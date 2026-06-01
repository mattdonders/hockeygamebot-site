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
  pp_off: z.number().optional(),  // PP RAPM percentile — only for ≥50 min PP TOI
  pk_def: z.number().optional(),  // PK RAPM percentile — only for ≥50 min PK TOI
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
  war_components: z.object({
    ev5:            z.number(),
    pp:             z.number(),
    pk:             z.number(),
    pen:            z.number(),
    ev5_rapm_war:   z.number().optional(),
    finishing_war:  z.number().optional(),
  }).nullable().optional(),
  hgb_rating:             z.number().nullable().optional(),
  hgb_rating_percentile:  z.number().nullable().optional(),
  hgb_rating_confidence:  z.enum(['full', 'limited', 'limited_sample']).optional(),
  hgb_rating_off_pct:     z.number().nullable().optional(),
  hgb_rating_def_pct:     z.number().nullable().optional(),
  // 3-year weighted counting stats (JFresh-style 60/25/15 blend). Additive —
  // raw blended per-60 values plus position-group percentile ranks. Surfaced
  // by the Season / Rating·3yr toggle on the player page Rate Stats card.
  g_60_3yr:           z.number().nullable().optional(),
  a1_60_3yr:          z.number().nullable().optional(),
  xg_60_3yr:          z.number().nullable().optional(),
  s_60_3yr:           z.number().nullable().optional(),
  finishing_3yr:      z.number().nullable().optional(),
  pen_diff_60_3yr:    z.number().nullable().optional(),
  g_60_pct_3yr:       z.number().nullable().optional(),
  a1_60_pct_3yr:      z.number().nullable().optional(),
  xg_60_pct_3yr:      z.number().nullable().optional(),
  s_60_pct_3yr:       z.number().nullable().optional(),
  finishing_pct_3yr:  z.number().nullable().optional(),
  pen_diff_pct_3yr:   z.number().nullable().optional(),
  qoc_pct_3yr:        z.number().nullable().optional(),
  qot_pct_3yr:        z.number().nullable().optional(),
  career_seasons: z.array(z.object({
    season:      z.string(),
    team:        z.string(),
    gp:          z.number().int(),
    toi_5v5_sec: z.number().int(),
    gf_pct:      z.number().nullable(),
    xgf_pct:     z.number().nullable(),
  })).optional().nullable(),
  xgar: z.number().nullable(),
  qoc: z.number().nullable(),
  qot: z.number().nullable(),
  edge: z.object({
    speed_max_mph:            z.number().nullable(),
    speed_max_pct:            z.number().nullable(),
    speed_max_league_avg_mph: z.number().nullable(),
    distance_mi:              z.number().nullable(),
    distance_pct:             z.number().nullable(),
    distance_league_avg_mi:   z.number().nullable(),
    bursts_over_20:           z.number().int().nullable(),
    bursts_over_20_pct:       z.number().nullable(),
    bursts_over_20_league_avg:z.number().nullable(),
    shot_speed_max_mph:       z.number().nullable(),
    shot_speed_max_pct:       z.number().nullable(),
    shot_speed_max_league_avg_mph: z.number().nullable(),
    oz_ev_pct:                z.number().nullable(),
    oz_ev_pct_pct:            z.number().nullable(),
    oz_ev_league_avg:         z.number().nullable(),
    oz_pct:                   z.number().nullable(),
    nz_pct:                   z.number().nullable(),
    dz_pct:                   z.number().nullable(),
    shots_high:               z.number().int().nullable(),
    shots_high_pct:           z.number().nullable(),
    shooting_pct_high:        z.number().nullable(),
    shooting_pct_high_pct:    z.number().nullable(),
    shots_mid:                z.number().int().nullable(),
    shots_mid_pct:            z.number().nullable(),
    shooting_pct_mid:         z.number().nullable(),
    shooting_pct_mid_pct:     z.number().nullable(),
    shots_long:               z.number().int().nullable(),
    shots_long_pct:           z.number().nullable(),
    shooting_pct_long:        z.number().nullable(),
    shooting_pct_long_pct:    z.number().nullable(),
  }).nullable().optional(),
  // Situation splits — added May 2026
  goals_ev:         z.number().int().optional(),
  goals_pp:         z.number().int().optional(),
  goals_sh:         z.number().int().optional(),
  i_sc:             z.number().int().optional(),
  i_hdc:            z.number().int().optional(),
  sc_pct:           z.number().optional(),
  hdc_pct:          z.number().optional(),
  toi_pp_sec_total: z.number().optional(),
  toi_pk_sec_total: z.number().optional(),
  toi_ev_sec_total: z.number().optional(),
  // Strength-state splits — added May 2026
  a1_pp:     z.number().int().optional(),
  a1_pk:     z.number().int().optional(),
  a2_pp:     z.number().int().optional(),
  a2_pk:     z.number().int().optional(),
  shots_pp:  z.number().int().optional(),
  shots_pk:  z.number().int().optional(),
  sum_xg_pp: z.number().optional(),
  sum_xg_pk: z.number().optional(),
  // Penalty differential — draw/take counts for WAR breakdown display
  penalties_drawn: z.number().int().optional(),
  penalties_taken: z.number().int().optional(),
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
  opp_abbrev:  z.string().nullable().optional(),
  decision:    z.enum(['W', 'L', 'OT', 'SO']).nullable().optional(),
  toi_sec:     z.number().int().nonnegative().nullable().optional(),
  game_type:   z.number().int().optional().default(2),
  sa:   z.number().int().nonnegative(),
  ga:   z.number().int().nonnegative(),
  sv_pct: z.number().nullable().optional(),
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
  gp:          z.number().int().nonnegative().optional(),
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

// ── Lines (lines.json) ─────────────────────────────────────────────────────

export const LineRecordSchema = z.object({
  players:  z.string(),
  player_ids: z.array(z.number()),
  type:     z.enum(['F', 'D']),
  team:     z.string(),
  season:   z.string(),
  game_type: z.number(),
  toi_min:  z.number(),
  games:    z.number(),
  xgf_pct:  z.number().nullable().optional(),
  xgf:      z.number().nullable().optional(),
  xga:      z.number().nullable().optional(),
  xgf_60:   z.number().nullable().optional(),
  xga_60:   z.number().nullable().optional(),
  gf:       z.number().nullable().optional(),
  ga:       z.number().nullable().optional(),
  gf_pct:   z.number().nullable().optional(),
  // Stage 2 breakdown fields — added May 2026; nullable/optional for graceful
  // null handling while pipeline data propagates.
  cf:      z.number().int().nullable().optional(),
  ca:      z.number().int().nullable().optional(),
  cf_pct:  z.number().nullable().optional(),
  ff:      z.number().int().nullable().optional(),
  fa:      z.number().int().nullable().optional(),
  ff_pct:  z.number().nullable().optional(),
  sf:      z.number().int().nullable().optional(),
  sa:      z.number().int().nullable().optional(),
  sf_pct:  z.number().nullable().optional(),
  sh_pct:  z.number().nullable().optional(),
  sv_pct:  z.number().nullable().optional(),
  pdo:     z.number().nullable().optional(),
  game_log: z.array(z.object({
    game_id:   z.string(),
    game_date: z.string(),
    game_type: z.number().int(),
    opp_abbrev: z.string(),
    xgf:       z.number(),
    xga:       z.number(),
    xgf_pct:   z.number().nullable(),
    toi_min:   z.number(),
    gf:        z.number().int(),
    ga:        z.number().int(),
  })).optional(),
});
export const LinesSchema = z.array(LineRecordSchema);
export type LineRecord = z.infer<typeof LineRecordSchema>;

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

// ── Player shots (player_shots.json) ────────────────────────────────────────

/** [x_normalized, y_normalized, is_goal (0|1), shot_type] */
export const PlayerShotSchema = z.tuple([
  z.number(),  // x: 25–89 (blue line → back boards, absolute)
  z.number(),  // y: −42.5 to +42.5 (normalized to attacking direction)
  z.number(),  // is_goal: 0 or 1
  z.string(),  // shot_type: wrist | slap | snap | backhand | etc.
]);
export const PlayerShotsSchema = z.record(z.string(), z.array(PlayerShotSchema));
export type PlayerShot = z.infer<typeof PlayerShotSchema>;
export type PlayerShots = z.infer<typeof PlayerShotsSchema>;

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
