# Codex Page Purpose Audit

Date: 2026-06-27

Scope: code-first cohesion and product-purpose audit after the HGBTable/nav/font-token work. This pass focuses on whether the current production pages feel like one HGB product, whether each page has a clear job, and which fixes should come before deeper feature work.

Method:

- Read production page code and shared components.
- Used existing design-review screenshots in `docs/design-review/screenshots/` for visual confirmation.
- Did not run fresh browser screenshots in this pass.
- Categorized findings by product severity, not implementation difficulty.

Product filter:

HockeyGameBot turns hockey data into fast, credible, shareable social artifacts. Pages should help users understand, trust, or share something. Tables are acceptable when comparison/discovery is the point, but they should not become the default product answer.

## Priority Summary

1. Fix visible hardcoded season copy on high-value detail/artifact pages.
2. Rework player page hierarchy so artifacts and the top read are primary, not one module in a stack.
3. Create a shared stats/detail masthead and migrate the secondary stats pages first.
4. Decide what `/stats` is: logged-in dashboard, public stats hub, or both with a clear split.
5. Break the game page into panel contracts with shared loading/error/empty states before visual polish.
6. Promote team-vs-opponent pages into shareable states instead of a quiet filter.

## Player Detail Page

File: `src/pages/stats/player/[slug].astro`

### NEEDS FIXING: The page has no clear hierarchy after the hero

Where:

- [src/pages/stats/player/[slug].astro](/Users/mattdonders/Development/hgb/hockeygamebot-site/src/pages/stats/player/[slug].astro:743)
- [src/pages/stats/player/[slug].astro](/Users/mattdonders/Development/hgb/hockeygamebot-site/src/pages/stats/player/[slug].astro:751)
- [src/pages/stats/player/[slug].astro](/Users/mattdonders/Development/hgb/hockeygamebot-site/src/pages/stats/player/[slug].astro:890)
- [src/pages/stats/player/[slug].astro](/Users/mattdonders/Development/hgb/hockeygamebot-site/src/pages/stats/player/[slug].astro:907)
- [src/pages/stats/player/[slug].astro](/Users/mattdonders/Development/hgb/hockeygamebot-site/src/pages/stats/player/[slug].astro:953)
- [docs/design-review/screenshots/player-page.png](/Users/mattdonders/Development/hgb/hockeygamebot-site/docs/design-review/screenshots/player-page.png)

What is wrong:

The content is useful, but visually it reads as: pills, career table, shot map, trend chart, game log, sidebar cards, peers, insights, methodology. The page answers a lot of questions without making the main HGB read obvious. This is exactly the "kitchen sink" concern: every feature has a place, but not a product hierarchy.

Suggested fix:

Reframe the page into four zones:

1. `Hero + model read`: identity, Talent/WAR/Impact, one sentence generated from top signals.
2. `Share artifacts`: one primary card action, secondary cards grouped under "More cards".
3. `Why the model says that`: career table, trend, shot map, peers, insights.
4. `Deep detail`: game log and methodology.

Frontend-only unless the model-read sentence needs new backend-generated copy.

### SHOULD FIX: Five equal artifact buttons flatten the page's main behavior

Where:

- [src/pages/stats/player/[slug].astro](/Users/mattdonders/Development/hgb/hockeygamebot-site/src/pages/stats/player/[slug].astro:970)

What is wrong:

The player page has five same-weight card buttons. Users clearly want cards, but equal CTA weight makes the page feel like a tool drawer rather than an artifact-first product.

Suggested fix:

Use an `ArtifactActionRail` pattern:

- Primary: current-season player card.
- Secondary: shotmap card, talent card, history card, RAPM card.
- Copy should describe what each captures, not just the card name.

Frontend-only.

### SHOULD FIX: Hidden percentile profile contains useful structure but is not part of the page contract

Where:

- [src/pages/stats/player/[slug].astro](/Users/mattdonders/Development/hgb/hockeygamebot-site/src/pages/stats/player/[slug].astro:770)

What is wrong:

The hidden profile block has the right idea: season vs talent mode, RAPM/offense/defense distinction, and context metrics. Because it is dead-rendered behind `false`, the live page lacks a compact "why" layer between hero percentiles and deeper tables.

Suggested fix:

Do not simply unhide it. Extract the useful idea into a smaller `ModelProfilePanel`: 3-5 labeled strengths/concerns with scope, then link to methodology or full table detail.

Frontend-only if existing fields are enough.

### SHOULD FIX: Player OG copy is generic for a card-first page

Where:

- [src/pages/stats/player/[slug].astro](/Users/mattdonders/Development/hgb/hockeygamebot-site/src/pages/stats/player/[slug].astro:674)

What is wrong:

The OG title and description say "HGB Stats" and "Season-by-season Rating, WAR, Impact, and RAPM." That describes data availability, not the thing people share. The image URL is player-specific, but the copy does not sell a shareable artifact.

Suggested fix:

Adopt a player detail title helper:

`{Player} · {Team} · HGB Player Card`

Description should include the top three visible scope points: season, Talent/WAR/Impact, and HGB model framing. Reuse for player, goalie, and future team artifacts.

Frontend-only.

## Goalie Detail Page

File: `src/pages/stats/goalies/[slug].astro`

### NEEDS FIXING: Hardcoded 2025-26 appears in visible page copy and generated cards

Where:

- [src/pages/stats/goalies/[slug].astro](/Users/mattdonders/Development/hgb/hockeygamebot-site/src/pages/stats/goalies/[slug].astro:296)
- [src/pages/stats/goalies/[slug].astro](/Users/mattdonders/Development/hgb/hockeygamebot-site/src/pages/stats/goalies/[slug].astro:374)
- [src/pages/stats/goalies/[slug].astro](/Users/mattdonders/Development/hgb/hockeygamebot-site/src/pages/stats/goalies/[slug].astro:590)
- [src/pages/stats/goalies/[slug].astro](/Users/mattdonders/Development/hgb/hockeygamebot-site/src/pages/stats/goalies/[slug].astro:658)
- [src/pages/stats/goalies/[slug].astro](/Users/mattdonders/Development/hgb/hockeygamebot-site/src/pages/stats/goalies/[slug].astro:1035)
- [src/pages/stats/goalies/[slug].astro](/Users/mattdonders/Development/hgb/hockeygamebot-site/src/pages/stats/goalies/[slug].astro:1374)
- [src/pages/stats/goalies/[slug].astro](/Users/mattdonders/Development/hgb/hockeygamebot-site/src/pages/stats/goalies/[slug].astro:1886)

What is wrong:

Goalie detail will visibly stale-date after this season. Worse, the card renderer writes `2025-26` into generated artifacts, which are the most shareable surface.

Suggested fix:

Mirror the player page pattern:

- Load `_meta = loadMeta()`.
- Derive `currentSeasonNorm` with `fmtSeasonLong(_meta.season)` and a dashed card label where needed.
- Derive age from the current season start year instead of `new Date(2025, 9, 1)`.
- Pass the season label into all canvas card drawing functions.

Frontend-only unless goalie data needs per-row season metadata for historical goalie pages.

### SHOULD FIX: Goalie page is artifact-strong but less systemized than player page

Where:

- [src/pages/stats/goalies/[slug].astro](/Users/mattdonders/Development/hgb/hockeygamebot-site/src/pages/stats/goalies/[slug].astro:581)
- [src/pages/stats/goalies/[slug].astro](/Users/mattdonders/Development/hgb/hockeygamebot-site/src/pages/stats/goalies/[slug].astro:655)
- [src/pages/stats/goalies/[slug].astro](/Users/mattdonders/Development/hgb/hockeygamebot-site/src/pages/stats/goalies/[slug].astro:1032)

What is wrong:

Goalie cards are strong, but the page uses its own detail structure, metric labels, and card actions. It should feel like the goalie variant of the same entity-detail system as player pages.

Suggested fix:

After the player page hierarchy is decided, apply the same entity detail contract to goalie pages: hero, primary artifact, compact model read, supporting panels, deeper stats.

Frontend-only.

## Team Detail Page

File: `src/pages/teams/[abbr].astro`

### NEEDS FIXING: Hardcoded season labels will undermine trust

Where:

- [src/pages/teams/[abbr].astro](/Users/mattdonders/Development/hgb/hockeygamebot-site/src/pages/teams/[abbr].astro:164)
- [src/pages/teams/[abbr].astro](/Users/mattdonders/Development/hgb/hockeygamebot-site/src/pages/teams/[abbr].astro:399)
- [src/pages/teams/[abbr].astro](/Users/mattdonders/Development/hgb/hockeygamebot-site/src/pages/teams/[abbr].astro:450)
- [src/pages/teams/[abbr].astro](/Users/mattdonders/Development/hgb/hockeygamebot-site/src/pages/teams/[abbr].astro:504)
- [src/pages/teams/[abbr].astro](/Users/mattdonders/Development/hgb/hockeygamebot-site/src/pages/teams/[abbr].astro:537)
- [src/pages/teams/[abbr].astro](/Users/mattdonders/Development/hgb/hockeygamebot-site/src/pages/teams/[abbr].astro:574)
- [src/pages/teams/[abbr].astro](/Users/mattdonders/Development/hgb/hockeygamebot-site/src/pages/teams/[abbr].astro:642)

What is wrong:

The page uses `_meta` for data freshness, but visible season labels are fixed. This creates a high-risk mismatch: data can update while the page still says 2025-26.

Suggested fix:

Use `fmtSeasonLong(loadMeta().season)` and one `seasonLabel` variable for title, description, masthead, overview, goalie/game log meta, JS overview fallback, and footer.

Frontend-only.

### SHOULD FIX: Bot discovery is buried below all analytics

Where:

- [src/pages/teams/[abbr].astro](/Users/mattdonders/Development/hgb/hockeygamebot-site/src/pages/teams/[abbr].astro:552)
- [docs/design-review/screenshots/team-page.png](/Users/mattdonders/Development/hgb/hockeygamebot-site/docs/design-review/screenshots/team-page.png)

What is wrong:

Team pages have two legitimate jobs: analytics and bot discovery. The current page puts bot discovery after every stat section. Users who came from a bot, or who want to know where else the bot posts, may never reach it.

Suggested fix:

Move compact bot-follow actions into the masthead or directly below the opponent filter, then keep the large follow block at the bottom as reinforcement.

Frontend-only.

### WORTH ADDING: Team-vs-opponent should become a shareable state

Where:

- [src/pages/teams/[abbr].astro](/Users/mattdonders/Development/hgb/hockeygamebot-site/src/pages/teams/[abbr].astro:607)
- [src/pages/teams/[abbr].astro](/Users/mattdonders/Development/hgb/hockeygamebot-site/src/pages/teams/[abbr].astro:622)

What is wrong:

The `?opponent=ABBR` behavior exists and updates the overview, table, warning, and child React components. Product-wise, this is one of the best team-page ideas because it creates argument-ready context. But the UI treats it as a plain dropdown filter.

Suggested fix:

Make the active opponent state a named page state:

- Masthead/subhead changes to `{TEAM} vs {OPP}`.
- Overview card title becomes a shareable claim, e.g. "CAR vs NJD at 5v5".
- Add a small "Copy link" or artifact action for this state.
- Make sample warning visually tied to the state.

Frontend-only for link/state. A team-vs-opponent card image would need artifact-renderer work.

## Game Page

Files:

- `src/pages/games/index.astro`
- `functions/games/[id].ts`

### SHOULD FIX: The page has panel-level fallbacks, but no shared panel state contract

Where:

- [src/pages/games/index.astro](/Users/mattdonders/Development/hgb/hockeygamebot-site/src/pages/games/index.astro:1077)
- [src/pages/games/index.astro](/Users/mattdonders/Development/hgb/hockeygamebot-site/src/pages/games/index.astro:2694)
- [src/pages/games/index.astro](/Users/mattdonders/Development/hgb/hockeygamebot-site/src/pages/games/index.astro:3108)

What is wrong:

Some failed data becomes visible panel copy, some failed data becomes an empty object, and some refresh failures are intentionally silent. That may be acceptable live, but it is not a reusable contract. A user cannot always tell "not available yet" from "API failed" from "this panel does not apply."

Suggested fix:

Before visual polish, define per-panel states:

- loading
- unavailable yet
- not applicable
- failed but stale data retained
- failed with no data

Then use the same copy and styling for flow, events, on-ice, lines, pregame, and bot posts.

Frontend-only if the API can already distinguish HTTP status. Pipeline/API change if endpoints need explicit freshness/state metadata.

### SHOULD FIX: Optional data fetches can silently degrade core charts

Where:

- [src/pages/games/index.astro](/Users/mattdonders/Development/hgb/hockeygamebot-site/src/pages/games/index.astro:3118)
- [src/pages/games/index.astro](/Users/mattdonders/Development/hgb/hockeygamebot-site/src/pages/games/index.astro:3124)
- [src/pages/games/index.astro](/Users/mattdonders/Development/hgb/hockeygamebot-site/src/pages/games/index.astro:3166)

What is wrong:

`flow` falls back to `EMPTY_FLOW`, events fall back to `null`, and live refresh errors are swallowed. That is okay for keeping the page usable, but it can make a game look like it had no flow/events rather than "flow failed to load."

Suggested fix:

Return `{ data, status }` objects from `fetchAll()` instead of raw data/null, then render visible state per panel. For live refresh, keep stale data but show a small "Live data delayed" notice when repeated refreshes fail.

Frontend-only.

### SHOULD FIX: Game OG image is generic

Where:

- [functions/games/[id].ts](/Users/mattdonders/Development/hgb/hockeygamebot-site/functions/games/[id].ts:60)

What is wrong:

Game titles/descriptions are dynamic, but OG image is always `https://hockeygamebot.com/og/main.png`. Game pages are high-share surfaces; generic imagery weakens the social artifact loop.

Suggested fix:

Phase 1: route to a matchup/static game OG path if already available.

Phase 2: generate game summary cards from the same final-game pipeline and use those as OG images.

Phase 1 may be frontend/Worker-only. Phase 2 requires artifact pipeline work.

### LOW / NICE TO HAVE: R2 vs D1 routing is not visible in this repo

Where:

- [src/pages/games/index.astro](/Users/mattdonders/Development/hgb/hockeygamebot-site/src/pages/games/index.astro:871)
- [functions/games/[id].ts](/Users/mattdonders/Development/hgb/hockeygamebot-site/functions/games/[id].ts:24)

What is wrong:

This site repo always calls `api.hockeygamebot.com`. The current site code does not decide R2 vs D1 for `/flow`, `/events`, `/on-ice`, or `/lines`; that logic lives behind the API. The Pages Function only injects metadata from `/boxscore`.

Suggested fix:

Audit the `hgb-api` Worker separately for season-prefix routing. In this repo, add a short comment near `fetchAll()` that route selection is API-owned so future site edits do not try to duplicate it.

API audit required.

## Stats Pages And Subnav

Files:

- `src/lib/stats-nav.ts`
- `src/components/StatsSubnav.astro`
- `src/pages/stats/*.astro`

### SHOULD FIX: Secondary stats pages still each define their own masthead system

Where:

- [src/pages/stats/lines.astro](/Users/mattdonders/Development/hgb/hockeygamebot-site/src/pages/stats/lines.astro:60)
- [src/pages/stats/wowy.astro](/Users/mattdonders/Development/hgb/hockeygamebot-site/src/pages/stats/wowy.astro:80)
- [src/pages/stats/impact.astro](/Users/mattdonders/Development/hgb/hockeygamebot-site/src/pages/stats/impact.astro:87)
- [src/pages/stats/series/index.astro](/Users/mattdonders/Development/hgb/hockeygamebot-site/src/pages/stats/series/index.astro:82)

What is wrong:

The shared nav is now aligned, but page openings remain page-local. Lines/WOWY have ghost-word mastheads; Impact has a simpler masthead; Series has a narrower variant. This is one of the main reasons stats pages feel assembled over time.

Suggested fix:

Create `StatsMasthead.astro` and migrate in this order:

1. Records
2. Series index
3. Lines
4. WOWY
5. Impact
6. Skaters/Goalies/Teams after the pattern proves itself

Frontend-only.

### SHOULD FIX: Hardcoded season labels remain in stats-page copy and export chips

Where:

- [src/pages/stats/skaters.astro](/Users/mattdonders/Development/hgb/hockeygamebot-site/src/pages/stats/skaters.astro:387)
- [src/pages/stats/skaters.astro](/Users/mattdonders/Development/hgb/hockeygamebot-site/src/pages/stats/skaters.astro:410)
- [src/pages/stats/goalies.astro](/Users/mattdonders/Development/hgb/hockeygamebot-site/src/pages/stats/goalies.astro:238)
- [src/pages/stats/goalies.astro](/Users/mattdonders/Development/hgb/hockeygamebot-site/src/pages/stats/goalies.astro:371)
- [src/pages/stats/impact.astro](/Users/mattdonders/Development/hgb/hockeygamebot-site/src/pages/stats/impact.astro:61)
- [src/pages/stats/impact.astro](/Users/mattdonders/Development/hgb/hockeygamebot-site/src/pages/stats/impact.astro:181)
- [src/components/react/ImpactTable.tsx](/Users/mattdonders/Development/hgb/hockeygamebot-site/src/components/react/ImpactTable.tsx:114)
- [src/pages/stats/lines.astro](/Users/mattdonders/Development/hgb/hockeygamebot-site/src/pages/stats/lines.astro:141)
- [src/pages/stats/wowy.astro](/Users/mattdonders/Development/hgb/hockeygamebot-site/src/pages/stats/wowy.astro:203)
- [src/pages/stats/wowy.astro](/Users/mattdonders/Development/hgb/hockeygamebot-site/src/pages/stats/wowy.astro:250)

What is wrong:

Skaters has started using `_meta.season`, but visible copy and export chips still include fixed labels. Goalies, Impact, Lines, and WOWY have the same issue. This will be a credibility problem at season rollover.

Suggested fix:

Use one season helper everywhere:

- `seasonKey`: `_meta.season`
- `seasonLong`: `fmtSeasonLong(_meta.season)`
- `seasonDashed`: `2025-26` style for canvas/card text
- `seasonShort`: table cells

Pass these labels into React wrappers that need export chips.

Frontend-only.

### LOW / NICE TO HAVE: Subnav group metadata is defined but not rendered

Where:

- [src/lib/stats-nav.ts](/Users/mattdonders/Development/hgb/hockeygamebot-site/src/lib/stats-nav.ts:1)
- [src/components/StatsSubnav.astro](/Users/mattdonders/Development/hgb/hockeygamebot-site/src/components/StatsSubnav.astro:13)

What is wrong:

`group` and `STATS_NAV_GROUP_LABELS` exist, but the subnav renders a flat list. This is not a blocker, but the stats section now has enough routes that mobile users may miss right-side items.

Suggested fix:

Either render subtle group separators or keep the current edge fade and explicitly document group metadata as future scaffold.

Frontend-only.

## Stats Dashboard

File: `src/pages/stats/index.astro`

### NEEDS FIXING: `/stats` still contains mock/personalized-dashboard scaffolding in production code

Where:

- [src/pages/stats/index.astro](/Users/mattdonders/Development/hgb/hockeygamebot-site/src/pages/stats/index.astro:2)
- [src/pages/stats/index.astro](/Users/mattdonders/Development/hgb/hockeygamebot-site/src/pages/stats/index.astro:72)
- [src/pages/stats/index.astro](/Users/mattdonders/Development/hgb/hockeygamebot-site/src/pages/stats/index.astro:110)
- [src/pages/stats/index.astro](/Users/mattdonders/Development/hgb/hockeygamebot-site/src/pages/stats/index.astro:120)
- [src/pages/stats/index.astro](/Users/mattdonders/Development/hgb/hockeygamebot-site/src/pages/stats/index.astro:857)

What is wrong:

The file starts with `LOCAL ONLY`, then ships hardcoded followed teams, hardcoded followed players, mock team stats, mock model signals, and hardcoded trending. Some logged-in components self-fetch real preferences later, but the page itself is unclear: is `/stats` a public hub, a personalized dashboard, or a POC?

Suggested fix:

Make a product decision:

- Option A: `/stats` is public stats hub. Move personalized dashboard to `/account` or `/dashboard`.
- Option B: `/stats` is public when logged out and personalized when logged in. Remove mock logged-in data from production and require real prefs/data.

I recommend Option A for cohesion: public `/stats` should be a clean hub into Skaters, Goalies, Teams, Lines, WOWY, Impact, Records, and Cards. Personalized dashboard can come later when account usage is real.

Frontend-only for route/content decision. API work only if dashboard stays and needs real personalized signals.

### SHOULD FIX: Draft content may be product-valuable, but it is currently mixed into the wrong surface

Where:

- [src/pages/stats/index.astro](/Users/mattdonders/Development/hgb/hockeygamebot-site/src/pages/stats/index.astro:13)
- [src/pages/stats/index.astro](/Users/mattdonders/Development/hgb/hockeygamebot-site/src/pages/stats/index.astro:882)

What is wrong:

Draft capital can drive visits, especially in offseason, but placing it inside `/stats` dashboard muddies the page purpose. It is neither a core stat leaderboard nor a team artifact.

Suggested fix:

Treat draft as an offseason/home/team-page module, not a permanent stats-dashboard block. If it becomes a feature, give it a clear artifact or team-page tie-in.

Frontend-only unless draft tracker becomes live/push-driven.

## Cards / Artifact Surfaces

Files:

- `src/pages/cards.astro`
- `src/pages/admin/generator.astro`
- `src/pages/stats/player/[slug].astro`
- `src/pages/stats/goalies/[slug].astro`

### SHOULD FIX: Card-rendering season and copy are duplicated across surfaces

Where:

- [src/pages/cards.astro](/Users/mattdonders/Development/hgb/hockeygamebot-site/src/pages/cards.astro:365)
- [src/pages/cards.astro](/Users/mattdonders/Development/hgb/hockeygamebot-site/src/pages/cards.astro:462)
- [src/pages/admin/generator.astro](/Users/mattdonders/Development/hgb/hockeygamebot-site/src/pages/admin/generator.astro:234)
- [src/pages/admin/generator.astro](/Users/mattdonders/Development/hgb/hockeygamebot-site/src/pages/admin/generator.astro:876)

What is wrong:

Artifact labels are the brand's most visible output. If cards and page labels drift, users will notice. The current implementation duplicates season strings and footer/copy decisions across player, goalie, cards explorer, and admin generator.

Suggested fix:

Create a small artifact label helper:

- `artifactSeasonLabel(meta.season)`
- `artifactFooter(...)`
- `artifactScopeChips(...)`

Use it from page cards first, then cards explorer/admin generator.

Frontend-only for site-generated cards. Pipeline work if Python/social card generator needs the same helper mirrored.

## Error / Empty / Fallback States

### SHOULD FIX: Build-time stats fallbacks are inconsistent

Where:

- [src/lib/stats-loader.ts](/Users/mattdonders/Development/hgb/hockeygamebot-site/src/lib/stats-loader.ts:31)
- [src/lib/stats-loader.ts](/Users/mattdonders/Development/hgb/hockeygamebot-site/src/lib/stats-loader.ts:45)

What is wrong:

Some endpoints fail the build (`players`, `leaderboards`, `meta`), while others fall back to empty objects/arrays. That is reasonable, but the pages consuming those fallbacks do not consistently communicate "data temporarily unavailable."

Suggested fix:

Define endpoint criticality and UI rules:

- Critical: fail build.
- Secondary: render a visible panel state.
- Enhancement: hide only if the absence is normal.

Then map each fallback endpoint to a shared `DataNotice`.

Frontend-only for notices. Pipeline/API work if freshness/status fields are needed.

### SHOULD FIX: Public client fetch errors are often converted into empty UI

Where:

- [src/components/react/DashboardPersonalized.tsx](/Users/mattdonders/Development/hgb/hockeygamebot-site/src/components/react/DashboardPersonalized.tsx:72)
- [src/components/react/DashboardPersonalized.tsx](/Users/mattdonders/Development/hgb/hockeygamebot-site/src/components/react/DashboardPersonalized.tsx:109)
- [src/components/react/DashboardPersonalized.tsx](/Users/mattdonders/Development/hgb/hockeygamebot-site/src/components/react/DashboardPersonalized.tsx:197)
- [src/components/react/DashboardPersonalized.tsx](/Users/mattdonders/Development/hgb/hockeygamebot-site/src/components/react/DashboardPersonalized.tsx:334)

What is wrong:

The personalized dashboard suppresses failures into `{}` or empty arrays. For user-specific surfaces, that can look like "you have no followed content" rather than "we could not load it."

Suggested fix:

Render a small dashboard-level data notice on fetch failure. Do not expose raw API errors; use human copy.

Frontend-only.

## Recommended Review Order

Section-by-section review should start here:

1. Stats dashboard decision: what should `/stats` be?
2. Season-label cleanup scope: high-value surfaces first or all at once?
3. Player page hierarchy and artifact action pattern.
4. Team page bot discovery and opponent-share state.
5. Stats masthead migration order.
6. Game page panel-state contract.
7. Artifact label helper and card copy consolidation.

## Pipeline / API Change Flags

Pure frontend:

- Most season-label fixes if `_meta.season` is enough.
- Player page hierarchy and artifact grouping.
- Team bot placement and opponent-link state.
- Shared masthead and stat page shell.
- Dashboard route/content decision.
- Panel-level state UI on game page.
- OG title/description helpers.

Requires API or pipeline review:

- Game R2 vs D1 routing behavior.
- Dynamic game OG images.
- Team-vs-opponent image cards.
- Shared artifact labels across Python/social card generation.
- Endpoint freshness/status metadata if needed for precise data notices.
