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
    xgf: r.xgf_pct_5v5 ?? null,
    cf: r.cf_pct_5v5 ?? null,
    lim: r.limited ? 1 : 0,
  };
}

export const GET: APIRoute = async () => {
  const all = loadPlayerSeasonStatsAll();
  const players = loadPlayers();
  const nameMap = new Map(players.map(p => [String(p.player_id), p]));

  const out: Record<string, unknown> = {};
  for (const [id, rec] of Object.entries(all)) {
    const p = nameMap.get(id);
    const firstRow = (rec.regular?.[0] ?? rec.playoffs?.[0]);
    out[id] = {
      f: p?.first_name ?? null,
      l: p?.last_name ?? null,
      s: p?.slug ?? null,
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
