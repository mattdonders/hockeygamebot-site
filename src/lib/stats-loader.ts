import playersData from '../data/stats/players.json';
import leaderboardsData from '../data/stats/leaderboards.json';
import methodologyData from '../data/stats/methodology.json';
import metaData from '../data/stats/_meta.json';
import playerGamesData from '../data/stats/player_games.json';

export type RatesPer60 = {
  goals: number;
  a1: number;
  shots: number;
  ixg: number;
  pen_diff: number;
  ev_offence: number;
  ev_defence: number;
  finishing: number;
};

export type Percentiles = {
  game_score: number;
  goals: number;
  a1: number;
  shots: number;
  ixg: number;
  pen_diff: number;
  ev_offence: number;
  ev_defence: number;
  finishing: number;
};

export type PlayerSummary = {
  player_id: number;
  slug: string;
  first_name: string;
  last_name: string;
  display_name: string;
  pos: string;
  pos_group: 'F' | 'D';
  team_abbrev: string;
  gp: number;
  goals: number;
  assists: number;
  toi_avg_sec: number;
  avg_gs_display: number;
  avg_gs_centered: number;
  gs_pct: number;
  rates_per_60: RatesPer60;
  percentiles_vs_pos: Percentiles;
  rapm: null;
  war: null;
  xgar: null;
  qoc: null;
  qot: null;
};

export type LeaderboardEntry = {
  player_id: number;
  slug: string;
  display_name: string;
  team_abbrev: string;
  pos: string;
  gp: number;
  value: number;
  pct: number;
};

export type GameLogEntry = {
  game_date: string;
  opp_abbrev: string;
  is_home: boolean;
  goals: number;
  assists: number;
  gs_display: number;
  team_score: number;
  opp_score: number;
};

export type MetaData = {
  season: string;
  generated_at: string;
  source_sha256: string;
  player_count: number;
  pending_fields: string[];
};

export function loadPlayers(): PlayerSummary[] {
  return playersData as unknown as PlayerSummary[];
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
  const boards = leaderboardsData as unknown as Record<string, LeaderboardEntry[]>;
  return boards[metric] ?? [];
}

export function loadMeta(): MetaData {
  return metaData as unknown as MetaData;
}

export function loadPlayerGames(playerId: number): GameLogEntry[] {
  const map = playerGamesData as unknown as Record<string, GameLogEntry[]>;
  return map[String(playerId)] ?? [];
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
