/**
 * Zod schemas for the recap-mode mock data (SITE-HOME-04 / Layer 4).
 *
 * Validates `src/data/home-mock/recap.json` at build time so a typo or
 * shape drift in the JSON fixture fails the build with a path-aware
 * message instead of silently rendering broken markup.
 *
 * Cross-repo contract: when the eventual Python recap-pipeline ships
 * (Layer 6+ — likely a 6 AM ET cron that materializes a recap card
 * pack), it will produce JSON matching these shapes. Same pattern as
 * `live-mock-schemas.ts` and `artifact-schemas.ts`.
 *
 * Shape model
 * -----------
 * The recap fixture composes existing artifact schemas (every wall card
 * is one of the 11 artifact types) plus three recap-specific blocks:
 *   - game_of_night     (reuses ArtifactGameSchema)
 *   - supporting_hero   (discriminated union: clinch | milestone | hattrick)
 *   - tweet_echo[]      (recap-specific shape)
 *
 * Reuse beats duplication — every artifact's schema is the source of
 * truth for both live and recap fixtures.
 */

import { z } from 'zod';
import {
  ArtifactGameSchema,
  ArtifactHotSchema,
  ArtifactColdSchema,
  ArtifactMilestoneSchema,
  ArtifactLineSchema,
  ArtifactMatchupSchema,
  ArtifactClinchSchema,
  ArtifactSeasonSchema,
  ArtifactHatTrickSchema,
  ArtifactThreeStarsSchema,
  ArtifactGoalieSchema,
} from './artifact-schemas';

// ── Playoff strip (mirror of live-mock — local copy keeps imports clean) ─

const PlayoffStripSeriesSchema = z.object({
  text: z.string(),
  emphasize: z.array(z.string()).optional(),
});
const PlayoffStripSchema = z.object({
  eyebrow: z.string(),
  series: z.array(PlayoffStripSeriesSchema),
});

// ── Wall entry — discriminated union on `slug` ──────────────────────────

const WallSpanSchema = z.enum(['a-3', 'a-4', 'a-6', 'a-8', 'a-12']);

/**
 * Each wall entry pairs a slug with the matching artifact schema. The
 * union is discriminated so a typo in one slug doesn't cascade-fail
 * every other slug's payload — Zod reports the exact path.
 *
 * `matchup` is intentionally allowed in recap fixtures even though the
 * canonical recap design only shows past games. Including it keeps the
 * schema permissive for hybrid fixtures (e.g. "tomorrow's slate" mixed
 * into recap). The recap chip filter does not surface matchup directly;
 * unfiltered ALL view is the only place it shows.
 */
const WallEntrySchema = z.discriminatedUnion('slug', [
  z.object({ slug: z.literal('game'),       span: WallSpanSchema, data: ArtifactGameSchema }),
  z.object({ slug: z.literal('hot'),        span: WallSpanSchema, data: ArtifactHotSchema }),
  z.object({ slug: z.literal('cold'),       span: WallSpanSchema, data: ArtifactColdSchema }),
  z.object({ slug: z.literal('milestone'),  span: WallSpanSchema, data: ArtifactMilestoneSchema }),
  z.object({ slug: z.literal('line'),       span: WallSpanSchema, data: ArtifactLineSchema }),
  z.object({ slug: z.literal('matchup'),    span: WallSpanSchema, data: ArtifactMatchupSchema }),
  z.object({ slug: z.literal('clinch'),     span: WallSpanSchema, data: ArtifactClinchSchema }),
  z.object({ slug: z.literal('season'),     span: WallSpanSchema, data: ArtifactSeasonSchema }),
  z.object({ slug: z.literal('hattrick'),   span: WallSpanSchema, data: ArtifactHatTrickSchema }),
  z.object({ slug: z.literal('stars'),      span: WallSpanSchema, data: ArtifactThreeStarsSchema }),
  z.object({ slug: z.literal('goalie'),     span: WallSpanSchema, data: ArtifactGoalieSchema }),
]);
export type WallEntry = z.infer<typeof WallEntrySchema>;

// ── Supporting hero — three artifact subtypes that pair with a game ─────

export const SupportingHeroSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('clinch'),    data: ArtifactClinchSchema }),
  z.object({ kind: z.literal('milestone'), data: ArtifactMilestoneSchema }),
  z.object({ kind: z.literal('hattrick'),  data: ArtifactHatTrickSchema }),
]);
export type SupportingHero = z.infer<typeof SupportingHeroSchema>;

// ── Tweet echo — recap-specific shape ──────────────────────────────────

export const TweetEchoEntrySchema = z.object({
  /** ISO-8601; not user-facing but useful for sort + audit. */
  posted_at: z.string().min(1),
  /** Display label, e.g. "10:47 PM". */
  posted_label: z.string().min(1),
  /**
   * Card-type footer string, e.g. "CLINCH CARD · 1200×675". Free-form
   * but the bot pipeline should keep these consistent across nights so
   * fans can scan for recurring card types.
   */
  card_type: z.string().min(1),
  /**
   * Allowed tags: <b>, <strong>, <br>, <span class="hl|gold|red|green">.
   * Internal-only input from the bot's tweet templater — set:html'd
   * downstream. Kept loose-typed here; runtime sanitizer not added (the
   * input source is trusted; user input never reaches this surface).
   */
  body_html: z.string().min(1),
  engagement: z.object({
    likes: z.number().int().nonnegative(),
    retweets: z.number().int().nonnegative(),
    replies: z.number().int().nonnegative(),
  }),
});
export type TweetEchoEntry = z.infer<typeof TweetEchoEntrySchema>;

// ── Top-level recap-mock schema ────────────────────────────────────────

export const RecapMockSchema = z.object({
  mode: z.literal('recap'),
  date_label: z.string(),
  playoff_strip: PlayoffStripSchema.optional(),
  hero_eyebrow: z.string(),

  /** Game-of-the-night — passed straight through to ArtifactGame. */
  game_of_night: ArtifactGameSchema,
  /** Optional companion artifact next to the hero. */
  supporting_hero: SupportingHeroSchema.nullable().optional(),

  /** Wall cards, in render order. Empty array allowed (no-recap night). */
  wall: z.array(WallEntrySchema),

  /** Tweet echo entries. 0+ allowed; section hides gracefully when empty
   *  (TweetEcho component renders a placeholder lede with no row). */
  tweet_echo: z.array(TweetEchoEntrySchema),
});
export type RecapMock = z.infer<typeof RecapMockSchema>;

// ── Parse helper (mirrors live-mock-schemas.ts/parseLiveMockOrThrow) ───

export function parseRecapMockOrThrow(data: unknown, sourceLabel: string): RecapMock {
  const result = RecapMockSchema.safeParse(data);
  if (result.success) return result.data;

  const issueLines = result.error.issues.slice(0, 8).map(issue => {
    const path = issue.path.length ? issue.path.join('.') : '<root>';
    const received =
      'received' in issue && issue.received !== undefined
        ? ` (received: ${JSON.stringify(issue.received).slice(0, 80)})`
        : '';
    return `  • ${path}: ${issue.message}${received}`;
  });
  const more =
    result.error.issues.length > 8
      ? `\n  … ${result.error.issues.length - 8} more issue(s)`
      : '';

  throw new Error(
    `[recap-mock-schemas] ${sourceLabel} failed runtime validation:\n${issueLines.join('\n')}${more}`,
  );
}
