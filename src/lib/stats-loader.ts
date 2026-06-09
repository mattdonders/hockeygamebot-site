import {
  PlayerRecordsSchema,
  LeaderboardsSchema,
  PlayerGamesSchema,
  TeamGameStatsSchema,
  GoaliesSchema,
  LinesSchema,
  StatsMetaSchema,
  PlayerShotsSchema,
  parseOrThrow,
  type PlayerRecord,
  type LeaderboardEntry as ZLeaderboardEntry,
  type GameLogEntry as ZGameLogEntry,
  type TeamGameEntry as ZTeamGameEntry,
  type GoalieRecord,
  type LineRecord,
  type StatsMeta,
  type PlayerShot,
} from './stats-schemas';

const _BASE = 'https://api.hockeygamebot.com/v1/stats';

async function _fetchJSON(path: string) {
  // cache: 'no-store' + unique query param ensures CF edge cache is bypassed at
  // build time so uploads to R2 are reflected immediately in the next build.
  const res = await fetch(`${_BASE}/${path}?_b=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`stats-loader: GET ${path} returned ${res.status}`);
  return res.json();
}

// Safe fetch: catches network/HTTP errors and returns a fallback value instead of
// letting the entire build fail. A warning is logged so the issue is visible in
// CF Pages build logs. Pages that depend on this data will render with empty state.
async function _safeFetchJSON(path: string, fallback: unknown): Promise<unknown> {
  try {
    return await _fetchJSON(path);
  } catch (e: any) {
    console.warn(
      `[stats-loader] WARNING: ${path} fetch failed (${e?.message ?? e}). ` +
      `Rendering with empty fallback — check api.hockeygamebot.com before deploying.`
    );
    return fallback;
  }
}

// Hardcoded meta fallback satisfies StatsMetaSchema so build/parse don't crash.
const _META_FALLBACK = {
  schema_version: '0.0.0-offline',
  season: '20252026',
  generated_at: new Date(0).toISOString(),
  player_count: 0,
  pending_fields: [] as string[],
};

// Fetch all stats data once at build time. Astro runs this module once
// during the build and shares the resolved values across all pages.
const [playersData, leaderboardsData, playerGamesData, metaData, teamGameStatsData, goaliesData, linesData, playerShotsData, seriesStatsData, seriesRecordsData, playerSeasonStatsData] = await Promise.all([
  _safeFetchJSON('players',      []),
  _safeFetchJSON('leaderboards', {}),
  _safeFetchJSON('player-games', {}),
  _safeFetchJSON('meta',         _META_FALLBACK),
  _fetchJSON('team-game-stats').catch(() => ({})),
  _fetchJSON('goalies').catch(() => []),
  _fetchJSON('lines').catch(() => []),
  _fetchJSON('player-shots').catch(() => ({})),
  _fetchJSON('series-stats').catch(() => ({ series: [], rounds: [] })),
  _fetchJSON('series-records').catch(() => ({ series: [], total_series: 0 })),
  _fetchJSON('player-season-stats').catch(() => ({})),
]);

// career_seasons is embedded in players.json by the exporter; player_career.json
// stays in R2 for future retired-player pages (client-side fetch on demand).
const VALIDATED_PLAYERS = parseOrThrow(PlayerRecordsSchema, playersData, 'players');
const VALIDATED_LEADERBOARDS = parseOrThrow(LeaderboardsSchema,   leaderboardsData,   'leaderboards');
const VALIDATED_PLAYER_GAMES = parseOrThrow(PlayerGamesSchema,    playerGamesData,    'player-games');
const VALIDATED_META         = parseOrThrow(StatsMetaSchema,      metaData,           'meta');
const VALIDATED_TEAM_GAMES   = parseOrThrow(TeamGameStatsSchema,  teamGameStatsData,  'team-game-stats');
const VALIDATED_GOALIES      = parseOrThrow(GoaliesSchema,        goaliesData,        'goalies');
const VALIDATED_LINES        = parseOrThrow(LinesSchema,          linesData,          'lines');
const VALIDATED_PLAYER_SHOTS = parseOrThrow(PlayerShotsSchema,   playerShotsData,    'player-shots');

// ── Public types ────────────────────────────────────────────────────────────

export type RatesPer60 = PlayerRecord['rates_per_60'];
export type Percentiles = PlayerRecord['percentiles_vs_pos'];
export type PlayerSummary = PlayerRecord;
export type LeaderboardEntry = ZLeaderboardEntry;
export type GameLogEntry = ZGameLogEntry;
export type TeamGameEntry = ZTeamGameEntry;
export type GoalieData = GoalieRecord;
export type MetaData = StatsMeta;
export type LineData = LineRecord;

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

export function loadPlayoffLeaderboard(
  metric: 'goals' | 'assists' | 'xg',
): LeaderboardEntry[] {
  return (VALIDATED_LEADERBOARDS as Record<string, LeaderboardEntry[]>)[`playoff_${metric}`] ?? [];
}

export function loadMeta(): MetaData {
  return VALIDATED_META;
}

export function loadPlayerGames(playerId: number): GameLogEntry[] {
  return VALIDATED_PLAYER_GAMES[String(playerId)] ?? [];
}

export function loadPlayerShots(playerId: number): PlayerShot[] {
  return VALIDATED_PLAYER_SHOTS[String(playerId)] ?? [];
}

export type { PlayerShot };

export function loadTeamGames(abbr: string): TeamGameEntry[] {
  return VALIDATED_TEAM_GAMES[abbr.toUpperCase()] ?? [];
}

export function loadAllTeamGames(): Record<string, TeamGameEntry[]> {
  return VALIDATED_TEAM_GAMES;
}

/** Returns all game log entries for players on a given team, keyed by player_id. */
export function loadTeamPlayerGames(abbr: string): Record<number, GameLogEntry[]> {
  const teamPlayers = loadPlayers().filter(p => p.team_abbrev === abbr.toUpperCase());
  return Object.fromEntries(
    teamPlayers.map(p => [p.player_id, VALIDATED_PLAYER_GAMES[String(p.player_id)] ?? []])
  );
}

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


export function loadGoalies(): GoalieData[] {
  return VALIDATED_GOALIES;
}

export function loadLines(): LineData[] {
  return VALIDATED_LINES;
}

export function loadSeriesStats(): { series: any[]; rounds: any[] } {
  return (seriesStatsData as any) ?? { series: [], rounds: [] };
}

// ── Player season stats (player-season-stats endpoint) ───────────────────────
// Shape: { [player_id: string]: { regular: SeasonEntry[], playoffs: SeasonEntry[] } }

export type PlayerSeasonEntry = {
  season: string;
  team?: string;
  pos?: string;
  gp?: number;
  toi_5v5_sec?: number;
  goals?: number;
  a1?: number;
  a2?: number;
  assists?: number;
  points?: number;
  shots?: number;
  ixg?: number;
  xgf_5v5?: number;
  xga_5v5?: number;
  xgf_pct_5v5?: number;
  cf_5v5?: number;
  ca_5v5?: number;
  cf_pct_5v5?: number;
  gf_5v5?: number;
  ga_5v5?: number;
  gf_pct_5v5?: number;
  // RAPM percentile fields — present now in pipeline
  rapm_off_pct?: number | null;
  rapm_def_pct?: number | null;
  rapm_net_pct?: number | null;
  rapm_finishing_pct?: number | null;
  rapm_pp_pct?: number | null;
  rapm_pk_pct?: number | null;
  // Future fields — pipeline not yet writing these; handle null gracefully
  hgb_rating_pct?: number | null;
  war_pct?: number | null;
  impact_pct?: number | null;
  limited?: boolean;
};

export type PlayerSeasonStats = {
  regular: PlayerSeasonEntry[];
  playoffs: PlayerSeasonEntry[];
};

export function loadPlayerSeasonStats(playerId: number): PlayerSeasonStats {
  const raw = (playerSeasonStatsData as Record<string, unknown>)[String(playerId)];
  if (!raw || typeof raw !== 'object') return { regular: [], playoffs: [] };
  const r = raw as Record<string, unknown>;
  return {
    regular:  Array.isArray(r.regular)  ? (r.regular  as PlayerSeasonEntry[]) : [],
    playoffs: Array.isArray(r.playoffs) ? (r.playoffs as PlayerSeasonEntry[]) : [],
  };
}

/** Full player-season-stats map (player_id → {regular, playoffs}). Used by the
 *  /data/skater-season-stats.json build-time endpoint to emit a slim, name-joined,
 *  client-cacheable asset for the multi-season skaters leaderboard. */
export function loadPlayerSeasonStatsAll(): Record<string, PlayerSeasonStats> {
  return (playerSeasonStatsData as Record<string, PlayerSeasonStats>) ?? {};
}

export function loadSeriesRecords(): { series: any[]; total_series: number; scope?: string; generated_at?: string } {
  return (seriesRecordsData as any) ?? { series: [], total_series: 0 };
}

/** Returns true when enough players have playoff data to indicate playoffs are active.
 *  Used to default table game-type toggles to 'playoffs' during postseason. */
export function loadIsPlayoffSeason(): boolean {
  const players = VALIDATED_PLAYERS;
  const withPo = players.filter(p => (p as any).playoff_gp != null && (p as any).playoff_gp >= 1).length;
  return withPo >= 50; // at least 50 players with playoff games = postseason is underway
}
