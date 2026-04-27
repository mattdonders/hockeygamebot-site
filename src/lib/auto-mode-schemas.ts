/**
 * Zod schemas for auto-mode + tomorrow + offseason mocks (SITE-HOME-05).
 *
 * Same pattern as live-mock-schemas.ts / recap-mock-schemas.ts — validates
 * the JSON fixtures at build time so a typo or shape drift in any of the
 * mocks fails the build with a path-aware error.
 *
 * Cross-repo contract: the Worker serves GET /v1/scoreboard producing JSON
 * matching ScoreboardSchema. The site mock files in src/data/home-mock/ must
 * also validate against this schema for build-time correctness guarantees.
 *
 * Layer 1.5 (April 2026): ScheduleSnapshotSchema replaced by ScoreboardSchema.
 * The old `{today, yesterday}` envelope is superseded by `{date, games[],
 * previous_day: {hockey_date, games[]}, cached}` — richer per-game shape,
 * full previous_day data (no second fetch needed for RECAP mode).
 */

import { z } from 'zod';
import {
  ArtifactMatchupSchema,
  ArtifactHotSchema,
  ArtifactColdSchema,
  ArtifactMilestoneSchema,
  ArtifactGameSchema,
} from './artifact-schemas';

// ── Scoreboard schema — feeds detectMode() + slate strip + RECAP ──────────

/** Site 5-state game vocabulary. */
export const GameStateSchema = z.enum(['pre', 'live', 'intermission', 'shootout', 'final']);
export type GameState = z.infer<typeof GameStateSchema>;

/**
 * Strength state strings produced by hgb-bot.
 *
 * New bot (rewrite): '5v5', '5v4', '4v5', etc.
 * Old bot (production, transition): 'EV', 'PP', 'PK' — legacy strength codes.
 * Both sets accepted for compatibility during the old→new bot migration.
 *
 * Empty-net variants: EN_HOME means the home team has an empty net (away team
 * pulled their goalie); EN_AWAY means the away team has an empty net (home team
 * pulled their goalie). Same directional pattern applies to SO_HOME / SO_AWAY
 * for shootout-situation variants. These suffixed forms are written by the new
 * rewrite bot to game_state and may appear in scoreboard strength_state fields.
 */
export const StrengthStateSchema = z.enum([
  '5v5', '5v4', '4v5', '5v3', '3v5', '4v4', '3v3', '6v5', '5v6', 'EN', 'SO', 'unknown',
  // Directional empty-net variants (new rewrite bot — game_state field):
  'EN_HOME', 'EN_AWAY',
  // Directional shootout variants:
  'SO_HOME', 'SO_AWAY',
  // Legacy old-bot strength codes (kept for backward compat during migration):
  'EV', 'PP', 'PK',
]);
export type StrengthState = z.infer<typeof StrengthStateSchema>;

/** Home/away numeric pair — used for shots, xG, and win probability stats. */
export const MetricPairSchema = z.object({
  home: z.number().nullable(),
  away: z.number().nullable(),
});
export type MetricPair = z.infer<typeof MetricPairSchema>;

/** Team info with current score. */
export const TeamSchema = z.object({
  id: z.number().int().nonnegative(),
  abbrev: z.string().min(2).max(4),
  name: z.string().min(1),
  short_name: z.string().min(1),
  score: z.number().int().nonnegative(),
});
export type Team = z.infer<typeof TeamSchema>;

/** Clock state — period, time, intermission flag, server timestamp. */
export const ClockSchema = z.object({
  /** null when game_state is 'pre' or 'final'. */
  period: z.number().int().nonnegative().nullable(),
  /** 'MM:SS'; '00:00' for final; null for pre/intermission. */
  time_remaining: z.string().nullable(),
  /**
   * null when game hasn't started (pre state) — the API returns null before
   * first puck drop since there's no clock state to interrogate yet.
   * false during live play, true during intermission breaks.
   */
  in_intermission: z.boolean().nullable(),
  /** ISO timestamp when the clock snapshot was captured (for client-side countdown). null when not live. */
  clock_at: z.string().nullable(),
});
export type Clock = z.infer<typeof ClockSchema>;

/** Live game stats — all metrics null for pre-game. */
export const StatsSchema = z.object({
  shots_on_goal: MetricPairSchema,
  xg: MetricPairSchema,
  xg_5v5: MetricPairSchema,
  win_probability: MetricPairSchema,
});
export type Stats = z.infer<typeof StatsSchema>;

/**
 * A single recent event entry (last_event or element of recent_events[]).
 *
 * Field compatibility notes (transition period):
 *  - `description` vs `desc`: API currently uses both; schema accepts either.
 *    `desc` is the compact form for recent_events[]; `description` for last_event.
 *  - `time_ago`: optional/nullable — may be absent in older API responses.
 *  - `occurred_at`: may appear instead of time_ago on last_event.
 */
export const EventSchema = z.object({
  type: z.string(),
  description: z.string().optional().default(''),
  /** Compact form in recent_events[]. */
  desc: z.string().optional(),
  time_ago: z.string().nullable().optional(),
  /** ISO timestamp — appears on last_event in current API. */
  occurred_at: z.string().optional(),
  /** Only present in recent_events[]; absent on last_event. */
  period: z.number().int().nonnegative().nullable().optional(),
  time: z.string().nullable().optional(),
  /** 'at' field in recent_events[] — ISO timestamp variant. */
  at: z.string().optional(),
}).transform(d => ({
  type: d.type,
  description: d.description || d.desc || '',
  time_ago: d.time_ago ?? d.occurred_at ?? null,
  period: d.period ?? null,
  time: d.time ?? null,
}));
export type ScoreboardEvent = z.infer<typeof EventSchema>;

/**
 * Full per-game scoreboard shape — returned in both games[] and
 * previous_day.games[]. This is the LOCKED schema from Layer 1.5.
 *
 * Field semantics:
 *  - `game_state`      — 5-state site vocab (pre/live/intermission/shootout/final)
 *  - `strength_state`  — top-level, NOT nested inside clock
 *  - `stats.*`         — all metrics use {home, away} shape; null pair for pre
 *  - `win_probability` — home-relative float, converted to {home, away} by Worker
 *  - `previous_day`    — semantically "date − 1 day", not "yesterday"
 */
export const ScoreboardGameSchema = z.object({
  game_id: z.string().min(1),
  game_state: GameStateSchema,
  strength_state: StrengthStateSchema.nullable(),
  venue: z.string().nullable(),
  start_time_utc: z.string().datetime().nullable(),
  home_team: TeamSchema,
  away_team: TeamSchema,
  clock: ClockSchema,
  stats: StatsSchema,
  last_event: EventSchema.nullable(),
  recent_events: z.array(EventSchema).max(5),
  three_stars: z.array(z.record(z.string(), z.unknown())).nullable(),
  score_by_period: z.array(z.object({
    period: z.number().int().positive(),
    home: z.number().int().nonnegative(),
    away: z.number().int().nonnegative(),
  })).nullable().optional(),
});
export type ScoreboardGame = z.infer<typeof ScoreboardGameSchema>;

/** The previous_day block — full game data for the calendar day before the requested date. */
const ScoreboardPreviousDaySchema = z.object({
  hockey_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** FULL game shape — not a count. RECAP mode hydrates from this without a second fetch. */
  games: z.array(ScoreboardGameSchema),
});

/**
 * Root scoreboard envelope — response shape of GET /v1/scoreboard.
 *
 * `detectMode()` uses:
 *   - `games.map(g => g.game_state)` — for today's active states
 *   - `games.length` — for today's game count
 *   - `Math.min(...games.map(g => Date.parse(g.start_time_utc)))` — for first puck
 *   - `previous_day.games.length` — for "anything yesterday?" RECAP rollover
 */
export const ScoreboardSchema = z.object({
  /** Hockey date for this scoreboard (YYYY-MM-DD). */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** All games on this hockey date. Empty array when no games scheduled. */
  games: z.array(ScoreboardGameSchema),
  previous_day: ScoreboardPreviousDaySchema,
  /** True when data was served from games_cache; false when cache was empty. */
  cached: z.boolean(),
});
export type Scoreboard = z.infer<typeof ScoreboardSchema>;

/**
 * Multi-variant scoreboard mock — one root keyed by scenario name. The
 * /home-v2 page reads `?schedule=morning|afternoon|evening|night|offseason`
 * and picks the matching variant. Default = `default`.
 *
 * Allowing extra keys via `.passthrough()` so we can add more scenarios
 * without bumping the schema (e.g. `playoff-clincher-night`).
 */
export const ScoreboardVariantsSchema = z
  .object({
    default: ScoreboardSchema,
    morning: ScoreboardSchema.optional(),
    afternoon: ScoreboardSchema.optional(),
    evening: ScoreboardSchema.optional(),
    night: ScoreboardSchema.optional(),
    /** Layer 1.8: today empty + previous_day has games → auto-triggers YESTERDAY mode. */
    yesterday: ScoreboardSchema.optional(),
    offseason: ScoreboardSchema.optional(),
  })
  .passthrough();
export type ScoreboardVariants = z.infer<typeof ScoreboardVariantsSchema>;

// ── Playoff strip (mirror of live/recap mocks) ─────────────────────────────

const PlayoffStripSeriesSchema = z.object({
  text: z.string(),
  emphasize: z.array(z.string()).optional(),
});
const PlayoffStripSchema = z.object({
  eyebrow: z.string(),
  series: z.array(PlayoffStripSeriesSchema),
});

// ── Tomorrow's Slate ────────────────────────────────────────────────────────

/**
 * One scheduled game in the slate strip. Compact shape (logo + abbrev +
 * scheduled start time). Looser than RecapScoreTile because tomorrow's
 * games haven't happened — no scores, no end-clock, no winner-loser dim.
 */
export const TomorrowSlateTileSchema = z.object({
  gameId: z.string().min(1),
  /**
   * Free-form local kickoff label — "7:00 PM ET" / "10:30 PM ET". Bot
   * pipeline owns the formatting; the site renders raw.
   */
  start_time: z.string().min(1),
  /**
   * Series context, e.g. "Series 1-1 · Game 3", "Reg-season finale". Optional
   * — falls through to a generic "TOMORROW · 7:00 PM ET" eyebrow when absent.
   */
  series_status: z.string().optional(),
  home: z.object({
    abbrev: z.string().min(2).max(4),
    logo: z.string().min(1),
    record: z.string().optional(),
    accentColor: z
      .string()
      .regex(/^#[0-9A-Fa-f]{3,8}$/)
      .optional(),
  }),
  away: z.object({
    abbrev: z.string().min(2).max(4),
    logo: z.string().min(1),
    record: z.string().optional(),
    accentColor: z
      .string()
      .regex(/^#[0-9A-Fa-f]{3,8}$/)
      .optional(),
  }),
  /**
   * Home team win probability (0..1) from the blended model. Optional —
   * slate strip degrades gracefully when absent (no WP shown). Added
   * Layer 5.8 for WP chip/inline variants on the slate strip.
   */
  home_wp: z.number().min(0).max(1).optional(),
  /**
   * Away team win probability (0..1). Present iff home_wp is present.
   */
  away_wp: z.number().min(0).max(1).optional(),
});
export type TomorrowSlateTile = z.infer<typeof TomorrowSlateTileSchema>;

/**
 * Per-game prediction tile. Bot pipeline outputs from its blended Elo +
 * xG model (the same one driving the playoff prediction cards). Optional
 * fields gracefully degrade — e.g. a regular-season game might not have a
 * series-context line.
 */
export const TomorrowPredictionSchema = z.object({
  gameId: z.string().min(1),
  home_abbrev: z.string().min(2).max(4),
  away_abbrev: z.string().min(2).max(4),
  /** Home win probability (0..1). */
  home_wp: z.number().min(0).max(1),
  /** Predicted goals — display strings ("3.2"), not floats. */
  home_xg: z.string().min(1),
  away_xg: z.string().min(1),
  // Layer 5.6: dropped `top_scorer_pick` (no model for it) and
  // `narrative` (mini-essay was too noisy across a 3-up grid). The
  // simplified card surfaces only logos + WP + xG — three rows tall,
  // built for comparative scan.
});
export type TomorrowPrediction = z.infer<typeof TomorrowPredictionSchema>;

/**
 * Storyline cards — projections of artifacts that COULD fire tomorrow.
 * Reuses the live-side artifact schemas (Hot / Cold / Milestone) so the
 * existing components render without modification. Discriminated on
 * `kind` to match the Layer 2 artifact prop shapes.
 */
export const TomorrowStorylineSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('hot'), data: ArtifactHotSchema }),
  z.object({ kind: z.literal('cold'), data: ArtifactColdSchema }),
  z.object({ kind: z.literal('milestone'), data: ArtifactMilestoneSchema }),
]);
export type TomorrowStoryline = z.infer<typeof TomorrowStorylineSchema>;

export const TomorrowMockSchema = z.object({
  mode: z.literal('tomorrow'),
  date_label: z.string().min(1),
  playoff_strip: PlayoffStripSchema.optional(),
  hero_eyebrow: z.string().min(1),
  /** Featured matchup for the hero — uses ArtifactMatchup props directly. */
  featured_matchup: ArtifactMatchupSchema,
  /** All games scheduled for tomorrow, in chronological order. */
  slate: z.array(TomorrowSlateTileSchema),
  /** Top 3-4 most-anticipated matchups for the preview wall. */
  matchup_previews: z.array(ArtifactMatchupSchema).min(0).max(8),
  /** Per-game projections — typically 4-8 entries depending on slate size. */
  predictions: z.array(TomorrowPredictionSchema),
  /** Storylines that "could fire tomorrow if X happens". */
  storylines: z.array(TomorrowStorylineSchema),
});
export type TomorrowMock = z.infer<typeof TomorrowMockSchema>;

// ── Offseason ───────────────────────────────────────────────────────────────

/**
 * Last-played memorial — the last game on the books before offseason
 * began. Reuses ArtifactGame schema so the existing component renders
 * without modification. The `kind` is informational (drives memorial
 * eyebrow framing in the UI) — schema doesn't enforce a particular value.
 */
export const OffseasonLastPlayedSchema = z.object({
  /**
   * 'scf_g7' for Stanley Cup Final Game 7, 'preseason' for last preseason
   * game (used during the late-Sept window before opening night), 'regular'
   * for regular-season finale fallback. Free-form string keeps the schema
   * forward-compatible if more framings are added.
   */
  kind: z.string().min(1),
  game_data: ArtifactGameSchema,
  /** Memorial framing line, e.g. "LAST GAME PLAYED · 2026 STANLEY CUP · GAME 7". */
  memorial_eyebrow: z.string().min(1),
});
export type OffseasonLastPlayed = z.infer<typeof OffseasonLastPlayedSchema>;

export const OffseasonStorylineSchema = z.object({
  /** Free-form kind tag — 'trades', 'fa', 'draft', etc. */
  kind: z.string().min(1),
  headline: z.string().min(1),
  subtitle: z.string().min(1),
  cta: z.string().min(1),
});
export type OffseasonStoryline = z.infer<typeof OffseasonStorylineSchema>;

export const OffseasonCountdownSchema = z.object({
  /** Days until opening night — non-negative integer. */
  days: z.number().int().nonnegative(),
  training_camp_date: z.string().min(1),
  opening_night: z.string().min(1),
});
export type OffseasonCountdown = z.infer<typeof OffseasonCountdownSchema>;

export const OffseasonMockSchema = z.object({
  mode: z.literal('offseason'),
  date_label: z.string().min(1),
  /** No playoff strip in offseason — schema rejects it for clarity. */
  hero_eyebrow: z.string().min(1),
  countdown: OffseasonCountdownSchema,
  last_played: OffseasonLastPlayedSchema,
  summer_storylines: z.array(OffseasonStorylineSchema).min(1).max(6),
});
export type OffseasonMock = z.infer<typeof OffseasonMockSchema>;

// ── Parse helpers (mirror parseLiveMockOrThrow / parseRecapMockOrThrow) ────

function formatIssues(issues: z.ZodIssue[]): string {
  const lines = issues.slice(0, 8).map(issue => {
    const path = issue.path.length ? issue.path.join('.') : '<root>';
    const received =
      'received' in issue && issue.received !== undefined
        ? ` (received: ${JSON.stringify(issue.received).slice(0, 80)})`
        : '';
    return `  • ${path}: ${issue.message}${received}`;
  });
  const more = issues.length > 8 ? `\n  … ${issues.length - 8} more issue(s)` : '';
  return lines.join('\n') + more;
}

export function parseScoreboardVariantsOrThrow(data: unknown, sourceLabel: string): ScoreboardVariants {
  const result = ScoreboardVariantsSchema.safeParse(data);
  if (result.success) return result.data;
  throw new Error(
    `[auto-mode-schemas] ${sourceLabel} failed runtime validation:\n${formatIssues(result.error.issues)}`,
  );
}

/**
 * @deprecated Use parseScoreboardVariantsOrThrow — ScheduleVariants was the Layer 1 name.
 * Kept as alias during the transition so callers that haven't migrated yet don't break the build.
 */
export const ScheduleVariantsSchema = ScoreboardVariantsSchema;
export type ScheduleVariants = ScoreboardVariants;
export function parseScheduleVariantsOrThrow(data: unknown, sourceLabel: string): ScoreboardVariants {
  return parseScoreboardVariantsOrThrow(data, sourceLabel);
}

export function parseTomorrowMockOrThrow(data: unknown, sourceLabel: string): TomorrowMock {
  const result = TomorrowMockSchema.safeParse(data);
  if (result.success) return result.data;
  throw new Error(
    `[auto-mode-schemas] ${sourceLabel} failed runtime validation:\n${formatIssues(result.error.issues)}`,
  );
}

export function parseOffseasonMockOrThrow(data: unknown, sourceLabel: string): OffseasonMock {
  const result = OffseasonMockSchema.safeParse(data);
  if (result.success) return result.data;
  throw new Error(
    `[auto-mode-schemas] ${sourceLabel} failed runtime validation:\n${formatIssues(result.error.issues)}`,
  );
}
