/**
 * Multi-season aggregation for the skaters leaderboard.
 *
 * Consumes the slim payload from /data/skater-season-stats.json and produces
 * one aggregated row per player for a [from, to] season range + game type.
 *
 * Counting stats are summed; rate stats (xGF%) are TOI-weighted; team is the
 * most-recent in range (flagged multiTeam if the player moved). Per-season
 * percentiles are intentionally NOT carried — they're season-specific ranks
 * and meaningless when summed, so the UI hides those columns in multi-season.
 *
 * Season strings ("2022-23") sort lexically by the leading year, so plain
 * string comparison is a valid range test.
 */

export type SlimRow = {
  season: string; team: string; pos: string; gp: number;
  g: number; a1: number; a2: number; a: number; pts: number;
  sog: number; ixg: number; toi: number;
  xgf: number | null; xga: number | null;   // raw on-ice xGF/xGA at 5v5
  gf:  number | null; ga:  number | null;   // raw on-ice GF/GA at 5v5
  cf: number | null; lim: number;
};
export type SlimPlayer = { n: string | null; s: string | null; pos: string; r: SlimRow[]; p: SlimRow[] };
export type SlimData = Record<string, SlimPlayer>;
export type GameType = 'regular' | 'playoffs';

export type AggRow = {
  player_id: string;
  slug: string | null;
  first_name: string; last_name: string; name: string; searchText: string;
  team: string; multiTeam: boolean;
  pos: string; group: 'F' | 'D';
  seasonsCount: number;
  gp: number; goals: number; assists: number; points: number; sog: number; ixg: number;
  toi_pg: number;           // 5v5 minutes per game
  g60: number; a60: number; p60: number; x60: number; sog60: number;  // per-60 of 5v5 TOI
  // On-ice 5v5 (summed raw counts → rates)
  xgf_pct: number | null;
  xgf60:   number | null;
  xga60:   number | null;
  gf_diff:    number | null;
  gf_diff_60: number | null;
  limited: boolean;
};

/** All seasons present in the data for a game type, sorted descending (newest first). */
export function availableSeasons(data: SlimData, gameType: GameType): string[] {
  const set = new Set<string>();
  for (const pl of Object.values(data)) {
    for (const r of (gameType === 'playoffs' ? pl.p : pl.r)) set.add(r.season);
  }
  return [...set].sort().reverse();
}

export function aggregateSeasons(
  data: SlimData,
  fromSeason: string,
  toSeason: string,
  gameType: GameType,
): AggRow[] {
  // Normalize so from <= to regardless of dropdown order
  const lo = fromSeason <= toSeason ? fromSeason : toSeason;
  const hi = fromSeason <= toSeason ? toSeason : fromSeason;
  const multi = lo !== hi;

  const out: AggRow[] = [];
  for (const [id, pl] of Object.entries(data)) {
    const src = gameType === 'playoffs' ? pl.p : pl.r;
    const rows = src.filter(r => r.season >= lo && r.season <= hi);
    if (!rows.length) continue;

    let gp = 0, g = 0, a = 0, pts = 0, sog = 0, ixg = 0, toi = 0;
    let xgfSum = 0, xgaSum = 0, gfSum = 0, gaSum = 0;
    let hasOnice = false, lim = false;
    let latestSeason = '', latestTeam = '';
    const teams = new Set<string>();

    for (const r of rows) {
      gp += r.gp; g += r.g; a += r.a; pts += r.pts; sog += r.sog; ixg += r.ixg; toi += r.toi;
      if (r.xgf != null && r.xga != null) { xgfSum += r.xgf; xgaSum += r.xga; hasOnice = true; }
      if (r.gf != null && r.ga != null)   { gfSum  += r.gf;  gaSum  += r.ga; }
      if (r.lim) lim = true;
      if (r.team) teams.add(r.team);
      if (r.season > latestSeason) { latestSeason = r.season; latestTeam = r.team; }
    }

    // Noise floor for multi-season: skip sub-5-GP aggregates (emergency callups, etc.)
    if (multi && gp < 5) continue;

    const hr = toi / 3600 || 1;
    const xgfDen = xgfSum + xgaSum;
    const name = pl.n ?? `#${id}`;
    const sp = pl.n ? pl.n.indexOf(' ') : -1;
    const first = sp > 0 ? pl.n!.slice(0, sp) : (pl.n ?? '');
    const last = sp > 0 ? pl.n!.slice(sp + 1) : '';

    out.push({
      player_id: id,
      slug: pl.s,
      first_name: first,
      last_name: last,
      name,
      searchText: `${name} ${latestTeam}`.toLowerCase(),
      team: latestTeam,
      multiTeam: teams.size > 1,
      pos: pl.pos,
      group: pl.pos === 'D' ? 'D' : 'F',
      seasonsCount: rows.length,
      gp, goals: g, assists: a, points: pts, sog,
      ixg: +ixg.toFixed(2),
      toi_pg: +(toi / Math.max(gp, 1) / 60).toFixed(1),
      g60: +(g / hr).toFixed(2),
      a60: +(a / hr).toFixed(2),
      p60: +((g + a) / hr).toFixed(2),
      x60: +(ixg / hr).toFixed(2),
      sog60: +(sog / hr).toFixed(2),
      xgf_pct:    hasOnice && xgfDen > 0 ? +(xgfSum / xgfDen * 100).toFixed(1) : null,
      xgf60:      hasOnice ? +(xgfSum / hr).toFixed(2) : null,
      xga60:      hasOnice ? +(xgaSum / hr).toFixed(2) : null,
      gf_diff:    hasOnice ? gfSum - gaSum : null,
      gf_diff_60: hasOnice ? +((gfSum - gaSum) / hr).toFixed(2) : null,
      limited: lim,
    });
  }
  return out;
}
