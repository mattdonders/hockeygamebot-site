# Codex Cohesion Audit

Date: 2026-06-27

Purpose: turn the current site into one clearly-authored product without flattening the parts that already work. This is a cohesion pass, not a request to become a comprehensive stat warehouse or copy another hockey analytics site.

## Product Direction

HockeyGameBot should feel like a bot-first analytics newsroom:

- fast game context
- credible model explanations
- player/team artifacts people can share
- table data only where tables are the best interface
- every page answering "what should I understand or post from here?"

The current site has strong pieces, especially player pages, cards, game pages, and several leaderboard surfaces. The issue is that they read like separate launches: different mastheads, different filter systems, different metric labels, different type choices, and different empty states.

## Highest-Leverage Cohesion Fixes

### 1. One Stats Page Shell

Status: NEEDS FIXING

Where:

- `src/pages/stats/skaters.astro`
- `src/pages/stats/goalies.astro`
- `src/pages/stats/teams.astro`
- `src/pages/stats/lines.astro`
- `src/pages/stats/impact.astro`
- `src/pages/stats/wowy.astro`
- `src/pages/stats/records.astro`
- `src/pages/stats/series/index.astro`
- `src/pages/stats/player/[slug].astro`
- `src/pages/stats/goalies/[slug].astro`
- `src/pages/stats/lines/[slug].astro`

What is wrong:

The same conceptual page shell is implemented many times: masthead, corner marks, ghost word, eyebrow, card padding, lede, meta row, and section titles. Some pages use `font-family: var(--display)` for tiny eyebrow text, some use `var(--body)`, some use `var(--mono)`. Some have ghost background text, some do not. Records and Series feel older than Skaters/Goalies/Player.

Suggested fix:

Create a shared `StatsMasthead.astro` component with props:

- `eyebrow`
- `title`
- `accent`
- `lede`
- `meta`
- `ghost`
- `scopeChips`
- `maxWidth`
- `variant`: `index | leaderboard | detail | tool`

Use it first on low-risk stats pages: Records, Series index, WOWY, Lines. Then move Skaters, Goalies, Teams, Impact. Leave player/detail pages for last because they have stronger custom layouts.

### 2. One Stats Navigation Map

Status: SHOULD FIX

Where:

- `src/components/Nav.astro`
- `src/components/StatsSubnav.astro`
- `src/pages/stats/explore.astro`

What is wrong:

Global nav and `StatsSubnav` do not expose the same stats IA. `StatsSubnav` includes Skaters, Goalies, Teams, Lines, Impact, WOWY, Playoff Series. Global nav includes Dashboard, Skaters, Goalies, Lines, Impact, WOWY, Series Records, Labs & Studio, while Teams is split under the Teams menu. Explore/Labs can drop users out of the stats subnav pattern.

Suggested fix:

Define a shared stats nav list in one module, for example `src/lib/stats-nav.ts`, and render both global dropdown and `StatsSubnav` from it. Group links as:

- Core: Dashboard, Skaters, Goalies, Teams
- Tools: Lines, WOWY, Impact, Explore
- History: Playoff Series, Records
- Studio: Cards

This is mainly frontend. No pipeline change.

### 3. Typography Source Of Truth

Status: NEEDS FIXING

Where:

- `BRANDING.md`
- `src/components/Nav.astro`
- `src/styles/site-tokens.css`
- `src/styles/stats-tokens.css`
- `src/components/react/FilterPrimitives.tsx`

What is wrong:

`BRANDING.md` contradicts itself: the font table says `--body` is Geist, while the "What Not To Do" section says not to reference Geist in production CSS. The actual nav token currently sets `--body` to Barlow. This makes future styling decisions ambiguous.

`FilterPrimitives.tsx` also exports `SEMI` and uses it for filter chips/labels even though the branding rules restrict `--semi` to table headers.

Suggested fix:

Make the canon explicit:

- `--display`: Barlow Condensed for big headings and large stat values
- `--body`: Barlow for UI, copy, chips, buttons, filters
- `--semi`: table headers only, or remove it if not needed
- `--mono`: numbers, timestamps, machine-readable codes

Then update `BRANDING.md` so it matches the actual token implementation. After that, convert filter chips/labels to `--body`.

### 4. One Filter And Control System

Status: NEEDS FIXING

Where:

- `src/components/react/FilterPrimitives.tsx`
- `src/components/react/SkatersTable.tsx`
- `src/components/react/GoaliesTable.tsx`
- `src/pages/stats/lines.astro`
- `src/pages/stats/wowy.astro`
- `src/pages/stats/impact.astro`

What is wrong:

Filters look and behave differently across leaderboard pages. Skaters has a denser, more app-like filter panel; other pages use local controls. Similar filters use different controls: min TOI can be a number input in one place and a slider in another. Some controls use inline hardcoded colors rather than site tokens.

Suggested fix:

Create a compact filter kit:

- `FilterBar`
- `FilterGroup`
- `SegmentedControl`
- `SelectControl`
- `NumberControl`
- `RangeControl`
- `SearchControl`
- `ScopePill`

Make it token-driven, mobile-friendly, and visually consistent with `StatsSubnav`. Roll it into Skaters and Goalies first, then Lines/WOWY/Impact.

### 5. Metric Scope Labels Everywhere

Status: NEEDS FIXING

Where:

- `docs/design-review/DESIGN_REVIEW.md` calls this out across Home, Player, Skaters, Goalies, Lines, WOWY, Series, Impact, Records.
- Code examples include `src/pages/stats/player/[slug].astro`, `src/pages/stats/skaters.astro`, `src/pages/stats/goalies.astro`, `src/pages/stats/lines.astro`, `src/pages/games/index.astro`.

What is wrong:

The site frequently shows `xG`, `xGF%`, `WAR`, `Rating`, `Impact`, `GSAx`, `dSV%`, and percentiles without point-of-use context. The underlying data may be correct, but the page often does not tell users whether a metric is 5v5, all situations, regular season, playoffs, current season, multi-season, percentile, or raw value.

Suggested fix:

Create a shared metric dictionary, likely `src/lib/metric-copy.ts`, with:

- display label
- short label
- tooltip
- situation scope
- time scope
- format
- whether the value is proprietary

Use this dictionary in table headers, card labels, tooltips, methodology strips, and share-card captions. This is frontend-only for labels, unless a metric cannot be reliably scoped from existing API fields.

### 6. One Table Pattern

Status: SHOULD FIX

Where:

- `src/components/react/HGBTable.tsx`
- `src/components/react/SkatersTable.tsx`
- `src/components/react/GoaliesTable.tsx`
- `src/pages/stats/lines.astro`
- `src/pages/stats/wowy.astro`
- `src/pages/stats/impact.astro`
- `src/pages/stats/records.astro`

What is wrong:

The table pages work, but the experience feels assembled from multiple eras. Some tables have methodology strips; some do not. Some have dense filters above the table; some have ledes only in the masthead. Some table headers encode scope; some rely on a page paragraph.

Suggested fix:

Define a table page contract:

- masthead with one-sentence page promise
- sticky subnav
- compact stat key above the table
- consistent filters
- active sort state
- visible data freshness/scope row
- row links and share affordances where useful
- table-specific methodology below, not as the only explanation

Avoid a full table rewrite before launch unless performance or mobile usability demands it. The sprint doc already says the current table stack is not the best long-term architecture, but it is serviceable.

### 7. Shared Empty, Loading, And Error States

Status: NEEDS FIXING

Where:

- `src/lib/stats-loader.ts`
- `src/pages/games/index.astro`
- `src/components/react/SkatersTable.tsx`
- home/off-day state from `src/pages/index.astro`
- scoreboard/results surfaces

What is wrong:

The site sometimes fails quietly into empty content. That is bad for an analytics brand because empty UI looks like "the model has no answer" rather than "the API failed." Some pages also have dead-end empty states with no useful navigation or fallback content.

Suggested fix:

Create shared states:

- `LoadingState`
- `EmptyState`
- `ErrorState`
- `OfflineDataNotice`
- `StaleDataNotice`

Rules:

- API failure should render a visible error state.
- Legitimate "no data" should explain the qualification rule.
- Off-day pages should still show evergreen useful content.
- Never ship mock sports data to production as a fallback.

### 8. Share Artifact Integration

Status: WORTH ADDING

Where:

- player pages
- goalie pages
- game pages
- team pages
- home artifact rail
- `docs/codex-feature-ideas.md`

What is wrong:

The site already has shareable cards, but they are often treated as sidebar downloads rather than the natural endpoint of a page. Users are already grabbing cards for Discord, which means the core behavior is proven.

Suggested fix:

Add a consistent artifact rail or action row:

- Primary action: "Share player card" / "Share game card" / "Share line card"
- Secondary actions grouped under "More cards"
- Each action should say what it captures, not just the card name
- Generated artifacts should use consistent titles, scopes, and metric language from the metric dictionary

This is a product differentiator, not just polish.

### 9. Page Titles And Meta Consistency

Status: SHOULD FIX

Where:

- `src/pages/stats/player/[slug].astro`
- `src/pages/stats/goalies/[slug].astro`
- `src/pages/stats/lines/[slug].astro`
- `src/pages/games/index.astro`
- `functions/games/[id].ts`
- stats index and leaderboard pages

What is wrong:

Titles and OG metadata are not uniformly structured. Player pages and game pages should be the most shareable parts of the site, but game OG image generation is still generic and some page titles do not communicate scope.

Suggested fix:

Adopt title patterns:

- Player: `{Player} · {Team} · HGB Player Card`
- Goalie: `{Goalie} · {Team} · HGB Goalie Card`
- Game: `{Away} at {Home} · {Date} · HockeyGameBot`
- Leaderboard: `{Metric/Page} · {Season Scope} · HGB Stats`

Use one helper for title/description generation, and one helper for OG image URL selection.

### 10. Season And Date Copy

Status: SHOULD FIX

Where:

- `src/pages/stats/player/[slug].astro`
- `src/components/react/PlayerCareerTable.tsx`
- `src/pages/stats/skaters.astro`
- `src/pages/stats/goalies.astro`
- `src/pages/stats/series/index.astro`
- `src/pages/games/index.astro`

What is wrong:

Hardcoded season text and constants make the site feel stale the moment the calendar flips. Even when data is correct, visible `2025-26` copy or hardcoded current-season constants will undermine trust.

Suggested fix:

Use one season helper everywhere:

- current season key: `20252026`
- display label: `2025-26`
- game season prefix/routing helper
- regular season/playoffs label
- current date boundary for age/current-season displays

This is mostly frontend/shared-lib work unless backend endpoints require new season metadata.

## Suggested Execution Order

### Pass 1: Foundations, Low Conflict

Do this while Claude is fixing data bugs because it mostly touches docs and shared components.

1. Correct `BRANDING.md` font-token contradiction.
2. Create shared stats nav config and update `StatsSubnav`.
3. Create `StatsMasthead.astro` without migrating every page yet.
4. Create metric-copy helper with labels/tooltips/scope.
5. Create shared empty/error state components.

### Pass 2: Stats Cohesion

1. Migrate Records, Series index, WOWY, and Lines to `StatsMasthead`.
2. Standardize filter controls on Lines/WOWY/Impact.
3. Add scope labels and stat keys above every leaderboard table.
4. Align page titles and meta descriptions.
5. Screenshot mobile widths after each page group.

### Pass 3: High-Value Detail Pages

1. Player page: make the hero percentiles, time horizons, and card actions clearer.
2. Goalie page: align hero tiles and metric scopes with player page.
3. Game page: add visible panel-level loading/error states, then polish chart mobile behavior.
4. Team page: keep the polished roster feel, but make the team-stats path consistent with the stats shell.

### Pass 4: Signature Features

Use `docs/codex-feature-ideas.md` as the product backlog. The best first features are:

1. Trade / Signing Instant Dossier
2. Game Turning Points Timeline
3. Receipt Cards
4. Daily Bot Court
5. Player Archetype Badges

Each should produce both a useful page state and a shareable artifact. That is the HGB lane.

## Pipeline Change Flags

Pure frontend:

- shared masthead
- nav alignment
- font-token cleanup
- filter/control system
- visible error/empty states
- static metric labels/tooltips
- title/meta consistency
- season display helper

May require API or data pipeline:

- dynamic metric scope if fields do not identify 5v5 vs all-situations
- robust data freshness timestamps by endpoint
- Trade / Signing Instant Dossier fit calculations
- Game Turning Points Timeline if win probability/xG swing events are not already stored
- Player Archetype Badges if tags are generated offline
- Receipt Cards if narrative-flip detection is generated overnight
- Team Discord Pack if creating bundled images server-side

## Non-Goals

- Do not add tables just because data exists.
- Do not turn HGB into a full stat warehouse.
- Do not clone HockeyStats interaction patterns directly.
- Do not redesign the strongest player/card surfaces before fixing shared language and shell consistency.
- Do not launch features that cannot produce a shareable artifact or a clear user decision.
