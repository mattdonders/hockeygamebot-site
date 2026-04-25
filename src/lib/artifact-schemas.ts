/**
 * Zod schemas for artifact-card props (SITE-HOME-02 / Layer 2).
 *
 * Each schema mirrors the `Props` interface exported from the matching
 * `src/components/home/artifacts/Artifact*.astro` component. The mock JSON
 * fixtures in `src/data/home-mock/artifacts/*.json` are validated against
 * these schemas at module-load time via `artifact-loader.ts` — so any
 * drift between the JSON shape and the component prop contract fails the
 * build with a path-aware error rather than rendering broken markup.
 *
 * Cross-repo contract
 * -------------------
 * The eventual Python card-generator pipeline will produce these same
 * shapes as input. When the pipeline ships, it should generate JSON that
 * passes these Zod schemas — that's the contract. Add `schema_version`
 * later if the shapes need versioning (matches `stats-schemas.ts` pattern).
 *
 * Pattern note
 * ------------
 * Schemas are kept loose where the design tolerates variability (free-form
 * `tag.label` strings; HTML in some context fields) and tight where the
 * component depends on exact shape (3-tuples for hat-trick goals, etc).
 */

import { z } from 'zod';

// ── Shared primitives ───────────────────────────────────────────────────────

const ArtifactTagSchema = z.object({
  label: z.string().min(1),
  /**
   * Color kind — keep in sync with `ArtifactTagKind` in
   * `src/components/home/artifacts/_types.ts` and the `.art-tag--*`
   * lookup in `ArtifactShell.astro`. Pick the kind that matches the
   * card's accent so the tag reads as part of the card, not on top of it.
   */
  kind: z
    .enum(['red', 'hot', 'cold', 'game', 'ot', 'mile', 'line', 'matchup', 'stars', 'goalie', 'neutral'])
    .optional(),
});

const ArtifactBylineSchema = z.object({
  left: z.string().optional(),
  right: z.string().optional(),
});

const TagAndBylineFields = {
  tag: ArtifactTagSchema.optional(),
  byline: ArtifactBylineSchema.optional(),
};

// ── Game ────────────────────────────────────────────────────────────────────

const GameSideSchema = z.object({
  abbrev: z.string().min(2).max(4),
  name: z.string().min(1),
  xg: z.string(),
  accentColor: z.string().regex(/^#[0-9A-Fa-f]{3,8}$/),
  isLoser: z.boolean().optional(),
});

export const ArtifactGameSchema = z.object({
  ...TagAndBylineFields,
  state: z.object({ label: z.string() }),
  home: GameSideSchema,
  away: GameSideSchema,
  score: z.object({
    home: z.number().int().nonnegative(),
    away: z.number().int().nonnegative(),
  }),
  wp: z.object({
    events: z.number().int().nonnegative(),
    finalLabel: z.string(),
    color: z.string().regex(/^#[0-9A-Fa-f]{3,8}$/),
    poly: z
      .array(z.object({ t: z.number().min(0).max(1), p: z.number().min(0).max(1) }))
      .min(2),
    goals: z.array(
      z.object({
        t: z.number().min(0).max(1),
        side: z.enum(['home', 'away']),
      }),
    ),
  }),
});
export type ArtifactGame = z.infer<typeof ArtifactGameSchema>;

// ── Hot ─────────────────────────────────────────────────────────────────────

const HotStatSchema = z.object({
  k: z.string(),
  v: z.string(),
  note: z.string().optional(),
});

export const ArtifactHotSchema = z.object({
  ...TagAndBylineFields,
  eyebrow: z.string(),
  name: z.string(),
  sub: z.string(),
  // exactly 3 stat tiles
  stats: z.tuple([HotStatSchema, HotStatSchema, HotStatSchema]),
  sparkline: z.array(z.number().min(0).max(1)).min(3),
});
export type ArtifactHot = z.infer<typeof ArtifactHotSchema>;

// ── Cold ────────────────────────────────────────────────────────────────────

export const ArtifactColdSchema = z.object({
  ...TagAndBylineFields,
  eyebrow: z.string(),
  name: z.string(),
  sub: z.string(),
  bigStat: z.object({
    value: z.string(),
    unit: z.string(),
  }),
  context: z.string(),
  sparkline: z.array(z.number().min(0).max(1)).min(3),
});
export type ArtifactCold = z.infer<typeof ArtifactColdSchema>;

// ── Milestone ───────────────────────────────────────────────────────────────

export const ArtifactMilestoneSchema = z.object({
  ...TagAndBylineFields,
  eyebrow: z.string(),
  num: z.object({
    value: z.string(),
    suffix: z.string().optional(),
  }),
  what: z.string(),
  who: z.string(),
  /** Optional "Nth in franchise" framing — renders muted under `who`. */
  teamContext: z.string().optional(),
  rank: z.string(),
  dotsTotal: z.number().int().nonnegative(),
  dotsLit: z.number().int().nonnegative(),
});
export type ArtifactMilestone = z.infer<typeof ArtifactMilestoneSchema>;

// ── Line ────────────────────────────────────────────────────────────────────

const LinePlayerSchema = z.object({
  number: z.string(),
  name: z.string(),
  pos: z.string(),
  emphasized: z.boolean().optional(),
});

const LineStatSchema = z.object({
  k: z.string(),
  v: z.string(),
  green: z.boolean().optional(),
});

export const ArtifactLineSchema = z.object({
  ...TagAndBylineFields,
  eyebrow: z.string(),
  title: z.string(),
  context: z.string(),
  players: z.tuple([LinePlayerSchema, LinePlayerSchema, LinePlayerSchema]),
  stats: z.tuple([LineStatSchema, LineStatSchema, LineStatSchema, LineStatSchema]),
});
export type ArtifactLine = z.infer<typeof ArtifactLineSchema>;

// ── Matchup ─────────────────────────────────────────────────────────────────

const MatchupSideSchema = z.object({
  abbrev: z.string().min(2).max(4),
  name: z.string(),
  record: z.string(),
  accentColor: z.string().regex(/^#[0-9A-Fa-f]{3,8}$/),
  /**
   * Optional team logo URL (e.g. assets.nhle CDN _dark.svg). When present,
   * the component renders the real SVG; when absent, falls through to the
   * accent-colored circle placeholder. The Python card pipeline always
   * supplies this in production; mocks should as well.
   */
  logo: z.string().min(1).optional(),
});

const MatchupPairSchema = z.object({
  left: z.object({ name: z.string(), meta: z.string() }),
  right: z.object({ name: z.string(), meta: z.string() }),
  centerLabel: z.string().optional(),
});

/**
 * Season-series summary line. `scope='current'` means the teams have
 * already played this season; `scope='last_season'` means it's the first
 * meeting and we're showing prior-season context as historical framing.
 * The component picks the label ("SEASON SERIES" vs "LAST SEASON") based
 * on `scope`.
 */
const SeasonSeriesSchema = z.object({
  scope: z.enum(['current', 'last_season']),
  summary: z.string().min(1),
});

export const ArtifactMatchupSchema = z.object({
  ...TagAndBylineFields,
  eyebrow: z.string(),
  home: MatchupSideSchema,
  away: MatchupSideSchema,
  timeLabel: z.string(),
  /** Optional venue name — renders muted under the time in the center column. */
  venue: z.string().optional(),
  keyMatchupTitle: z.string(),
  matchups: z.array(MatchupPairSchema).min(1).max(4),
  /** Optional season-series summary (current-season or last-season fallback). */
  season_series: SeasonSeriesSchema.optional(),
});
export type ArtifactMatchup = z.infer<typeof ArtifactMatchupSchema>;

// ── Clinch ──────────────────────────────────────────────────────────────────

export const ArtifactClinchSchema = z.object({
  ...TagAndBylineFields,
  tagText: z.string(),
  eyebrow: z.string(),
  headline: z.string(),
  by: z.string(),
  bigNum: z.string(),
  pills: z.array(z.string()),
});
export type ArtifactClinch = z.infer<typeof ArtifactClinchSchema>;

// ── Season ──────────────────────────────────────────────────────────────────

const SeasonGameRowSchema = z.object({
  date: z.string(),
  text: z.string(),
  tail: z.string().optional(),
  value: z.string(),
  pos: z.boolean().optional(),
  neg: z.boolean().optional(),
});

export const ArtifactSeasonSchema = z.object({
  ...TagAndBylineFields,
  eyebrow: z.string(),
  player: z.object({ name: z.string(), meta: z.string() }),
  score: z.object({ value: z.string(), label: z.string() }),
  statsHtml: z.string(),
  sparkline: z
    .array(
      z.object({
        h: z.number().min(0).max(1),
        neg: z.boolean().optional(),
      }),
    )
    .min(8),
  games: z.tuple([SeasonGameRowSchema, SeasonGameRowSchema, SeasonGameRowSchema]),
});
export type ArtifactSeason = z.infer<typeof ArtifactSeasonSchema>;

// ── Hat trick ───────────────────────────────────────────────────────────────

const HatTrickGoalSchema = z.object({
  period: z.number().int().min(1).max(5), /* 4 = OT, 5 = SO */
  clock: z.string().regex(/^\d{1,2}:\d{2}$/),
});

export const ArtifactHatTrickSchema = z.object({
  ...TagAndBylineFields,
  eyebrow: z.string(),
  name: z.string(),
  sub: z.string(),
  goals: z.tuple([HatTrickGoalSchema, HatTrickGoalSchema, HatTrickGoalSchema]),
  context: z.string(),
});
export type ArtifactHatTrick = z.infer<typeof ArtifactHatTrickSchema>;

// ── Three stars ─────────────────────────────────────────────────────────────

const StarSchema = z.object({
  name: z.string(),
  team: z.string().min(2).max(4),
  pos: z.string(),
  stat: z.string(),
});

export const ArtifactThreeStarsSchema = z.object({
  ...TagAndBylineFields,
  eyebrow: z.string(),
  context: z.string(),
  stars: z.tuple([StarSchema, StarSchema, StarSchema]),
});
export type ArtifactThreeStars = z.infer<typeof ArtifactThreeStarsSchema>;

// ── Goalie ──────────────────────────────────────────────────────────────────

export const ArtifactGoalieSchema = z.object({
  ...TagAndBylineFields,
  eyebrow: z.string(),
  name: z.string(),
  sub: z.string(),
  svPct: z.string(),
  saves: z.number().int().nonnegative(),
  shotsAgainst: z.number().int().nonnegative(),
  gsax: z.string(),
  /** High-danger save percentage display string, e.g. ".862". */
  hdSvPct: z.string(),
  decision: z.enum(['W', 'L', 'OT', 'SO']),
  context: z.string(),
});
export type ArtifactGoalie = z.infer<typeof ArtifactGoalieSchema>;

// ── Slug map (for typed loader) ─────────────────────────────────────────────

export type ArtifactSlug =
  | 'game'
  | 'hot'
  | 'cold'
  | 'milestone'
  | 'line'
  | 'matchup'
  | 'clinch'
  | 'season'
  | 'hattrick'
  | 'stars'
  | 'goalie';

export interface ArtifactDataMap {
  game: ArtifactGame;
  hot: ArtifactHot;
  cold: ArtifactCold;
  milestone: ArtifactMilestone;
  line: ArtifactLine;
  matchup: ArtifactMatchup;
  clinch: ArtifactClinch;
  season: ArtifactSeason;
  hattrick: ArtifactHatTrick;
  stars: ArtifactThreeStars;
  goalie: ArtifactGoalie;
}

export const ARTIFACT_SCHEMAS: { [K in ArtifactSlug]: z.ZodType<ArtifactDataMap[K]> } = {
  game: ArtifactGameSchema,
  hot: ArtifactHotSchema,
  cold: ArtifactColdSchema,
  milestone: ArtifactMilestoneSchema,
  line: ArtifactLineSchema,
  matchup: ArtifactMatchupSchema,
  clinch: ArtifactClinchSchema,
  season: ArtifactSeasonSchema,
  hattrick: ArtifactHatTrickSchema,
  stars: ArtifactThreeStarsSchema,
  goalie: ArtifactGoalieSchema,
};

// ── Parse helper (mirrors stats-schemas.ts/parseOrThrow) ────────────────────

export function parseArtifactOrThrow<T>(
  schema: z.ZodType<T>,
  data: unknown,
  sourceLabel: string,
): T {
  const result = schema.safeParse(data);
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
    `[artifact-schemas] ${sourceLabel} failed runtime validation:\n${issueLines.join('\n')}${more}`,
  );
}
