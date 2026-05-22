# Engineer Briefing — Two Tickets, May 21 Evening Batch

**Filed:** 2026-05-21
**Repo:** `hockeygamebot-site` (rewrite branch) + `hgb-analytics` (for pipeline work)
**Status:** Open, ready to execute

Two related tickets following the lines detail page (Stage 1) success this afternoon. **Both follow staged discipline: verify data dependencies first, ship Stage 1 only, defer features to later stages.**

---

## TICKET 1 — Line Detail Page Stage 2 (stat breakdown blocks + PDO)

### Phase 1a — Pipeline work for PDO (~45 min)

Add the data needed for line-level PDO to `lines.json`:
- Per-line on-ice SV% (computed from saves and shots against while the line is on the ice at 5v5)
- Per-line on-ice SH% (computed from goals and shots for while the line is on the ice at 5v5)
- Or: pre-compute `pdo` field directly as `(sv% + sh%) × 1000`

Source: aggregate from `shots` + `on_ice_rosters` joined to the line composition. 5v5 only for the standard PDO methodology.

### Phase 2a — UI Stage 2 (~2-3 hours, after Phase 1a ships)

Add stat breakdown blocks BELOW the existing KPI strip on the line detail page (`/stats/lines/{slug}`). Six block cards stacked or arranged in a grid:

1. **Corsi:** CA / CF% / CF
2. **Fenwick:** FA / FF% / FF
3. **Shots:** SA / SF% / SF
4. **xG:** xGA / xGF% / xGF
5. **Goals:** GA / GF% / GF
6. **PDO:** SV% / PDO / SH%

Each block uses HGB design tokens (cream/ink, Barlow Condensed, threshold colors on percentage cells).

PDO block uses the new pipeline data from Phase 1a. If pipeline data isn't deployed yet, ship the other 5 blocks first and add PDO as a follow-up.

### Out of scope for Stage 2

- Heat maps (Stage 3, deferred — pipeline lift not yet done)
- Game-by-game breakdowns (separate future ticket)
- Compare-two-lines side-by-side (separate future ticket)

### Acceptance criteria (Ticket 1)

- [ ] PDO computed correctly in pipeline (verify against a known line — e.g., a top line that's been getting bounces should show PDO > 1.000)
- [ ] All 6 blocks render on the detail page
- [ ] Threshold colors apply correctly to percentage cells (≥55% green, ≤45% red)
- [ ] PNG export captures the expanded page state
- [ ] Light + dark mode render correctly
- [ ] Mobile rendering: blocks stack vertically

---

## TICKET 2 — Team Detail Page Stage 1 (foundation)

### Phase 1b — Data dependency check (~30 min, no UI work)

Verify what team-level data exists in the JSON exports. **Likely gaps:**

1. Season W-L-OT record (probably derivable from `team_game_stats.json`)
2. Total GF / GA (derivable by summing per-game values)
3. Total 5v5 xGF / xGA (derivable from same)
4. 5v5 xGF% (computed)
5. PP% — **likely missing**
6. PK% — **likely missing**
7. Team logo URL (NHL CDN: `assets.nhle.com/logos/nhl/svg/{TEAM}_light.svg`)
8. Team full name / division / conference (may need static lookup OR addition to a metadata file)

**Three resolution paths for gaps:**

- **A.** Extend `team_game_stats.json` to include season aggregates (W-L-OT, PP%, PK%) as a top-level field per team
- **B.** New `teams.json` export with one row per team, full season aggregates
- **C.** Client-side aggregation from `team_game_stats.json` at page load (no pipeline changes)

Recommend a path with estimated time. **Stop-point: if resolution is bigger than ~1 hour pipeline work, surface to Matt before continuing.**

### Phase 2b — UI Stage 1 build (~2-3 hours, after Phase 1b is approved + shipped)

Build `/teams/{abbr}` route with:

1. **Team identity header**
   - Team logo (NHL CDN)
   - Full team name + city
   - Division / Conference label
   - Current record (W-L-OT)

2. **KPI strip** — 7-8 stat cells:
   - Record (W-L-OT)
   - GF / GA
   - 5v5 xGF%
   - 5v5 xGF / xGA
   - PP%
   - PK%

3. **Tabbed views** (or sections):
   - **Skaters** — embedded `/stats/skaters` table filtered to this team
   - **Goalies** — embedded `/stats/goalies` table filtered to this team
   - **Lines & Pairs** — embedded `/stats/lines` table filtered to this team

   Each tab retains Regular Season / Playoffs toggle, scoped to this team.

4. **Filter context bar** at top — same chip pattern as `/stats/*` pages

5. **PNG export** — exports visible page state (header + KPI strip + active tab)

6. **HGB design language** — cream/ink/Barlow Condensed, red threshold cells, HGB watermark bottom-right

### Click-through wiring

- Each team card on `/teams` index becomes clickable → `/teams/{abbr}`
- Existing X/Bluesky icons per team stay accessible (in card OR move to team detail page header — your call)

### Out of scope for Stage 1 (don't build)

- `?opponent={abbr}` head-to-head filter (Stage 2 — the killer feature for series previews)
- Game log table (Stage 3)
- Schedule / upcoming games
- Custom team palette per page
- Roster page with photos

### Acceptance criteria (Ticket 2)

- [ ] Click any team card on `/teams` index → opens team detail page
- [ ] Team identity header renders with logo + name + record
- [ ] KPI strip shows all stats with HGB threshold colors
- [ ] All three tabs load filtered data correctly
- [ ] Regular Season / Playoffs toggle works on all three tabs
- [ ] PNG export captures visible page state
- [ ] Light + dark mode + mobile all render correctly
- [ ] URL `/teams/{abbr}` is shareable

---

## SEQUENCING SUGGESTION

You can sequence two ways:

**A. Batched pipeline first, then both UI in parallel:**
1. Do Phase 1a (PDO) + Phase 1b (team data verification + resolution) together as one pipeline sprint
2. Once both data layers are ready, build Phase 2a (Line Stage 2 UI) + Phase 2b (Team Stage 1 UI) in parallel

**B. Sequential ticket by ticket:**
1. Finish Ticket 1 (Line Stage 2 pipeline + UI) completely
2. Then start Ticket 2 (Team Stage 1 data + UI)

Recommend **A** — pipeline work has shared concerns (both touch JSON exports + aggregation logic). UI work is fully independent and parallelizable.

## What Stages 2/3 will add later (context only — do NOT build now)

**Line Stage 3:** Heat maps. Pipeline lift needed (shot x/y coordinates need to be queryable per line). Defer until we decide it's worth the data work.

**Team Stage 2:** `?opponent={abbr}` query param for head-to-head filtering. **This is the killer feature for matchup analysis** — instant "how does NJD do vs PHI?" page. Defer until Team Stage 1 is in hand.

**Team Stage 3:** Game log table + schedule.

## REPORTING BACK

Three checkpoints:

1. **After Phase 1a + 1b data work:** report data layer changes, any gaps that needed pipeline work, any architectural decisions made
2. **After Phase 2a ships (Line Stage 2 UI):** sample URL + screenshots + PNG export
3. **After Phase 2b ships (Team Stage 1 UI):** sample URLs (e.g., `/teams/col` and `/teams/mtl`) + screenshots + PNG export

Stop-points:
- If data verification reveals gaps requiring more than ~1 hour of pipeline work → surface to Matt
- If any acceptance criterion fails → fix or surface, don't ship broken

## OUT OF SCOPE FOR THIS BATCH

- iOS work (different engineer, different repo)
- Anomaly detector signals (already shipped enough for now)
- Game pages improvements (separate concern)
- /analysis blog work (separate concern)

Don't touch anything outside the two tickets above without surfacing to Matt first.
