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
  // Strength-state splits (compact keys to keep slim JSON small)
  gev: number; gpp: number; gsh: number;
  aev: number; app: number; apk: number;
  sev: number; spp: number; spk: number;
  iev: number; ipp: number; ipk: number;
  tpp: number; tpk: number;
  // Physical / faceoff
  hit: number; htk: number; blk: number; fow: number; fol: number;
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
  toi_ev_sec: number;       // 5v5 TOI in seconds (for strength-filter rate calcs)
  g60: number; a60: number; p60: number; x60: number; sog60: number;  // per-60 of 5v5 TOI
  // On-ice 5v5 (summed raw counts → rates)
  xgf_pct: number | null;
  xgf60:   number | null;
  xga60:   number | null;
  gf_diff:    number | null;
  gf_diff_60: number | null;
  limited: boolean;
  // Strength-state splits
  goals_ev: number; goals_pp: number; goals_sh: number;
  a_ev: number; a_pp: number; a_pk: number;
  sog_ev: number; sog_pp: number; sog_pk: number;
  ixg_ev: number; ixg_pp: number; ixg_pk: number;
  toi_pp_sec: number; toi_pk_sec: number;
  // Physical / faceoff
  hits: number; hits_taken: number; blocks: number;
  fo_wins: number; fo_losses: number; fo_pct: number | null;
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
    let gev = 0, gpp = 0, gsh = 0, aev = 0, app = 0, apk = 0;
    let sev = 0, spp = 0, spk = 0, iev = 0, ipp = 0, ipk = 0;
    let tpp = 0, tpk = 0;
    let hits = 0, htk = 0, blk = 0, fow = 0, fol = 0;

    for (const r of rows) {
      gp += r.gp; g += r.g; a += r.a; pts += r.pts; sog += r.sog; ixg += r.ixg; toi += r.toi;
      if (r.xgf != null && r.xga != null) { xgfSum += r.xgf; xgaSum += r.xga; hasOnice = true; }
      if (r.gf != null && r.ga != null)   { gfSum  += r.gf;  gaSum  += r.ga; }
      if (r.lim) lim = true;
      if (r.team) teams.add(r.team);
      if (r.season > latestSeason) { latestSeason = r.season; latestTeam = r.team; }
      gev += r.gev ?? 0; gpp += r.gpp ?? 0; gsh += r.gsh ?? 0;
      aev += r.aev ?? 0; app += r.app ?? 0; apk += r.apk ?? 0;
      sev += r.sev ?? 0; spp += r.spp ?? 0; spk += r.spk ?? 0;
      iev += r.iev ?? 0; ipp += r.ipp ?? 0; ipk += r.ipk ?? 0;
      tpp += r.tpp ?? 0; tpk += r.tpk ?? 0;
      hits += r.hit ?? 0; htk += r.htk ?? 0; blk += r.blk ?? 0;
      fow += r.fow ?? 0; fol += r.fol ?? 0;
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
      toi_ev_sec: toi,
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
      goals_ev: gev, goals_pp: gpp, goals_sh: gsh,
      a_ev: aev, a_pp: app, a_pk: apk,
      sog_ev: sev, sog_pp: spp, sog_pk: spk,
      ixg_ev: +iev.toFixed(2), ixg_pp: +ipp.toFixed(2), ixg_pk: +ipk.toFixed(2),
      toi_pp_sec: tpp, toi_pk_sec: tpk,
      hits, hits_taken: htk, blocks: blk,
      fo_wins: fow, fo_losses: fol,
      fo_pct: (fow + fol) > 0 ? +(fow / (fow + fol) * 100).toFixed(1) : null,
    });
  }
  return out;
}
