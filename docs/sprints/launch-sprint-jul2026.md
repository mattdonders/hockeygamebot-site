# Launch Sprint — July 1, 2026

**Audit date:** June 15, 2026  
**Sources:** Claude Opus (UX/design/positioning), Claude Sonnet (breadth/data), + external models (pending)  
**Target:** Public launch July 1, 2026 (~2 weeks)

---

## Sprint scope

Two-tier split:

- **Must-fix (Week 1 target):** Data bugs, broken routing, embarrassing inconsistencies that would damage credibility on first visit
- **Polish (Week 2 target):** UX, navigation, design consistency, copy, SEO

---

## P0 — Must fix before launch

These are the things that would embarrass the site or destroy data trust on day one.

### 1. Goalie GSAx — same label, two different scopes
**What:** Hellebuyck hero tile shows `GSAx +7.15` (5v5, SA=1,546). Career table shows `GSAx +1.15` (all-situations, SA=2,374). Same column label, different values, different denominators. A visitor who notices will lose trust immediately.  
**Fix:** Add scope labels. Hero: `GSAx (5v5)`. Career table header: `GSAx (all sit.)`. Or standardize both to one scope and clearly label it once.  
**File:** `src/pages/stats/goalies/[slug].astro`

### 2. MacKinnon 2013-14 shows Rating% = 7%
**What:** Career table for MacKinnon shows `RATING % = 7%` for 2013-14 while WAR% and Impact% are 87%/86%. Almost certainly a parse bug (should be ~70%). Flagship player page, glaring wrong number.  
**Fix:** Investigate the rating percentile export for early seasons. Check `export_stats_data.py` and the career season percentile calculation.  
**File:** `hgb-analytics/scripts/export_stats_data.py` or `compute_hgb_rating.py`

### 3. Playoffs page stale + broken math
**What:** "Predictions updated Jun 1, 2026" on an active Stanley Cup Final (CAR leads 4-2 after game 6). Completed series show "Next Game TBD" instead of "Series Complete." Win% sidebar shows CAR 100%, MTL/COL 25% simultaneously (sums >100%).  
**Fix:** Either update playoff probabilities and normalize percentages, or clearly archive/label the page as a historical snapshot. At minimum fix the completed-series "TBD" label and the probability normalization.  
**File:** `src/pages/playoffs/2026.astro`

### 4. Teams page defaults to Playoffs (16 teams), header says "32 teams"
**What:** Page masthead says "32 teams · 2025-26" but the default tab is Playoffs which shows 16 teams. First visible content contradicts the headline.  
**Fix:** Default to Regular Season tab, or change the masthead to be dynamic based on selected tab.  
**File:** `src/pages/stats/teams.astro` (or the Teams React component)

### 5. Player/goalie clean slugs 404
**What:** `/stats/player/nathan-mackinnon` → 404 (only `nathan-mackinnon-8477492` works). `/stats/goalies/connor-hellebuyck` → 404 (only `connor-hellebuyck-8476945` works). Any external link without the numeric suffix is broken.  
**Fix:** Add a redirect: strip the trailing `-{id}` from incoming slugs, look up the canonical slug, and 307 to the full slug. Or add slug-without-id as an accepted `getStaticPaths` param that resolves to the right page.  
**Note:** The `.bak.20260612` file next to `[slug].astro` suggests recent churn — confirm routing is stable.  
**Files:** `src/pages/stats/player/[slug].astro`, `src/pages/stats/goalies/[slug].astro`

### 6. "Phase 2" internal label visible on /games
**What:** "On-ice xGF/xGA · Phase 2 HGB GIF" is visible to users on the game page. Internal dev terminology.  
**Fix:** Change to "On-ice xGF/xGA" or the feature's actual user-facing name.  
**File:** `src/pages/games/index.astro` (or game component)

### 7. "V1" watermark on /stats/skaters footer
**What:** `HOCKEYGAMEBOT.COM · HGB STATS · 2025–2026 · SKATERS V1` is visible as a page footer watermark. "V1" is internal versioning.  
**Fix:** Remove "V1" from the watermark.  
**File:** `src/pages/stats/skaters.astro`

---

## P1 — High impact polish (Week 1/2 overlap)

### 8. Homepage doesn't mention the analytics product
**What:** The homepage is entirely bot-centric (32 bots, card feed, game results). WAR, Rating, GSAx, WOWY, line combos — the site's real differentiator vs. NST/MoneyPuck — are completely invisible until you open the Stats dropdown. A stat-savvy fan referred from social has no idea deep analytics exist here.  
**Fix:** Add one homepage section that surfaces the analytics ("Player ratings, WAR, GSAx, line combos — every team") with direct links to key leaderboards. Doesn't need to be large — even a 2-row "Explore the data" strip changes the story.  
**File:** `src/pages/index.astro`

### 9. Metric naming is inconsistent — pick one vocabulary
**What:** The game-by-game performance metric is called three different things across pages:
- `/stats/impact` and leaderboard: "HGB Impact" / "HGBScore v2"  
- Player page footer note: "HGB Game Score"  
- Methodology page: not defined at all  

**Fix:** Pick one canonical name (recommend "HGB Game Impact" or just "Game Score") and use it everywhere. Add it to the methodology page.  
**Files:** `src/pages/stats/impact.astro`, `src/pages/stats/player/[slug].astro`, `src/pages/methodology.astro`

### 10. Lines + WOWY use old "HockeyGameBot Analytics" header
**What:** Lines and WOWY still use an older wordmark/header design. Skaters, Impact, Player, and Goalie pages use the current "HGB Stats" header system. Makes the stats section look like two different products.  
**Fix:** Migrate `lines.astro` and `wowy.astro` to the current header/masthead pattern from `skaters.astro`.  
**Files:** `src/pages/stats/lines.astro`, `src/pages/stats/wowy.astro`

### 11. Sub-nav "Series Records" links to wrong page
**What:** The sub-nav "Series Records" link → `/stats/records` (10-year historical database). The 2026 playoff series index is at `/stats/series` and is NOT in the sub-nav. Users clicking "Series Records" during the playoffs land on historical franchise data, not the 2026 series they're looking for.  
**Fix:** Either rename the sub-nav item to "Historical" and add a "2026 Series" item, or make it context-aware. Also: sub-nav disappears entirely once you're on a series detail page — add it back.  
**File:** Wherever `StatsSubnav` is defined

### 12. Sub-nav UX — order, grouping, redundancy
**What (flagged independently by both agents and user):** The sub-nav has three issues:
- Order isn't logical ("Impact" sits between Lines and Series Records, away from Skaters/Goalies it belongs with)
- All items are at the same hierarchy level — "WOWY" and "Series Records" appear equal to "Skaters"
- Duplicates the Stats dropdown in the main nav — two competing nav systems for the same pages

**Fix:** Reorder to group naturally (Skaters / Goalies / Teams | Lines / Impact / WOWY | Series). Consider visually separating core leaderboards from tools. Or rethink the whole sub-nav — this is the UX issue the user flagged in screenshot.  
**File:** `StatsSubnav` component

### 13. Sitemap only has 3 URLs
**What:** `sitemap.xml` contains only homepage, `/teams/`, `/project/`. 800+ player pages, all stats leaderboards, goalie pages, playoffs page — all missing. Zero organic search discovery for "Nathan MacKinnon WAR" type queries.  
**Fix:** Generate sitemap dynamically from `getStaticPaths` in the Astro build. Include all player pages, goalie pages, series pages, and main stats routes.  
**Files:** `src/pages/sitemap.xml.ts` (or equivalent sitemap generation file)

### 14. Impact page — no minimum GP filter, single-game players inflate top 10
**What:** Tristan Luneau (1 GP) appears in the top 10 with +2.13 Impact. No "min GP" filter is visible on the Impact page. The Skaters leaderboard has min 20 GP but Impact doesn't enforce it consistently.  
**Fix:** Add a default minimum (suggest 5 GP) to the Impact leaderboard, or add a visible filter control matching the Skaters page pattern.  
**File:** `src/pages/stats/impact.astro`

---

## P2 — Polish and nice-to-have (Week 2)

### 15. Account page is a dead end after login
After signing in, users see only "Signed in · Free account / Sign out" with no links, no tracked teams, no explanation of what an account gets you. The support page says "Perks and supporter features are coming" with no specifics.  
**Fix:** Add a short "what you get / what's coming" section on the account page. Link to tracked-teams personalization if it exists.

### 16. Onboarding for metrics is buried
The methodology page is good but lives at Analysis → Methodology (2 levels deep). The leaderboard glossaries at page bottom are good. What's missing: a "What is HGB Rating?" one-liner near the player page hero tile or the leaderboard title.  
**Fix:** Add a tooltip or small glossary link near each metric header on the leaderboard and player page.

### 17. "Series Records" and "WOWY" naming
"WOWY" is an insider acronym. On the sub-nav it appears with no expansion. The series page uses "Series Records," "Series Records," and "2026 Playoff Series" in three different places.  
**Fix:** Expand WOWY to "With/Without (WOWY)" on first use. Standardize "Playoff Series" naming.

### 18. Skaters table renders "0 skaters" in SSR HTML
Before React hydrates, the table shows "0 skaters match the current filters." Crawlers index this state.  
**Fix:** Add a skeleton/loading state in the static HTML that's visually distinct from the real empty state.

### 19. ARI still appears in team filters
Arizona Coyotes are now Utah HC (UTA). Historical data legitimately has ARI, but showing it in current-season filters is confusing.  
**Fix:** Filter ARI out of current-season team dropdowns (keep in historical ranges).

### 20. `player_count: 0` in `_meta.json`
The metadata field that should report 715 players shows 0. Pipeline health data isn't populating correctly even when the underlying data is fine.  
**Fix:** Check the `export_stats_data.py` meta section — this field was likely not wired up after a schema change.

### 21. Analysis section has only 2 articles
Both are playoffs-only content from May-June 2026. A visitor to /analysis sees almost nothing.  
**Post-launch:** Add 2-3 offseason methodology/explainer articles.

### 22. Game page `<title>` never updates
`Game · HockeyGameBot` for every game regardless of teams or state. Usability and SEO issue for the SPA.

### 23. "Find your team bot →" CTA on /support doesn't link anywhere
The CTA exists but the link destination is missing.

---

## What's working — don't break it

- **Player pages** — composite percentile hero tiles, shot map, season trend, game log, similar players panel. Genuinely better UX than NST spreadsheet aesthetic.
- **Goalie pages** — GSAx breakdown by shot difficulty, bin analysis, career table.
- **Sample-size guards** — min 20 GP, min 500 SA, <50 min → no data. Correctly surfaced everywhere.
- **CSV/PNG export** on every leaderboard.
- **Freshness timestamps** ("updated Jun 15, 2026") on all data pages.
- **Methodology page** — honest, clear, doesn't overclaim. Keep.
- **Passwordless auth** — right pattern for this audience.
- **Stats glossaries** at page bottom — well-written.

---

## Sprint schedule (rough)

| Week | Focus |
|------|-------|
| Jun 16–20 | P0 data bugs (#1-7), sub-nav routing fix (#11), sitemap (#13) |
| Jun 21–25 | P1 UX (#8-12, #14), sub-nav redesign |
| Jun 26–28 | P2 polish, final QA pass, external model feedback integration |
| Jun 29–30 | Staging review, launch checklist, go/no-go |
| Jul 1 | 🚀 |

---

## Pending
- External model audit results (ChatGPT / Gemini / Grok) — user running manually from ZIP bundle
- Methodology page — Impact/Game Score definition missing (P1 #9)
- Cloudflare WAF — verify og: unfurlers (Twitter/Bluesky/Discord) aren't blocked (Opus finding #4)
