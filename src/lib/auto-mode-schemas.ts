/**
 * Zod schemas for auto-mode + tomorrow + offseason mocks (SITE-HOME-05).
 *
 * Same pattern as live-mock-schemas.ts / recap-mock-schemas.ts — validates
 * the JSON fixtures at build time so a typo or shape drift in any of the
 * mocks fails the build with a path-aware error.
 *
 * Cross-repo contract: when the Python pipeline ships, it produces JSON
 * matching these shapes. The "schedule snapshot" is the most likely first
 * production handoff — it's a tiny payload (today + yesterday game count
 * + first puck-drop) that Python computes once at the 6 AM ET rollover
 * and stores in KV / D1.
 */

import { z } from 'zod';
import {
  ArtifactMatchupSchema,
  ArtifactHotSchema,
  ArtifactColdSchema,
  ArtifactMilestoneSchema,
  ArtifactGameSchema,
} from './artifact-schemas';

// ── Schedule snapshot — feeds detectMode() ─────────────────────────────────

const AutoModeGameStateSchema = z.enum(['pre', 'live', 'intermission', 'shootout', 'final']);

const ScheduleTodaySchema = z.object({
  hockey_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /**
   * `null` is meaningful (offseason / no games). The schema rejects
   * arbitrary strings here so a Python bug emitting "" instead of null
   * fails the build instead of silently triggering "no first game" code
   * paths at runtime.
   */
  first_game_start_iso: z.string().datetime().nullable(),
  games_count: z.number().int().nonnegative(),
  games_states: z.array(AutoModeGameStateSchema),
});

const ScheduleYesterdaySchema = z.object({
  hockey_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  games_count: z.number().int().nonnegative(),
});

export const ScheduleSnapshotSchema = z.object({
  today: ScheduleTodaySchema,
  yesterday: ScheduleYesterdaySchema,
});
export type ScheduleSnapshotMock = z.infer<typeof ScheduleSnapshotSchema>;

/**
 * Multi-variant schedule mock — one root keyed by scenario name. The
 * /home-v2 page reads `?schedule=morning|afternoon|evening|night|offseason`
 * and picks the matching variant. Default = `default`.
 *
 * Allowing extra keys via `.passthrough()` so we can add more scenarios
 * without bumping the schema (e.g. `playoff-clincher-night`).
 */
export const ScheduleVariantsSchema = z
  .object({
    default: ScheduleSnapshotSchema,
    morning: ScheduleSnapshotSchema.optional(),
    afternoon: ScheduleSnapshotSchema.optional(),
    evening: ScheduleSnapshotSchema.optional(),
    night: ScheduleSnapshotSchema.optional(),
    offseason: ScheduleSnapshotSchema.optional(),
  })
  .passthrough();
export type ScheduleVariants = z.infer<typeof ScheduleVariantsSchema>;

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
  /** Vegas comparison line, e.g. "BOS −155 · O/U 6.5". Optional. */
  vegas_line: z.string().optional(),
  /** Top scorer bot pick, e.g. "Pastrnak (BOS) — 0.55G". */
  top_scorer_pick: z.string().optional(),
  /** Tiny narrative blurb — "BOS at home off 2 days rest." */
  narrative: z.string().optional(),
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

export function parseScheduleVariantsOrThrow(data: unknown, sourceLabel: string): ScheduleVariants {
  const result = ScheduleVariantsSchema.safeParse(data);
  if (result.success) return result.data;
  throw new Error(
    `[auto-mode-schemas] ${sourceLabel} failed runtime validation:\n${formatIssues(result.error.issues)}`,
  );
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
