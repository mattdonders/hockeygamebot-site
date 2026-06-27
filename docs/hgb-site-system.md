# HGB Site System

Date: 2026-06-27

Status: Draft for section-by-section review.

Purpose: keep HockeyGameBot cohesive as new pages and features are added. This is not a brand bible. It is a working product/design spec for deciding what belongs, what gets reused, and what should be consolidated.

## Review Plan

Review this document one section at a time:

1. Product north star
2. Page archetypes
3. Component inventory and consolidation
4. Canonical patterns
5. HGB voice
6. Player, team, and game page rules
7. Feature acceptance rules
8. What should never be added
9. Implementation order

Each section should end with a practical decision. If a section feels wrong, revise the rule before implementing code.

## 1. Product North Star

HockeyGameBot turns hockey data into fast, credible, shareable social artifacts.

That sentence should be the filter for the site.

The site exists because the bots exist. The bots are the product's origin and the core distribution engine. The website should make the bots feel credible, useful, and worth sharing, not replace them with a generic analytics platform.

Product lineage:

1. Social bots were the original HGB product.
2. Game pages came next as the site-side component of the bots.
3. The broader stats site exists to make bot output credible, discoverable, and resilient if social platforms become more expensive or less reliable.
4. The RAPM/WAR/model pipeline exists to produce trusted, shareable artifacts, especially player cards, goalie cards, comparison views, game summaries, and screenshots that people want to post on social.
5. The long-term destination is not "analytics website only"; it is bots + site + eventual iOS push notifications working as one real-time hockey information system.

HGB is not trying to be:

- a complete public data warehouse
- a Hockey Reference clone
- a HockeyStats clone
- a cap/contracts destination
- a raw table-first analytics platform
- a place where every available stat deserves a page
- a tabular export product

HGB is trying to be:

- a near-real-time bot network that gets credible hockey data onto social as quickly as possible
- the easiest place to find a player/team/game artifact worth posting
- the easiest way to share a credible hockey argument in Discord or social
- a site that gives the bot network credibility and context
- a trusted model layer that supports what smart fans already think or are debating
- a site where advanced stats are packaged into fandom-native artifacts, not explained to death
- a data/model pipeline strong enough to generate cards that fans recognize as credible

Product rule:

If a feature does not create one of these outcomes, it should not ship:

- a user finds something worth posting
- a user trusts the bot/model output more
- a user gets a better argument to share
- a user finds a useful card/artifact
- a user comes back because the bots/site react quickly to real hockey events

Model note:

The model does not need to be explained in exhaustive public detail on every page. It does need to be trustworthy enough that the artifacts feel credible when shared. A separate model audit can review RAPM/WAR inputs, weights, outliers, and player rankings, but that is outside this site-system spec.

Artifact note:

"Artifact" does not only mean a generated image card. It can be a card, comparison table, cropped page state, chart, game summary, or any compact view that carries an argument on its own when pasted into Twitter, Bluesky, Discord, or a group chat.

Effort note:

The scope of HGB can be large, but implementation time is limited. Do not chase feature parity with full-time analytics platforms. Prioritize work that compounds across bots, site pages, cards, and future push notifications. Avoid low-leverage table/export work unless it directly improves a shareable artifact or a core user workflow.

## 2. Page Archetypes

Every page should fit one archetype. If a page does not fit, either the archetype list is incomplete or the page is probably an experiment that should stay internal.

### 2.1 Live Context Page

Examples:

- `/`
- `/scoreboard`
- `/results`
- `/games/[game_id]`

Job:

Explain what is happening, what happened, or why a game changed.

Canonical contents:

- current or recent game state
- matchup/team identity
- score and clock context when relevant
- xG or win probability only with scope labels
- turning points or bot moments
- shareable game artifact
- useful empty/off-day state

Should not become:

- a full box-score clone
- a feed of unlabeled raw events
- an empty page when no games exist

Future note:

These pages may eventually connect more directly to bot posts and iOS push notifications, but the current page contract should stay "live/recent game context" until that integration exists.

### 2.2 Entity Detail Page

Examples:

- `/stats/player/[slug]`
- `/stats/goalies/[slug]`
- `/teams/[abbr]`
- `/stats/lines/[slug]`
- `/stats/series/[slug]`

Job:

Answer "what should I know about this player, goalie, team, line, or series?"

Canonical contents:

- identity masthead
- 3-5 strongest summary signals
- model readout or short interpretation
- trend over time
- relevant peers/comps
- recent game/sample context
- share artifacts
- methodology/scope labels at point of use

Should not become:

- a database dump
- a page with every split available
- a wall of unexplained advanced stats

### 2.3 Leaderboard Page

Examples:

- `/stats/skaters`
- `/stats/goalies`
- `/stats/teams`
- `/stats/lines`
- `/stats/impact`
- `/stats/records`

Job:

Let users compare and discover who stands out.

Canonical contents:

- stat promise in masthead
- visible season/game-type/situation scope
- compact stat key above the table
- consistent filters
- sortable table
- row links to detail pages
- data freshness/scope note
- methodology below the table

Should not become:

- the first answer for every product idea
- a maze of niche filters
- a place where screenshots lose metric context

### 2.4 Tool / Explorer Page

Examples:

- `/stats/wowy`
- `/stats/explore`
- `/stats/edge-compare`
- `/cards`
- future Lineup Lab
- future Trade Machine Lite

Job:

Let users ask a specific hockey question and get an answer.

Canonical contents:

- one clear input task
- default/example state
- direct answer area
- explainer or confidence note
- share artifact if the answer is interesting
- visible qualification rules when no result appears

Should not become:

- a developer sandbox in production
- a page that requires analytics knowledge before it is useful
- a generic SQL/data explorer

Artifact access note:

The standalone cards page belongs here for now. Day-one artifact use should primarily come from player, goalie, team, line, and game pages where the user already has context. `/cards` can stay as a utility/studio surface rather than becoming a primary site archetype.

### 2.5 Editorial / Methodology Page

Examples:

- `/analysis`
- `/analysis/[slug]`
- `/methodology`
- `/support`

Job:

Build trust, explain the model, and provide durable context.

Canonical contents:

- plain-language explanation
- links back to relevant stat surfaces
- definitions of proprietary metrics
- examples using real players/games

Should not become:

- the only place a user can understand a table
- disconnected from the live/product surfaces

### 2.6 Internal / Prototype Page

Examples:

- `/src/pages/_internal/*`
- POC components under `src/components/poc`
- old mockups under `docs/plans`

Job:

Experiment without committing to production IA.

Canonical rules:

- keep out of public navigation
- label clearly as internal
- delete or graduate after a decision
- never become an accidental production dependency

## 3. Component Inventory And Consolidation

Current system has useful components, but too many page-local reinventions.

Scope note:

This section is not a delete list yet. It is an audit map. Most existing components should be kept until a specific styling, duplication, or behavior problem is confirmed. Consolidation should happen only when a shared component clearly replaces repeated page-local code.

### Keep And Treat As Core

- `src/components/Nav.astro`
- `src/components/Fonts.astro`
- `src/components/StatsSubnav.astro`
- `src/components/StatsSEO.astro`
- `src/components/react/HGBTable.tsx`
- `src/components/react/SkatersTable.tsx`
- `src/components/react/GoaliesTable.tsx`
- `src/components/react/LinesTable.tsx`
- `src/components/react/TeamsTable.tsx`
- `src/components/react/ImpactTable.tsx`
- `src/components/react/PlayerCareerTable.tsx`
- `src/components/react/PlayerGameLogTable.tsx`
- `src/components/react/ShotMap.tsx`
- `src/components/home/artifacts/ArtifactShell.astro`

Review note:

These should stay, but they still need styling review against the final system. "Core" means they are important to the product, not that their current implementation is automatically final.

### Consolidate Into Shared Components

Create or formalize only after reviewing the existing components/pages they would replace:

- `StatsMasthead.astro`: canonical stats/detail masthead
- `PageSection.astro`: consistent section heading, eyebrow, meta, actions
- `StatKey.astro`: compact definitions above data-heavy blocks
- `ScopePill.astro`: season, game type, 5v5/all-situations labels
- `MetricTooltip.astro` or React equivalent
- `EmptyState.astro`
- `ErrorState.astro`
- `StaleDataNotice.astro`
- `ArtifactActionRail.astro`
- `FilterBar.tsx`
- `SegmentedControl.tsx`
- `SelectControl.tsx`
- `SearchControl.tsx`
- `RangeControl.tsx`

Open audit questions:

- What exact markup/styles belong in a future `StatsMasthead.astro`?
- Which pages already share enough masthead structure to justify extracting it?
- Which filter controls were already consolidated, and where are the remaining one-offs?
- Does `PageSection.astro` already exist under another name or pattern?
- Should artifact/share action layout become a page-level component or remain local to player/game pages for now?
- Artifact sharing already has an implementation path via the `showTable` modal/popup image flow. The audit should focus on action naming, grouping, hierarchy, and UX, not rebuilding the modal mechanism from scratch.

### Keep But Audit

- `src/components/ChipGroup.astro`
- `src/components/Badge.astro`
- `src/components/StatusPill.astro`
- `src/components/Table.astro`
- `src/components/EdgePanel.astro`
- `src/components/react/FilterPrimitives.tsx`
- `src/components/stats/*`

These may already solve pieces of the canonical system, but they need one source of truth for tokens, spacing, and naming.

Specific audit required:

- Compare `src/components/Table.astro` against `src/components/react/HGBTable.tsx`.
- Decide whether `Table.astro` is legacy/simple-Astro table infrastructure, whether `HGBTable.tsx` is the canonical leaderboard table, or whether both have distinct valid roles.
- Do not consolidate these two until their current consumers and feature differences are documented.

### Delete, Archive, Or Keep Internal

Targets to review:

- `src/components/poc/*`
- `src/components/react/*Demo*`
- `src/pages/_internal/*`
- old page backups such as `src/pages/stats/player/[slug].astro.bak.20260612`
- stale mockup docs that are no longer decision records

Rule:

Experiments are fine, but they need an expiration path: delete, archive under docs with a note, or graduate into shared production components.

Decision:

Archive old, unused, and POC work once it is confirmed unreferenced. Do not delete active prototypes that still explain a current design direction.

## 4. Canonical Patterns

### 4.1 Masthead Pattern

Every production page should have a clear page-opening pattern. It does not need to be visually identical across archetypes, but it should stay structurally consistent and within the brand.

Every page opening should answer:

- where am I?
- what is this page for?
- what is the current scope?
- what is the primary action or takeaway?

Useful variants:

- `home/live`: dynamic game-state hero
- `stats/leaderboard`: title, lede, scope, stat promise
- `detail/entity`: identity, summary tiles, artifact action
- `tool`: task prompt, input summary, example/default state

Canonical masthead ingredients:

- eyebrow in `--body`, uppercase, small
- large title in `--display`
- lede in `--body`
- metric/stat values in `--mono` or `--display` depending on size
- corner marks only when they frame meaningful content
- ghost word optional, not required
- visible scope chips for season/game type/situation

### 4.2 Table Pattern

Every page with tabular data should have:

- stat key above the table
- filters in the same visual style
- active sort state
- qualification rule
- data freshness note
- row links when a detail page exists
- no undefined proprietary metric headers

Stat key note:

Use a compact legend/stat key wherever tabular data appears. HGB does not have so much table surface area that definitions need to be rationed. The key can be small, but screenshots should not strip all context from the table.

### 4.3 Metric Pattern

Every metric display should answer:

- what is this?
- what is the scope?
- is higher better?
- is it raw, rate, percentile, or model output?
- what time/sample does it represent?

Short labels are allowed only when a nearby tooltip/stat key explains them.

### 4.4 Share Artifact Pattern

Any page with meaningful user-facing analysis should ask:

- what card should someone post from this page?
- what non-card artifact might someone screenshot or share?
- does the card use the same labels/scopes as the page?
- is there one primary share action?
- are secondary card formats grouped instead of all presented equally?

Artifact rule:

Player, goalie, team, game, line, and tool pages should all consider purposeful share artifacts. Users may screenshot anything, but HGB-owned artifacts should be intentionally designed, labeled, and easy to share.

### 4.5 Empty/Error Pattern

Empty states must say why there is no data and what to do next.

API/data failures must not look like legitimate empty results.

Public pages should not expose raw API errors. Use a custom, human-readable message such as "This data is temporarily unavailable" with a useful next step or retry path. A global catch-all fallback is acceptable until panel-specific states are built.

Mock sports data must not ship as a production fallback.

## 5. HGB Voice

HGB has three related voices:

1. Site voice: the trust layer.
2. Artifact voice: the share layer.
3. Social voice: the distribution layer.

The site should not be written like a personal Twitter account. It should produce credible artifacts and page states that can be shared by a personal account, the HGB/project account, or automated bots with different levels of commentary.

### 5.1 Site Voice

Site voice should be:

- direct
- natural
- credible
- careful with claims
- hockey-native
- concise
- useful as context for a Discord or social argument

Site voice should avoid:

- fake scouting certainty
- generic marketing copy
- analytics jargon without translation
- jokes that obscure the data
- "AI says" framing
- overexplaining every metric in the main flow
- robotic feature names that sound forced or corny

Preferred sentence shape:

- "The concern is..."
- "This looks better than the box score."
- "The sample is thin, but..."
- "At 5v5, the game tilted here."
- "This is a percentile, not a grade."

Open copy decision:

Defer whether to use first-person brand phrasing such as "HGB likes..." versus neutral phrasing such as "Model view..." until actual page copy is being written. The right answer may differ between player pages, artifacts, and social posts.

### 5.2 Artifact Voice

Artifact voice should be even tighter than site voice:

- clear headline
- labeled scope
- no buried caveats
- no unnecessary explanation
- enough context to survive a screenshot

Artifacts should avoid strong claims unless the evidence is overwhelming. Hockey is too nuanced for every takeaway to sound determined by a stat.

### 5.3 Social Voice

Social voice can vary by account:

- Personal account: more personality, context, and opinion.
- HGB/project account: more official, higher-signal artifacts and bot outputs.
- Team bots: fast, factual, automated, event-driven.

The site system should support all three by producing clean artifacts, not by forcing every account to use the same tone.

Content strategy note:

Develop a distribution strategy where the personal account and HGB/project account can live alongside each other. The personal account can continue to use existing hockey reach, but the project account should grow in parallel so HGB is not permanently dependent on a personal feed. This also keeps the personal account from feeling locked into only hockey content.

Voice rule:

Write like a trusted hockey account posting something useful enough that a fan wants to share it. Do not write like a model explaining itself.

## 6. Player, Team, And Game Page Rules

### Player Pages

Must answer:

- how good is he right now?
- what is the clearest HGB read on this player?
- what supports that read?
- what is the recent trend?
- what should a fan post when he is traded, signed, or argued about?

Belongs:

- hero identity and team context
- Rating/WAR/Impact with clear scopes
- strengths, concerns, and context
- trend chart
- game log
- peer/comparison panel
- shot map when useful
- share cards
- recent insight feed
- artifact-first actions

Does not belong:

- every possible split
- unexplained RAPM/EDGE blocks
- five equal-weight download buttons
- hidden model caveats
- stat dumps with no share/use case
- a kitchen-sink stack of modules with no hierarchy

Player page priority:

The problem to solve is not lack of content. It is that useful modules can feel thrown onto the page without a clear order. A player page should make the top read obvious, make artifacts easy to grab, and then let deeper stats support the read. Do not add new player-page modules until the existing hero, career table, cards/actions, shot map, trend, game log, peers, and insight feed feel like one cohesive page.

### Team Pages

Must answer:

- what is this team good/bad at?
- who drives the team?
- what changed recently?
- what can fans share?
- where can fans follow the team bot?
- how does this team perform against a specific opponent when that context is available?

Belongs:

- team identity
- current form
- top/bottom skaters
- goalie story
- lines or pairings that matter
- bot/account context
- shareable team snapshot
- team insights
- team-vs-opponent view via query state such as `?opponent=ABBR`

Does not belong:

- a full roster database
- cap/contracts scope creep
- standings clone behavior unless directly tied to HGB model context

Team page priority:

Team pages have two valid jobs: bot discovery and team analytics. Bot discovery matters because users may not know the bots post on multiple platforms. Team analytics should prioritize useful, shareable page states such as team insights, team overview, top drivers, goalie story, lines, game log, and team-vs-opponent context. The `?opponent=ABBR` state is a strong fit because it can be linked from the home page and creates a specific argument-ready view.

### Game Pages

Must answer:

- what were the biggest signals from this game?
- what changed the game state?
- who stood out?
- what did the box score potentially hide?
- what artifact should fans post?

Belongs:

- score/matchup context
- xG and WP charts with labels
- turning point
- goalie story
- key line/on-ice story
- play log only if filtered or explained
- bot posts/cards
- visible data state per panel
- good-enough live tracking
- useful recap state after final

Does not belong:

- raw event walls as the primary experience
- unlabeled chart scopes
- silent fallback content
- chart interactions that only make sense to the developer
- overconfident single-game storylines

Game page priority:

Game pages need both live and postgame value. Live tracking should be good enough and credible, even if other sites are deeper. Postgame recap/explanation should be careful because hockey is noisy and a single game rarely has one definitive statistical story. The page should surface signals, swings, and useful context without pretending the model can fully determine why the game happened.

## 7. Feature Acceptance Rules

The current site grew by building the pipeline and frontend together. That created useful features, but it also created pages, cards, and artifacts whenever the backend made new data available. Going forward, new data should not automatically become a new page or artifact.

### 7.1 Product Fit Requirements

Before a feature ships, it must answer:

- who is this for?
- what will they do with it?
- is this a page, module, card, query state, or internal-only data?
- what is the share/use case?
- why does this belong on HGB specifically?

### 7.2 Feature Value Check

Every public feature should satisfy at least two:

- helps understand a player/team/game
- creates a shareable artifact, screenshot, or quote
- improves bot/site/app credibility
- updates with real hockey events
- supports a known fan argument or workflow

### 7.3 Technical And Design Requirements

No page or public component should ship without:

- fitting a page archetype
- reusing canonical patterns where they exist
- visible empty/error states
- metric scope labels
- mobile layout check
- page title and OG metadata where relevant
- no production mock data
- no hardcoded current season unless intentionally static historical content

## 8. What Should Never Be Added

Do not add:

- tables just because the data exists
- exports as a primary product surface
- exports without a clear external user need
- public pages for backend milestones
- betting/pick language unless explicitly scoped and legally reviewed
- cap/contracts workflows
- full draft/scouting platform features
- recognizable competitor rituals copied directly
- recognizable competitor page designs or language copied directly
- generic player rankings without HGB framing
- forced/corny engagement mechanics
- "receipt", "proof", or "I told you so" framing
- features with no share artifact, insight, workflow, or bot/app value
- raw SQL/data explorer surfaces in public IA
- pages whose only value is "we have the data"

Export note:

Screenshots and HGB-branded artifacts are usually better than exports because they carry the brand and the context. Exports are allowed only when there is a clear use for someone else, and they should not become the primary product surface. If an export is necessary, keep it secondary and avoid designing the page around it.

Cap/contracts note:

Cap and contract data can appear when it supports HGB context, but HGB should not build cap-management or "be a GM" workflows. Existing cap sites own that space.

Use this question:

Would a fan send this to someone else, or does it only prove the database exists?

If it only proves the database exists, it probably does not belong.

## 9. Implementation Order

### Pass 1: Finish System Decisions

1. Review and revise this document section by section.
2. Correct font-token guidance in `BRANDING.md`.
3. Audit existing masthead patterns before extracting a shared component.
4. Audit `Table.astro` vs `HGBTable.tsx`.
5. Audit existing filter consolidation and remaining one-offs.
6. Decide canonical stats navigation groups.
7. Decide whether `--semi` survives outside table headers.
8. Decide the minimum metric dictionary/stat-key shape.

### Pass 2: Build Foundations

1. Add shared stats nav config.
2. Add shared metric-copy/stat-key helper.
3. Add shared empty/error/stale data components.
4. Clean up filter/control primitives based on the audit.
5. Define artifact action UX rules around the existing `showTable` sharing flow.
6. Add `StatsMasthead.astro` only if the masthead audit confirms enough shared structure.

### Pass 3: Cohesion Pass On Existing High-Value Pages

1. Player pages
2. Goalie pages
3. Team pages
4. Game pages

These pages matter most because they are where users find shareable artifacts, bot context, and the strongest HGB product value.

### Pass 4: Leaderboard And Tool Cleanup

1. Skaters
2. Goalies
3. Team stats
4. Lines
5. WOWY
6. Impact
7. Records
8. Series
9. Explore / EDGE Compare

### Pass 5: Add New Artifact/Product Bets

Use `docs/codex-feature-ideas.md` as the feature backlog. Start with:

1. Trade / Signing Instant Dossier
2. Game Turning Points Timeline
3. Player Archetype Badges
4. Team-vs-Opponent Artifacts
5. Daily insight prompts, renamed before shipping if used

These should plug into the system rather than create new isolated page patterns.
