# Game Page Redesign — `/games/:id`

## Context

The game detail page at `/games/:id` launched May 12 2026. It is a static Astro SPA shell — client JS reads the game ID from the URL, fetches data from two APIs, and renders everything. An Opus design review identified clear structural problems. This doc is the blueprint for the redesign sprint.

**Live page:** `rewrite.hockeygamebot-site.pages.dev/games/2025030214`
**File:** `src/pages/games/index.astro`
**Routing:** `public/_redirects` `/games/* /games/index.html 200` (SPA rewrite)

---

## Current State (as of May 12 2026)

The page has:
1. Light header — logos, big score, status badge, venue/date
2. KEY STATS strip — 3 cells: away xGF | xGF% | home xGF
3. GAME CHARTS — tab toggle "Win %" / "5V5 xG" (both charts hidden behind tabs)
4. GOAL LOG — table with scorer/assists/strength/GIF link
5. THREE STARS — post-game only, from boxscore
6. Footer placeholder "Player stats & shot map coming soon"

**Known problems (Opus design review):**
- Page underdelivers above the fold — no period score, no SOG, no clock
- Tab toggle hides both charts; WP and xG tell different stories and shouldn't compete
- xGF% center cell duplicates the bars; wastes space
- Goal log has no WP swing column — the most differentiated stat we can surface
- Header has no clock/period for live games (just a status badge)

---

## Data Available RIGHT NOW

### `/v1/games/{id}/boxscore` (HGB proxy of NHL API, has CORS headers)
- `awayTeam` / `homeTeam`: abbrev, name, placeName, score, SOG
- `gameState`: FUT / PRE / LIVE / CRIT / OFF
- `clock`: period, timeRemaining, inIntermission
- `venue.default`, `gameDate`, `startTimeUTC`
- `tvBroadcasts[]`
- `linescore.byPeriod[]`: period-by-period goals per team
- `threeStars[]` (post-game): name, teamAbbrev, goals, assists, saves, savePctg, toi

### `/v1/games/{id}/flow` (HGB API, D1-backed)
- `points[]`: { t (game seconds), wp (0–1), xg_home (cumulative), xg_away (cumulative), event_type }
- `goals[]`: { t, is_home, score, scorer, assists[], strength (pp/sh/even/en), goal_video_url }

**Not yet available (Phase 2):** shot map, per-player TOI/stats, penalty log

---

## Target Layout

Ordered top to bottom. Every section uses data available today.

### A. Hero Header
- Team logos (80px), big score, team abbrevs + city names — unchanged
- **Status row (new):** for LIVE/CRIT — show `P2 · 14:23` or `P2 · INT` prominently next to the badge
- **Info strip (new, one mono line):** `VENUE · DATE · BROADCAST` left, `SOG 28–24` right
- Team color bar (4px, away | home) stays at top

### B. Linescore Strip
- Full-width horizontal table: Team logo | P1 | P2 | P3 | (OT) | Total
- Two rows (away / home), from `linescore.byPeriod[]`
- Instant context — eliminates "where are we in the game?" question

### C. Win Probability Chart
- Full-width, no tab — always visible
- Split-color WP line (home color above 50%, away color below) — keep current implementation
- Goal markers with team abbrev labels, area fills, 25%/75% grid lines
- Period dividers

### D. 5v5 xG Chart
- Stacked directly below WP, same x-axis width, NO tab toggle
- Step-function cumulative xG lines (home / away) in team colors
- Y-axis ticks (0, 1, 2, 3...), period dividers, goal dots
- Final xG values labeled at line endpoints

### E. Key Stats (4 tiles, no bars)
- `SOG away | SOG home` — from boxscore
- `xGF% · home label` — from last flow point
- `xGF away | xGF home` — from last flow point
- Remove the colored bars; let the numbers speak
- Layout: 2×2 grid or single row of 4

### F. Goal Log
- Keep existing table structure
- **Add `WP SWING` column** — compute delta between wp before and after each goal from `flow.points[]`; format as `+14.2%` (positive = scoring team gained)
- This is the most differentiated stat vs competitors; MoneyPuck shows it per-goal, we can too

### G. Three Stars
- Post-game only (OFF state), from `boxscore.threeStars[]`
- Three cards: player name, team color accent bar, stat line
- Hidden during live/pregame

### H. Phase 2 Placeholder
- One subtle footer line: "Shot map & player stats · Phase 2"

---

## State-Specific Behavior

| State | Header | Charts | Goal Log | Stars |
|-------|--------|--------|----------|-------|
| FUT/PRE | Start time + venue + broadcasts | Hidden | Hidden | Hidden |
| LIVE/CRIT | Score + `P2 · 14:23` + SOG strip | Visible (partial data, auto-refresh 30s) | Visible (goals so far) | Hidden |
| OFF | Final score | Visible (complete) | Visible (all goals) | Visible |

---

## Design System Constraints

- **Fonts:** Barlow Condensed 800 for big numbers/titles, JetBrains Mono for labels/data
- **Colors:** `#EFEEE8` bg, `#FFFFFF` surface, `#0d0d14` ink, `#E8002D` red accent
- **Identity:** Light background throughout — no dark sections except the 4px color bar
- **No tabs:** Charts are stacked, not toggled
- **Mobile:** Full stack, responsive down to 375px
- **No new dependencies** — all SVG rendering is vanilla JS, no chart libraries

---

## Completion Criteria

The redesign is complete when ALL of the following are true:

1. `src/pages/games/index.astro` implements sections A–H in order
2. No tab toggle exists — WP chart and xG chart are both always visible (stacked)
3. LIVE state shows period + clock (`P2 · 14:23`) in the header
4. Linescore strip renders from `linescore.byPeriod[]`
5. Goal log has a WP SWING column computed from `flow.points[]`
6. Key stats shows 4 tiles with SOG included (no bars)
7. Three stars section only appears when `gameState === 'OFF'`
8. Pregame state shows start time, venue, and broadcasts (no charts, no goal log)
9. `npm run build` in `hockeygamebot-site/` exits 0 with no TypeScript errors
10. All changes committed and pushed to `rewrite` branch on `hockeygamebot-site`

---

## Key Files

| File | Role |
|------|------|
| `src/pages/games/index.astro` | The entire page — CSS, HTML shell, client JS |
| `public/_redirects` | SPA rewrite rule (do not change) |
| `src/components/Nav.astro` | Nav (do not change) |
| `public/js/hgb-charts.js` | Modal chart library (reference only, do not import) |

---

## Reference: Opus Design Feedback (May 12 2026)

> "The page underdelivers above the fold. Score + a 3-cell xG strip is all the user sees before scrolling. There's no period-by-period score, no SOG, no game state context.
>
> Kill the tabs. Stack WP over xG. They're complementary, not alternatives. Mobile: same stack, full-width.
>
> Add a WP swing column to the goal log — biggest swing per goal is a killer stat MoneyPuck doesn't surface cleanly."

---

## Competitor References

- **MoneyPuck:** Goal-by-goal scoring summary with WP impact, individual player xG bars, cumulative xG chart. Clean and readable.
- **HockeyStats.com:** Very data-dense, dark theme, shot maps, butterfly chart, xGoal share with player names.
- **Target:** MoneyPuck-level clarity + HGB editorial design language (Barlow Condensed, cream palette, red accent).
