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
  // Situation splits — added May 2026
  sc_per60:    z.number().optional(),
  hdc_per60:   z.number().optional(),
  xg_pp_per60: z.number().optional(),
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
  rapm_off: z.number().nullable(),
  rapm_def: z.number().nullable(),
  war: z.number().nullable(),
  xgar: z.number().nullable(),
  qoc: z.number().nullable(),
  qot: z.number().nullable(),
  // Situation splits — added May 2026
  goals_ev:         z.number().int().optional(),
  goals_pp:         z.number().int().optional(),
  goals_sh:         z.number().int().optional(),
  i_sc:             z.number().int().optional(),
  i_hdc:            z.number().int().optional(),
  sc_pct:           z.number().optional(),
  hdc_pct:          z.number().optional(),
  toi_pp_sec_total: z.number().optional(),
  // Playoff counting stats — null when player has no playoff appearances
  playoff_gp:      z.number().int().nonnegative().nullable().optional(),
  playoff_goals:   z.number().int().nonnegative().nullable().optional(),
  playoff_assists: z.number().int().nonnegative().nullable().optional(),
  playoff_points:  z.number().int().nonnegative().nullable().optional(),
  playoff_sog:     z.number().int().nonnegative().nullable().optional(),
  playoff_ixg:     z.number().nullable().optional(),
  playoff_toi_sec: z.number().nullable().optional(),
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
 * Leaderboards is a map of metric-name -> entry[], plus optional metadata fields.
 * game_type was added in Sprint A Item 3 (always 2 = regular season).
 * New metrics can be added by the exporter without a schema bump (catchall).
 */
export const LeaderboardsSchema = z.object({
  game_type: z.number().optional(),
}).catchall(z.array(LeaderboardEntrySchema));
export type LeaderboardEntry = z.infer<typeof LeaderboardEntrySchema>;
export type Leaderboards = z.infer<typeof LeaderboardsSchema>;

// ── Player games (player_games.json) ────────────────────────────────────────

export const GameLogEntrySchema = z.object({
  game_id:   z.string().optional(),
  game_date: z.string(),
  opp_abbrev: z.string(),
  is_home: z.boolean(),
  goals: z.number().int().nonnegative(),
  assists: z.number().int().nonnegative(),
  gs_display: z.number(),
  team_score: z.number().int().nonnegative(),
  opp_score: z.number().int().nonnegative(),
  // Enriched fields added in export v2 — optional for backward compat
  toi_sec: z.number().int().nonnegative().optional(),
  ixg:     z.number().nonnegative().optional(),
  shots:   z.number().int().nonnegative().optional(),
});

/** Map of player_id (as string) -> game log entries. */
export const PlayerGamesSchema = z.record(
  z.string(),
  z.array(GameLogEntrySchema),
);
export type GameLogEntry = z.infer<typeof GameLogEntrySchema>;
export type PlayerGames = z.infer<typeof PlayerGamesSchema>;

// ── Team game stats (team_game_stats.json) ──────────────────────────────────

export const TeamGameEntrySchema = z.object({
  game_id:    z.string().optional(),
  game_date:  z.string(),
  opp_abbrev: z.string(),
  is_home:    z.boolean(),
  gf:         z.number().int().nonnegative(),
  ga:         z.number().int().nonnegative(),
  result:     z.enum(['W', 'L', 'OT']),
  xgf_5v5:   z.number().nonnegative(),
  xga_5v5:   z.number().nonnegative(),
});

/** Map of team_abbrev -> per-game team entries, sorted chronologically. */
export const TeamGameStatsSchema = z.record(
  z.string(),
  z.array(TeamGameEntrySchema),
);
export type TeamGameEntry = z.infer<typeof TeamGameEntrySchema>;

// ── Goalies (goalies.json) ──────────────────────────────────────────────────

export const GoalieGameSchema = z.object({
  game_date:   z.string(),
  team_abbrev: z.string(),
  game_type:   z.number().int().optional().default(2),
  sa:   z.number().int().nonnegative(),
  ga:   z.number().int().nonnegative(),
  xga:  z.number(),
  gsax: z.number(),
});

export const GoalieBinSchema = z.object({
  xg_bin:        z.number().int(),
  bin_label:     z.string(),
  sa:            z.number().int().nonnegative(),
  ga:            z.number().int().nonnegative(),
  expected_ga:   z.number(),
  gsax:          z.number(),
  sv_pct:        z.number().nullable(),
  league_sv_pct: z.number(),
});

export const GoalieTypeSchema = z.object({
  shot_type_group: z.string(),
  sa:              z.number().int().nonnegative(),
  ga:              z.number().int().nonnegative(),
  expected_ga:     z.number(),
  gsax:            z.number(),
  sv_pct:          z.number(),
  league_sv_pct:   z.number(),
});

export const GoalieRecordSchema = z.object({
  goalie_id:   z.number().int(),
  name:        z.string(),
  team_abbrev: z.string(),
  game_type:   z.number().int().optional().default(2),
  sa:    z.number().int().nonnegative(),
  ga:    z.number().int().nonnegative(),
  xga:   z.number(),
  gsax:  z.number(),
  sv_pct: z.number().nullable(),
  sa_5v5: z.number().int().nonnegative(),
  ga_5v5: z.number().int().nonnegative(),
  // Playoff fields — null when goalie has no playoff appearances
  playoff_gsax:  z.number().nullable().optional(),
  playoff_sa:    z.number().int().nonnegative().nullable().optional(),
  playoff_ga:    z.number().int().nonnegative().nullable().optional(),
  playoff_games: z.number().int().nonnegative().nullable().optional(),
  games: z.array(GoalieGameSchema),
  bins:  z.array(GoalieBinSchema).optional().default([]),
  types: z.array(GoalieTypeSchema).optional().default([]),
});

export const GoaliesSchema = z.array(GoalieRecordSchema);
export type GoalieGame   = z.infer<typeof GoalieGameSchema>;
export type GoalieBin    = z.infer<typeof GoalieBinSchema>;
export type GoalieType   = z.infer<typeof GoalieTypeSchema>;
export type GoalieRecord = z.infer<typeof GoalieRecordSchema>;

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
