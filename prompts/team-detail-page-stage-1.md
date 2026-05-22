# Engineer Briefing — Team Detail Page (Stage 1 of 3)

**Filed:** 2026-05-21
**Repo:** `hockeygamebot-site` (rewrite branch)
**Status:** Open. Stage 1 of 3-stage build (same staging pattern as the line detail page).
**Context:** Follow-up to the lines detail page success. Shareable stat URLs at the team level — natural next surface after lines/pairs.

---

## What you're building

A team detail page at `/teams/{abbr}` (e.g., `/teams/njd`) that drills into team-level stats with filtered views of skaters, goalies, and lines/pairs for that team.

Triggered by clicking any team card on the existing `/teams` index page.

## Two-phase ticket — don't start phase 2 until phase 1 is resolved

### Phase 1 — Data dependency check (~30 min, no UI work)

Verify what team-level data already exists in the JSON exports:

**Required for Stage 1 KPI strip:**
1. **Season record** (W-L-OT) — may need to be derived from `team_game_stats.json` or added as a new field
2. **Total GF / GA** (all situations, all season) — probably derivable from `team_game_stats.json` summing per-game values
3. **Total 5v5 xGF / xGA** (all season) — derivable from `team_game_stats.json` (xgf_5v5, xga_5v5 per game)
4. **5v5 xGF%** — computed from the above
5. **PP%** (power play conversion rate) — likely NOT in current exports
6. **PK%** (penalty kill success rate) — likely NOT in current exports
7. **Team logo URL** — NHL CDN at `assets.nhle.com/logos/nhl/svg/{TEAM}_light.svg` or similar
8. **Team full name + division + conference** — may need a static lookup or addition to a metadata file

**Required for the filtered tab views:**
- `players.json` filtered by `team_abbrev` (skaters tab)
- `goalies.json` filtered by `team_abbrev` (goalies tab)
- `lines.json` filtered by `team` field (lines tab)
- All three already exist; this is just client-side filtering at page load.

**Report back with:**
- What's actually in the JSONs vs what needs adding
- Three resolution paths for any gaps:
  - **A.** Extend existing `team_game_stats.json` to include season aggregates (W-L-OT, PP%, PK%) as a new top-level field
  - **B.** New `teams.json` export with one row per team, full season aggregates
  - **C.** Client-side aggregation from `team_game_stats.json` at page load (no pipeline changes)
- Recommended path + estimated time

**Stop point:** if resolution work is bigger than ~1 hour of pipeline changes, surface to Matt before committing. Don't start UI work until the path is approved.

### Phase 2 — Stage 1 UI build (~2-3 hours)

ONLY after phase 1 data resolution is approved + shipped.

#### Required sections

1. **Team identity header**
   - Team logo (NHL CDN)
   - Full team name + city
   - Division / Conference label
   - Current record (W-L-OT)

2. **KPI strip** — 7-8 stat cells in a horizontal row:
   - Record (W-L-OT)
   - GF / GA
   - 5v5 xGF%
   - 5v5 xGF / xGA
   - PP%
   - PK%

3. **Tabbed views** (or sections — your call based on what reads cleaner):
   - **Skaters** — embedded /stats/skaters table filtered to this team
   - **Goalies** — embedded /stats/goalies table filtered to this team
   - **Lines & Pairs** — embedded /stats/lines table filtered to this team

   Each tab/section retains the Regular Season / Playoffs toggle from its parent page, scoped to this team.

4. **Filter context bar** at the top — same chip pattern as existing /stats pages (PLAYOFFS / REGULAR SEASON / team locked to current team)

5. **PNG export** — exports the visible page state (header + KPI strip + active tab)

6. **HGB design language** — cream/ink/Barlow Condensed, red threshold cells, HGB watermark bottom-right

#### Click-through wiring

- Each team card on `/teams` index (the existing "FIND YOUR TEAM BOT" page) becomes clickable → opens `/teams/{abbr}`
- The existing X/Bluesky links per team stay as small icons in the card or move into the team detail page header

## NOT in Stage 1

- `?opponent={abbr}` query param for head-to-head filtering (Stage 2)
- Game log table for the team (Stage 3)
- Schedule / upcoming games
- Team-specific design touches (custom palette per team — defer)
- "Recent activity" / latest game summary
- Player roster page with photos

## URL pattern

Path-based: `/teams/{abbr}` (lowercase, 3-letter abbreviation)

Examples:
- `/teams/njd`
- `/teams/col`
- `/teams/car`
- `/teams/mtl`

Future Stage 2 will add `?opponent={opp_abbr}` query param to this.

## Acceptance criteria

- [ ] Click any team card on `/teams` index → opens corresponding team detail page
- [ ] Team identity header renders with logo + name + record
- [ ] KPI strip shows all stats correctly with HGB threshold colors
- [ ] All three tabs (Skaters / Goalies / Lines) load filtered data correctly
- [ ] Regular Season / Playoffs toggle works on all three tabs
- [ ] PNG export captures the visible page state
- [ ] Light + dark mode render correctly
- [ ] Mobile rendering: tabs work, KPI strip wraps cleanly
- [ ] URL `/teams/{abbr}` is shareable (deep-linking works)

## Time budget

- Phase 1 (data check): ~30 min
- Phase 1 (resolution work, if needed): up to ~1 hour, with stop-point check first
- Phase 2 (UI build): ~2-3 hours

Total Stage 1: ~3-4 hours expected. If the data resolution is bigger than expected, the phase 1 stop-point catches it before UI work starts.

## What Stage 2 will add (for context, don't build now)

`?opponent={abbr}` query param. When set, filters all team data to head-to-head only:
- KPI strip recomputes for games against that opponent only
- Skaters/Goalies/Lines tabs filter to head-to-head stats
- Use case: "How does NJD do specifically against PHI?" — instant matchup analysis page

This is the killer feature for series previews + receipts. But Stage 1 has to land cleanly first.

## What Stage 3 will add (for context, don't build now)

- Game log table (chronological game-by-game for this team)
- Maybe schedule / upcoming games if data source is available

## Reporting back

Two checkpoints:

1. **After phase 1 verification:** data gap summary + recommended resolution path + Matt's approval before continuing
2. **After phase 2 ships:** sample URLs (e.g., `/teams/col` and `/teams/mtl`) + screenshots (light/dark/mobile) + PNG export sample + any architectural notes

Don't start Stage 2 (opponent filter) until Stage 1 is approved.
