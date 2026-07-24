# HGB Data Contract Audit — 2026-06-07

## Summary

- **22 feeds total** — 18 R2 static exports (16 top-level JSON files + 2 per-object directories) + 4 direct API endpoints (D1/live)
- **Total R2 payload on disk: 141 MB** (significantly larger than what any browser client ever downloads)
- **Feeds with no confirmed site consumer: 3** — `methodology.json`, `_pipeline_health.json`, `_meta.json` (only available via API, site never fetches it client-side)
- **Largest feeds with broad site consumption: `player_season_stats.json` (11 MB, fetched at build time), `wowy.json` (17 MB, client-side fetch on demand), `player_games.json` (14 MB, build-time)**
- **Optimization candidates: wowy.json (17 MB client payload), player_shots.json (unclear field shape), player_season_stats.json over-fetched at build (11 MB → slimmed to ~1–2 MB via `/data/skater-season-stats.json` endpoint for one consumer, but full payload still fetched at build time for player pages), game-lines/ directory (88 MB, per-game not indexed)**

---

## Feed Inventory

### R2 Static Exports (served via `api.hockeygamebot.com/v1/stats/*`)

| Feed | File Size | Top-level shape | Site consumers | Fields used | Notes |
|---|---|---|---|---|---|
| `players.json` | 6.4 MB | `array[715]` of player objects | `stats/skaters.astro`, `stats/index.astro`, `stats/player/[slug].astro`, `stats/lines/[slug].astro`, `stats/impact.astro`, `stats/wowy.astro`, `stats/explore.astro`, `teams/[abbr].astro`, `games/index.astro`, `account.astro`, `DashboardPlayersTable.tsx`, `DashboardPersonalized.tsx` | Core: `player_id`, `slug`, `display_name`, `first_name`, `last_name`, `pos`, `pos_group`, `team_abbrev`, `gp`, `goals`, `assists`, `toi_avg_sec`, `avg_gs_display`, `gs_pct`, `rates_per_60`, `percentiles_vs_pos`, `rapm`, `rapm_off`, `rapm_def`, `war`, `war_components`, `hgb_rating*`, `rapm_ev_*_z`, `rapm_pp_*_z`, `edge`, `edge_history`, `goals_ev/pp/sh`, `i_sc`, `i_hdc`, `toi_*_sec_total`, `a1_pp/pk`, `a2_pp/pk`, `shots_pp/pk`, `sum_xg_pp/pk`, `penalties_drawn/taken`, `playoff_*`, `3yr fields`, `xgar`, `qoc`, `qot`, `l7_avg`, `l7_games`, `career_seasons` (injected from player-career) | 87 fields per player; ~all consumed across the player page ecosystem. `avg_gs_centered`, `sc_pct`, `hdc_pct`, `xgar`, `qoc`, `qot` usage unclear — manual review needed |
| `player_season_stats.json` | 11 MB | `dict[2267]` keyed by player_id → `{regular: [], playoffs: [], name, slug}` | `stats/player/[slug].astro` (season cards), `data/skater-season-stats.json.ts` (build-time slim) | Per season row: `season`, `team`, `pos`, `gp`, `toi_5v5_sec`, `goals`, `a1`, `a2`, `assists`, `points`, `shots`, `ixg`, `xgf_5v5`, `xga_5v5`, `xgf_pct_5v5`, `cf_5v5`, `ca_5v5`, `cf_pct_5v5`, `rapm_*_pct` (6 fields), `hgb_rating_pct`, `war_pct`, `impact_pct`, `limited` | Full 11 MB loaded at build time. `skater-season-stats.json.ts` slims it to ~15 fields for the SkatersTable multi-season leaderboard. `toi_avg_sec`, `gf_5v5`, `ga_5v5`, `gf_pct_5v5` present in payload but slimmer path drops them. |
| `player_games.json` | 14 MB | `dict[715]` keyed by player_id → `array` of game log rows | `stats/player/[slug].astro`, `stats/impact.astro`, `games/index.astro`, `teams/[abbr].astro` | Per row: `game_id`, `game_date`, `game_type`, `opp_abbrev`, `is_home`, `goals`, `assists`, `gs_display`, `team_score`, `opp_score`, `toi_sec`, `ixg`, `shots` | All 13 fields appear consumed. Loaded at build time for all 715 active players |
| `player_shots.json` | 6.3 MB | `dict[932]` keyed by player_id → `array of [x, y, is_goal_int, shot_type]` tuples | `stats/player/[slug].astro` (shot chart) | `x`, `y`, `is_goal`, `shot_type` | Compact tuple format. 932 players (includes inactive); stats-schemas validates via `PlayerShotsSchema`. |
| `player_career.json` | 2.7 MB | `dict[3130]` keyed by player_id → `{seasons: []}` | `stats-loader.ts` (merged into `players` array) | Per season: `season`, `team`, `gp`, `toi_5v5_sec`, `gf_pct`, `xgf_pct` | Injected into players array as `career_seasons`. Only 715 of 3130 players are in active `players.json`; the remaining 2415 career records for retired players are fetched but only used if player page is visited. Effectively wasted for 77% of entries at build time. |
| `wowy.json` | 17 MB | `array[24340]` of pair rows | `stats/wowy.astro` (client-side on-demand) | `player1`, `player2`, `player1_id`, `player2_id`, `player1_pos`, `player2_pos`, `team`, `season`, `game_type`, `with.{toi_min, xgf, xga, games}`, `a_wo_b.{toi_min, xgf, xga}`, `b_wo_a.{toi_min, xgf, xga}`, `neither.{toi_min, xgf, xga}` | **Largest client-downloaded file.** Unused sub-fields in segment objects: `xgf_pct`, `xgf_60`, `xga_60`, `gf_pct` — site recomputes `xgf_pct` client-side from raw `xgf`/`xga`. `a_wo_b.games`, `neither.games` not in payload (only `with.games`) |
| `goalies.json` | 1008 KB | `array[71]` of goalie rows | `stats/goalies.astro`, `stats/goalies/[id].astro`, `teams/[abbr].astro` | All fields: `goalie_id`, `name`, `first_name`, `last_name`, `team_abbrev`, `season`, `game_type`, `gp`, `toi_sec`, `sa`, plus additional goalie stats | 71 rows (71 KB is tiny). Well-sized. |
| `teams.json` | 804 KB | `{regular: [], playoffs: []}` — multi-season rows | `stats/teams.astro`, `DashboardPersonalized.tsx` | `team_abbrev`, `team_name_full/city/nickname`, `division`, `conference`, `season`, `game_type`, `gp`, `wins`, `losses`, `ot_losses`, `points`, `xgf_all`, `xgf_pct_all`, `xgf_5v5`, `xga_5v5`, `xgf_pct_5v5`, `pp_pct`, `pk_pct`, `cf_5v5/ca_5v5/cf_pct_5v5`, `hdcf_5v5`, `hdca_5v5`, `hdcf_pct_5v5` | `toi_all_sec`, `gf_all`, `ga_all`, `sf_5v5`, `sa_5v5`, `sf_pct_5v5`, `sh_pct_5v5`, `sv_pct_5v5`, `pdo_5v5`, `gf_5v5`, `ga_5v5`, `gf_pct_5v5`, `pp_xgf_60`, `pk_xga_60` — present in payload, usage unclear — manual review needed |
| `lines.json` | 2.0 MB | `array[4451]` of line-combo rows | `stats/lines.astro`, `stats/lines/[slug].astro`, `stats/series/[slug].astro` | `players`, `player_ids`, `type`, `team`, `season`, `game_type`, `toi_min`, `games`, `xgf_pct`, `xgf`, `xga`, plus additional advanced stats | Loaded at build time. All fields appear consumed. |
| `leaderboards.json` | 26 KB | `dict[9]` — keys: `game_type`, `game_score[50]`, `goals[10]`, `assists[10]`, `xg[10]`, `pts60[10]`, `playoff_goals[10]`, `playoff_assists[10]`, `playoff_xg[10]` | `stats/index.astro`, `stats/skaters.astro` | `player_id`, `slug`, `display_name`, `team_abbrev`, `pos`, `gp`, `value`, `pct` | Tiny. `pts60` list loaded but usage unclear — not found in stats-loader public API |
| `signals.json` | 437 KB | `{generated_at, season, signals: array[731]}` | `DashboardPersonalized.tsx` (client-side on-demand) | `entity_type`, `entity_id`, `category`, `severity`, `copy`, `cta_href` | **7 of 19 signal fields consumed.** Unused: `rule_id`, `priority`, `confidence_score`, `window`, `strength`, `stat_key`, `value`, `comparison_value`, `threshold`, `generated_at` (per-signal), `expires_at`, `dedup_key`. Fetched twice on dashboard (lines 240 + 298 in DashboardPersonalized.tsx). |
| `team_game_stats.json` | 673 KB | `dict[32]` keyed by team abbrev → `array` of game log rows | `teams/[abbr].astro` (build-time via `loadAllTeamGames`) | `game_id`, `game_date`, `game_type`, `opp_abbrev`, `is_home`, `gf`, `ga`, `result`, `xgf_5v5`, `xga_5v5`, plus additional per-game stats | All fields likely consumed on team pages. |
| `draft_picks.json` | 64 KB | `{generated_at, draft_year, picks: array}` | `stats/index.astro` (build-time + client-side reload) | `overall`, `round`, `pick_in_round`, `team`, `team_name`, `original_team`, `original_team_name`, `source_team`, `source_original_team`, `is_traded`, `protected` | `odds`, `top1_odds` present in payload but not referenced in site code — possibly reserved for iOS/future use |
| `series_stats.json` | 23 KB | `{season, series: [], rounds: []}` | `stats/series/index.astro`, `stats/series/[slug].astro`, `index.astro` (client-side) | `series`: `series_id`, `season`, `round`, `matchup_id`, `teams`, `games_played`, `status`, `games`; `rounds`: `team`, `opponent`, `wins`, `losses`, `xgf_pct`, `gf`, `ga`, `status` | Small. Well-sized for use case. |
| `series_narratives.json` | 1.7 KB | `{season, generated_at, narratives: dict[series_id → {narrative, teams, round_name, games_played}]}` | `index.astro` (client-side, playoff section) | `narratives[series_id].narrative` | Tiny. Only the `narrative` text string is rendered. Other fields are metadata only. |
| `_meta.json` | 543 B | `{schema_version, season, generated_at, player_count, game_count, goalie_count, pending_fields}` | `stats-loader.ts` build-time only (via `loadMeta()`) | `season`, `generated_at`, `player_count`, `pending_fields` | Only surfaced on stats index page as build metadata. `game_count`, `goalie_count` not visibly consumed — manual review needed. |
| `methodology.json` | 810 B | `{note, primer, design_docs, metrics, pending_metrics}` | **None confirmed** | — | Endpoint exists in `_STATS_KEYS` map and is publicly reachable, but `methodology.astro` is a fully static page with no fetch. Not loaded in `stats-loader.ts`. Consider removing from the endpoint map or wiring to the methodology page. |
| `_pipeline_health.json` | 323 B | `{generated_at, last_run_at, ...}` | **None confirmed (site)** | — | Served via dedicated endpoint `/v1/health/pipeline` (not under `/v1/stats/`). No site page fetches it. Used by ops/monitoring tooling only. |

### R2 Per-Object Directories

| Directory | Count | Total Size | API route | Site consumers | Notes |
|---|---|---|---|---|---|
| `stats/game-lines/{game_id}.json` | 20,574 files | 88 MB | `GET /v1/games/{game_id}/lines` | `games/index.astro` (client-side, on-demand per game) | Largest directory by far. Per-game 5v5 line combo stats. Only fetched when a user views a specific game page. Never bulk-fetched. |
| `stats/line-shots/{slug}.json` | 2,199 files | 19 MB | `GET /v1/lines/{slug}/shots` | `stats/lines/[slug].astro`, `stats/series/[slug].astro`, `ShotMapDemo.tsx` | Per-line shot coordinate data `{slug, team, type, shots_for: [{x, y, xg, is_goal}], shots_against: [...]}`. Only fetched for specific line or series page. |
| `stats/series/{records.json}` | 1 file | — | `GET /v1/stats/series-records` | `stats/records.astro` | Series H2H records. Well-sized. |

### API Endpoints (D1/live, via `api.hockeygamebot.com`)

| Endpoint | Source | Returns | Site consumers | Notes |
|---|---|---|---|---|
| `GET /v1/goals?date=YYYY-MM-DD` | D1 `events` table | Goals for a date with scorer details | `scoreboard.astro`, `index.astro` | Cached per-date; date param optional (defaults to today) |
| `GET /v1/games/today?date=...` | D1 `game_state` + NHL API | Today's games with live scores, `seriesStatus` | `scoreboard.astro`, `index.astro`, `results.astro`, `teams/[abbr].astro` | 60s edge cache; 5s during live games |
| `GET /v1/games/{id}/flow` | D1 `events` | Win probability + xG time-series for WP chart | `index.astro`, `games/index.astro`, `GameChartsDemo.tsx`, `ChartsPOC.tsx` | 15s cache live; 5min cache final |
| `GET /v1/games/{id}/events?sort=asc` | D1 `events` | All events for a game | `games/index.astro` | 15s cache live; 5min cache final |
| `GET /v1/games/{id}/boxscore` | NHL API proxy | NHL boxscore with CORS headers | `games/index.astro`, `GameChartsDemo.tsx` | Cache-control from NHL API |
| `GET /v1/games/{id}/pregame` | R2 `pregame/{game_id}.json` (B2 artifact) | Pre-game editorial artifact | `games/index.astro` | 404 if no pregame article exists |
| `GET /v1/games/{id}/on-ice` | D1 `game_state.on_ice` | On-ice xGF blob for game | `games/index.astro` | 10s edge cache |
| `GET /v1/games/{id}/lines` | R2 `stats/game-lines/{game_id}.json` | Per-game 5v5 line combos | `games/index.astro` | No explicit cache-control set |
| `GET /v1/games/{id}/series` | NHL schedule API | Playoff series context for a game | `index.astro` | 5min edge cache |
| `GET /v1/games/team-history?team_ids=...&limit=20` | D1 `game_results` table | Recent results for tracked teams | `index.astro` (personalized homepage section) | |
| `GET /v1/playoffs/round/{1-4}` | D1 `playoffs` table | Series predictions + Monte Carlo dist | `scoreboard.astro`, `playoffs/2026.astro`, `stats/series/index.astro`, `stats/series/[slug].astro` | Fetched 4× on playoff pages (one per round) |
| `GET /v1/playoffs/status` | D1 `playoffs` table | Active/eliminated teams for current postseason | `stats/index.astro`, `DashboardPersonalized.tsx` | |
| `GET /v1/series/{id}/shots` | R2 `stats/line-shots/` (aggregated) | Aggregated shot coordinates for a series | `stats/series/[slug].astro`, `ShotMapDemo.tsx` | |
| `GET /v1/lines/{slug}/shots` | R2 `stats/line-shots/{slug}.json` | Shot coordinates for a specific line combo | `stats/lines/[slug].astro` | |
| `GET /v1/scoreboard?date=...` | D1 `daily_schedule` + `game_state` | Full scoreboard (schedule + live state join) | `scoreboard.astro` | |
| `GET /v1/account/prefs` | D1 `users` table | Tracked teams + players for logged-in user | `index.astro`, `account.astro`, `DashboardPersonalized.tsx`, `DashboardPlayersTable.tsx`, `teams.astro` | Requires auth |
| `GET /v1/auth/me` | D1 session | Session verification | `stats/index.astro` | |
| `GET /v1/health/pipeline` | R2 `_pipeline_health.json` | Pipeline freshness + stale flag | Ops/monitoring only — no site page | |

---

## Optimization Opportunities

### 1. wowy.json — Drop pre-computed segment fields

- **Feed**: `wowy.json` (17 MB, largest client-download)
- **Issue**: Each segment object (`with`, `a_wo_b`, `b_wo_a`, `neither`) carries 7 fields: `toi_min`, `xgf_pct`, `xgf`, `xga`, `xgf_60`, `xga_60`, `gf_pct`. The site only reads `toi_min`, `xgf`, `xga` (raw values) and recomputes `xgf_pct` itself. The pre-computed `xgf_pct`, `xgf_60`, `xga_60`, `gf_pct` are downloaded but ignored.
- **Proposed fix**: Remove `xgf_pct`, `xgf_60`, `xga_60`, `gf_pct` from all segment objects in the exporter. Keep only `{toi_min, xgf, xga, games}`.
- **Savings**: ~4/7 of segment data eliminated. Rough estimate: 17 MB × ~40% = **~7 MB savings** (≈ 10 MB final). This is the single highest-impact change.

### 2. player_career.json — Retired player bloat

- **Feed**: `player_career.json` (2.7 MB)
- **Issue**: Contains 3,130 player entries but only 715 players are in the active `players.json`. The remaining 2,415 are retired/inactive players. Since `career_seasons` is only rendered on player detail pages (which only exist for active players), the extra 2,415 entries are fetched at build time and merged with zero benefit.
- **Proposed fix**: Filter `player_career.json` in the exporter to only include player IDs present in `players.json`. Or, better: embed `career_seasons` directly in `players.json` (eliminating the separate fetch entirely) since it's only 6 fields per season.
- **Savings**: Eliminate the 2.7 MB fetch entirely if merged, or reduce to ~600 KB if filtered to active players only.

### 3. signals.json — 13 unused fields per signal

- **Feed**: `signals.json` (437 KB, 731 signals)
- **Issue**: 19 fields per signal, but the dashboard only reads 6: `entity_type`, `entity_id`, `category`, `severity`, `copy`, `cta_href`. The other 13 (`rule_id`, `priority`, `confidence_score`, `window`, `strength`, `stat_key`, `value`, `comparison_value`, `threshold`, `generated_at`, `expires_at`, `dedup_key`) are downloaded but never accessed in any site component. Additionally, signals is fetched **twice** in `DashboardPersonalized.tsx` (two separate `fetch()` calls at lines 240 and 298).
- **Proposed fix 1**: Slim the payload to the 6 consumed fields + any needed by iOS.
- **Proposed fix 2**: Deduplicate the double-fetch — share a single `useState` + `useEffect` that fetches once and serves both UI sections.
- **Savings**: ~70% payload reduction (437 KB → ~130 KB); plus removes one redundant network round-trip per dashboard load.

### 4. player_season_stats.json — Full 11 MB fetched at build for a slim consumer

- **Feed**: `player_season_stats.json` (11 MB)
- **Issue**: The build fetches all 11 MB for two consumers: (a) `stats/player/[slug].astro` which renders the per-season cards for a single player, and (b) `data/skater-season-stats.json.ts` which already slims it to ~15 fields for the SkatersTable leaderboard. The full payload includes 37 fields per season row, but the season cards only use ~20 of them (`toi_avg_sec`, `gf_5v5`, `ga_5v5`, `gf_pct_5v5` appear in the raw data but are not referenced in `PlayerSeasonEntry` type or any page template).
- **Proposed fix**: Drop `toi_avg_sec`, `gf_5v5`, `ga_5v5`, `gf_pct_5v5` from the season row (they duplicate information available via `gf_pct_5v5` and `toi_5v5_sec`). Alternatively, consider the `/data/skater-season-stats.json` build-time slimming pattern as the canonical approach: have the player page fetch the slim asset and supplement with the R2 feed only when RAPM/rating fields are needed (i.e., lazy-load the 11 MB only on demand).
- **Savings**: Removing 4 fields from 2,267 × avg 10 seasons ≈ modest (~500 KB). Bigger win is preventing the full 11 MB from being a build-time dependency if the lazy-load pattern is adopted.

### 5. /v1/playoffs/round/{n} — 4 parallel fetches on playoff pages

- **Feed**: D1 playoffs endpoint
- **Issue**: `playoffs/2026.astro` and `stats/series/index.astro` each fire 4 parallel fetches (`/v1/playoffs/round/1` through `/4`) on every page load. A single `/v1/playoffs/all` endpoint returning all rounds in one response would halve the round-trip overhead (4 fetches → 1).
- **Proposed fix**: Add `GET /v1/playoffs/all` that returns `{ rounds: { "1": ..., "2": ..., "3": ..., "4": ... } }`.
- **Savings**: 3 fewer HTTP round-trips per page load on playoff pages. Minor latency improvement, mainly cleaner code.

---

## Field-level Bloat Candidates

| Feed | Unused fields (confirmed) | Unused fields (usage unclear) | Suggested action |
|---|---|---|---|
| `wowy.json` | `xgf_pct`, `xgf_60`, `xga_60`, `gf_pct` in each segment | — | Drop from exporter — site recomputes these client-side |
| `signals.json` | `rule_id`, `priority`, `confidence_score`, `window`, `strength`, `stat_key`, `value`, `comparison_value`, `threshold`, `expires_at`, `dedup_key`, per-signal `generated_at` | — | Drop from site-facing payload; keep in internal/pipeline version |
| `draft_picks.json` | — | `odds`, `top1_odds` | Keep for iOS/future use; manual review needed |
| `teams.json` | — | `toi_all_sec`, `gf/ga_all`, `sf/sa_5v5`, `sf_pct_5v5`, `sh_pct_5v5`, `sv_pct_5v5`, `pdo_5v5`, `gf_5v5`, `ga_5v5`, `gf_pct_5v5`, `pp_xgf_60`, `pk_xga_60` | Manual review — stats page uses `xgf_pct_5v5`, `xgf_all`, `xgf_pct_all`, `wins/losses/ot_losses`, `pp_pct`, `pk_pct`, `cf_pct_5v5`, `hdcf_pct_5v5`; rest needs confirmation |
| `player_season_stats.json` | `toi_avg_sec`, `gf_5v5`, `ga_5v5`, `gf_pct_5v5` (present in raw, absent from TypeScript type) | — | Remove from exporter season rows |
| `methodology.json` | All — no site consumer | — | Remove from `_STATS_KEYS` map or wire to `/methodology` page |
| `players.json` | — | `avg_gs_centered`, `sc_pct`, `hdc_pct`, `xgar`, `qoc`, `qot`, `l7_avg`, `l7_games` | Some may be used by iOS; manual review needed |

---

## Consolidation Candidates

### 1. `player_career.json` → merge into `players.json`

- **Feeds**: `player_career.json` (2.7 MB) + `players.json` (6.4 MB)
- **Pattern**: `stats-loader.ts` already fetches both feeds in parallel and merges them in JS (`VALIDATED_PLAYERS = VALIDATED_PLAYERS_RAW.map(player => { career = careerMap[player_id]; return {...player, career_seasons: career.seasons} })`). This is a client-side join that could be done in the Python exporter.
- **Merge strategy**: Embed `career_seasons` (6 fields × ~10 seasons = ~60 fields) directly in each `players.json` entry. Remove `player_career.json` endpoint entirely. Since only active players are in `players.json` (715 vs 3130), the merged file would be significantly smaller than the current sum.
- **Estimated result**: Eliminate one HTTP fetch; combined size ~7 MB (vs current 9.1 MB split) after filtering retired-only career data.

### 2. `_meta.json` + `leaderboards.json` — always fetched together at build

- **Feeds**: `_meta.json` (543 B) + `leaderboards.json` (26 KB)
- **Pattern**: Both are fetched in the `stats-loader.ts` parallel `Promise.all()` at build time and used together on `stats/index.astro` and `stats/skaters.astro`. The `_meta.json` `season` field is used to label the leaderboard table header.
- **Merge strategy**: Embed the `_meta.json` content as a `meta` key inside `leaderboards.json`. Minor reduction in HTTP round-trips at build time.
- **Savings**: Minimal (1 build-time fetch), but simplifies the loader.

### 3. `series_stats.json` + `series_narratives.json` — always fetched together

- **Feeds**: `series_stats.json` (23 KB) + `series_narratives.json` (1.7 KB)
- **Pattern**: Both are fetched client-side together in `index.astro` for the playoff series section (lines 1577 and 1602). They are keyed by `series_id`.
- **Merge strategy**: Embed `narratives` as a field inside the relevant `series[]` entries in `series_stats.json`. Remove `series_narratives.json` endpoint.
- **Savings**: One fewer client-side fetch on the homepage during playoffs.
