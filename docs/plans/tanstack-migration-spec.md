# TanStack Table Migration Spec
**Date:** 2026-05-31  
**Purpose:** Complete audit of every table surface on hockeygamebot-site so a developer can implement a shared React TanStack Table component tomorrow without doing discovery work.

---

## Table of Contents
1. [Table Surface Audit](#table-surface-audit)
2. [Shared `<HGBTable>` Component API Proposal](#shared-hgbtable-component-api-proposal)

---

## Table Surface Audit

### 1. `/stats/skaters` — Skater Stats

**Route:** `/stats/skaters`  
**Title:** "Leaderboards — HGB Stats — HockeyGameBot" / "Skater Stats"

**Data Source:**
- SSR: `loadPlayers()` from `src/lib/stats-loader` (reads local JSON file)
- The full dataset is embedded in `<script type="application/json" id="skaters-data">` at build time
- Client JS re-renders the table on every filter/tab change — no additional network requests

**Columns (dynamic — swap entirely per tab):**

Fixed columns always present:

| Key | Label | Type | Sort Dir | Mobile-Visible | Notes |
|---|---|---|---|---|---|
| `_rank` | # | rank | — | yes | `sortable: false` |
| `name` | Player | player | — | yes | Sub-line: `"{team} · {pos} · {gp} GP"`, team logo |
| `pos` | Pos | position | — | yes | Renders as position badge |
| `gp` | GP | number | desc | yes | Swaps to `po_gp` in Playoffs mode |

**Tab: Counting** (default tab, defaultSort: `points` desc):

| Key | Label | Type | Notes |
|---|---|---|---|
| `goals` | G | number | Playoff alias: `po_goals` |
| `assists` | A | number | Playoff alias: `po_assists` |
| `points` | P | number | **bold** · Playoff alias: `po_points` |
| `sog` | SOG | number | Playoff alias: `po_sog` |
| `ixg` | ixG | number | `.toFixed(2)` · Playoff alias: `po_ixg` |
| `toi_pg` | TOI | number | `.toFixed(1)` · Playoff alias: `po_toi_pg` |

*When `display=per60` (Totals/Per60 toggle), counting cols swap to:*
`g60, a60, p60, sog60, x60, toi_pg`

*When `strength=5v5/pp/pk`, stat values are recomputed from `goals_ev/goals_pp/goals_sh`, `a_ev/a_pp/a_pk`, `shots_ev/shots_pp/shots_pk`, `ixg_ev/ixg_pp/ixg_pk`, `toi_ev_sec/toi_pp_sec/toi_pk_sec`. Labels prefixed with `EV/PP/SH`.*

**Tab: Rates** (defaultSort: `p60` desc, regular season only):

| Key | Label | Type | Notes |
|---|---|---|---|
| `g60` | G/60 | number | `.toFixed(2)` |
| `a60` | A/60 | number | `.toFixed(2)` |
| `p60` | P/60 | number | **bold** · `.toFixed(2)` |
| `x60` | xG/60 | number | `.toFixed(2)` |
| `toi_pg` | TOI/G | number | `.toFixed(1)` |

**Tab: Advanced** (defaultSort: `imp` desc, regular season only):

| Key | Label | Type | Notes |
|---|---|---|---|
| `imp` | Impact | number | **bold** · signed (`±`) · green/red · two-line stack with `imp_p` percentile sub-line |
| `war` | WAR | number | signed · two-line stack with `war_p` percentile sub-line |
| `fin` | Finishing | number | signed · two-line stack with `fin_p` percentile sub-line |
| `rapm` | RAPM/60 | number | signed · `.toFixed(3)` |

*Percentile sub-line classes: `pe` (≥90), `pg` (≥70), `pa` (≥40), `pl` (<40). Color: `#00c078 / #60a5fa / ink-32 / red`.*

**Tab: On-Ice 5v5** (defaultSort: `xgf_pct` desc, regular season only):

| Key | Label | Type | Notes |
|---|---|---|---|
| `xgf_pct` | xGF% | number | **bold** · `{v.toFixed(1)}%` · green ≥55%, red ≤45% |
| `xgf60` | xGF/60 | number | `.toFixed(2)` |
| `xga60` | xGA/60 | number | `.toFixed(2)` |
| `sc60` | SC/60 | number | `.toFixed(2)` |
| `hdc60` | HDC/60 | number | `.toFixed(2)` |

**Filter Controls:**

| Control | Type | Default | Filters On | URL Param |
|---|---|---|---|---|
| Season Type | ChipGroup (Regular / Playoffs) | Regular Season (2) | switches dataset to `po_*` fields | `?game_type=3` |
| View (tab) | ChipGroup (Counting / Rates / Advanced / On-Ice) | Counting | column set | `?tab=rates` etc |
| Pos | ChipGroup (All / Fwds / Def) | All | `group` (`F` / `D`) | none |
| Display | ChipGroup (Totals / Per 60) | Totals | counting col key swap | `?display=per60` |
| Strength | ChipGroup (All / 5v5 / PP / PK) | All | recomputed from split fields | `?strength=5v5` |
| Team | `<select>` (All + 32 teams) | All | `team` field | `?team=EDM` |
| Min TOI | Range slider (0–28 min) | 0 | `toi_pg` ≥ value | `?toi=N` |
| Top N | ChipGroup (All / Top 10 / 20 / 50) | All | row slice | none |
| Name Search | Text input | empty | `searchText` (contains) | none |

**Default Sort:** `points` desc (counting), swaps to tab default on tab change  
**Export:** PNG, `exportFilename="hgb-skaters.png"`, disabled when >20 rows without Top N  
**Row Links:** Yes → `/stats/player/{slug}`  
**Estimated Rows:** ~700–800 eligible skaters (≥20 GP). SSR shows top 50. "Show all" button for full set.

**Computed Columns (render-time, not in raw data):**
- `points = goals + assists` (both from raw per-game rates × TOI)
- `p60 = (goals + assists) / toi_hours`
- `a60 = assists / toi_hours`
- `sog` = `Math.round(rates_per_60.shots * tot60)`
- `ixg` = `rates_per_60.ixg * tot60`
- All strength-state split stats (`goals_ev`, `shots_pp`, etc.) computed from raw sub-totals
- `war_p` = position-group percentile via binary search (computed at build time, stored in row)
- `imp_p`, `fin_p`, `g60_p`, etc. = rounded percentiles from `percentiles_vs_pos`

**Special Cell Rendering:**
- `name` cell: team logo SVG (`assets.nhle.com/logos/nhl/svg/{team}_light.svg`) + player name + sub-line
- `pos` cell: `<span class="pos-badge">` badge
- Advanced tab values: two-line `.stat-stack` with value + percentile rank in ordinal format (`90th`)
- `xgf_pct`: threshold color (green/red)
- Signed values: `+/-` prefix, green/red color

---

### 2. `/stats/goalies` — Goalie GSAx Leaderboard

**Route:** `/stats/goalies`  
**Title:** "Goalie GSAx — HGB Stats — HockeyGameBot"

**Data Source:**
- SSR: `loadGoalies()` from `src/lib/stats-loader`
- Both `regular` and `playoffs` datasets embedded in `<script type="application/json" id="goalies-data">`
- Client JS swaps tbody on game-type toggle

**Columns (static schema — serves both regular/playoff):**

| Key | Label | Type | Sort Dir | Mobile-Visible | Notes |
|---|---|---|---|---|---|
| `_rank` | # | rank | — | yes | `sortable: false` |
| `name` | Goalie | player | — | yes | Sub-line: team abbrev only |
| `games` | GP | number | desc | yes | `null` for regular season rows (SA threshold only); shows `—` |
| `sa` | SA | number | desc | yes | Comma-formatted |
| `ga` | GA | number | desc | yes | Integer |
| `xga` | xGA | number | desc | yes | `.toFixed(2)` |
| `gsax` | GSAx | number | desc | yes | **bold** · signed `+/-` · `.toFixed(2)` · green/red |
| `sv_pct` | SV% | number | desc | yes | `.toFixed(3)` |
| `vs_exp` | vs Exp | number | desc | yes | signed `+/-` + `%` · `.toFixed(2)` · green/red |

**Filter Controls:**

| Control | Type | Default | Filters On | URL Param |
|---|---|---|---|---|
| Season Type | ChipGroup (Regular Season / Playoffs) | Regular Season | switches dataset | `?game_type=3` |

**Default Sort:** `gsax` desc  
**Export:** PNG, `exportFilename="hgb-goalies.png"`  
**Row Links:** Yes → `/stats/goalies/{goalie_id}`  
**Estimated Rows:** ~60–80 qualifying goalies (≥500 SA regular, ≥100 SA playoffs)

**Computed Columns:**
- `vs_exp` = `(sv_pct - (1 - xga/sa)) * 100` — computed at build time in frontmatter
- Playoff `xga` = `playoff_gsax + playoff_ga` (reconstructed since xGA not stored separately)
- Playoff `sv_pct` = `1 - playoff_ga / playoff_sa`

**Special Cell Rendering:**
- `name` cell: team logo SVG + goalie name + team abbrev sub-line
- `gsax`: signed with green (≥0) / red (<0) color
- `vs_exp`: signed with `%` suffix and green/red color
- Also has a cumulative GSAx SVG line chart above the table (not a table surface)

---

### 3. `/stats/teams` — NHL Team Leaderboard

**Route:** `/stats/teams`  
**Title:** "NHL Team Stats — HockeyGameBot"

**Data Source:**
- SSR: `fetch('https://api.hockeygamebot.com/v1/stats/teams')` at build time (R2-backed JSON)
- Client payload: 8 pre-computed variants (2 game types × 2 strengths × 2 display modes) embedded in `<script type="application/json" id="teams-data">`

**Columns (static schema, labels swap on Per60 toggle):**

| Key | Label | Type | Sort Dir | Mobile-Visible | Notes |
|---|---|---|---|---|---|
| `rank` | # | rank | — | yes | `sortable: false`, assigned post-sort |
| `team_abbrev` | Team | team | — | yes | Team logo + city/nickname two-line stack |
| `season` | Season | number | desc | yes | Formatted `"25-26"` from `"2025-26"` |
| `gp` | GP | number | desc | yes | Integer |
| `record` | Record | number | — | yes | `"{W}-{L}-{OT}"` string, no sort |
| `gf_pct_5v5` | GF% | number | desc | yes | `{v*100).toFixed(1)}%` · green ≥55%, red ≤45% |
| `xgf_pct_5v5` | xGF% | number | desc | yes | **bold** · `%` format · threshold color |
| `sf_pct_5v5` | CF% | number | desc | yes | `%` format · threshold color (renamed from SF%) |
| `gf_display` | GF / GF/60 | number | desc | yes | Label swaps with Per60 toggle |
| `ga_display` | GA / GA/60 | number | desc | yes | Label swaps |
| `xgf_display` | xGF / xGF/60 | number | desc | yes | `.toFixed(1)` / `.toFixed(2)` |
| `xga_display` | xGA / xGA/60 | number | desc | yes | `.toFixed(1)` / `.toFixed(2)` |
| `pp_pct` | PP% | number | desc | yes | `%` format, no threshold color |
| `pk_pct` | PK% | number | desc | yes | `%` format, no threshold color |

**Filter Controls:**

| Control | Type | Default | Filters On | URL Param |
|---|---|---|---|---|
| Season Type | ChipGroup (Regular / Playoffs) | Regular | switches dataset payload | `?game_type=playoffs` |
| Strength | btn-group (All / 5v5) | All | switches payload bucket (`all` vs `fivev5`) | `?strength=5v5` |
| Display | btn-group (Totals / Per 60) | Totals | switches payload display mode + column labels | `?display=per60` |
| Conference | `<select>` (All / East / West) | All | `conference` field match | `?conf=east` |
| Division | `<select>` (All / 4 divisions) | All | `division` field match | `?div=metropolitan` |
| Season | `<select>` (multiple seasons) | latest | `season` field match | `?season=2025-26` |
| Team Search | Text input | empty | DOM-level hide/show on `data-team-*` attributes | none |

**Default Sort:** `xgf_pct_5v5` desc  
**Export:** PNG, `exportFilename="hgb-team-stats.png"`  
**Row Links:** Yes → `/teams/{team_abbrev.toLowerCase()}`  
**Estimated Rows:** 32 teams (all, no minimum threshold)

**Computed Columns:**
- `record` = `"{wins}-{losses}-{ot_losses}"` string assembled at build
- `gf_display` / `ga_display` = raw count OR `raw/hours` depending on display mode
- `xgf_display` / `xga_display` = same rate transform
- `gf_pct` = computed from `gf_5v5 / (gf_5v5 + ga_5v5)` for all-sit mode (since pipeline only has 5v5 GF%)
- `xgf_pct` for all-sit = `xgf_all / (xgf_all + xga_all)` (or falls back to 5v5)
- `rank` = reassigned after sort (1–32)

**Special Cell Rendering:**
- `team_abbrev` cell: team logo SVG + city (bold) + nickname (light) two-line stack
- Percentage columns: green ≥55%, red ≤45% threshold color on GF%/xGF%/CF%
- Column labels for `gf_display`, `ga_display`, `xgf_display`, `xga_display` updated in-place via `window.HGB_Table.updateColumnLabels()` when display mode changes

---

### 4. `/stats/impact` — HGB Impact Leaderboard

**Route:** `/stats/impact`  
**Title:** "HGB Impact — Player Leaderboard — HockeyGameBot"

**Data Source:**
- SSR: `loadPlayers()` + `loadPlayerGames()` from `src/lib/stats-loader`
- Full dataset embedded in `<script type="application/json" id="impact-data">`
- Client renders all rows; SSR renders empty table (`isLoading` state)

**Columns:**

| Key | Label | Type | Sort Dir | Mobile-Visible | Notes |
|---|---|---|---|---|---|
| `_rank` | # | rank | — | yes | `sortable: false` |
| `name` | Player | player | — | yes | Sub-line: `"{team} · {pos}"` |
| `pos` | Pos | position | — | yes | Position badge |
| `gp` | GP | number | desc | yes | Integer |
| `avg` | Avg Impact | number | desc | yes | **bold** · signed `+/-` · green/red · `.toFixed(2)` |
| `l10a` | L10 Avg | number | desc | yes | signed `+/-` · green/red · `.toFixed(2)` |
| `l10` | L10 Trend | label | — | yes | **Special:** inline SVG sparkline (72×22px), `sortable: false` |
| `best` | Best | number | desc | yes | green · `.toFixed(2)` |
| `worst` | Worst | number | asc | yes | red · `.toFixed(2)` |

**Filter Controls:**

| Control | Type | Default | Filters On | URL Param |
|---|---|---|---|---|
| Pos | tab buttons (All / Forwards / Defence) | All | `group` (`F` / `D`) | none |

**Pagination:** 50 rows per page with prev/next + numbered page buttons

**Default Sort:** `avg` desc  
**Export:** None (no `exportFilename`)  
**Row Links:** Yes → `/stats/player/{slug}`  
**Estimated Rows:** ~700–800 skaters (≥20 GP), paginated to 50/page

**Computed Columns:**
- `avg` = `player.avg_gs_display` (stored in data, HGBScore v2 average)
- `l10` = array of last 10 `gs_display` values from game log (sorted by date)
- `l10a` = mean of `l10` array
- `best` = `Math.max(...allGs)`
- `worst` = `Math.min(...allGs)`

**Special Cell Rendering:**
- `l10` cell uses `.td-spark` CSS class for special alignment (`!important` overrides)
- Sparkline SVG: viewBox `0 0 72 22`, fixed scale GS_MIN=−5 / GS_MAX=12, zero-line, color-coded line/dot (green if L10 avg ≥0, red if <0), terminal dot at rightmost point
- `avg` and `l10a` both use signed `+/-` prefix and threshold green/red color

---

### 5. `/stats/leaderboards` — Season Leaderboards

**Route:** `/stats/leaderboards`  
**Title:** "Leaderboards — HGB Stats — HockeyGameBot"

**Data Source:**
- SSR: `loadPlayers()` + `loadPlayoffLeaderboard()` (3 separate calls: `goals`, `assists`, `xg`)
- Dataset embedded in `<script type="application/json" id="lb-data">` as `{ rows, poGoals, poAssists, poXg }`
- SSR shows top 50 pre-sorted by WAR

**Columns (dynamic — full column swap by situation tab AND game type):**

Fixed columns (regular season):

| Key | Label | Type | Notes |
|---|---|---|---|
| `_rank` | # | rank | `sortable: false` |
| `name` | Player | player | Sub-line: `"{team} · {pos} · {gp} GP"` |
| `pos` | Pos | position | |
| `gp` | GP | number | |

**Situation: All** (defaultSort: `war` desc):

| Key | Label | Notes |
|---|---|---|
| `war` | WAR | **bold** · signed · pctKey: `war_p` · two-line stack |
| `g60` | G/60 | pctKey: `g60_p` |
| `a60` | A1/60 | pctKey: `a60_p` |
| `x60` | xG/60 | pctKey: `x60_p` |
| `fin` | Fin | signed · pctKey: `fin_p` |
| `imp` | Impact | pctKey: `imp_p` |

**Situation: 5v5** (defaultSort: `xgf_pct` desc):

| Key | Label | Notes |
|---|---|---|
| `xgf_pct` | xGF% | **bold** · `{v.toFixed(1)}%` · green ≥55%, red ≤45% |
| `xgf60` | xGF/60 | |
| `xga60` | xGA/60 | |
| `sc60` | SC/60 | |
| `hdc60` | HDC/60 | |
| `hdc_pct` | HDC% | `{v.toFixed(1)}%` |

**Situation: PP** (defaultSort: `pp_xg60` desc):

| Key | Label | Notes |
|---|---|---|
| `pp_toi` | PP min/gm | `.toFixed(1)` |
| `pp_g` | PP G | integer |
| `pp_xg60` | PP xG/60 | **bold** · `.toFixed(2)` |
| `sc60` | SC/60 | |
| `hdc60` | HDC/60 | |

**Game Type: Playoffs** (unified schema, replaces all situation tabs):

| Key | Label | Notes |
|---|---|---|
| `_rank` | # | rank |
| `display_name` | Player | player |
| `pos` | Pos | position |
| `gp` | GP | number |
| `goals` | Goals | **bold** |
| `assists` | Assists | |
| `xg60` | xG/60 | `.toFixed(2)` |

**Filter Controls:**

| Control | Type | Default | Filters On | URL Param |
|---|---|---|---|---|
| Season Type | tab buttons (Regular / Playoffs) | Regular | switches to unified playoff schema | `?game_type=3` |
| Situation | tab buttons (All Sit / 5v5 / PP) | All Sit | column set, hidden in Playoffs mode | none |
| Pos | tab buttons (All / Fwds / Def) | All | `group` (`F` / `D`), hidden in Playoffs mode | none |

**Pagination:** "Show all" button (top 50 by default)  
**Default Sort:** `war` desc (regular), `goals` desc (playoffs)  
**Export:** PNG, `exportFilename="hgb-leaderboards.png"`  
**Row Links:** Yes → `/stats/player/{slug}`  
**Estimated Rows:** ~700–800 (regular), variable for playoffs

---

### 6. `/stats/lines` — Line Combinations

**Route:** `/stats/lines`  
**Title:** "Line Combinations — HockeyGameBot"

**Data Source:**
- SSR: empty rows (`isLoading` state)
- Client: `fetch('https://api.hockeygamebot.com/v1/stats/lines')` on page load
- Full dataset loaded into memory; all filtering/sorting is client-side

**Columns:**

| Key | Label | Type | Sort Dir | Mobile-Visible | Notes |
|---|---|---|---|---|---|
| `_rank` | # | rank | — | yes | `sortable: false` |
| `players` | Line | label | — | yes | Player name string e.g. `"McDavid – Draisaitl – Hyman"` |
| `type` | Type | position | — | yes | `F` or `D` badge |
| `team` | Team | team | — | yes | Logo + abbrev |
| `toi_min` | Minutes | number | desc | yes | `.toFixed(1)` |
| `min_per_g` | Min/G | number | desc | yes | `.toFixed(1)`, computed client-side |
| `xgf_pct` | xG% | number | desc | yes | **bold** · `{v.toFixed(1)}%` · green ≥55%, red ≤45% |
| `xgf` | xGF | number | desc | yes | `.toFixed(2)` |
| `xga` | xGA | number | desc | yes | `.toFixed(2)` |
| `xgf_60` | xGF/60 | number | desc | yes | `.toFixed(2)` |
| `xga_60` | xGA/60 | number | desc | yes | `.toFixed(2)` |

**Filter Controls:**

| Control | Type | Default | Filters On | URL Param |
|---|---|---|---|---|
| Season Type | ChipGroup (Regular / Playoffs) | Regular | `game_type` field match | `?game_type=3` |
| Line Type | ChipGroup (All / Forwards / Defense) | All | `type` (`F` / `D`) | `?type=F` |
| Season | `<select>` (All + 4 seasons) | All Seasons | `season` field match | `?s=20252026` |
| Team | `<select>` + chip removable (up to 3 teams) | None | `team` field match | `?team=EDM,MTL` |
| Min TOI | Range slider (20–400 min, 10m step; 5–400 in playoffs) | 150 (reg) / 30 (playoff) | `toi_min` ≥ value | `?toi=N` |
| Player | URL param only (from player detail page link) | none | `player_ids` array contains player_id | `?player=ID` |

**Default Sort:** `xgf_pct` desc  
**Export:** PNG, `exportFilename="hgb-lines.png"`  
**Row Links:** Yes → `/stats/lines/{slug}` (slug computed from team/player names/season)  
**Pagination:** Shows top 100, "Show All" button for remainder  
**Estimated Rows:** Several thousand lines across all seasons; top 100 shown by default

**Computed Columns:**
- `min_per_g = toi_min / games` (client-side, not in API response)

**Special Cell Rendering:**
- `xgf_pct` cell: `{v.toFixed(1)}%` + threshold color (green ≥55, red ≤45)
- `players` cell: plain text string with `–` delimiter between player last names

---

### 7. `/stats/lines/[slug]` — Line Detail Breakdown

**Route:** `/stats/lines/{slug}`  
**Title:** `"{line.players} · {team} · HGB Stats"`

**Note:** This page has NO table. It has:
- KPI strip (9 cells: GP, TOI, MIN/GP, GF, GF%, GA, XGF, XGF%, XGA)
- Breakdown blocks (4 tiles: Corsi, Fenwick, Shots, PDO — each with 3 sub-values: against/%, for)
- Shot map SVG (fetched client-side from `/v1/lines/{slug}/shots`)
- PNG export via canvas

**No `<Table>` component is used on this page.** Skipped from migration scope.

---

### 8. `/stats/player/[slug]` — Player Detail Page

**Route:** `/stats/player/{slug}`  
**Title:** `"{first_name} {last_name} — HGB Stats"`

**Data Source:**
- SSR: `loadPlayers()`, `loadPlayerGames()`, `loadPlayerShots()`, `loadMeta()` from `src/lib/stats-loader`
- All data embedded at build time; no client-side fetches for table data

**Table 1: Career Stats**

| Key | Label | Type | Sort Dir | Notes |
|---|---|---|---|---|
| `season_fmt` | Season | label | desc | **bold** · formatted `"2025–26"` |
| `team` | Team | team | — | Logo + abbrev |
| `gp` | GP | number | desc | |
| `toi_gp` | TOI/GP | number | — | Pre-formatted `"M:SS"` string |
| `gf_pct` | GF% | number | desc | `{v.toFixed(1)}%` · green ≥55%, red ≤45% |
| `xgf_pct` | xGF% | number | desc | **bold** · same format/color |

- `defaultSort: { column: 'season_fmt', direction: 'desc' }`
- `sticky={false}`
- No export, no row links
- Estimated rows: 3–12 seasons depending on player career length

**Table 2: Game Log**

| Key | Label | Type | Sort Dir | Notes |
|---|---|---|---|---|
| `date` | Date | label | desc | Pre-formatted `"Jan 15"` |
| `opp` | Opp | label | — | `"vs DET"` or `"@ DET"` |
| `result` | Result | label | — | **bold** · `"W 4–2"` · green=win, dim=OT, red=loss |
| `goals` | G | number | desc | |
| `assists` | A | number | desc | |
| `points` | PTS | number | desc | **bold** |
| `toi_sec` | TOI | number | desc | `"M:SS"` format · conditional — only if `_hasToi` |
| `ixg` | xG | number | desc | `.toFixed(2)` · conditional — only if `_hasIxg` |
| `gs_display` | Impact | number | desc | **bold** · signed `+/-` · `.toFixed(2)` · green/red |

- `sticky={false}`, `scrollable`, `maxHeight=400`
- No export
- Row links: `/games/{game_id}` (conditional, only if game_id present)
- Estimated rows: ~82 games (full regular season), newest first

**Computed Columns:**
- `result` = `"W/L/OT {team_score}–{opp_score}"` assembled from game log fields
- `result_w`, `result_ot` flags for coloring
- `points = goals + assists`

**Special Cell Rendering:**
- `result` cell: color via `resultColor` callback — green=win, `ink-48`=OT, red=loss
- `gs_display` (Impact): signed `+/-`, green/red threshold at 0

---

### 9. `/stats/wowy` — With Or Without You

**Route:** `/stats/wowy`  
**Title:** "WOWY — With Or Without You · HockeyGameBot"

**Data Source:**
- SSR: empty table (`sticky={false}`)
- Client: `fetch('https://api.hockeygamebot.com/v1/stats/wowy')` on page load
- Results are filtered per player-pair selection; table always has exactly 4 rows when populated

**Columns:**

| Key | Label | Type | Sort Dir | Notes |
|---|---|---|---|---|
| `segment` | Segment | label | — | Two-line HTML: primary name (bold) + desc sub-line; "TOGETHER" badge on first row |
| `toi_min` | TOI (min) | number | — | `.toFixed(1)` |
| `games` | Games | number | — | Integer or `—` |
| `xgf_pct` | xGF% | number | desc | **bold** · `{v.toFixed(1)}%` · green ≥55%, red ≤45% |
| `xgf` | xGF | number | desc | `.toFixed(2)` |
| `xga` | xGA | number | desc | `.toFixed(2)` |
| `xgf_60` | xGF/60 | number | desc | `.toFixed(2)` |
| `xga_60` | xGA/60 | number | desc | `.toFixed(2)` |

**Filter Controls:**

| Control | Type | Default | Filters On | URL Param |
|---|---|---|---|---|
| Player A | Autocomplete text input | empty | `player1_id` / `player2_id` match | `?player=ID` (pre-fills Player A) |
| Player B | Autocomplete text input | empty | the other player of the pair | none |
| Season | `<select>` (All + 4 seasons) | All Seasons | `season` field match | none |

**Default Sort:** None (fixed 4-row order: Together, A without B, B without A, Neither)  
**Export:** None  
**Row Links:** None  
**Estimated Rows:** Always exactly 4 rows (one per WOWY segment) when populated

**Computed Columns:**
All 4 segment rows are computed client-side by aggregating from the raw pairs data:
- `toi_min` = sum of all matching records' TOI / 60
- `xgf_pct` = `xgf / (xgf + xga) * 100` (rounded 1dp)
- `xgf_60`, `xga_60` = per-60 rates
- `games` = sum of `with.games` (only available for "Together" segment)

**Special Cell Rendering:**
- First row (`segment` cell): `<span class="seg-with-badge">TOGETHER</span>` inline badge
- `segment` cell: two-line structure `.seg-name` + `.seg-desc`

---

### 10. `/teams/[abbr]` — Team Hub Page

**Route:** `/teams/{abbr}` (32 static pages)  
**Title:** `"{Team Name} Stats — HGB Analytics"`

**Data Source:**
- SSR: `loadPlayers()`, `loadAllTeamGames()`, `loadTeamPlayerGames()`, `loadGoalies()`, `loadMeta()`
- Player and goalie rows embedded at build time
- Game log and player rows rendered/filtered client-side

This page has 3 separate `<Table>` instances:

**Table 1: Team Skaters**

| Key | Label | Type | Sort Dir | Notes |
|---|---|---|---|---|
| `_rank` | # | rank | — | `sortable: false` |
| `name` | Player | player | — | Sub-line: `"{pos} · {gp} GP"` |
| `pos` | Pos | position | — | |
| `gp` | GP | number | desc | |
| `war` | WAR | number | desc | signed (implied by client code) |
| `g60` | G/60 | number | desc | |
| `a60` | A1/60 | number | desc | |
| `x60` | xG/60 | number | desc | |
| `fin` | Fin | number | desc | |
| `imp` | Impact | number | desc | **bold** |

- `defaultSort: { column: 'imp', direction: 'desc' }`, `sticky={false}`
- Rows start empty; client JS renders from team players data (uses `tbl:rows-changed`)
- Row links: `/stats/player/{slug}`
- "Show all players" button (pagination)
- Opponent filter: `<select>` dropdown — filters game log stats by opponent — affects player stat values too via `playerGameMap`
- No export (no `exportFilename`)
- Estimated rows: ~25–30 players per team

**Table 2: Team Goalies**

| Key | Label | Type | Sort Dir | Notes |
|---|---|---|---|---|
| `name` | Name | label | — | No logo; plain text name |
| `gp` | GP | number | desc | |
| `gsax` | GSAx | number | desc | **bold** · signed `+/-` · `.toFixed(2)` · green/red |
| `sv_pct` | SV% | number | desc | `{(v*100).toFixed(2)}%` |
| `sa` | SA | number | desc | Integer |

- `defaultSort: { column: 'sa', direction: 'desc' }`, `sticky={false}`
- SSR renders with real rows (goalie data is static, no opponent filter)
- Row links: `/stats/goalies/{goalie_id}`
- No export
- Estimated rows: 1–3 goalies per team

**Table 3: Team Game Log**

| Key | Label | Type | Sort Dir | Notes |
|---|---|---|---|---|
| `date` | Date | label | — | `"Mon Jan 15"` |
| `opp` | Opp | label | — | `"vs DET"` or `"@ DET"` |
| `result` | Result | label | — | `"W 4–2"` |
| `gf` | GF | number | desc | |
| `ga` | GA | number | desc | |
| `xgf_pct` | xGF% | number | desc | **bold** · `{v.toFixed(1)}%` |
| `xgf` | xGF | number | desc | |
| `xga` | xGA | number | desc | |

- `isLoading` / `sticky={false}`
- Rows rendered client-side from `teamGames` data
- Filtered by opponent when `activeOpp` is set
- No row links, no export
- Estimated rows: up to 82 games, default "Last 10"

---

## Shared `<HGBTable>` Component API Proposal

### Philosophy

The current implementation pattern is:
- Astro server renders a skeleton `<Table>` with column schema
- Client JS rebuilds rows via innerHTML + dispatches `tbl:rows-changed`
- `window.HGB_Table.replaceColumns()` swaps column headers when tabs change
- `window.HGB_Table.updateColumnLabels()` patches header text only

The React/TanStack migration should eliminate this two-layer system entirely. TanStack Table handles all of this declaratively via controlled state.

---

### `ColumnDef` Shape

```typescript
interface HGBColumnDef<TRow = Record<string, any>> {
  // Required
  key: string;            // data key in the row object
  label: string;          // header label
  
  // Type determines default rendering + alignment
  type: 'rank'            // right-aligned, padded "01" format, non-sortable
       | 'player'         // logo + name + sub-line; always left-aligned
       | 'team'           // logo + city/nickname stack; left-aligned  
       | 'position'       // badge rendering; center-aligned
       | 'number'         // tabular-nums; center-aligned
       | 'label';         // plain text; left-aligned
  
  // Optional overrides
  sortable?: boolean;                          // default: true for number/player/team; false for rank/label
  bold?: boolean | ((value: any, row: TRow) => boolean);
  format?: (value: any, row: TRow) => string; // string override for display
  color?: (value: any, row: TRow, tok: ColorTokens) => string | undefined;
  align?: 'left' | 'center' | 'right';       // override type-default alignment
  width?: number;                              // fixed px width
  
  // Player-type sub-line
  sub?: (row: TRow) => string;
  
  // Dynamic label (for Per60 toggle on teams page)
  labelKey?: string;     // if set, label is looked up from a labels map instead of static string
  
  // Percentile two-line stack (Advanced/Leaderboards view)
  percentileKey?: string; // row field containing 0–100 percentile value
}

interface ColorTokens {
  pos: string;   // --stats-pos CSS var value
  neg: string;   // --stats-neg CSS var value
}
```

---

### `<HGBTable>` Props

```typescript
interface HGBTableProps<TRow = Record<string, any>> {
  // ─── Required ───────────────────────────────────────────────
  columns: HGBColumnDef<TRow>[];
  data: TRow[];
  
  // ─── Sort ───────────────────────────────────────────────────
  defaultSort?: { column: string; direction: 'asc' | 'desc' };
  // When columns change entirely (tab swap), caller updates `columns` prop.
  // TanStack Table re-derives sort state from new column list automatically
  // if we use the `id` field to match. Reset sort on column change is the
  // safe default.
  
  // ─── Row navigation ────────────────────────────────────────
  getRowHref?: (row: TRow) => string | undefined;
  
  // ─── Scroll / height ───────────────────────────────────────
  scrollable?: boolean;     // enables overflow-x: auto wrapper
  maxHeight?: number;       // px; enables vertical scroll with sticky header
  sticky?: boolean;         // sticky thead (default: true)
  
  // ─── Export ─────────────────────────────────────────────────
  exportFilename?: string;  // enables PNG export button
  exportTitle?: string;     // title shown in exported PNG
  exportChips?: string[];   // filter labels baked into PNG
  
  // ─── Accessibility / loading ───────────────────────────────
  ariaLabel?: string;
  isLoading?: boolean;
  loadingMessage?: string;
  emptyMessage?: string;
  
  // ─── Pagination ─────────────────────────────────────────────
  pagination?: {
    mode: 'pages' | 'show-more';
    pageSize?: number;       // default: 50
  };
  
  // ─── Column label overrides (for Per60 toggle) ──────────────
  // Pass a partial map to rename specific column labels without re-specifying
  // the full columns array. TanStack Table updates header text reactively.
  columnLabelOverrides?: Record<string, string>;
  
  // ─── CSS class pass-through ─────────────────────────────────
  className?: string;
}
```

---

### Filter Types Needed

Based on the audit, the following filter types must be supported outside the table itself (as controlled state passed down to the table via `data` prop):

| Filter Type | Used By | Implementation |
|---|---|---|
| **ChipGroup (single-select)** | Skaters, Goalies, Teams, Lines, Impact, Leaderboards | `<ChipGroup>` component (already exists as Astro component — needs React port) |
| **Text search** | Skaters, Teams | Controlled `<input>` with debounce; filter applied to `data` before passing |
| **Range slider** | Skaters, Lines | `<input type="range">` with controlled state; `min/max/step` configurable |
| **Select dropdown** | Skaters (team), Teams (conf/div/season), Lines (season/team) | Native `<select>` or Radix `<Select>` |
| **Multi-select with chip removals** | Lines (up to 3 teams) | Controlled chips array with add/remove; current implementation is custom |
| **Autocomplete** | WOWY (player picker) | Custom autocomplete input; unique to WOWY |
| **Season select** | Lines, WOWY | Same as select dropdown; season values hardcoded |

---

### Column Swap Strategy (Tabs)

Several pages swap the **entire column set** client-side (Skaters view tabs, Leaderboards situation tabs). In TanStack Table this is straightforward: just update the `columns` prop passed to `<HGBTable>`. The component should:

1. Reset sort state to the tab's `defaultSort` when `columns` change (detected via column `key` set diff)
2. Re-render headers without re-mounting the component (use `key` prop on TanStack `useReactTable` or watch columns in a `useEffect`)

### Per-60 Label Swap

The Teams page needs to swap column header labels (not the data key) when Per60 toggle changes. Options:
- Pass `columnLabelOverrides={{ gf_display: 'GF/60', ga_display: 'GA/60', ... }}` and apply in header render
- Or just re-pass the full `columns` array with updated labels (simpler, though slightly more verbose for the consumer)

Recommendation: re-pass columns with updated labels — avoids a special-case prop.

### Sparkline Column

The `/stats/impact` `l10` column renders an inline SVG sparkline. This is a custom cell renderer that TanStack Table supports via `cell: (ctx) => <SparklineSVG values={ctx.row.original.l10} />`. The sparkline spec:
- Width: 72px, Height: 22px
- Scale: fixed, GS_MIN=−5 / GS_MAX=12
- Zero baseline: dashed line at `y(0)`
- Line color: green if L10 avg ≥0, red if <0
- Terminal dot: 2.5px radius at final data point

### Signed-Value + Percentile Stack

Advanced/Leaderboards tab cells need a two-line display:
- Top: value with `+/-` prefix and threshold color
- Bottom: percentile rank in ordinal format (`90th`, `3rd`) with tier color class

This is a composite cell renderer in TanStack. When `column.percentileKey` is set:
```tsx
cell: (ctx) => {
  const val = ctx.getValue();
  const pct = ctx.row.original[col.percentileKey];
  return <PercentileStack value={val} percentile={pct} format={col.format} />;
}
```

### PNG Export

The current `table-export.js` script reads the `ColumnDef[]` from `window.HGB_Table` and uses `html2canvas` or a Canvas-based renderer. For the React migration:
- Keep the export logic in a standalone utility (`exportTablePng(columns, rows, options)`)
- Wire a button click in `<HGBTable>` to call this utility when `exportFilename` is provided
- The `exportChips` prop provides the filter label chips that appear in the PNG header

---

### Migration Priority Order

Based on complexity and shared structure:

1. **`/stats/goalies`** — simplest: static columns, two-dataset toggle, clean `<Table>` usage
2. **`/stats/teams`** — 32 rows, no player-type cells, clean filter set; good for testing Per60 label swap
3. **`/teams/[abbr]` (goalies + game log tables)** — straightforward; tests opponent filter + team-scoped data
4. **`/stats/wowy`** — small fixed table (4 rows), unique autocomplete picker; good isolation test
5. **`/stats/impact`** — introduces sparkline + pagination; moderate complexity
6. **`/stats/player/[slug]` (career + game log)** — two tables, conditional columns (`_hasToi`, `_hasIxg`), result color callback
7. **`/stats/lines`** — client-fetch, team chip multi-select, slug routing
8. **`/stats/leaderboards`** — column swap between 3 situations + 2 game types; moderate complexity
9. **`/stats/skaters`** — most complex: 4 view tabs × 2 display modes × 3 strength modes × 2 game types = 24 effective column/data combinations

---

### Files to Create / Modify

| File | Action | Notes |
|---|---|---|
| `src/components/HGBTable.tsx` | Create | Main TanStack Table wrapper |
| `src/components/table/cells/PlayerCell.tsx` | Create | Logo + name + sub-line |
| `src/components/table/cells/TeamCell.tsx` | Create | Logo + city/nickname |
| `src/components/table/cells/PositionBadge.tsx` | Create | `<span class="pos-badge">` |
| `src/components/table/cells/PercentileStack.tsx` | Create | Value + ordinal sub-line |
| `src/components/table/cells/SparklineCell.tsx` | Create | 72×22 inline SVG |
| `src/components/ChipGroup.tsx` | Create (port) | React port of existing `ChipGroup.astro` |
| `src/lib/table-export.ts` | Create | Extracted PNG export logic from `public/js/table-export.js` |
| `src/lib/stats-loader.ts` | Modify | May need to expose typed row shapes |
