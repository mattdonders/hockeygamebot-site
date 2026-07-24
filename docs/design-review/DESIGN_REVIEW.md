# HockeyGameBot Site — Design & Data Presentation Review

**Date:** June 8, 2026  
**Method:** Playwright screenshots of live site (1440px) + Astro source code review  
**Pages covered:** 19 page types across all sections  
**Screenshots:** `docs/design-review/screenshots/`

---

## Executive Summary

Three systemic problems affect almost every page:

1. **xG situation context is missing everywhere.** 5v5 xG, all-sit xG, and actual goals appear side-by-side with no labels. Users cannot tell what they're looking at.
2. **The masthead/hero pattern is implemented 4+ different ways.** Corner marks at different insets, different paddings, different eyebrow styles. The site looks like 3 separate builds.
3. **Advanced stats are undefined at point of use.** WAR, GSAx, RAPM, xGF%, A1/60, dSV% appear in tables and cards with no tooltip, footnote, or inline explanation — only on methodology pages that are below the fold or on a different page entirely.

The most polished pages: **Teams**, **Impact**, **Player**. The least polished: **Records**, **Games Index**, **Home (off-day state)**.

---

## Priority Matrix — Top P1 Issues

| # | Page | Issue | Fix Complexity |
|---|------|-------|----------------|
| 1 | ALL | xG shown without situation context (5v5 vs all-sit) — inconsistent across every page | Medium |
| 2 | ALL | No tooltips on any advanced stat column (WAR, GSAx, xGF%, A1/60, dSV%) | Low |
| 3 | Home | Entire page is blank on no-game days — no fallback content below the empty-state card | Medium |
| 4 | Scoreboard | Empty state gives no navigation path out; loading state looks broken | Low |
| 5 | Stats Index | Mock/hardcoded data (`followedTeams: ["NJD","SJS"]`) ships to production | Low |
| 6 | Player | Hero tiles show "97%" — looks like a score, not a percentile rank | Low |
| 7 | Player | Impact trend chart y-axis has no unit label | Low |
| 8 | Series | GSAx tile has no definition anywhere on the page | Low |
| 9 | Series | "PO TOI / PO xGF%" abbreviations never explained | Low |
| 10 | Leaderboards | Skaters/Lines On-Ice columns have no 5v5 situation annotation | Low |
| 11 | Leaderboards | Filter panel collapsible on Skaters only — inconsistent with all other pages | Low |
| 12 | Explore | Uses wrong subnav (ExploreSubnav instead of StatsSubnav) — breaks navigation | Low |
| 13 | Records | No above-fold orientation — no lede, no explanation before a wall of table data | Low |
| 14 | Games Index | Renders "NO GAME SELECTED" as its only content — functionally a dead end | High |
| 15 | Team Page | "Tonight" widget perpetually shows "Loading…" during off-season | Low |

---

## Page-by-Page Findings

---

### Home (`/`)

**P1 — Blank on no-game days**  
The page renders a single empty-state card and a footer. The Bot Cards rail, Results strip, and Featured Game section all disappear when there are no games. A first-time visitor sees nothing useful. The ticker freezes on "Loading game data…" in a solid black bar.  
→ *Fix: Always render the Bot Cards rail and a static recent results strip. Add a fallback string to the ticker when no goals are available.*

**P1 — xG bar has no situation label on the Featured Game hero**  
The hero xG bar uses `xg_away ?? xg_5v5.away` — the situation depends on which field is available at runtime, and neither is labeled in the UI. The dek copy says "out-chanced on expected goals" with no qualifier.  
→ *Fix: Resolve the actual situation being displayed and label it "(5v5)" or "(all-sit)" inline.*

**P2 — Empty-state eyebrow is redundant**  
"THAT'S A WRAP · LAST NIGHT" on the left and "No games tonight" on the right communicate the same thing at the same visual weight across a full-width gap. In the empty state both slots describe inactivity.  
→ *Fix: Collapse to a centered single string in the empty state.*

**P3 — Corner registration marks frame nothing in the empty-state hero**  
The four corner marks are decorative anchors that work when the hero has content. In the blank state they look like UI artifacts.  
→ *Fix: Hide corner marks when the empty state is active.*

---

### Stats Index (`/stats`)

**P1 — Hardcoded mock data ships to production**  
`followedTeams` is hardcoded to `["NJD", "SJS"]`. `followedPlayers`, `trending`, `modelSignals`, and `topTeams` are all static arrays marked "Mock data (matches approved POC)." Any logged-in user who isn't the developer sees Jack Hughes in their player table.  
→ *Fix: Guard all mock data behind `import.meta.env.DEV`. SSR HTML for production should render empty/skeleton states.*

**P1 — GF% label missing "5v5" on team cards**  
The adjacent column is `xGF% 5v5` (correctly labeled). The GF% column uses `gf_pct_5v5` internally but the label drops the qualifier. Users comparing them will assume both are all-sit.  
→ *Fix: Change label to `GF% 5v5`. One word.*

**P2 — WAR%/RTNG%/IMP% column explanatory footnote only appears in the logged-in view**  
The logged-out `DashboardTopImpact` renders the same columns without the "WAR% · RTNG% · IMP% = percentile vs. position group" footnote that appears for authenticated users.  
→ *Fix: Render the footnote for both auth states.*

**P2 — Model Signals "locked" state looks like broken content**  
`opacity: 0.6; pointer-events: none` on the card reads as a UI glitch, not an intentional upsell. A duplicate sign-in CTA appears 200px below the masthead CTA.  
→ *Fix: Replace with a proper locked-state component (lock icon + single CTA). Remove the duplicate CTA.*

**P2 — Section title typography inconsistent with home page**  
Stats index `.section-title` = 10px mono label. Home `.section-title` = 26–44px display font. Same class name, completely different definitions in local style blocks.  
→ *Fix: Rename one to `.section-label` to prevent collision, and document a shared convention.*

---

### Player Page (`/stats/player/[slug]`)

**P1 — Hero tiles show "97%" with no indication it's a percentile, not a score**  
First-time users cannot tell if 97% is a grade, a rate, or a rank. The sub-label (`+1.41 Rating`) is 10px mono — invisible at a glance.  
→ *Fix: Render as "97th" ordinal or add "pct" to the tile label.*

**P1 — Impact trend chart y-axis has no unit**  
Y-axis shows `-4, 0, +4, +8` — no label for what this number represents. The tooltip on hover shows the value but the axis is silent.  
→ *Fix: Add y-axis title "Game Score" and label the zero line "Avg".*

**P1 — Career table has no situation context on any column**  
G/A/PTS are all-sit counting stats. Rating/WAR/Impact are percentiles vs. position group peers. None of this is labeled. Users coming from a hockey reference site expect these to be 5v5 or all-sit counting stats.  
→ *Fix: Add "(pct)" to Rating/WAR/Impact headers. Add "(All-Sit)" near counting stat columns.*

**P2 — Three hero tiles use three different time horizons with no labels**  
Rating = blended multi-season, WAR = current season, Impact = current season game score. Shown side-by-side with equal visual weight.  
→ *Fix: Add time horizon to each tile sub-label: "3-yr blended" / "2025-26" / "2025-26".*

**P2 — Shot map "all situations" qualifier is buried in 10px muted meta**  
"94 shots · all situations · 2025-26" is the card meta. The qualifier is a critical methodological note displayed in the smallest text on the card.  
→ *Fix: Move "All Situations" into the card eyebrow: "Shot Map · All Situations".*

**P2 — Five undifferentiated download buttons in the sidebar**  
"Player Card", "Rating Card", "History Card", "Expanded Card", "RAPM Card" — all same color, same weight, no description of contents.  
→ *Fix: Add one-line description under each. Make one primary CTA; collapse the rest into "More formats".*

**P2 — Rating Card hero stat is WAR, not Rating**  
The card is named "Rating Card" but the large hero number is WAR. The Rating values appear only in the smaller right-column bars.  
→ *Fix: Swap the hero stat to Rating percentile, or rename the button "WAR Card".*

**P2 — Canvas Season Card mixes RAPM bars, rate bars, and context bars with no grouping**  
EV Offense (RAPM %), Goals/60 (rate %), Opp. Quality (context %) are all shown in one undivided percentile bar list.  
→ *Fix: Group bars with a visual divider: "EV Impact" / "Rate Stats" / "Special Teams" / "Context".*

**P2 — Historical seasons silently use a different pipeline**  
Code acknowledges historical seasons use a "simplified pipeline formula" but there is no user-visible callout. 2018-19 WAR appears next to 2025-26 WAR as if identical.  
→ *Fix: Add a dagger footnote on historical Rating/WAR columns: "Historical seasons use retroactive estimates."*

**P3 — "RAPM Card" button label is analytics jargon**  
→ *Fix: Rename to "EV Impact Card" or "Advanced Card".*

**P3 — "A1/60" undefined anywhere on the page for non-analytics users**  
→ *Fix: Render as "Primary A/60" on first appearance, or add to the methodology sidebar.*

---

### Series Page (`/stats/series/[slug]`)

**P1 — GSAx has no definition anywhere on the page**  
A "+3.4" in green with the label "GSAx — VGK" is completely uninterpretable without knowing GSAx = Goals Saved Above Expected.  
→ *Fix: Add a scope note below the Series at a Glance section: "GSAx = Goals Saved Above Expected · positive = goalie outperforming xG".*

**P1 — "PO TOI" and "PO xGF%" — "PO" is never defined**  
The line table headers use "PO" to mean "Playoff" but this is not explained anywhere on the page.  
→ *Fix: Change to "Playoff TOI" and "Playoff xGF%".*

**P2 — G/xG tile shows all-sit xG next to the 5v5 xGF% section label**  
The section header says "5v5 Expected Goals" but the G/xG glance tile uses `xgfAll` (all-situations). The comparison is internally inconsistent.  
→ *Fix: Add a sublabel directly on the G/xG tile: "all situations". Or add a divider between the 5v5 bar and the all-sit glance tiles.*

**P2 — Compare grid GF/GA rows have no situation qualifier**  
Next to `xGF (5v5)` rows sit bare `GF` / `GA` rows that look like box-score totals but may be 5v5.  
→ *Fix: Label them explicitly: `GF (5v5)` or `GF (All-Sit)` depending on what they actually are.*

**P2 — Shot map dot size does not encode xG danger, but users expect it to**  
The code explicitly passes `xg: 0` because per-shot xG isn't available yet. Readers familiar with other shot maps (Evolving Hockey, Moneypuck) will misread flat dots as equal-danger.  
→ *Fix: Add footnote below the legend: "Dot size is uniform — xG weighting pending".*

**P2 — Model Prediction block is entirely inline-styled**  
Every other section uses CSS classes. The Prediction block uses `style=` throughout, which won't inherit future token changes.  
→ *Fix: Extract to named classes (`pred-card`, `pred-team`, `pred-bar`).*

---

### Skaters (`/stats/skaters`)

**P1 — On-Ice 5v5 tab columns carry no situation annotation**  
The tab is named "On-Ice 5v5" but `xGF%`, `xGF/60`, `xGA/60`, `SC/60`, `HDC/60` column headers have no situation qualifier. Export/screenshot loses all context.  
→ *Fix: Append "(5v5)" to each On-Ice column header.*

**P1 — Filter panel is collapsible on Skaters only**  
Users arriving from Lines or Goalies will look for a toggle that doesn't exist there; users from Skaters won't find the always-visible panel they expect.  
→ *Fix: Make filter bars either all-collapsible or all-always-visible across all four leaderboard pages.*

**P2 — No tooltips on "Impact", "Finishing", "WAR" columns**  
These are proprietary HGB terms. The methodology strip is below the table.  
→ *Fix: Add `title` attributes. Add a one-line stat key visible between the filter bar and table on the Advanced tab.*

---

### Goalies (`/stats/goalies`)

**P2 — GSAx and xGA have no situation annotation (they are all-sit)**  
The Skaters page labels 5v5. The Goalies page does not label all-sit. Asymmetric.  
→ *Fix: Add "(all-sit)" to GSAx, GSAx/60, and xGA column headers.*

**P2 — `dSV%` has no explanation anywhere on the page**  
Not in the methodology strip. No tooltip. Only defined in the player card download, not the table.  
→ *Fix: Add to the Goalies methodology strip with one-line definition.*

---

### Lines (`/stats/lines`)

**P1 — xGF%, xGF/60, xGA/60 have no 5v5 situation label in column headers**  
The masthead lede mentions "at 5v5" but it's invisible once scrolled. The footer says "5v5 · Regular Season" — also below the fold.  
→ *Fix: Add a persistent "5v5" pill above the column headers, inside the table header row.*

**P2 — No stat glossary (methodology section)**  
Skaters and Goalies have methodology strips. Lines has nothing.  
→ *Fix: Add a minimal one-card methodology strip defining xGF%, xGF/60, xGA/60.*

**P2 — Min TOI filter is a range slider; Skaters uses a number input**  
Inconsistent control for the same filter type.  
→ *Fix: Standardize on range slider + numeric readout across all pages.*

---

### WOWY (`/stats/wowy`)

**P2 — xGF%, xGF/60, xGA/60 have no situation annotation**  
Same issue as Lines.

**P3 — Empty state doesn't explain why no data appears**  
When two players have insufficient shared TOI, "No qualifying data" gives no reason.  
→ *Fix: Expand to "Players must be current teammates with ≥50 min of shared 5v5 ice time."*

---

### Explore (`/stats/explore`)

**P1 — Uses ExploreSubnav instead of StatsSubnav**  
A user navigating from Skaters → Explore loses the stats subnav entirely and has no way back to Teams, Impact, or Records without the global nav.  
→ *Fix: Switch to StatsSubnav, or add a "← Stats" back link.*

**P2 — Scatter axis dropdown labels are too abbreviated**  
"EV Offense %" could mean a rate, a percentile, or something else. The tooltip reveals context but the dropdown is the first thing seen.  
→ *Fix: Expand dropdown option text: "EV Offense % (Percentile vs. Position)".*

---

### Impact (`/stats/impact`)

**P1 — Methodology cards are below the table, not above it**  
Users hit the leaderboard with no understanding of the scale. `+1.39` next to Podkolzin is meaningless without knowing 0 = league average.  
→ *Fix: Move a condensed one-line scale note above the table: "0 = league avg for position · +1.0 ≈ one goal equivalent above avg per game".*

**P2 — L10 Trend sparkline column gives no direction convention**  
Up-sloping vs. down-sloping, color change on rightmost dot — none of this is explained at the point of use.  
→ *Fix: Add "(↑ = improving)" to the column header or a visible legend dot above the first sparkline.*

**P2 — "Avg Impact" column doesn't communicate sign convention**  
Signed values (+/−) but the header is just "Avg Impact."  
→ *Fix: Add parenthetical "(vs avg)" or a +/− icon in the header.*

---

### Records (`/stats/records`)

**P1 — No above-fold orientation — blank masthead before a wall of table data**  
The masthead has only a one-line mono sub. No lede, no explanation of what the rankings mean, no definition of xGF%, no statement of which years are covered.  
→ *Fix: Add 3–4 sentences to the masthead card explaining what the table ranks and why xGF% matters.*

**P1 — "5v5 only" scope is in the masthead sub-line but absent from the table**  
Once a user scrolls past the masthead, there is no persistent label confirming the table is 5v5-scoped.  
→ *Fix: Add a "5v5" chip or watermark to the table section header.*

**P3 — Missing `.mast-corners` decoration**  
Every other stats page has the four corner bracket marks as a visual signature. Records skips them.  
→ *Fix: Add `<div class="mast-corners">` to the Records masthead.*

---

### Teams Index (`/stats/teams`)

**P2 — Strength toggle ("All Situations / 5v5") does not update the xGF% column label**  
After toggling to "All Situations," the column still reads `xGF%` with no qualifier. The sort key label doesn't reflect what was selected.  
→ *Fix: Dynamically set column header to `xGF% (5v5)` vs. `xGF% (All)` based on toggle state.*

**P2 — Season context not shown in the filter bar on default load**  
Page loads with current season active but no chip or label confirms which season is displayed. After toggling to Playoffs there is no visual confirmation the data switched.  
→ *Fix: Add an active season chip in the filter bar that updates on change.*

---

### Team Page (`/teams/[abbr]`)

**P1 — "Tonight" widget shows "Loading…" perpetually in the off-season**  
Most teams are eliminated. The widget occupies premium masthead real estate to show a loading state that never resolves.  
→ *Fix: Default text to "No game tonight". During playoffs, replace with series status: "CAR leads 3-1 vs VGK · Game 5 Tonight".*

**P2 — Overview card mixes 5v5 and all-sit in the same tile group without labels**  
GF/GA = all-situations, xGF/xGA = 5v5. The card meta says "5v5 · 2025–26" but it visually applies to all six KPIs.  
→ *Fix: Annotate GF/GA cells with "All Sit" and xGF/xGA cells with "5v5", or separate them into distinct rows with headers.*

**P2 — "Lines & Pairs" link card is visually orphaned between two dense tables**  
No section eyebrow, no grouping. Reads as an afterthought.  
→ *Fix: Promote to a proper section header with eyebrow label, or move to the sidebar.*

**P2 — EntitySignals renders invisibly when empty**  
The component slot produces a visible gap in spacing with no content and no placeholder.  
→ *Fix: Add a minimum visible state or conditionally suppress the section entirely.*

---

### Playoffs 2026 (`/playoffs/2026`)

**P1 — Series distribution bars have no legend**  
The colored percentage segments show game-length probability distribution, but there is no legend anywhere on the page. Completed series all show "100%" making the bars look like solid fills.  
→ *Fix: Add a legend below each card: "Win odds: [Team] in 4 · 5 · 6 · 7" or a hover tooltip.*

**P2 — Completed series cards look identical to in-progress cards**  
"100% win probability" is displayed as the primary data point for completed series — technically correct but misleading (implies a predicted sweep, not the actual series result).  
→ *Fix: Replace win% with "WON IN 5" or "4-1" as the primary data point on completed series.*

**P2 — Bracket hero and series cards section are visually disconnected**  
No round labels, no connective tissue between the bracket above and the card grid below. A user scrolling straight to the cards doesn't know they correspond to the bracket.  
→ *Fix: Add visible round headers above each group of cards: "Round 1 — Eastern Conference".*

**P3 — "Cup win probability" is a rough approximation, not labeled as such**  
Source comment explicitly calls this "rough approximation using 50/50 assumptions." The label just says "cup%."  
→ *Fix: Change label to "Est. Cup%" or "Rough Cup Odds".*

---

### Scoreboard (`/scoreboard`)

**P1 — Loading state is a blank cream canvas — looks broken**  
Renders entirely client-side. Before the first API response, the user sees an empty viewport. No skeleton, no spinner on the grid wrapper.  
→ *Fix: Show a centered spinner or skeleton grid in `#grid-wrapper` immediately on paint.*

**P1 — "Expected Goals" bar on game cards has no situation qualifier**  
Code comment acknowledges this is all-situations xG, not 5v5. The bar label just says "EXPECTED GOALS."  
→ *Fix: Change label to "xG (All Sit)" or add a persistent footnote: "xG = all-situations".*

**P1 — Empty state gives no navigation path**  
"NO GAMES TODAY / CHECK BACK TOMORROW" with no links, no suggestions, and the bottom bar hidden.  
→ *Fix: Add 2–3 contextual links in the empty state: "Recent Results", "Stats Leaderboard", "Playoff Bracket".*

**P2 — Ticker shows "⚡ LIVE" while content is still loading or frozen**  
The label is set in static HTML and only updated after JS resolves. On a no-game day it freezes on "⚡ LIVE" permanently.  
→ *Fix: Default the ticker label to "HGB" in the initial HTML. Let JS set LIVE/RECAP after the first successful fetch.*

---

### Results (`/results`)

**P1 — xG bar is unlabeled and uses grey ink instead of team colors**  
Every other xG bar on the site uses team colors. The Results page xG bar uses `var(--ink-32)` and `var(--ink-56)` — two shades of grey. At 3px height it reads as a visual divider, not data.  
→ *Fix: Use team colors on the bar halves. Increase height to 5px. Add a label.*

**P1 — xG bar has no situation qualifier**  
No label, no footnote, no context for whether the bar is 5v5 or all-sit.  
→ *Fix: Add "5v5 xG" or "xG (all-sit)" to the subtitle or as an inline bar label.*

**P2 — Game row cards have no team color accent**  
Every other game card on the site (home final-card, home result-card, scoreboard cards) has a team color accent bar. Results game rows are plain white with no color.  
→ *Fix: Add a 4px left-border or top accent bar to each game row using team colors, matching the pattern on `.final-card-bar`.*

**P3 — Subtitle says "7-day rolling window" but behavior is paginated fixed-week**  
"Rolling window" implies auto-updating. The actual behavior is paginated 7-day chunks.  
→ *Fix: Change subtitle to "Browse results by week".*

---

### Games Index (`/games`)

**P1 — The index page is effectively a dead end**  
Renders only "NO GAME SELECTED" and a "BROWSE RESULTS →" button. ~80% of the viewport is empty whitespace.  
→ *Fix: Render today's game schedule on page load using the same API call used in `[abbr].astro`. Fall back to the empty state only on fetch failure.*

---

### Analysis (`/analysis`)

**P2 — 2 articles renders as a sparse half-empty page**  
With only 2 items, the bottom 40% of the viewport is whitespace.  
→ *Fix: Feature the first article in a larger hero card above the list.*

**P2 — Tags are decorative — clicking them does nothing**  
Tags exist on each article but are non-interactive.  
→ *Fix: Wire `?tag=` URL param filtering client-side.*

**P3 — No footer element**  
Only page on the site with no footer at all.

---

### Methodology (`/methodology`)

**P2 — Dark mode tokens are different from every other page**  
`--bg: #1c1c1f` vs. the canonical `#0D0D14` used everywhere else. The page renders noticeably lighter/warmer in dark mode.  
→ *Fix: Align to the canonical token set.*

**P2 — Mobile sidebar (table of contents) is not accessible after collapsing**  
On screens under 900px, the sticky ToC collapses below all content — appearing only after the user has read the entire page.  
→ *Fix: Convert ToC to a "Jump to section" accordion at the top of the content area on mobile.*

---

## Cross-Cutting Issues

### CSS / Design System

**P1 — `:root` token block is copy-pasted into every page**  
Dark mode tokens have already drifted on the Methodology page. Any color change requires updates in 15+ places.  
→ *Fix: Extract to `src/styles/tokens.css`. Import once.*

**P2 — Masthead pattern is implemented 4+ different ways**  
Corner mark insets: 10px (Results), 16px (Home, Stats). Inner padding: 3 different values. Grid background: present on some pages, absent on others. Ghost watermark: Lines/WOWY only, not Skaters/Goalies.  
→ *Fix: Extract a `<Mast>` Astro component. Standardize corner mark inset to 16px.*

**P2 — Two distinct design eras visible within the stats leaderboard section**  
Skaters/Goalies = one visual identity. Lines/WOWY = a different one (ghost watermark, taller padding, wordmark footer). These are the same nav section.  
→ *Fix: Pick one pattern and apply to all four. The ghost watermark variant is more distinctive.*

**P2 — Filter chip components are not shared — `ctrl-btn-group` vs `lb-tab` vs `chip()`**  
Three separate implementations of the same chip/toggle pattern across Explore, Impact, and Skaters.  
→ *Fix: Extract a single `ChipGroup` React primitive used by all leaderboard pages.*

### Data Presentation

**P1 — xG situation context is missing site-wide**  
Summary of the problem:

| Page | xG Shown As | Situation Labeled? |
|------|-------------|-------------------|
| Home hero | "xG" | No |
| Scoreboard | "Expected Goals" | No (all-sit per code comment) |
| Results bar | (unlabeled) | No |
| Stats index team card | "xGF% 5v5" | Yes ✓ |
| Player shot map | "all situations" | Yes (buried) |
| Series xGF% bar | "5v5 Expected Goals" | Yes ✓ |
| Series G/xG tile | (unlabeled) | No (all-sit) |
| Skaters On-Ice | (no qualifier) | No |
| Lines | (no qualifier) | No |

**Proposed standard:** `xG (5v5)` when 5v5 confirmed, `xG (all)` when all-situations, never bare `xG` without a qualifier.

**P2 — `<title>` tags use inconsistent format**  
Team page: `{name} Stats — HGB Analytics` (em-dash, "HGB Analytics"). All others: `{Page} · HockeyGameBot` (middle dot). Pick one. Recommended: `{Page} · HockeyGameBot`.

---

## Screenshots

All screenshots captured June 8, 2026 at 1440px viewport from the live site (`hockeygamebot.com`).

```
docs/design-review/screenshots/
  home.png
  stats-index.png
  player-page.png          (Mitch Marner)
  series-page.png          (2026 SCF — CAR vs VGK)
  skaters.png
  goalies.png
  lines.png
  wowy.png
  explore.png
  impact.png
  records.png
  teams-index.png
  team-page.png            (CAR)
  playoffs-2026.png
  scoreboard.png
  results.png
  games-index.png
  analysis.png
  methodology.png
```
