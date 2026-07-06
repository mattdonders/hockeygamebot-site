/**
 * hgb-api-client — shared fetch layer for the live `api.hockeygamebot.com`
 * endpoints consumed by scoreboard/goals/game/series pages.
 *
 * Centralizes what was previously 7 pages each hand-rolling a local
 * `API_BASE`/`HGB_API`/`API` constant + raw `fetch()` calls (D1-11).
 *
 * Every response is runtime-validated against the Zod schemas in
 * `hgb-api-schemas.ts` (D1-12) via `safeValidate()` — a shape mismatch logs
 * `console.error` and passes the raw payload through rather than throwing;
 * these are live external responses, not build-time fixtures, so a bad
 * shape must never crash a page (existing call sites already tolerate
 * missing/weird fields via `?.` chaining).
 *
 * Per-endpoint error handling below intentionally mirrors the EXACT
 * behavior of the call site(s) it replaces — some return `null` on failure,
 * some throw, some take a caller-supplied fallback value. See the comment
 * on each function for which page(s) it was extracted from.
 */

import { API_BASE } from './auth-client';
import {
  ScoreboardSchema,
  GoalsResponseSchema,
  GamesTodayResponseSchema,
  GameFlowSchema,
  GameSeriesResponseSchema,
  TeamHistoryResponseSchema,
  GamePregameSchema,
  GameBoxscoreSchema,
  GameEventsSchema,
  GameOnIceSchema,
  GameLinesSchema,
  PlayoffRoundSchema,
  SeriesPlayersResponseSchema,
  SeriesLinesResponseSchema,
  SeriesShotsResponseSchema,
  safeValidate,
  type Scoreboard,
  type GoalsResponse,
  type GamesTodayResponse,
  type GameFlow,
  type GameSeriesResponse,
  type TeamHistoryResponse,
  type GamePregame,
  type GameBoxscore,
  type GameEvents,
  type GameOnIce,
  type GameLines,
  type PlayoffRound,
  type SeriesPlayersResponse,
  type SeriesLinesResponse,
  type SeriesShotsResponse,
} from './hgb-api-schemas';

export { API_BASE };

// ── GET /v1/scoreboard ──────────────────────────────────────────────────────
// Mirrors: index.astro frontmatter (SCORE_URL) + client `fetchAndRender`.
// Both call sites swallow any failure and return null.
export async function getScoreboard(date?: string): Promise<Scoreboard | null> {
  try {
    const url = date ? `${API_BASE}/v1/scoreboard?date=${date}` : `${API_BASE}/v1/scoreboard`;
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) return null;
    const data = await r.json();
    return safeValidate(ScoreboardSchema, data, 'getScoreboard');
  } catch {
    return null;
  }
}

// ── GET /v1/goals (optional ?date=) ─────────────────────────────────────────
// Mirrors: index.astro `fetchGoals` + scoreboard.astro `fetchGoals`/
// `fetchYesterdayGoals`. All three swallow failures and return null; the
// today→yesterday fallback chain is page-specific business logic, kept there.
export async function getGoals(date?: string): Promise<GoalsResponse | null> {
  try {
    const url = date ? `${API_BASE}/v1/goals?date=${date}` : `${API_BASE}/v1/goals`;
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) return null;
    const data = await r.json();
    return safeValidate(GoalsResponseSchema, data, 'getGoals');
  } catch {
    return null;
  }
}

// ── GET /v1/games/today (optional ?date=) ───────────────────────────────────
// Mirrors 4 call sites with 3 different failure behaviors:
//  - scoreboard.astro `fetchGames`      → throws `Error("API ${status}")` on !ok (opts.throwOnHttpError)
//  - scoreboard.astro `fetchYesterdayData`, results.astro `fetchDate`,
//    teams/[abbr].astro `loadTonightGame` → all just want null on failure
// Network-level exceptions always propagate (matches the original code,
// where each of those call sites already wraps the raw fetch in try/catch).
export async function getGamesToday(
  date?: string,
  opts: { throwOnHttpError?: boolean } = {},
): Promise<GamesTodayResponse | null> {
  const url = date ? `${API_BASE}/v1/games/today?date=${date}` : `${API_BASE}/v1/games/today`;
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) {
    if (opts.throwOnHttpError) throw new Error(`API ${r.status}`);
    return null;
  }
  const data = await r.json();
  return safeValidate(GamesTodayResponseSchema, data, 'getGamesToday');
}

// ── GET /v1/games/:id/flow ───────────────────────────────────────────────────
// Mirrors: index.astro frontmatter (null on failure) + games/index.astro
// `fetchAll` (EMPTY_FLOW stub on failure) — caller picks the fallback.
export async function getGameFlow<T = null>(gameId: string, fallback: T = null as T): Promise<GameFlow | T> {
  try {
    const r = await fetch(`${API_BASE}/v1/games/${gameId}/flow`);
    if (!r.ok) return fallback;
    const data = await r.json().catch(() => fallback);
    if (data === fallback) return fallback;
    return safeValidate(GameFlowSchema, data, 'getGameFlow');
  } catch {
    return fallback;
  }
}

// ── GET /v1/games/:id/series ─────────────────────────────────────────────────
// Mirrors: index.astro client `fetchSeriesInfo` (null on failure — page then
// falls back to a direct NHL schedule fetch itself).
export async function getGameSeries(gameId: string): Promise<GameSeriesResponse | null> {
  try {
    const r = await fetch(`${API_BASE}/v1/games/${gameId}/series`, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return null;
    const data = await r.json();
    return safeValidate(GameSeriesResponseSchema, data, 'getGameSeries');
  } catch {
    return null;
  }
}

// ── GET /v1/games/team-history?team_ids=&limit= ─────────────────────────────
// Mirrors: index.astro client `loadPrefsAndTrackedTeams` (null on failure).
export async function getTeamHistory(teamIds: Array<number | string>, limit = 20): Promise<TeamHistoryResponse | null> {
  try {
    const r = await fetch(`${API_BASE}/v1/games/team-history?team_ids=${teamIds.join(',')}&limit=${limit}`);
    if (!r.ok) return null;
    const data = await r.json();
    return safeValidate(TeamHistoryResponseSchema, data, 'getTeamHistory');
  } catch {
    return null;
  }
}

// ── GET /v1/games/:id/pregame ────────────────────────────────────────────────
// Mirrors: games/index.astro `renderPregame` (null on failure — page builds
// its own stub from the boxscore already in hand).
export async function getGamePregame(gameId: string): Promise<GamePregame | null> {
  try {
    const r = await fetch(`${API_BASE}/v1/games/${gameId}/pregame`);
    if (!r.ok) return null;
    const data = await r.json();
    return safeValidate(GamePregameSchema, data, 'getGamePregame');
  } catch {
    return null;
  }
}

// ── GET /v1/games/:id/boxscore ───────────────────────────────────────────────
// Mirrors: games/index.astro `fetchAll` — this is the one throwing endpoint;
// network failure and HTTP failure throw distinct messages the page relies on.
export async function getGameBoxscore(gameId: string): Promise<GameBoxscore> {
  let r: Response;
  try {
    r = await fetch(`${API_BASE}/v1/games/${gameId}/boxscore`);
  } catch (e) {
    throw new Error(`Boxscore unreachable: ${(e as Error).message}`);
  }
  if (!r.ok) throw new Error(`Game ${gameId} not found (HTTP ${r.status})`);
  const data = await r.json();
  return safeValidate(GameBoxscoreSchema, data, 'getGameBoxscore');
}

// ── GET /v1/games/:id/events?sort=asc ────────────────────────────────────────
// Mirrors: games/index.astro `fetchAll` (fallback null on any failure).
export async function getGameEvents<T = null>(gameId: string, fallback: T = null as T): Promise<GameEvents | T> {
  try {
    const r = await fetch(`${API_BASE}/v1/games/${gameId}/events?sort=asc`);
    if (!r.ok) return fallback;
    const data = await r.json().catch(() => fallback);
    if (data === fallback) return fallback;
    return safeValidate(GameEventsSchema, data, 'getGameEvents');
  } catch {
    return fallback;
  }
}

// ── GET /v1/games/:id/on-ice ──────────────────────────────────────────────────
// Mirrors: games/index.astro `fetchAll` (fallback null on any failure).
export async function getGameOnIce<T = null>(gameId: string, fallback: T = null as T): Promise<GameOnIce | T> {
  try {
    const r = await fetch(`${API_BASE}/v1/games/${gameId}/on-ice`);
    if (!r.ok) return fallback;
    const data = await r.json().catch(() => fallback);
    if (data === fallback) return fallback;
    return safeValidate(GameOnIceSchema, data, 'getGameOnIce');
  } catch {
    return fallback;
  }
}

// ── GET /v1/games/:id/lines ───────────────────────────────────────────────────
// Mirrors: games/index.astro `fetchAll` (fallback null on any failure).
export async function getGameLines<T = null>(gameId: string, fallback: T = null as T): Promise<GameLines | T> {
  try {
    const r = await fetch(`${API_BASE}/v1/games/${gameId}/lines`);
    if (!r.ok) return fallback;
    const data = await r.json().catch(() => fallback);
    if (data === fallback) return fallback;
    return safeValidate(GameLinesSchema, data, 'getGameLines');
  } catch {
    return fallback;
  }
}

// ── GET /v1/playoffs/round/:n ────────────────────────────────────────────────
// Mirrors: scoreboard.astro frontmatter, stats/series/[slug].astro
// `getStaticPaths`, stats/series/index.astro — all three want null on any
// failure (HTTP or network) with no exception surfacing.
export async function getPlayoffRound(round: number): Promise<PlayoffRound | null> {
  try {
    const r = await fetch(`${API_BASE}/v1/playoffs/round/${round}`);
    if (!r.ok) return null;
    const data = await r.json();
    return safeValidate(PlayoffRoundSchema, data, 'getPlayoffRound');
  } catch {
    return null;
  }
}

// ── GET /v1/series/:id/players ───────────────────────────────────────────────
// Mirrors: stats/series/[slug].astro define:vars script (fallback null).
export async function getSeriesPlayers(seriesId: string): Promise<SeriesPlayersResponse | null> {
  try {
    const r = await fetch(`${API_BASE}/v1/series/${seriesId}/players`);
    if (!r.ok) return null;
    const data = await r.json();
    return safeValidate(SeriesPlayersResponseSchema, data, 'getSeriesPlayers');
  } catch {
    return null;
  }
}

// ── GET /v1/series/:id/lines ─────────────────────────────────────────────────
// Mirrors: stats/series/[slug].astro define:vars script (fallback null).
export async function getSeriesLines(seriesId: string): Promise<SeriesLinesResponse | null> {
  try {
    const r = await fetch(`${API_BASE}/v1/series/${seriesId}/lines`);
    if (!r.ok) return null;
    const data = await r.json();
    return safeValidate(SeriesLinesResponseSchema, data, 'getSeriesLines');
  } catch {
    return null;
  }
}

// ── GET /v1/series/:id/shots ──────────────────────────────────────────────────
// Mirrors: stats/series/[slug].astro shot-map module script (null on failure).
export async function getSeriesShots(seriesId: string): Promise<SeriesShotsResponse | null> {
  try {
    const r = await fetch(`${API_BASE}/v1/series/${seriesId}/shots`);
    if (!r.ok) return null;
    const data = await r.json();
    return safeValidate(SeriesShotsResponseSchema, data, 'getSeriesShots');
  } catch {
    return null;
  }
}
