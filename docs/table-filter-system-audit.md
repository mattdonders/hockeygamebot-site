# Table + Filter System Audit

Date: 2026-06-27  
Branch: `codex/table-filter-system-audit`

## Purpose

This audit defines what table system HGB should standardize around before doing more page-by-page cleanup. The goal is not to make every data display use the same component. The goal is to stop shipping new table/filter surfaces with one-off behavior, one-off styling, and unclear product purpose.

HGB tables should support the site lane:

> HockeyGameBot turns hockey data into fast, credible, shareable explanations.

That means tables are allowed, but they should be purposeful. A table should either help a fan find a player/team, explain the artifact on the page, or support a shareable screenshot/export with HGB context.

## Current Component Roles

### `src/components/react/HGBTable.tsx`

This is the actual production table foundation for active leaderboard-style React surfaces.

Current capabilities:

- TanStack sorting
- optional global search
- declarative filter types: search, chips, number minimum, select
- mobile column hiding
- optional column toggles for `defaultHidden` columns
- CSV export
- PNG export through `window.HGB_Export`
- row click navigation
- empty state
- virtualized rows
- jump-to-row highlight
- export title and filter chips

Current production consumers:

- `src/components/react/SkatersTable.tsx`
- `src/components/react/GoaliesTable.tsx`
- `src/components/react/TeamsTable.tsx`
- `src/components/react/LinesTable.tsx`
- `src/components/react/ImpactTable.tsx`
- `src/components/react/SeriesRecordsTable.tsx`
- `src/components/react/DashboardPlayersTable.tsx`
- `src/components/react/TeamSkatersTable.tsx`
- `src/components/react/TeamGameLogTable.tsx`

Decision: `HGBTable` should be the canonical base for large interactive stat tables, leaderboard pages, dashboard tables, and entity-page tables that need sorting/search/export/mobile behavior.

### `src/components/Table.astro`

This component still calls itself the canonical shared table component, but that is no longer true in practice. It is a static Astro table with DOM sorting, row navigation, sticky headers, PNG export, and typed rendering for `rank`, `team`, `player`, `position`, `number`, and `label`.

Current production consumers found in this audit:

- `src/pages/stats/wowy.astro`
- `src/pages/stats/goalies/[slug].astro` shot-type breakdown
- `src/pages/stats/goalies/[slug].astro` goalie game log

Nearby stale references/comments exist in:

- `src/pages/stats/skaters.astro`
- `src/pages/stats/goalies.astro`
- `src/pages/stats/teams.astro`
- `src/pages/stats/impact.astro`

Decision: `Table.astro` should not be called canonical anymore. It is either:

- a small static Astro table component, renamed/documented as such, or
- a deprecated legacy component to migrate away from after the player/team/page purpose pass.

Do not delete it yet. WOWY and goalie detail still use it, and those pages should be reviewed as product surfaces before migration.

### Local Hand-Rolled Tables

There are still local table implementations in production:

- `src/components/react/PlayerCareerTable.tsx`
- `src/components/react/PlayerGameLogTable.tsx`
- `src/pages/stats/goalies/[slug].astro` career table and shot-zone table markup
- `src/pages/stats/index.astro` home/dashboard generated player table HTML
- `src/pages/stats/series/[slug].astro` generated player/line table HTML
- `src/pages/games/index.astro` compact game/list tables
- `src/components/home/TodayHero.astro` period-by-period score tables
- `src/pages/methodology.astro` explanatory table
- `src/pages/support.astro` cost table

Decision: not all of these should move to `HGBTable`.

Keep local/static markup when the table is editorial, tiny, or part of a composed card where full table affordances would be too heavy. Convert only when the table behaves like a stat product: sorting, filtering, row navigation, export, mobile scroll, and repeated use.

## Inventory Matrix

| Surface | Current implementation | Filters/actions | Export | Product role | Recommended action |
| --- | --- | --- | --- | --- | --- |
| `/stats/skaters` | `SkatersTable` + `HGBTable` | heavy custom chrome: game type, season range, position, strength, display, scope, player/team filters, find player, saved filters | CSV/PNG proxied through hidden `HGBTable` buttons | primary leaderboard/data discovery | Keep `HGBTable`; audit filter hierarchy and stat-key copy before visual refactor. This is too complex to touch first. |
| `/stats/goalies` | `GoaliesTable` + `HGBTable` | custom chrome: game type, season range, strength, display, min GP, top N, team, optional columns, find goalie | CSV/PNG proxied through hidden `HGBTable` buttons | primary leaderboard/data discovery | Keep `HGBTable`; align filter chrome with skaters after a shared filter/action pattern exists. |
| `/stats/teams` | `TeamsTable` + `HGBTable` | local toggles for game type, strength, display, season plus built-in search | CSV/PNG via `HGBTable` | compact team leaderboard | Keep; likely good early candidate for canonical filter/action styling. |
| `/stats/lines` | `LinesTable` + `HGBTable` | local game type, line type, season, team, min TOI | CSV/PNG via `HGBTable` | line/pair discovery | Keep; needs clearer product framing and stat key, not a component replacement first. |
| `/stats/impact` | `ImpactTable` + `HGBTable` | position chips plus built-in search | CSV/PNG via `HGBTable` | current form/trend discovery | Keep; simple enough to use as a cleanup pilot. Note hardcoded export chip `2025-26`. |
| `/stats/records` | `SeriesRecordsTable` + `HGBTable` | round, top N, team search | CSV/PNG hidden by `hideToolbar`? PNG/CSV props are passed but toolbar hidden, so no visible action unless externally triggered | playoff series ranking artifact | Review export action visibility. This is a good page for shareable artifacts if actions are intentional. |
| `/stats/wowy` | `Table.astro` with client-updated rows | player search A/B, season select | no visible export | comparison/explanation artifact | Keep for now, but consider a dedicated ComparisonTable pattern later. Current year options are hardcoded. |
| `/stats/player/[slug]` career | custom React TanStack table | regular/playoff toggle, active season row updates page | custom PNG export | player-page support artifact | Do not migrate blindly. This table has page-specific behavior. It should either become a detail-table variant or stay custom with shared styling tokens. |
| `/stats/player/[slug]` game log | custom React TanStack table | opponent search | none | player-page support detail | Candidate for `HGBTable` only after player page purpose/layout pass. It duplicates much of `HGBTable`. |
| `/stats/goalies/[slug]` shot type/game log | `Table.astro` | none | none | goalie-page support detail | Keep short term; rename/deprecate `Table.astro` after goalie page cleanup. |
| `/stats/goalies/[slug]` career | local Astro table | regular/playoff tabs via script | none | goalie history detail | Candidate for detail-table styling cleanup, not necessarily `HGBTable`. |
| `/teams/[abbr]` skaters/game log | `TeamSkatersTable`, `TeamGameLogTable` + `HGBTable` | opponent filter is driven outside via document event | default `HGBTable` toolbar may appear unless hidden | team context/explanation | Keep `HGBTable`; review whether toolbar/actions belong on team page. |
| `/teams/[abbr]` goalies | `GoaliesTable` compact mode | same goalie table controls, compact flag disables virtualization | CSV/PNG controls visible | team goalie detail | Consider whether full leaderboard actions are too heavy inside team page. |
| `/games`, `/games/index` | local compact tables | live game controls | none | live status and recap | Do not force into `HGBTable`; game UI has different density/latency needs. |
| `TodayHero` score tables | local static tables | none | none | homepage live summary | Keep local. |
| `methodology`, `support` | local static tables | none | none | editorial/support info | Keep local. |

## Findings

### 1. `HGBTable` is the real canonical interactive table, but the repo says otherwise

`Table.astro` still has a large header claiming it is the canonical shared table for all HGB stats tables. That no longer matches production usage. Most current leaderboard tables use `HGBTable`; `Table.astro` is a legacy/static component used by WOWY and goalie detail.

Suggested fix:

- Update component docs/comments in a later branch.
- Rename or document `Table.astro` as `StaticTable`/`LegacyTable` only after remaining consumers are reviewed.
- Avoid adding new large stat products to `Table.astro`.

### 2. Filters are not actually centralized

`HGBTable` has declarative filter support, but the largest production pages mostly hide its toolbar and build custom filter chrome above it. `SkatersTable`, `GoaliesTable`, `TeamsTable`, `LinesTable`, `ImpactTable`, and `SeriesRecordsTable` all hand-roll filter/action layout with inline styles.

That is not automatically wrong. The problem is that the repeated controls do not have a shared product hierarchy:

- game type
- season / season range
- position / scope
- strength
- display mode
- min sample
- top N
- entity search
- find/jump to row
- team multi-filter
- optional columns
- export actions

Suggested fix:

- Do not start by rewriting `HGBTable`.
- Create a shared `TableToolbar` / `FilterBar` design pattern first.
- Keep page-level state in wrappers, but standardize the visual layout, labels, actions, and mobile behavior.

### 3. `FilterPrimitives.tsx` is useful but too small and too hardcoded

`FilterPrimitives.tsx` provides `FilterChip`, `FilterChipGroup`, and `FilterLabel`, but it is not enough to define table chrome. It also hardcodes colors and layout details that should be token-driven.

Suggested fix:

- Promote this into a real table-control primitive set only after the table roles are accepted.
- Add primitives for select, number input, search, action button, count text, export action, and grouped rows.
- Use CSS variables instead of literal `#0d0d14`, `#EFEEE8`, and repeated `rgba(...)` values.

### 4. The biggest cohesion issue is the wrapper chrome, not cell rendering

The table bodies are reasonably consistent because many of them already render through `HGBTable`. The inconsistent feeling comes from the control bands around the tables, export placement, hidden proxy buttons, local chip styles, row-count text, and explanatory footnotes.

Suggested fix:

- Standardize the table card header/footer/action pattern before changing columns.
- Add a canonical stat key/legend pattern so tables explain what the displayed metrics mean without becoming a data warehouse.

### 5. Some production comments/imports are stale

Several pages still mention `Table.astro` in comments, and `src/pages/stats/skaters.astro` imports `Table` even though the visible table is now `SkatersTable`/`HGBTable`.

Suggested fix:

- Remove stale imports/comments in the eventual cleanup branch.
- Do not do this in the audit branch unless we choose to include a tiny no-behavior cleanup commit.

### 6. Export behavior is inconsistent by page

Current patterns include:

- visible CSV/PNG controls generated by `HGBTable`
- page-level buttons proxy-clicking hidden `HGBTable` export buttons
- custom PNG export inside `PlayerCareerTable`
- `Table.astro` PNG support that only appears when `exportFilename` is passed
- no export on some comparison/detail tables

This is product-relevant because exports should not become the primary product surface. Screenshots/cards are stronger for HGB because they carry brand context. Exports should exist only when there is a clear user need.

Suggested fix:

- Define canonical action order: primary artifact/screenshot/card action first, PNG table second when useful, CSV hidden/secondary only when clearly needed.
- Avoid making CSV visible by default on every table.

### 7. `PlayerCareerTable` and `PlayerGameLogTable` duplicate `HGBTable` behavior

Both use TanStack directly and duplicate sorting, mobile handling, row rendering, empty states, and table styling. `PlayerCareerTable` has legitimate custom behavior: active season selection updates player-page percentile bars and has custom PNG export. `PlayerGameLogTable` is more likely to be migratable later.

Suggested fix:

- Do not migrate player tables until the player-page purpose pass decides what belongs.
- If retained custom, make them consume shared tokens/control primitives.
- If migrated, migrate `PlayerGameLogTable` before `PlayerCareerTable`.

### 8. Team-page tables have a separate integration pattern

`TeamSkatersTable` and `TeamGameLogTable` listen to an external opponent filter via `hgb:team-opp-filter`. That supports a product idea the site cares about: team-vs-opponent context. These should not be flattened into a generic leaderboard page pattern.

Suggested fix:

- Keep the opponent-filter integration.
- Standardize the table display/action treatment inside team pages so team pages feel intentional instead of embedded leaderboard fragments.

## Canonical Pattern Proposal

### Interactive Stat Table

Use for leaderboard/data-discovery pages.

Base component: `HGBTable`

Required:

- clear page-level purpose
- visible table title/subtitle outside the table
- stat key or legend when metric labels are not obvious
- canonical filter/action bar
- mobile scroll affordance
- empty state with useful next step
- export only when intentional

Examples:

- `/stats/skaters`
- `/stats/goalies`
- `/stats/teams`
- `/stats/lines`
- `/stats/impact`
- `/stats/records`

### Entity Detail Table

Use for player/team/goalie support context.

Base component: `HGBTable` when behavior is generic; custom React or Astro table when it has page-specific interactions.

Required:

- compact header
- clear scope line
- no unnecessary toolbar
- no CSV by default
- row click only when it clearly leads somewhere useful

Examples:

- player career
- player game log
- team skaters
- team game log
- goalie shot-type breakdown

### Comparison / Artifact Table

Use when the table is itself a screenshot-worthy explanation.

Base component: dedicated comparison/artifact component, not necessarily `HGBTable`.

Required:

- title formatted for screenshot
- filter/context chips visible in the artifact area
- HGB footer/attribution
- no spreadsheet-like toolbar
- PNG/share action if the table is intended for external sharing

Examples:

- WOWY player comparison
- future trade dossier comparison
- playoff series records artifact

### Static Editorial Table

Use for methodology/support/cost/reference content.

Base component: local semantic HTML or a future `StaticTable`.

Required:

- accessible markup
- responsive overflow if needed
- no stat-table chrome

Examples:

- methodology persistence table
- support cost table
- period score mini tables

## Recommended Implementation Order

1. **Document and rename roles**

   Update comments/docs so `HGBTable` is the canonical interactive table and `Table.astro` is legacy/static. Do not rename files until consumers are handled.

2. **Create shared table-control primitives**

   Extend `FilterPrimitives.tsx` or replace it with a more complete table-control set:

   - `FilterBar`
   - `FilterGroup`
   - `FilterChip`
   - `FilterSelect`
   - `FilterNumberInput`
   - `TableActionButton`
   - `TableCount`
   - `TableFootnote`

3. **Pilot on simple pages**

   Start with `/stats/impact` and `/stats/teams`, not `/stats/skaters`.

   These pages are simpler and will expose whether the filter/action pattern works without risking the largest table.

4. **Apply to goalie/skater leaderboards**

   Once the primitives feel right, migrate the control chrome on `GoaliesTable` and `SkatersTable` without changing data behavior.

5. **Run player/team page purpose pass before detail-table migration**

   Decide what belongs on player/team pages before moving detail tables. This prevents a component cleanup from accidentally preserving a kitchen-sink page.

6. **Decide fate of `Table.astro`**

   After WOWY and goalie detail are reviewed:

   - rename to `StaticTable.astro`, or
   - replace with targeted components and delete it.

## Not Recommended Right Now

- Do not rewrite `HGBTable` first.
- Do not force all local tables into `HGBTable`.
- Do not make CSV export more prominent sitewide.
- Do not clean up `/stats/skaters` first. It is the most complex table/filter surface and will create churn before the pattern is proven.
- Do not add more columns just because data exists. Tables must support discovery, explanation, or shareable artifacts.

## Open Questions

- Should CSV be hidden behind a secondary menu on all public stat tables?
- Should table PNG export use the same modal/share wrapper as cards/artifacts?
- Should WOWY become a first-class shareable artifact with HGB footer and PNG action?
- Should `/stats/records` expose a visible PNG action, since it is naturally shareable?
- Should team-page embedded tables hide exports by default?

