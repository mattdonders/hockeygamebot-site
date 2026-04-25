/**
 * Zod schemas for the live-mode mock data (SITE-HOME-03 / Layer 3).
 *
 * Validates `src/data/home-mock/live.json` (and its sibling
 * `live.shootout.json`) at build time so a typo in the JSON fixture
 * fails the build with a path-aware message instead of silently
 * rendering broken markup.
 *
 * Cross-repo contract: when the eventual Python live-poll service ships
 * (Layer 6+), it will produce JSON matching these shapes — same way
 * `artifact-schemas.ts` is the contract between site + the card
 * generator. Bump a `schema_version` field if the shapes need to change
 * incompatibly later.
 *
 * Pattern note: the artifact-card schemas already live in
 * `artifact-schemas.ts`. The `live_moments` discriminated union here
 * REUSES those schemas for each moment's `data` payload — no
 * duplicate-of-truth.
 */

import { z } from 'zod';
import {
  ArtifactMilestoneSchema,
  ArtifactHatTrickSchema,
  ArtifactGoalieSchema,
  ArtifactClinchSchema,
} from './artifact-schemas';

// ── Featured-game shapes (mirrors LiveHero.astro `FeaturedGame`) ───────────

const TeamPaneSchema = z.object({
  abbrev: z.string().min(2).max(4),
  record: z.string(),
  score: z.number().int(),
  accent: z.string().regex(/^#[0-9A-Fa-f]{3,8}$/),
  logo: z.string().min(1),
  pbp: z.array(z.number().int().nonnegative()).min(4).max(6),
});

const StatPairSchema = z.object({
  home: z.number(),
  away: z.number(),
  unit: z.string().optional(),
});

const StrengthStateSchema = z.object({
  state: z.string(),
  team: z.string().optional(),
  clock: z.string().optional(),
});

const GoalEntrySchema = z.object({
  period: z.number().int().min(1).max(5),
  clock: z.string(),
  team: z.string().min(2).max(4),
  scorer: z.string(),
  goal_number: z.number().int().nonnegative().optional(),
  assists: z.array(z.string()),
  score_after: z.string(),
  strength: z.string().optional(),
  overturned: z.boolean().optional(),
  review_reason: z.string().optional(),
});

const LastEventEntrySchema = z.object({
  period: z.number().int().min(1).max(5),
  clock: z.string(),
  type: z.string(),
  team: z.string().optional(),
  player: z.string().optional(),
  reason: z.string().optional(),
  danger: z.string().optional(),
});

// Shootout block — populated only when `featured_game.status === 'shootout'`.
const ShootoutAttemptSchema = z.object({
  shooter: z.string().min(1),
  result: z.enum(['goal', 'save', 'miss', 'pending']),
});
const ShootoutGoalieSchema = z.object({
  name: z.string().min(1),
  saves: z.number().int().nonnegative(),
  attempts: z.number().int().nonnegative(),
});
export const ShootoutBlockSchema = z.object({
  round: z.number().int().min(1),
  home: z.array(ShootoutAttemptSchema),
  away: z.array(ShootoutAttemptSchema),
  goalies: z.object({
    home: ShootoutGoalieSchema,
    away: ShootoutGoalieSchema,
  }),
});

export const FeaturedGameSchema = z.object({
  id: z.string().optional(),
  status: z.enum(['live', 'final', 'scheduled', 'shootout']),
  period: z.number().int(),
  clock: z.string(),
  meta_chips: z.array(z.string()),
  strength_state: StrengthStateSchema.nullable().optional(),
  home: TeamPaneSchema,
  away: TeamPaneSchema,
  stats: z.object({
    shots: StatPairSchema,
    xg_5v5: StatPairSchema,
    xg_all: StatPairSchema,
    wp: StatPairSchema,
    faceoff_pct: StatPairSchema.optional(),
    hits: StatPairSchema.optional(),
  }),
  goal_feed: z.array(GoalEntrySchema),
  last_events: z.array(LastEventEntrySchema).optional(),
  shootout: ShootoutBlockSchema.optional(),
});
export type FeaturedGame = z.infer<typeof FeaturedGameSchema>;

// ── 3×2×1 grid game shape (GameTile props) ─────────────────────────────────

const GameTileTeamSchema = z.object({
  abbrev: z.string().min(2).max(4),
  score: z.number().int().nullable(),
  sog: z.union([z.number(), z.string()]).nullable().optional(),
  xg: z.union([z.number(), z.string()]).nullable().optional(),
  record: z.string(),
  logo: z.string().min(1),
  accent: z.string().regex(/^#[0-9A-Fa-f]{3,8}$/).optional(),
});

const GameTileChipSchema = z.object({
  label: z.string().min(1),
  kind: z.string().optional(),
});

const GameTileXgBarSchema = z.object({
  home: z.number(),
  away: z.number(),
  label: z.string().optional(),
});

export const GameTileEntrySchema = z.object({
  id: z.string().min(1),
  state: z.enum(['live', 'final', 'ot', 'pre', 'intermission']),
  period: z.number().int().optional(),
  clock: z.string().optional(),
  startTime: z.string().optional(),
  topContext: z.string().optional(),
  home: GameTileTeamSchema,
  away: GameTileTeamSchema,
  chips: z.array(GameTileChipSchema).optional(),
  xgBar: GameTileXgBarSchema.optional(),
  footNote: z.string().optional(),
});
export type GameTileEntry = z.infer<typeof GameTileEntrySchema>;

// ── live_moments discriminated union ───────────────────────────────────────

export const LiveMomentSchema = z.discriminatedUnion('slug', [
  z.object({
    slug: z.literal('milestone'),
    fired_at: z.string(),
    data: ArtifactMilestoneSchema,
  }),
  z.object({
    slug: z.literal('hattrick'),
    fired_at: z.string(),
    data: ArtifactHatTrickSchema,
  }),
  z.object({
    slug: z.literal('goalie'),
    fired_at: z.string(),
    data: ArtifactGoalieSchema,
  }),
  z.object({
    slug: z.literal('clinch'),
    fired_at: z.string(),
    data: ArtifactClinchSchema,
  }),
]);
export type LiveMoment = z.infer<typeof LiveMomentSchema>;

// ── Top-level live-mock schema ─────────────────────────────────────────────

const PlayoffStripSeriesSchema = z.object({
  text: z.string(),
  emphasize: z.array(z.string()).optional(),
});
const PlayoffStripSchema = z.object({
  eyebrow: z.string(),
  series: z.array(PlayoffStripSeriesSchema),
});

export const LiveMockSchema = z.object({
  mode: z.literal('live'),
  date_label: z.string(),
  playoff_strip: PlayoffStripSchema.optional(),
  hero_eyebrow: z.string(),
  // Layer 1.9 panel-mode descriptors — not consumed by Layer 3 code paths
  // but kept loose so old JSON keeps validating.
  _panel_a_kind: z.string().optional(),
  _panel_a_fields: z.array(z.string()).optional(),
  _panel_b_kind: z.string().optional(),
  _panel_b_fields: z.array(z.string()).optional(),
  featured_game: FeaturedGameSchema,
  // Layer 3 additions:
  games: z.array(GameTileEntrySchema).optional(),
  live_moments: z.array(LiveMomentSchema).optional(),
});
export type LiveMock = z.infer<typeof LiveMockSchema>;

// ── Parse helper (mirrors artifact-schemas.ts/parseArtifactOrThrow) ───────

export function parseLiveMockOrThrow(data: unknown, sourceLabel: string): LiveMock {
  const result = LiveMockSchema.safeParse(data);
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
    `[live-mock-schemas] ${sourceLabel} failed runtime validation:\n${issueLines.join('\n')}${more}`,
  );
}
