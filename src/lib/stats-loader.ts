import playersData from '../data/stats/players.json';
import leaderboardsData from '../data/stats/leaderboards.json';
import methodologyData from '../data/stats/methodology.json';
import metaData from '../data/stats/_meta.json';
import playerGamesData from '../data/stats/player_games.json';

import {
  PlayerRecordsSchema,
  LeaderboardsSchema,
  PlayerGamesSchema,
  StatsMetaSchema,
  MethodologySchema,
  parseOrThrow,
  type PlayerRecord,
  type LeaderboardEntry as ZLeaderboardEntry,
  type GameLogEntry as ZGameLogEntry,
  type StatsMeta,
} from './stats-schemas';

// Build-time validation — runs once at module load. On failure the build
// errors out with a path-aware message instead of silently rendering NaN
// on pages that depend on these types. See `stats-schemas.ts` for the
// cross-repo contract.
const VALIDATED_PLAYERS = parseOrThrow(PlayerRecordsSchema, playersData, 'players.json');
const VALIDATED_LEADERBOARDS = parseOrThrow(LeaderboardsSchema, leaderboardsData, 'leaderboards.json');
const VALIDATED_PLAYER_GAMES = parseOrThrow(PlayerGamesSchema, playerGamesData, 'player_games.json');
const VALIDATED_META = parseOrThrow(StatsMetaSchema, metaData, '_meta.json');
// Methodology schema is loose; parse to catch gross type errors but allow
// extra keys silently.
parseOrThrow(MethodologySchema, methodologyData, 'methodology.json');

// ── Public types ────────────────────────────────────────────────────────────
// Re-exported under their prior names so existing pages keep compiling.

export type RatesPer60 = PlayerRecord['rates_per_60'];
export type Percentiles = PlayerRecord['percentiles_vs_pos'];
export type PlayerSummary = PlayerRecord;
export type LeaderboardEntry = ZLeaderboardEntry;
export type GameLogEntry = ZGameLogEntry;
export type MetaData = StatsMeta;

// ── Loaders ─────────────────────────────────────────────────────────────────

export function loadPlayers(): PlayerSummary[] {
  return VALIDATED_PLAYERS;
}

export function loadPlayer(slugOrId: string): PlayerSummary | null {
  const players = loadPlayers();
  const bySlug = players.find(p => p.slug === slugOrId);
  if (bySlug) return bySlug;
  const idMatch = slugOrId.match(/(\d+)$/);
  if (idMatch) {
    const playerId = parseInt(idMatch[1], 10);
    return players.find(p => p.player_id === playerId) ?? null;
  }
  return null;
}

export function loadLeaderboard(
  metric: 'game_score' | 'goals' | 'assists' | 'xg',
): LeaderboardEntry[] {
  return VALIDATED_LEADERBOARDS[metric] ?? [];
}

export function loadMeta(): MetaData {
  return VALIDATED_META;
}

export function loadPlayerGames(playerId: number): GameLogEntry[] {
  return VALIDATED_PLAYER_GAMES[String(playerId)] ?? [];
}

// TODO: Once hgb-bot scripts/export_stats_data.py writes _meta.player_of_the_week
// (7-day rolling window, min 3 GP, min 40 min TOI), read it from _meta directly here
// and expose the "PLAYER OF THE WEEK" label. Until then, falls back to season-avg top
// avg_gs_display with a min 20 GP threshold — labeled "SEASON LEADER" on the site.
export function loadPlayerOfTheWeek(): PlayerSummary {
  const players = loadPlayers();
  const eligible = players.filter(p => p.gp >= 20);
  eligible.sort((a, b) => {
    if (b.avg_gs_display !== a.avg_gs_display) return b.avg_gs_display - a.avg_gs_display;
    return (b.gp * b.toi_avg_sec) - (a.gp * a.toi_avg_sec);
  });
  return eligible[0] ?? players[0];
}

// ── SS-5 Leaderboard hub ─────────────────────────────────────────────────────

export type LeaderboardSectionEntry = {
  player_id: number;
  slug: string;
  display_name: string;
  team_abbrev: string;
  pos: string;
  pos_group: 'F' | 'D';
  gp: number;
  toi_avg_sec: number;
  value: number;
  pct: number;
};

function toSectionEntries(
  sorted: PlayerSummary[],
  getValue: (p: PlayerSummary) => number,
  getPct: (p: PlayerSummary) => number,
): LeaderboardSectionEntry[] {
  return sorted.map(p => ({
    player_id: p.player_id,
    slug: p.slug,
    display_name: p.display_name,
    team_abbrev: p.team_abbrev,
    pos: p.pos,
    pos_group: p.pos_group,
    gp: p.gp,
    toi_avg_sec: p.toi_avg_sec,
    value: getValue(p),
    pct: getPct(p),
  }));
}

export function loadTopForwardsHGBScore(n = 25): LeaderboardSectionEntry[] {
  const sorted = loadPlayers()
    .filter(p => p.pos_group === 'F' && p.gp >= 20)
    .sort((a, b) => b.avg_gs_display - a.avg_gs_display)
    .slice(0, n);
  return toSectionEntries(sorted, p => p.avg_gs_display, p => p.gs_pct);
}

export function loadTopDefensemenHGBScore(n = 25): LeaderboardSectionEntry[] {
  const sorted = loadPlayers()
    .filter(p => p.pos_group === 'D' && p.gp >= 20)
    .sort((a, b) => b.avg_gs_display - a.avg_gs_display)
    .slice(0, n);
  return toSectionEntries(sorted, p => p.avg_gs_display, p => p.gs_pct);
}

export function loadTopForwardsXG60(n = 25): LeaderboardSectionEntry[] {
  const sorted = loadPlayers()
    .filter(p => p.pos_group === 'F' && p.gp >= 20)
    .sort((a, b) => b.rates_per_60.ixg - a.rates_per_60.ixg)
    .slice(0, n);
  return toSectionEntries(sorted, p => p.rates_per_60.ixg, p => p.percentiles_vs_pos.ixg);
}

export function loadTopForwardsShots60(n = 20): LeaderboardSectionEntry[] {
  const sorted = loadPlayers()
    .filter(p => p.pos_group === 'F' && p.gp >= 20)
    .sort((a, b) => b.rates_per_60.shots - a.rates_per_60.shots)
    .slice(0, n);
  return toSectionEntries(sorted, p => p.rates_per_60.shots, p => p.percentiles_vs_pos.shots);
}

export function loadTopGoals60(n = 10): LeaderboardSectionEntry[] {
  const sorted = loadPlayers()
    .filter(p => p.gp >= 10)
    .sort((a, b) => b.rates_per_60.goals - a.rates_per_60.goals)
    .slice(0, n);
  return toSectionEntries(sorted, p => p.rates_per_60.goals, p => p.percentiles_vs_pos.goals);
}
