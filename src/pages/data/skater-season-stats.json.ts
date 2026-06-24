/**
 * Build-time endpoint → static cacheable asset for the multi-season skaters leaderboard.
 *
 * Slims the ~11 MB player-season-stats payload to only the fields the leaderboard
 * needs, joins player names from players.json (active players), and emits a single
 * JSON file the SkatersTable React island fetches once and caches.
 *
 * Output shape (compact keys to keep the file small):
 *   { [player_id]: { f, l, s, pos, r: SlimRow[], p: SlimRow[] } }
 *   SlimRow = { season, team, pos, gp, g, a1, a2, a, pts, sog, ixg, toi, xgf, cf, lim }
 *
 * NOTE: player-season-stats has no names; only ~715 of ~2267 players resolve via
 * players.json. Retired/inactive players get f/l/s = null until the DE adds a name
 * field to the upstream payload (see prompts/2026-06-06-skaters-name-join.md).
 */
import type { APIRoute } from 'astro';
import { loadPlayerSeasonStatsAll, loadPlayers, type PlayerSeasonEntry } from '../../lib/stats-loader';

export const prerender = true;

function slim(r: PlayerSeasonEntry) {
  return {
    season: r.season,
    team: r.team ?? '',
    pos: r.pos ?? '',
    gp: r.gp ?? 0,
    g: r.goals ?? 0,
    a1: r.a1 ?? 0,
    a2: r.a2 ?? 0,
    a: r.assists ?? 0,
    pts: r.points ?? 0,
    sog: r.shots ?? 0,
    ixg: r.ixg ?? 0,
    toi: r.toi_5v5_sec ?? 0,
    // Raw on-ice 5v5 counts — summed across seasons for multi-season rates
    xgf: r.xgf_5v5 ?? null,
    xga: r.xga_5v5 ?? null,
    gf:  r.gf_5v5  ?? null,
    ga:  r.ga_5v5  ?? null,
    cf: r.cf_pct_5v5 ?? null,
    lim: r.limited ? 1 : 0,
    // Strength-state splits (compact keys)
    gev: r.goals_ev ?? 0,
    gpp: r.goals_pp ?? 0,
    gsh: r.goals_sh ?? 0,
    aev: r.a_ev ?? 0,
    app: r.a_pp ?? 0,
    apk: r.a_pk ?? 0,
    sev: r.shots_ev ?? 0,
    spp: r.shots_pp ?? 0,
    spk: r.shots_pk ?? 0,
    iev: r.ixg_ev ?? 0,
    ipp: r.ixg_pp ?? 0,
    ipk: r.ixg_pk ?? 0,
    tpp: r.toi_pp_sec ?? 0,
    tpk: r.toi_pk_sec ?? 0,
    // Physical / faceoff (compact keys)
    hit: r.hits ?? 0,
    htk: r.hits_taken ?? 0,
    blk: r.blocks ?? 0,
    fow: r.fo_wins ?? 0,
    fol: r.fo_losses ?? 0,
  };
}

export const GET: APIRoute = async () => {
  const all = loadPlayerSeasonStatsAll();
  // Names now come from the payload itself (DE added top-level name+slug for all
  // 2267 players, incl. retired). Fall back to players.json only if a record is
  // missing them, for safety.
  const players = loadPlayers();
  const nameMap = new Map(players.map(p => [String(p.player_id), p]));

  const out: Record<string, unknown> = {};
  for (const [id, rec] of Object.entries(all)) {
    const r = rec as typeof rec & { name?: string; slug?: string };
    const p = nameMap.get(id);
    const firstRow = (rec.regular?.[0] ?? rec.playoffs?.[0]);
    out[id] = {
      n: r.name ?? (p ? `${p.first_name} ${p.last_name}` : null),
      s: r.slug ?? p?.slug ?? null,
      pos: firstRow?.pos ?? '',
      r: (rec.regular ?? []).map(slim),
      p: (rec.playoffs ?? []).map(slim),
    };
  }

  return new Response(JSON.stringify(out), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
