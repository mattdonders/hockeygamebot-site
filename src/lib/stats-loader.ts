import {
  PlayerRecordsSchema,
  LeaderboardsSchema,
  PlayerGamesSchema,
  StatsMetaSchema,
  parseOrThrow,
  type PlayerRecord,
  type LeaderboardEntry as ZLeaderboardEntry,
  type GameLogEntry as ZGameLogEntry,
  type StatsMeta,
} from './stats-schemas';

const _BASE = 'https://api.hockeygamebot.com/v1/stats';

async function _fetchJSON(path: string) {
  const res = await fetch(`${_BASE}/${path}`);
  if (!res.ok) throw new Error(`stats-loader: GET ${path} returned ${res.status}`);
  return res.json();
}

// Fetch all stats data once at build time. Astro runs this module once
// during the build and shares the resolved values across all pages.
const [playersData, leaderboardsData, playerGamesData, metaData] = await Promise.all([
  _fetchJSON('players'),
  _fetchJSON('leaderboards'),
  _fetchJSON('player-games'),
  _fetchJSON('meta'),
]);

const VALIDATED_PLAYERS = parseOrThrow(PlayerRecordsSchema, playersData, 'players');
const VALIDATED_LEADERBOARDS = parseOrThrow(LeaderboardsSchema, leaderboardsData, 'leaderboards');
const VALIDATED_PLAYER_GAMES = parseOrThrow(PlayerGamesSchema, playerGamesData, 'player-games');
const VALIDATED_META = parseOrThrow(StatsMetaSchema, metaData, 'meta');

// ── Public types ────────────────────────────────────────────────────────────

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
