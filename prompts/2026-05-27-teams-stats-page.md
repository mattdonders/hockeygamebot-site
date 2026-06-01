# Engineer Briefing — `teams.json` Export + `/stats/teams` Leaderboard Page

**Filed:** 2026-05-27
**Repo:** `hgb-analytics` (pipeline) + `hockeygamebot-site` (rewrite branch)
**Status:** Open. Closes the biggest single-page gap in HGB's stats hub.
**Reference:** JFresh's 2026-05-27 tweet (Vegas xGF% rankings) + hockey-statistics.com's NHL Team Stats page — the format we're matching with HGB design language.

---

## What we're building

A league-wide team leaderboard at `/stats/teams` — sort all 32 teams by xGF%, GF%, SF%, or any other column. **This page does NOT currently exist.**

You have `/teams` (find your team bot index) and `/teams/{abbr}` (individual team detail). You do NOT have `/stats/teams` (the "all 32 teams in one sortable table" view). That's this ticket.

## Why this matters

This is the page that competitors (NST, hockey-statistics.com, MoneyPuck) all have and HGB doesn't. It's also the surface where the JFresh-style "Vegas is 3rd in 5v5 xGF%" content originates. Every analytical thread on team performance starts with this kind of view.

It's also the **simplest first build** for the eventual D1 migration — team-level aggregates are smaller in volume than player-level data, making it the right Phase 1.5 ticket before tackling Phase 2 D1 work (see `hgb-docs/docs/plans/data-layer-architecture-d1-vs-json-2026-05.md`).

---

## Phase 1 — Pipeline: `teams.json` export (~1-2 hours)

Add a new export `teams.json` (or rename/extend the existing `team_game_stats.json` — pick whichever is cleaner). Each row = one team-season aggregate.

### Required columns per team

**Identity:**
- `team_abbrev` (e.g., "CAR")
- `team_name_full` (e.g., "Carolina Hurricanes")
- `team_name_city` ("Carolina") + `team_name_nickname` ("Hurricanes") — useful for the page header lockup
- `division` ("Metropolitan")
- `conference` ("Eastern")
- `logo_url` (NHL CDN pattern: `https://assets.nhle.com/logos/nhl/svg/{TEAM}_light.svg`)

**Standings:**
- `gp` (games played)
- `wins`, `losses`, `ot_losses`
- `points`
- `goal_diff` (GF - GA, all situations)

**5v5 stats (the JFresh column set):**
- `toi_5v5_sec` (total 5v5 ice time across all games)
- `gf_5v5`, `ga_5v5`
- `gf_pct_5v5` (computed as `gf_5v5 / (gf_5v5 + ga_5v5)`)
- `xgf_5v5`, `xga_5v5` (from XGBoost pipeline model)
- `xgf_pct_5v5`
- `sf_5v5`, `sa_5v5`
- `sf_pct_5v5`
- `sh_pct_5v5`, `sv_pct_5v5`
- `pdo_5v5` (computed as `sh_pct_5v5 + sv_pct_5v5`)
- `cf_5v5`, `ca_5v5`, `cf_pct_5v5` (Corsi)
- `hdcf_5v5`, `hdca_5v5`, `hdcf_pct_5v5` (high-danger chances)

**Special teams:**
- `pp_pct` (power play conversion rate)
- `pk_pct` (penalty kill success rate)
- `pp_xgf_60` (PP xG per 60)
- `pk_xga_60` (PK xG against per 60)

**Metadata:**
- `season` ("2025-26")
- `game_type` ("regular" | "playoffs") — emit one row per team per game_type if needed

### Data source

All of this should be derivable from existing `hgb_analytics.sqlite` tables. The pipeline already aggregates per-player; team-level is a SUM over players per team. Likely 1-2 new queries plus a serializer.

**Verify with stats engineer** before building: confirm the source columns exist for all 32 teams across both regular season and playoffs.

---

## Phase 2 — UI: `/stats/teams` page (~2-3 hours after Phase 1 ships)

### Page structure

Follow the exact pattern of `/stats/skaters`:

1. **Page header**
   - Wordmark + breadcrumb: `HGB Stats / Teams`
   - Title: `NHL TEAM STATS`
   - Subtitle: `Forward lines, defensive pairs, and team-level 5v5 + all-sit aggregates. Sort by any column.`

2. **Filter chip bar**
   - Regular Season / Playoffs toggle (existing pattern)
   - Strength: All / 5v5 (start with these two; PP/PK come later when strength-state ticket lands)
   - Display: Totals / Per 60
   - Conference filter: All / East / West (optional, nice-to-have)
   - Division filter: All / Metro / Atlantic / Central / Pacific (optional, nice-to-have)

3. **Sortable data table**
   - Default sort: xGF% descending
   - Sticky header row
   - Click column header to re-sort (asc/desc)
   - Color-coded percentage cells (≥55% green, ≤45% red — same threshold logic as `/stats/lines`)
   - Row hover: subtle highlight
   - Click row → navigates to `/teams/{abbr}` (existing team detail page)
   - First column: rank (#1, #2, …)
   - Second column: team logo + abbreviation lockup
   - Columns reflect the schema in Phase 1; default visible set:
     - Rank, Team, GP, GF%, xGF%, SF%, GF/60, GA/60, xGF/60, xGA/60, PP%, PK%
   - Plus "Show all columns" button to expand to full schema

4. **PNG export**
   - Canvas-direct export (existing pattern from `/stats/lines`)
   - Captures current table state (filters + sort applied)
   - HGB watermark bottom-right

5. **Filter context bar at top of exported PNG**
   - Same chip pattern as page filters
   - Shows what slice the user is viewing (e.g., "PLAYOFFS · 5V5 · SORTED BY XGF%")

### Design language

- HGB cream/ink palette (existing tokens)
- Barlow Condensed for headers, table headers
- JetBrains Mono for numbers
- Red threshold cells on percentages
- Match the visual rhythm of `/stats/skaters` and `/stats/lines` — should feel of-a-piece

### NOT in this ticket

- Strength-state toggle for PP/PK (waits for the strength-state ticket — pipeline support not ready)
- Date range filter (waits for D1 work — Phase 2 of the data architecture plan)
- Team head-to-head view (waits for D1 work)
- Column selection / show-hide individual columns (nice-to-have, defer)

---

## Acceptance criteria

- [ ] `teams.json` ships to R2 with all 32 teams populated
- [ ] All required columns populated for at least 2025-26 regular season + 2025-26 playoffs
- [ ] `/stats/teams` route renders without errors
- [ ] Default sort = xGF% descending
- [ ] Clicking any column header re-sorts the table (asc on first click, desc on second, etc.)
- [ ] Threshold color coding applies to % cells
- [ ] Clicking a row navigates to `/teams/{abbr}`
- [ ] Regular Season / Playoffs toggle changes the data
- [ ] PNG export works and captures the current filtered state
- [ ] Light + dark mode render correctly
- [ ] Mobile: table scrolls horizontally, sticky team name column
- [ ] Nav link added to main nav under Stats: "Teams" → /stats/teams

---

## Reporting back

Two checkpoints:

1. **After Phase 1 ships:** post the schema of `teams.json` + a sample row for one team (e.g., CAR or COL) to confirm data shape is correct
2. **After Phase 2 ships:** sample URL + screenshots (light/dark/mobile) + PNG export sample + confirm acceptance criteria

## Out of scope (do NOT build in this ticket)

- Team head-to-head page (separate ticket — needs D1)
- Date range filtering (separate ticket — needs D1)
- Team strength-state toggle for PP/PK (waits for strength-state ticket)
- Adding new columns beyond the schema above (file separate tickets if needed)
- Refactoring `/teams/{abbr}` (separate ticket — Team Detail Stage 2)

## Time budget

- Phase 1 (pipeline): ~1-2 hours
- Phase 2 (UI): ~2-3 hours

Total: ~3-5 hours. Aim to ship within one focused session.
