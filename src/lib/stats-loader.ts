import playersData from '../data/stats/players.json';
import leaderboardsData from '../data/stats/leaderboards.json';
import methodologyData from '../data/stats/methodology.json';
import metaData from '../data/stats/_meta.json';

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
