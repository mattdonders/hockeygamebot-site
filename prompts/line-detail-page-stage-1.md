# Engineer Briefing — Line/Pair Detail Page (Stage 1 of 3)

**Filed:** 2026-05-21
**Repo:** `hockeygamebot-site` (rewrite branch)
**Status:** Open, ready to execute. This is Stage 1 of a 3-stage build. Don't add Stage 2/3 features in this PR.

---

## Context — why staged

The full spec for this page (see `prompts/line-detail-page.md`) is comprehensive. We're shipping it in 3 stages instead of one to:
1. See real output faster (~1.5 hours vs ~5-8)
2. Let Matt course-correct after seeing Stage 1 before building heat maps
3. Avoid feeling like a 1:1 copy of an existing site by building OUR version incrementally

## Stage 1 scope (THIS ticket)

Build the detail page foundation:
1. **New route** `/stats/lines/{slug}` (path-based; generate the slug from team + sorted player last names + season + game_type, e.g., `mtl-caufield-slafkovsky-suzuki-2025-26-playoffs`)
2. **Click-through** from `/stats/lines` rows — each row becomes clickable, navigates to the detail page for that line
3. **Player identity strip** — for each player on the line, show:
   - Headshot from NHL CDN: `https://assets.nhle.com/mugs/nhl/20252026/{TEAM}/{player_id}.png`
   - Player name (full, "Cole Caufield" not "C. Caufield")
   - Position (L / C / R / D)
4. **KPI strip** — 9 stat cells in a horizontal row:
   - GP (games played as a unit)
   - TOI (total minutes together)
   - GF / GA
   - GF% (goals percentage)
   - XGF / XGA
   - XGF% (expected goals percentage)
   - PDO (computed from SV% + SH% or just `SV% + SH%`)
5. **Filter context bar** at the top — same chip pattern as `/stats/lines` showing what slice this is (PLAYOFFS / 5V5 / etc.)
6. **PNG export** — same canvas-direct pattern as `/stats/lines`, exports the visible page (filter chips + player strip + KPI strip + HGB watermark)

## NOT in Stage 1

- Heat maps (Stage 3)
- Stat breakdown column with Corsi/Fenwick/Shots/xG/Goals/PDO blocks (Stage 2)
- Time-series of line performance (deferred indefinitely)
- Compare-two-lines UI (deferred)

## Design language

- Cream/ink palette (existing HGB tokens)
- Barlow Condensed headers
- JetBrains Mono numbers
- Red/green threshold cells on GF% and XGF% (same logic as `/stats/lines`)
- HGB watermark bottom-right (same red chip styling as `/stats/lines` export)

**Do NOT use the dark theme from the nhl.hockey-statistics.com reference.** Match HGB's existing design system across the rest of /stats/*.

## URL pattern

Path-based: `/stats/lines/{slug}`

Slug rules:
- Lowercase
- `{team-abbr}-{lastname1}-{lastname2}-{lastname3}-{season}-{game-type}`
- Example: `mtl-caufield-slafkovsky-suzuki-2025-26-playoffs`
- Diacritic-safe (strip diacritics for slug, e.g., "slafkovsky" not "slafkovský")
- D-pair example: `car-blake-miller-2025-26-playoffs` (2 names instead of 3)

## Acceptance criteria

- [ ] Click any row on `/stats/lines` → navigates to detail page
- [ ] All 9 KPI cells render correctly with HGB threshold colors
- [ ] Player headshots load (graceful fallback to silhouette if missing)
- [ ] Filter context bar matches the source `/stats/lines` view (Playoffs vs Regular Season carries through)
- [ ] PNG export works and includes everything
- [ ] Light + dark mode render correctly
- [ ] Mobile rendering: KPI strip wraps to 2 rows on narrow screens
- [ ] URL is shareable: opening the slug URL directly in a fresh browser tab loads the detail page

## Time budget

~1.5 hours. KPI strip is mostly existing data from `lines.json`; new code is the route + slug logic + headshot fetching + click-through wiring.

## After Stage 1 ships

Matt reviews. Decision points:
1. Does the foundation look right? If yes → proceed to Stage 2 (stat breakdown blocks).
2. Does it feel like its own thing or a derivative? Adjust before adding more layers.
3. Anything about the layout that should change at the foundation level? Better to catch now than after Stage 2/3.

When done, post:
- Sample URL for a forward line (e.g., MTL Caufield/Slaf/Suzuki playoffs)
- Sample URL for a D-pair (e.g., CAR Blake/Miller playoffs)
- Screenshots: light + dark + mobile + PNG export
- Any architectural decisions worth flagging before Stage 2 starts

Don't start Stage 2 until Matt approves Stage 1.
