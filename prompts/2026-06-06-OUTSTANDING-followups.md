# Outstanding Follow-ups — Session 2026-06-06

Handoff for the next session (Claude, DE, or future-you). Everything from tonight
that's shipped is on `main`; this is what's left. Grouped by owner.

---

## A. DE / data pipeline

### A0. Series page — restore Lines/Pairs + Top Skaters (this-series data) — added 2026-06-07
The series page (`/stats/series/[slug]`) is now correctly **this-series only**, but
two sections are hidden because the series-filtered data doesn't exist:
- **Lines / Pairs** — `game_log` was removed from `lines.json` ("too large"), so
  `seriesLineRows()` (which filters `game_log` by opponent) always returns empty.
  Need either per-series line/pair aggregates in a series-scoped feed, or `game_log`
  re-added. The frontend sections are gated on `hasSeriesLines` → they auto-return
  when data is present, no FE change needed.
- **Top Skaters** — currently the only player feed is regular-season totals
  (players.json) and whole-playoff `playoff_points`; neither is series-specific.
  Need per-series player points (G/A/P vs this opponent). Section is behind
  `{false &&}` → flip on + wire fields once available.
- Shot map per-shot xG: NOT needed (confirmed we don't size dots by xG).

### A1. Names on `player-season-stats` (blocks skaters retired players)
Full prompt: `prompts/2026-06-06-skaters-name-join-DE.md`.
TL;DR: add top-level `name` + `slug` per player to `player-season-stats`. ~1,552
of 2,267 players (retired/inactive) currently render as `#8470794` on the
multi-season skaters leaderboard because the only name source is `players.json`
(current 715). `player-career.json` has no names either.

### A2. (DONE — verify only) `edge_history` + `toi_avg_sec`
DE delivered both. `edge_history` keyed by season on every player object;
`toi_avg_sec` (all-situations TOI ÷ GP) on `player-season-stats` rows. Playoff
backfill also done (Marner now 10 playoff seasons, 30-min threshold). No action
unless frontend wiring (B1) surfaces gaps.

---

## B. Frontend — Season Card historical data (data now exists, not yet wired)

### B1. Wire historical EDGE into the Season Card
`drawSeasonCard` in `src/pages/stats/player/[slug].astro` still always reads
`D.edge` (current season) and shows a "2025-26 only" note + dashes for counting
stats on historical seasons. Now that `edge_history[season]` and per-season
counting (`goals/assists/points/toi_avg_sec`) exist:
- Pick `edge_history[selectedSeason]` instead of `D.edge` when historical.
- Fill the counting strip from the historical `_seasonStats` row instead of `—`.
- Drop the "2025-26 only" note once historical EDGE renders.

### B2. Fix remaining hardcoded `'th'` ordinals in `[slug].astro` HTML
Canvas cards now use `ordinal()`. The HTML edge-stat-grid still hardcodes
`Math.round(n)+'th'` at ~lines 913, 924, 965, 971 → shows "32th" etc. Swap to
`ordinal()`.

### B3. Season Card fonts (deferred to summer)
labelFont Barlow vs JetBrains Mono experiment. The sandbox at
`/tmp/season_card_sandbox.html` has live font dropdowns. Low priority.

---

## C. Frontend — Skaters leaderboard polish

### C1. (after A1) Point name join at the payload
Once `player-season-stats` carries names, change the join in
`src/pages/data/skater-season-stats.json.ts` from `players.json` lookup to the
payload's own `name`/`slug`. ~10 lines. Makes all 2,267 resolve and retired rows
clickable.

### C2. Dark mode table body (existing limitation, not a regression)
SkatersTable/HGBTable inline styles are hardcoded light; the table body stays
light in dark mode (true before tonight too). If we want true dark mode it's a
HGBTable-wide theming pass — separate task.

### C3. (optional) Per-82 display mode
Discussed: add `Per 82` to the Display toggle (Σstat ÷ ΣGP × 82) for
length-adjusted comparison. `aggregateSeasons` already has per-season rows; few
lines. Per-season-average is more niche, skip.

### C4. (guard rail) Dedupe if pipeline emits split-by-team season rows
Today every (player, season) has exactly one row, so summing is safe. If the DE
ever splits traded players into per-team season rows AND adds a combined "TOT"
row, `aggregateSeasons` would double-count. Add a dedupe/skip-TOT guard then.

---

## D. Housekeeping

### D1. `src/data/stats/player_career.json` working-tree divergence
Tracked file is +140,838 lines vs HEAD in the working tree — predates tonight,
not part of any committed work. Decide: revert (`git checkout`) or commit. Looks
like the committed version is near-empty and the working copy got populated.

### D2. Uncommitted leftovers
`.astro/data-store.json` (build artifact — ignore/revert) and a small `TODO.md`
edit from the /wrap. Clean up as desired.

### D3. Stray Python static server on :4322
An old `dist/` static server is still bound to 4322 (not ours). `lsof -ti :4322
| xargs kill` to clear it.

### D4. (offseason) Extract shared React `ChipGroup`
The chip toggle is reimplemented inline in PlayerCareerTable, SkatersTable, and
HGBTable. Extract one shared React component (sibling to `ChipGroup.astro`) as a
single source of truth. Design-system cleanup, not urgent.

---

## Shipped tonight (for context, all on `main`)
- Player Season Card: counting strip, hero values, EDGE padding/alignment,
  ordinals, historical-season correctness
- Player page: Regular/Playoffs career table toggle
- Skaters: multi-season + playoff leaderboard, season range, hybrid data path
