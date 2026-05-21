# Engineer Briefing — Line/Pair Detail Page

**Filed:** 2026-05-21
**Repo:** `hockeygamebot-site` (rewrite branch)
**Reference design:** screenshot from nhl.hockey-statistics.com line tool (saved separately; included with brief)
**Status:** Open, ready to execute

---

## What you're building

A new detail page on `/stats/lines/{slug}` (or `?players=A,B,C` — your call on URL pattern) that drills into a specific line or D-pair combination with comprehensive stats + offensive/defensive zone heat maps.

Triggered by clicking any row in the existing `/stats/lines` table.

## Reference design

The provided screenshot from `nhl.hockey-statistics.com` shows the structure to match:
- Header bar with line filter context ("Season · playoffs · 5v5 · Totals · xG_F · Fenwick · Vs. Team · All zones")
- Player headshots + names + positions (3 for forward lines, 2 for D-pairs)
- KPI strip: GP / TOI / GF / GA / GF% / XGF / XGA / XGF% / PDO (9 cells)
- Side-by-side defensive + offensive zone heat maps with zone-bucketed event counts
- Middle column with stat breakdown by category (Corsi / Fenwick / Shots / xG / Goals / PDO)
- Branded watermark bottom-right

**Match the STRUCTURE, not the visual style.** Apply HGB design language: cream/ink palette, Barlow Condensed, red accents (NOT the dark theme from the reference). Keep the heat-map rink layouts; restyle the colors to match HGB tokens.

## URL pattern (your call)

Two reasonable options:

**A. Path-based:** `/stats/lines/{line-slug}` where slug is like `caufield-slafkovsky-suzuki-mtl`
- Pros: clean, shareable, SEO-friendly
- Cons: slug generation logic + collision handling

**B. Query-string:** `/stats/lines/detail?players=8479394,8482124,8477934`
- Pros: trivial generation, no collision concern
- Cons: ugly URLs

Recommend A for shareability. Both teams + season + game_type included in the slug (e.g., `mtl-caufield-slafkovsky-suzuki-2025-26-playoffs`).

## Required sections (top to bottom)

### 1. Filter context bar
Identical pattern to the existing `/stats/lines` filter chips (PLAYOFFS / FORWARDS / MIN TOI / SORT). Add additional context: "Season 2025-26 · Playoffs · 5v5" etc.

### 2. Player identity strip
- Player headshot for each player (3 forwards or 2 defensemen)
- Name + position below each headshot
- Headshot source: NHL CDN at `assets.nhle.com/mugs/nhl/20252026/{TEAM}/{player_id}.png`

### 3. KPI strip
9 stat cells in a horizontal row:
- GP (games played as a unit)
- TOI (minutes together)
- GF / GA (goals for/against)
- GF% (goals percentage)
- XGF / XGA (expected goals for/against)
- XGF% (expected goals percentage)
- PDO (SV% + SH%)

Color-coding: GF% and XGF% cells should match the existing `/stats/lines` red/green threshold logic (≥55% green, ≤45% red).

### 4. Heat maps (defensive + offensive zones)
Two rink visualizations side-by-side showing event distribution by zone:
- Defensive zone (where the line was defending)
- Offensive zone (where the line attacked)
- Each zone bucketed and labeled with event count (per the reference)
- Color intensity reflects density (more events = more saturated)

Use SVG for the rink (probably already have rink SVG assets from the shot maps on game pages). Layer zone buckets on top.

**Heat map data source:** filter `shots` table by the on_ice_rosters joining player IDs from this line. Bucket by x/y coordinates into zone polygons. Sum events per zone.

### 5. Stat breakdown column (between heat maps)
Six stat-block cards stacked vertically:
- **Corsi:** CA, CF%, CF
- **Fenwick:** FA, FF%, FF
- **Shots:** SA, SF%, SF
- **xG:** XGA, XGF%, XGF
- **Goals:** GA, GF%, GF
- **PDO:** SV%, PDO, SH%

### 6. Branded watermark
"Created on hockeygamebot.com" or HGB logo in bottom-right corner. Same styling as the existing Lines & Pairs export.

## Click-through from existing /stats/lines table

Each row in the existing table becomes clickable (cursor: pointer, hover state). On click, navigate to the detail page for that line.

## PNG export

Apply the same canvas-direct PNG export pattern from the existing Lines page. The whole detail page (filter context + KPI strip + heat maps + stat breakdown) renders to a single shareable PNG.

This makes individual line/pair findings tweetable as a self-contained visual asset — much richer than the current Lines & Pairs table screenshot.

## Out of scope (do NOT build)

- Comparing two lines side-by-side (defer to v1.1)
- Time-series of a line's performance over the season (defer to v1.1)
- Line synergy / WOWY analysis (separate feature, separate scope)
- Editable filters on the detail page itself (the filter context from /stats/lines is inherited; if user wants different filters, they navigate back)
- Auto-populating "similar lines" recommendations

## Acceptance criteria

- [ ] Click any row on `/stats/lines` → opens the corresponding detail page
- [ ] All 9 KPI cells populated correctly
- [ ] Heat maps render with zone buckets visible + event counts labeled
- [ ] Player headshots load (graceful fallback if missing)
- [ ] Stat breakdown column shows all 6 categories
- [ ] PNG export works, includes all sections
- [ ] Light AND dark mode render correctly
- [ ] Mobile rendering: heat maps stack vertically, KPI strip wraps
- [ ] URL is shareable — pasting the URL into a fresh browser tab loads the same line

## Time budget

~5-8 hours. Heat map zone-bucketing is the heaviest lift; KPI strip + stat breakdown are quick once the data layer is wired.

## Data source notes

- **Line aggregates:** `lines.json` (already has GP, TOI, xGF, xGA, GF, GA, etc.) — primary source
- **Heat map zone events:** query `shots` table directly via `on_ice_rosters` join filtered to all members of the line being on the ice at 5v5. Bucket by x/y coordinates.
- **Player headshots:** NHL CDN, no auth required: `https://assets.nhle.com/mugs/nhl/20252026/{TEAM}/{player_id}.png`

## Voice + style reference

Match the existing site design system. **Do NOT use the dark theme from the reference screenshot** — that's their brand, not ours. Apply HGB tokens:
- Cream background (#EFEEE8 or whatever the established cream is)
- Barlow Condensed for all headers
- JetBrains Mono for numbers
- Red accents for highlighting (>55% xGF%, etc.)
- Brand language consistent with /stats/lines, /stats/skaters, /stats/goalies

## Reporting back

When done:
1. Live URL to the detail page (with sample line, e.g., Caufield/Slaf/Suzuki MTL playoffs)
2. Live URL with a D-pair sample (e.g., Carrier/Matheson MTL playoffs)
3. Screenshot of light + dark mode
4. PNG export sample
5. Any architectural choices that diverge from this brief (especially around heat map rendering)
6. Mobile rendering screenshot

Don't ship if heat maps don't render correctly — better to surface that and discuss than to launch with broken visuals. The heat maps are the differentiator vs every other stats page.
