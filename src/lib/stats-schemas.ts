/**
 * Zod runtime schemas for stats JSON payloads.
 *
 * Purpose
 * -------
 * The checked-in JSON files under `src/data/stats/` are produced by an
 * external Python exporter (`hgb-bot/scripts/export_stats_data.py`). Without
 * a runtime contract, rename/null/type drift in that exporter either breaks
 * the build silently or renders `NaN`/`undefined` with no clear error.
 *
 * These schemas parse each JSON payload at module load time (via
 * `stats-loader.ts`). On failure the build fails fast with a path + expected
 * type + actual value — no silent UI corruption.
 *
 * Cross-repo contract
 * -------------------
 * The bumpable surface is `schemaVersion` (in `_meta.json`). The exporter
 * MUST write `schema_version` alongside the existing meta fields. Until the
 * Python side starts writing it, the site-side `_meta.json` carries it
 * manually (see SITE-FIX-03). Any breaking change to these schemas bumps
 * `schemaVersion` and requires a coordinated exporter update.
 *
 * Pending fields
 * --------------
 * Fields intentionally null in v1 (RAPM, WAR, xGAR, QoC, QoT) are modeled as
 * `.nullable()` here. `_meta.json.pending_fields` lists the canonical set so
 * the site and exporter agree on what's deferred.
 */

import { z } from 'zod';

// ── Primitives ──────────────────────────────────────────────────────────────

const RatesPer60Schema = z.object({
  goals: z.number(),
  a1: z.number(),
  shots: z.number(),
  ixg: z.number(),
  pen_diff: z.number(),
  ev_offence: z.number(),
  ev_defence: z.number(),
  finishing: z.number(),
});

const PercentilesSchema = z.object({
  game_score: z.number(),
  goals: z.number(),
  a1: z.number(),
  shots: z.number(),
  ixg: z.number(),
  pen_diff: z.number(),
  ev_offence: z.number(),
  ev_defence: z.number(),
  finishing: z.number(),
});

// ── Players (players.json) ──────────────────────────────────────────────────

export const PlayerRecordSchema = z.object({
  player_id: z.number().int(),
  slug: z.string().min(1),
  first_name: z.string(),
  last_name: z.string(),
  display_name: z.string(),
  pos: z.string(),
  pos_group: z.enum(['F', 'D']),
  team_abbrev: z.string(),
  gp: z.number().int().nonnegative(),
  goals: z.number().int().nonnegative(),
  assists: z.number().int().nonnegative(),
  toi_avg_sec: z.number(),
  avg_gs_display: z.number(),
  avg_gs_centered: z.number(),
  gs_pct: z.number(),
  rates_per_60: RatesPer60Schema,
  percentiles_vs_pos: PercentilesSchema,

  // Pending fields — intentionally null in v1. Listed in _meta.pending_fields.
  // Kept nullable (not .optional()) because the exporter currently writes
  // the keys with null values; switching to optional would silently accept
  // a missing key if the exporter ever stops writing them.
  rapm: z.number().nullable(),
  war: z.number().nullable(),
  xgar: z.number().nullable(),
  qoc: z.number().nullable(),
  qot: z.number().nullable(),
});

export const PlayerRecordsSchema = z.array(PlayerRecordSchema);
export type PlayerRecord = z.infer<typeof PlayerRecordSchema>;

// ── Leaderboards (leaderboards.json) ────────────────────────────────────────

export const LeaderboardEntrySchema = z.object({
  player_id: z.number().int(),
  slug: z.string().min(1),
  display_name: z.string(),
  team_abbrev: z.string(),
  pos: z.string(),
  gp: z.number().int().nonnegative(),
  value: z.number(),
  pct: z.number(),
});

/**
 * Leaderboards is a map of metric-name -> entry[]. Current known metrics:
 *   game_score, goals, assists, xg
 * New metrics can be added by the exporter without a schema bump (catchall).
 */
export const LeaderboardsSchema = z.record(
  z.string(),
  z.array(LeaderboardEntrySchema),
);
export type LeaderboardEntry = z.infer<typeof LeaderboardEntrySchema>;
export type Leaderboards = z.infer<typeof LeaderboardsSchema>;

// ── Player games (player_games.json) ────────────────────────────────────────

export const GameLogEntrySchema = z.object({
  game_date: z.string(),
  opp_abbrev: z.string(),
  is_home: z.boolean(),
  goals: z.number().int().nonnegative(),
  assists: z.number().int().nonnegative(),
  gs_display: z.number(),
  team_score: z.number().int().nonnegative(),
  opp_score: z.number().int().nonnegative(),
});

/** Map of player_id (as string) -> game log entries. */
export const PlayerGamesSchema = z.record(
  z.string(),
  z.array(GameLogEntrySchema),
);
export type GameLogEntry = z.infer<typeof GameLogEntrySchema>;
export type PlayerGames = z.infer<typeof PlayerGamesSchema>;

// ── Meta (_meta.json) ───────────────────────────────────────────────────────

export const StatsMetaSchema = z.object({
  /**
   * Schema contract version. Added by SITE-FIX-03 — the Python exporter MUST
   * start writing this field. Until then, the site-side JSON carries it
   * manually. Bump on breaking changes to any stats schema.
   */
  schema_version: z.string().min(1),

  season: z.string().regex(/^\d{8}$/),
  generated_at: z.string(),
  source_sha256: z.string().optional(),
  player_count: z.number().int().nonnegative(),
  pending_fields: z.array(z.string()),
});
export type StatsMeta = z.infer<typeof StatsMetaSchema>;

// ── Methodology (methodology.json) ─────────────────────────────────────────

// Kept loose — methodology is URL pointers + commentary. Schema is intentionally
// tolerant because it's display copy, not a hot-path data source.
export const MethodologySchema = z.object({
  note: z.string().optional(),
  primer: z.string().optional(),
  design_docs: z.record(z.string(), z.string()).optional(),
  metrics: z.record(z.string(), z.record(z.string(), z.string())).optional(),
  pending_metrics: z.array(z.string()).optional(),
});
export type Methodology = z.infer<typeof MethodologySchema>;

// ── Parse helper ────────────────────────────────────────────────────────────

/**
 * Parse a JSON value against a Zod schema and throw a loud, path-aware error
 * on failure. Called at module-load time in `stats-loader.ts` so build fails
 * before any page renders.
 */
export function parseOrThrow<T>(
  schema: z.ZodType<T>,
  data: unknown,
  sourceLabel: string,
): T {
  const result = schema.safeParse(data);
  if (result.success) return result.data;

  const issueLines = result.error.issues.slice(0, 8).map(issue => {
    const path = issue.path.length ? issue.path.join('.') : '<root>';
    // Truncate large 'received' payloads so the build log stays readable.
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
    `[stats-schemas] ${sourceLabel} failed runtime validation:\n${issueLines.join('\n')}${more}`,
  );
}
