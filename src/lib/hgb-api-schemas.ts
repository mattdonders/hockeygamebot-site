/**
 * Zod schemas for the live `api.hockeygamebot.com` endpoints consumed across
 * the site (scoreboard, goals ticker, game/series pages, playoffs).
 *
 * Unlike `live-mock-schemas.ts` (which validates build-time JSON fixtures and
 * is allowed to throw), these validate LIVE runtime responses. Callers in
 * `hgb-api-client.ts` use `.safeParse()` + these `parseXOrThrow`-style helpers
 * are exposed for symmetry/tests, but the client itself never lets a bad
 * response crash a page — see hgb-api-client.ts for the fallback behavior.
 *
 * Shapes are intentionally loose (`.passthrough()`, generous `.optional()`)
 * and modeled off the hand-written `type X = {...}` declarations that already
 * existed inline in the pages before this file existed — this is a runtime
 * safety net, not a strict contract.
 */

import { z } from 'zod';

// ── Shared fragments ────────────────────────────────────────────────────────

const TeamRefSchema = z
  .object({
    abbrev: z.string().optional(),
    name: z.string().optional(),
    short_name: z.string().optional(),
    score: z.number().optional(),
  })
  .passthrough();

const ClockSchema = z
  .object({
    period: z.number().nullable().optional(),
    time_remaining: z.string().nullable().optional(),
    in_intermission: z.boolean().nullable().optional(),
  })
  .passthrough();

const ThreeStarSchema = z
  .object({
    star: z.number().optional(),
    player_name: z.string().optional(),
    player_last_name: z.string().optional(),
    team_abbrev: z.string().optional(),
  })
  .passthrough();

// ── GET /v1/scoreboard ──────────────────────────────────────────────────────

const SBGameSchema = z
  .object({
    game_id: z.string().optional(),
    game_state: z.string().optional(),
    venue: z.string().nullable().optional(),
    start_time_utc: z.string().nullable().optional(),
    away_team: TeamRefSchema.optional(),
    home_team: TeamRefSchema.optional(),
    clock: ClockSchema.optional(),
    stats: z
      .object({
        win_probability: z.object({ away: z.number().nullable().optional(), home: z.number().nullable().optional() }).optional(),
        xg_5v5: z.object({ away: z.number().nullable().optional(), home: z.number().nullable().optional() }).optional(),
      })
      .passthrough()
      .optional(),
    xg_home: z.number().nullable().optional(),
    xg_away: z.number().nullable().optional(),
    three_stars: z.array(ThreeStarSchema).nullable().optional(),
    series: z.unknown().optional(),
  })
  .passthrough();

export const ScoreboardSchema = z
  .object({
    date: z.string().optional(),
    games: z.array(SBGameSchema).optional(),
    previous_day: z
      .object({
        hockey_date: z.string().optional(),
        games: z.array(SBGameSchema).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();
export type Scoreboard = z.infer<typeof ScoreboardSchema>;

// ── GET /v1/goals (optional ?date=) ─────────────────────────────────────────

const GoalEntrySchema = z
  .object({
    scorer: z.object({ name: z.string().optional() }).passthrough().optional(),
    scoring_team: z.object({ abbrev: z.string().optional() }).passthrough().optional(),
    away_team: z.object({ abbrev: z.string().optional() }).passthrough().optional(),
    home_team: z.object({ abbrev: z.string().optional() }).passthrough().optional(),
    away_score: z.number().optional(),
    home_score: z.number().optional(),
    period: z.number().nullable().optional(),
    time_in_period: z.string().optional(),
    strength: z.string().optional(),
  })
  .passthrough();

export const GoalsResponseSchema = z
  .object({
    goals: z.array(GoalEntrySchema).optional(),
  })
  .passthrough();
export type GoalsResponse = z.infer<typeof GoalsResponseSchema>;

// ── GET /v1/games/today (optional ?date=) ───────────────────────────────────
// Note: consumers of this endpoint disagree on key casing in the wild
// (snake_case `home_team`/`game_state` vs. camelCase `homeTeam`/`gameState`
// seen in teams/[abbr].astro) — kept fully passthrough/optional so validation
// never blocks either consumer.

const GamesTodayGameSchema = z.record(z.string(), z.unknown());

export const GamesTodayResponseSchema = z
  .object({
    date: z.string().optional(),
    games: z.array(GamesTodayGameSchema).optional(),
  })
  .passthrough();
export type GamesTodayResponse = z.infer<typeof GamesTodayResponseSchema>;

// ── GET /v1/games/:id/flow ───────────────────────────────────────────────────

const FlowPointSchema = z.object({ t: z.number().optional(), wp: z.number().nullable().optional() }).passthrough();
const FlowGoalSchema = z
  .object({
    t: z.number().optional(),
    is_home: z.boolean().optional(),
    score: z.string().optional(),
    scorer: z.string().optional(),
    strength: z.string().optional(),
    wp_delta: z.number().optional(),
  })
  .passthrough();

export const GameFlowSchema = z
  .object({
    game_id: z.string().optional(),
    points: z.array(FlowPointSchema).optional(),
    goals: z.array(FlowGoalSchema).optional(),
    three_stars: z.array(ThreeStarSchema).nullable().optional(),
  })
  .passthrough();
export type GameFlow = z.infer<typeof GameFlowSchema>;

// ── GET /v1/games/:id/series ─────────────────────────────────────────────────

const SeriesStatusSchema = z
  .object({
    gameNumberOfSeries: z.number().optional(),
    topSeedTeamAbbrev: z.string().optional(),
    topSeedWins: z.number().optional(),
    bottomSeedWins: z.number().optional(),
    seriesTitle: z.string().optional(),
    seriesAbbrev: z.string().optional(),
  })
  .passthrough();

export const GameSeriesResponseSchema = z
  .object({
    seriesStatus: SeriesStatusSchema.nullable().optional(),
  })
  .passthrough();
export type GameSeriesResponse = z.infer<typeof GameSeriesResponseSchema>;

// ── GET /v1/games/team-history ──────────────────────────────────────────────

export const TeamHistoryResponseSchema = z
  .object({
    games: z
      .array(
        z
          .object({
            game_id: z.string().optional(),
            status: z.string().optional(),
            date: z.string().optional(),
            game_date: z.string().nullable().optional(),
            away_team: TeamRefSchema.optional(),
            home_team: TeamRefSchema.optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();
export type TeamHistoryResponse = z.infer<typeof TeamHistoryResponseSchema>;

// ── GET /v1/games/:id/pregame, /boxscore, /events, /on-ice, /lines ──────────
// These proxy (largely) raw NHL API shapes consumed dynamically by untyped
// client JS (games/index.astro is:inline) — no prior hand-written TS type
// exists to mirror, so these stay maximally permissive passthrough records.

export const GamePregameSchema = z.record(z.string(), z.unknown());
export type GamePregame = z.infer<typeof GamePregameSchema>;

export const GameBoxscoreSchema = z.record(z.string(), z.unknown());
export type GameBoxscore = z.infer<typeof GameBoxscoreSchema>;

export const GameEventsSchema = z.record(z.string(), z.unknown());
export type GameEvents = z.infer<typeof GameEventsSchema>;

export const GameOnIceSchema = z.record(z.string(), z.unknown());
export type GameOnIce = z.infer<typeof GameOnIceSchema>;

export const GameLinesSchema = z.record(z.string(), z.unknown());
export type GameLines = z.infer<typeof GameLinesSchema>;

// ── GET /v1/playoffs/round/:n ────────────────────────────────────────────────

const PlayoffSeriesSchema = z
  .object({
    series_id: z.string().optional(),
    round: z.number().optional(),
    season: z.string().optional(),
    team_a: z.string().optional(),
    team_b: z.string().optional(),
    win_pct_a: z.number().optional(),
    win_pct_b: z.number().optional(),
    next_game_utc: z.string().nullable().optional(),
    games: z.array(z.string().nullable()).optional(),
    is_complete: z.boolean().optional(),
    winner: z.string().nullable().optional(),
    winner_in: z.number().nullable().optional(),
    updated_at: z.string().nullable().optional(),
  })
  .passthrough();

export const PlayoffRoundSchema = z
  .object({
    series: z.array(PlayoffSeriesSchema).optional(),
  })
  .passthrough();
export type PlayoffRound = z.infer<typeof PlayoffRoundSchema>;

// ── GET /v1/series/:id/players ───────────────────────────────────────────────

const SeriesPlayerSchema = z
  .object({
    player_id: z.union([z.number(), z.string()]).optional(),
    team: z.string().optional(),
    name: z.string().optional(),
    pos: z.string().optional(),
    gp: z.number().optional(),
    goals: z.number().optional(),
    a1: z.number().optional(),
    a2: z.number().optional(),
    points: z.number().optional(),
  })
  .passthrough();

export const SeriesPlayersResponseSchema = z
  .object({
    players: z.array(SeriesPlayerSchema).optional(),
  })
  .passthrough();
export type SeriesPlayersResponse = z.infer<typeof SeriesPlayersResponseSchema>;

// ── GET /v1/series/:id/lines ─────────────────────────────────────────────────

const SeriesLineSchema = z
  .object({
    type: z.string().optional(),
    team: z.string().optional(),
    toi_min: z.number().optional(),
  })
  .passthrough();

export const SeriesLinesResponseSchema = z
  .object({
    lines: z.array(SeriesLineSchema).optional(),
  })
  .passthrough();
export type SeriesLinesResponse = z.infer<typeof SeriesLinesResponseSchema>;

// ── GET /v1/series/:id/shots ──────────────────────────────────────────────────
// API tuple: [x, y, is_goal, shot_type, team, ...] — kept as a loose tuple
// with a passthrough tail since the API may append fields (e.g. xG later).

const SeriesShotTupleSchema = z.tuple([z.number(), z.number(), z.number(), z.string(), z.string()]).rest(z.unknown());

export const SeriesShotsResponseSchema = z
  .object({
    shots: z.array(SeriesShotTupleSchema).optional(),
  })
  .passthrough();
export type SeriesShotsResponse = z.infer<typeof SeriesShotsResponseSchema>;

// ── Parse helpers (mirror live-mock-schemas.ts/parseLiveMockOrThrow) ────────

function formatIssues(error: z.ZodError): string {
  const issueLines = error.issues.slice(0, 8).map(issue => {
    const path = issue.path.length ? issue.path.join('.') : '<root>';
    const received =
      'received' in issue && (issue as { received?: unknown }).received !== undefined
        ? ` (received: ${JSON.stringify((issue as { received?: unknown }).received).slice(0, 80)})`
        : '';
    return `  • ${path}: ${issue.message}${received}`;
  });
  const more = error.issues.length > 8 ? `\n  … ${error.issues.length - 8} more issue(s)` : '';
  return `${issueLines.join('\n')}${more}`;
}

function makeParseOrThrow<T>(schema: z.ZodType<T>) {
  return (data: unknown, sourceLabel: string): T => {
    const result = schema.safeParse(data);
    if (result.success) return result.data;
    throw new Error(`[hgb-api-schemas] ${sourceLabel} failed runtime validation:\n${formatIssues(result.error)}`);
  };
}

export const parseScoreboardOrThrow = makeParseOrThrow(ScoreboardSchema);
export const parseGoalsResponseOrThrow = makeParseOrThrow(GoalsResponseSchema);
export const parseGamesTodayResponseOrThrow = makeParseOrThrow(GamesTodayResponseSchema);
export const parseGameFlowOrThrow = makeParseOrThrow(GameFlowSchema);
export const parseGameSeriesResponseOrThrow = makeParseOrThrow(GameSeriesResponseSchema);
export const parseTeamHistoryResponseOrThrow = makeParseOrThrow(TeamHistoryResponseSchema);
export const parseGamePregameOrThrow = makeParseOrThrow(GamePregameSchema);
export const parseGameBoxscoreOrThrow = makeParseOrThrow(GameBoxscoreSchema);
export const parseGameEventsOrThrow = makeParseOrThrow(GameEventsSchema);
export const parseGameOnIceOrThrow = makeParseOrThrow(GameOnIceSchema);
export const parseGameLinesOrThrow = makeParseOrThrow(GameLinesSchema);
export const parsePlayoffRoundOrThrow = makeParseOrThrow(PlayoffRoundSchema);
export const parseSeriesPlayersResponseOrThrow = makeParseOrThrow(SeriesPlayersResponseSchema);
export const parseSeriesLinesResponseOrThrow = makeParseOrThrow(SeriesLinesResponseSchema);
export const parseSeriesShotsResponseOrThrow = makeParseOrThrow(SeriesShotsResponseSchema);

/**
 * Runtime (non-throwing) validation used by hgb-api-client.ts. Logs a
 * console.error with `sourceLabel` + issues on failure and returns the raw,
 * unvalidated data — live API responses must never crash a page over a
 * shape mismatch (pages already tolerate missing fields via `?.` chaining).
 */
export function safeValidate<T>(schema: z.ZodType<T>, data: unknown, sourceLabel: string): T {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  // eslint-disable-next-line no-console
  console.error(`[hgb-api-client] ${sourceLabel} failed runtime validation:\n${formatIssues(result.error)}`);
  return data as T;
}
