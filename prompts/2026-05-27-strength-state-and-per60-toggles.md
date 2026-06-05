# Engineer Briefing — Strength-State + Per-60 Toggles (Skaters Surfaces)

**Filed:** 2026-05-27
**Repo:** `hockeygamebot-site` (rewrite branch)
**Status:** Open. Highest-retention-impact gap surfaced by the 2026-05-27 competitive audit.
**Strategic context:** HGB beats peers on presentation but falls short on situational granularity. The audit's verdict: "Two small-to-medium additions close the gap entirely." This is those two additions.

---

## What we're building

Two new filter toggles across all skater-facing stat surfaces:

1. **Strength-state toggle:** `All Situations · 5v5 · PP · PK`
2. **Display toggle:** `Totals · Per 60`

Toggles persist via URL query params (shareable) and optionally fall back to localStorage for "remember my last choice" UX.

## Why this matters (retention argument)

From the audit: HGB currently shows 5v5 only on the player detail page. Every competitor (NST, hockey-statistics.com, MoneyPuck) has strength-state slicing. Power-play specialists' PP1 numbers are the single most-asked-for stat, and right now HGB tells those users "5v5 only." That's the retention leak.

Per-60 vs Totals is table-stakes everywhere except HGB.

These two together move HGB from "best-looking page that's missing power-user features" to "best-looking page that also does the deep slicing."

---

## Pages in scope

### Primary (build for these)

1. **Player detail page** — `/stats/skaters/{slug}` — main retention surface
2. **Skaters leaderboard** — `/stats/skaters` — same audience, same data shape
3. **Team detail page** — `/teams/{abbr}` — the embedded skaters table inherits toggles automatically when navigating from/within team context

### Out of scope (don't touch this ticket)

- **Goalies surfaces** — Per-60 makes sense for goalies, but strength-state means something different (and SV% / GSAx on PP/PK is rare data). File separately if we want it.
- **Lines surfaces** — Lines are 5v5 by methodology. Adding strength-state to lines would be conceptually incoherent.
- **Career table on player page** — Multi-season strength-state data may not exist for all back-seasons. Add a TODO to investigate, but don't build into this ticket.

## UI pattern

### Toggle placement

Match the existing filter chip pattern used on `/stats/skaters` etc. Add two new chip groups to the filter bar:

**Existing (today):** `Regular Season · Playoffs` · `Forwards · Defense` · `Min TOI: 150m`

**Add:** `All · 5v5 · PP · PK` · `Totals · Per 60`

### Visual treatment

- Same chip styling as existing toggles
- Selected state: filled red background
- Unselected: outlined
- Place new chips inline with existing filter bar — don't add a new row if avoidable

### Default state

- Strength: `5v5` (current behavior — no regression)
- Display: `Totals` (current behavior — no regression)

This keeps page-load behavior identical for users who don't interact with the toggles. Only opt-in changes.

## Behavior

### Query params

Selection updates URL:
- `?strength=5v5` (default, omit from URL)
- `?strength=all` / `?strength=pp` / `?strength=pk`
- `?display=totals` (default, omit from URL)
- `?display=per60`

Shareable URLs work: `/stats/skaters/connor-mcdavid?strength=pp&display=per60` shows McDavid's PP1 numbers per 60. That's the "shareable receipt" use case.

### localStorage fallback

If user navigates without query params but has previously set a preference, read from localStorage. Key: `hgb_stat_prefs`. Value: `{ strength: "pp", display: "per60" }`. Optional v1 — can be deferred to v1.1 if it complicates the build.

### Data source

The pipeline already exports per-strength splits because:
- PP RAPM and PK RAPM components exist in the WAR breakdown
- Events table preserves strength state per event
- 5v5 / PP / PK aggregations should be derivable from existing data

**Confirm with stats engineer** before building: does `players.json` already have per-strength rollups, or do we need a pipeline export change first?

If pipeline support is missing → that becomes a Phase 1 stop-point. Don't build UI on data that doesn't exist.

### Which stats get the per-60 transform

**Counting stats only.** Percentage / rate stats already are rates and stay unchanged.

Apply per-60 to:
- Goals, Assists, Primary Assists, Points
- Shots, iCF, iFF
- ixG
- Hits, Takeaways, Giveaways (if shown)
- Penalty minutes / penalties drawn

Do NOT apply per-60 to:
- GF%, xGF%, CF%, SF%, etc. (already rates)
- Shooting %, Save % (already rates)
- PDO (already composite)
- TOI itself
- WAR / Impact (already aggregated)

## Acceptance criteria

- [ ] Strength-state chip group renders on player detail, skaters leaderboard, team detail (embedded)
- [ ] Display chip group renders on same surfaces
- [ ] Default selections (`5v5` + `Totals`) match current page behavior — no regression for users not interacting with toggles
- [ ] Clicking a toggle updates the URL and reloads / re-renders with new data
- [ ] Shareable URL works: pasting `/stats/skaters/connor-mcdavid?strength=pp&display=per60` in a fresh tab opens to that state
- [ ] Counting stats correctly transform to per-60 when display=per60
- [ ] Rate/percentage stats DO NOT transform (already rates)
- [ ] Threshold colors (≥55% green, ≤45% red on percentages) still apply correctly
- [ ] PNG export captures the current toggle state
- [ ] Mobile rendering: chip groups wrap cleanly, don't break layout
- [ ] Light + dark mode
- [ ] Team detail page's embedded skaters table inherits the toggle state when set

## Out of scope (do NOT build in this ticket)

- Opponent / vs-team filter (separate ticket — audit recommendation #3)
- Date-range filter (separate ticket)
- Score-state splits (separate ticket)
- Explicit CF% / HDCF% row on player page (separate ticket — audit recommendation #4)
- Career RAPM trend chart (separate ticket — audit recommendation #5)
- Goalie surfaces (separate decision)
- Lines surfaces (out of scope by methodology)

## Phase 1 — Data check (~30 min, stop-point)

Before touching UI, confirm with stats engineer / SQLite:
1. Are per-strength rollups (5v5 / PP / PK / All) already in `players.json`? Or only 5v5?
2. If only 5v5 → what's the pipeline lift to add the others? Estimate.
3. Are per-60 values pre-computed, or do we compute client-side from totals + TOI?

**Stop-point:** if pipeline lift is more than ~2 hours, surface to Matt before continuing. Don't sink hours of UI work on missing data.

## Phase 2 — UI build (~2-3 hours after Phase 1 approval)

Match the existing filter chip pattern. Reuse existing components where possible.

## Reporting back

Two checkpoints:

1. **After Phase 1 data check:** post the data availability summary + any pipeline lift required + Matt approval
2. **After Phase 2 ships:** sample URL with toggle states (e.g., McDavid PP per-60) + screenshots (light/dark/mobile) + confirm acceptance criteria met

## Time budget

- Phase 1 (data check): ~30 min
- Phase 1 (pipeline support, if needed): up to ~2 hours, stop-point first
- Phase 2 (UI build): ~2-3 hours

Total: ~3-5 hours expected, depending on pipeline state.

## Strategic priority

This is the load-bearing finding from the competitive audit. Highest retention-impact gap on the player page surface. Ship this and HGB matches table-stakes; defer it and we keep leaking power users to NST.
