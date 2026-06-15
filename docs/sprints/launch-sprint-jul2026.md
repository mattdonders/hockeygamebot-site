# Launch Sprint — July 1, 2026

**Audit date:** June 15, 2026  
**Sources:** Claude Opus (UX/design), Claude Sonnet (breadth/data), ChatGPT (full site + player pages), Gemini (full site + cards)  
**Target:** Public launch July 1, 2026 (~2 weeks)

---

## Consensus findings (flagged by 3+ sources — highest confidence)

These came up independently across multiple audits. Fix first.

| # | Issue | Sources |
|---|-------|---------|
| 1 | Homepage doesn't communicate the analytics product | All 4 |
| 2 | Sub-nav placement/UX is wrong | All 4 |
| 3 | Games page empty state looks unfinished | ChatGPT, Gemini, Sonnet |
| 4 | WOWY empty state needs examples/defaults | ChatGPT, Gemini, Opus |
| 5 | Metric naming inconsistent (Impact vs HGBScore v2 vs Game Score) | Opus, Sonnet, ChatGPT |
| 6 | Account page dead end — no value prop | ChatGPT, Gemini, Opus, Sonnet |
| 7 | Mobile filter density too heavy on stats pages | ChatGPT, Gemini, Sonnet |
| 8 | Small/light text contrast issues (metadata, legends, footnotes) | ChatGPT, Gemini |
| 9 | Glossary/methodology path buried too deep | All 4 |
| 10 | Filter/metadata mismatches (reg season label when playoffs active) | ChatGPT, Gemini |

---

## P0 — Must fix before launch

Data bugs and broken routing that destroy credibility or trust on first visit.

### 1. MacKinnon 2013-14 shows Rating% = 7%
WAR% and Impact% for the same season are 87%/86%. Parse bug — likely should be ~70th percentile.  
**File:** `hgb-analytics/scripts/export_stats_data.py` or `compute_hgb_rating.py`  
**Signal:** Claude Opus (flagged as P0)

### 2. Goalie GSAx — hero vs career table show different scopes, same label
Hero: `GSAx +7.15` (5v5, SA=1,546). Career table: `GSAx +1.15` (all-situations, SA=2,374). Same label, different values. Trust-breaking.  
**Fix:** Label hero as `GSAx (5v5)` and career table as `GSAx (all sit.)` — this is a labeling fix, not a data fix.  
**File:** `src/pages/stats/goalies/[slug].astro`  
**Signal:** Opus + Sonnet

### 3. Playoffs page — stale timestamp + completed series say "Next Game TBD"
"Predictions updated Jun 1" on an active Stanley Cup Final. All finished series show "Next Game TBD" instead of "Series Complete." Probability math sums >100%.  
**Fix:** Update probabilities + normalize math. Change "Next Game TBD" to "Series Complete" for finished series. Or clearly archive/label the page.  
**File:** `src/pages/playoffs/2026.astro`  
**Signal:** Opus + Sonnet + ChatGPT

### 4. Teams page defaults to Playoffs tab — header says "32 teams"
First visible content contradicts the headline. Default should be Regular Season.  
**File:** `src/pages/stats/teams.astro`  
**Signal:** Sonnet

### 5. Clean slugs 404
`/stats/player/nathan-mackinnon` → 404. `/stats/goalies/connor-hellebuyck` → 404. Any external link without the numeric ID suffix is broken.  
**Fix:** Add slug-without-ID redirect or accept both formats in `getStaticPaths`.  
**Files:** `src/pages/stats/player/[slug].astro`, `src/pages/stats/goalies/[slug].astro`  
**Signal:** Opus + Sonnet + ChatGPT (initially thought pages were broken entirely)

### 6. "Phase 2" internal label on /games
"On-ice xGF/xGA · Phase 2 HGB GIF" is visible to users.  
**Fix:** Remove "Phase 2".  
**File:** Games page component

### 7. "V1" watermark on /stats/skaters footer
`SKATERS V1` is internal versioning, not user-facing copy.  
**Fix:** Remove "V1".  
**File:** `src/pages/stats/skaters.astro`

### 8. Goalie card — blank headshot circle on image failure
Empty gray circle is the fallback when goalie image doesn't load. Reads as a rendering bug on social.  
**Fix:** Fallback to team logo, initials, or remove the circle entirely.  
**Signal:** ChatGPT (flagged post player-page review)

---

## P1 — High impact (Week 1/2)

### 9. Homepage doesn't communicate the analytics product ⭐ CONSENSUS
The homepage is entirely bot/game-centric. WAR, Rating, GSAx, WOWY, line combos — the real differentiator — are invisible until the Stats dropdown. On a July 1 launch with no games, the homepage reads as "No games today."  
**Fix:** Add one homepage section that surfaces the analytics ("Player ratings, WAR, GSAx, line combos — every team") with direct links. Suggestions from audits: top 5 Impact skaters from last night, WAR leaders mini-strip, 4 entry points (Skater Ratings / Goalie GSAx / Playoff Series / Search Player).  
**File:** `src/pages/index.astro`  
**Signal:** All 4 audits

### 10. Sub-nav UX redesign ⭐ CONSENSUS
Issues flagged by every source:
- Placement below the hero makes it feel disconnected and it disappears when scrolling
- Order isn't logical (Impact between Lines and Series Records, away from Skaters/Goalies)
- "Series Records" links to wrong page (`/stats/records` historical database, not `/stats/series` 2026 playoff index)
- Disappears entirely on series detail pages
- Duplicates the Stats dropdown

**Fix options:** Move sub-nav above the hero or make it sticky. Reorder: Core (Skaters / Goalies / Teams) → Tools (Lines / Impact / WOWY) → History (Series). Rename "Series Records" → "Playoff Series" or split. Add it back to series detail pages.  
**Signal:** All 4 audits + user (flagged before audit)

### 11. Metric naming — pick one vocabulary
Same concept called 3 things across the site: "HGB Impact" / "HGBScore v2" / "HGB Game Score." Methodology page defines only WAR and Rating, not Impact/Game Score at all.  
**Fix:** Pick one name (recommend "Game Score" or "HGB Impact"). Define it on the methodology page. Use it everywhere.  
**Files:** `src/pages/stats/impact.astro`, `src/pages/stats/player/[slug].astro`, `src/pages/methodology.astro`  
**Signal:** Opus + Sonnet + ChatGPT

### 12. Percentile columns using "%" creates confusion with actual percentages
`RATING %` and `WAR %` columns sit next to `xGF%` (55.9%) — same `%` symbol, completely different meaning. A user reads "WAR % = 100%" and doesn't know if it's a percentile or a share metric.  
**Fix:** Change column headers to `Rating Pct`, `WAR Pct`, `Impact Pct`. Show raw integers (99, 100) not 99%, 100%.  
**Signal:** ChatGPT + Gemini  
**Files:** `src/pages/stats/player/[slug].astro`, career table section

### 13. "Similar Forwards" label is misleading
Players listed are similar by WAR bucket, not stylistically. McDavid comps by WAR won't look like McDavid stylistically.  
**Fix:** Rename to "Closest WAR Comps" or "Nearest by WAR."  
**Signal:** ChatGPT

### 14. Games page empty state
"No game selected" with one button in a large blank canvas. Looks unfinished, not a feature.  
**Fix:** Default to showing a recent results list or date picker. Add a one-liner: "Select a game to view win probability, xG flow, events, and on-ice data."  
**Signal:** ChatGPT + Gemini + Sonnet

### 15. Lines + WOWY use old "HockeyGameBot Analytics" header
Two pages still use an older header design generation. Looks like a different product from Skaters/Impact/Player pages.  
**Files:** `src/pages/stats/lines.astro`, `src/pages/stats/wowy.astro`  
**Signal:** Opus

### 16. WOWY empty state needs examples
Just a search bar — no hints, no default pairings, no explanation of what WOWY shows.  
**Fix:** Add 3-4 suggested pairings (McDavid + Draisaitl, MacKinnon + Rantanen, etc.). Add one-liner: "Compares how two players perform together, apart, and when neither is on ice."  
**Signal:** ChatGPT + Gemini

### 17. Sitemap has only 3 URLs
Homepage, `/teams/`, `/project/`. 800+ player pages, all stats pages, goalie pages, playoffs — all missing. No organic search discovery.  
**Fix:** Generate sitemap from `getStaticPaths` in the Astro build.  
**Signal:** Opus + Sonnet

### 18. Impact page — no minimum GP filter, single-game players inflate top 10
Tristan Luneau (1 GP) in the top 10 with +2.13 Impact.  
**Fix:** Default min 5 GP on Impact leaderboard, or add a visible filter control.  
**File:** `src/pages/stats/impact.astro`  
**Signal:** Sonnet

### 19. Positive green text contrast in game log
Negative impact numbers use dark red (pops). Positive impact values use bright green that bleeds into the cream background.  
**Fix:** Darken the positive green to a forest/hunter shade for WCAG contrast compliance.  
**Signal:** Gemini (post player-page review)

### 20. "lg" abbreviation on goalie cards/pages
"lg" as "league average" is not self-explanatory to non-regulars.  
**Fix:** Spell out "league avg" in small type.  
**Signal:** ChatGPT (post goalie-page review)

---

## P2 — Polish (Week 2)

### 21. Account page — explain the value of signing in
Currently just "Sign in · Free account · Sign out" after login. No tracked teams, no saved filters, no "here's what you get" panel.  
**Fix:** Add a "What you get / What's coming" section: followed teams, saved filters, personalized dashboard.  
**Signal:** All 4 audits

### 22. Methodology/glossary path buried
Good content (WAR, Rating, xG, RAPM definitions) but hidden under Analysis → Methodology. Leaderboard bottom glossaries are good — need surface-level links near metric headers.  
**Fix:** Add "What is HGB Rating?" link near hero tile on player page. Add tooltip or glossary anchor near each metric header.  
**Signal:** All 4 audits

### 23. Mobile filter density
On mobile stats pages, filters consume most of the screen before the user sees any data. Tab bar also wraps on narrow screens.  
**Fix:** Collapse advanced filters by default on mobile. Show table immediately.  
**Signal:** ChatGPT + Gemini + Sonnet

### 24. Mobile table horizontal scroll affordance
No visual hint that tables scroll horizontally on mobile. A right-side inner shadow or "← swipe →" label would help.  
**Signal:** Gemini

### 25. Teams page — add L10 sparklines or visual rank indicators
Current state is a flat spreadsheet. Even simple sparklines would make it more scannable.  
**Signal:** Gemini

### 26. ARI still appears in team filters
Arizona Coyotes relocated → Utah HC (UTA). Historical data legitimately has ARI but shouldn't appear in current-season dropdowns.  
**Signal:** Sonnet

### 27. `player_count: 0` in `_meta.json`
Pipeline health metadata field broken.  
**Signal:** Sonnet

### 28. Min TOI slider styling on Lines page
The red range slider feels disconnected from the flat, premium aesthetic of the rest of the UI.  
**Signal:** Gemini

### 29. Game page `<title>` never updates
Always "Game · HockeyGameBot" regardless of teams or state. SEO + bookmarking issue.  
**Signal:** Sonnet

### 30. Analysis section has only 2 articles
Both playoffs-only. Looks thin for a launch.  
**Post-launch:** Add 2-3 offseason explainers (methodology, RAPM primer, season preview).

### 31. "Find your team bot →" CTA on /support doesn't link anywhere
CTA exists but the destination is missing.  
**Signal:** Sonnet

---

## What's working — don't break it

Consensus positives across all 4 audits:

- **Player pages** — hero tiles, shot map, season trend, game log, similar players. ChatGPT: "These are not a launch-blocker — they're a major strength."
- **Goalie pages** — GSAx by difficulty tier, zone breakdown, career table. Genuinely better than NST.
- **Social card system** — multiple card types is an exceptional viral growth feature. Vertical bar card is the strongest format.
- **Support/About page** — "One person. 32 bots." + exact cost breakdown builds trust. Gemini: "This is fantastic."
- **Stats leaderboard tables** — design, sort, CSV/PNG export, filter depth.
- **GSAx cumulative chart** on goalies page — immediate visual differentiator.
- **Sparklines on Impact page** — "something competitors don't usually present this cleanly" (Gemini).
- **Methodology page** — honest, clear, doesn't overclaim.
- **Passwordless auth** — right pattern for this audience.
- **Bottom glossaries** on leaderboards — well-written.
- **Freshness timestamps** ("updated Jun 15, 2026") — present everywhere.
- **Sample-size guards** — min 20 GP, min 500 SA. Flagged as trust-builders by 3 audits.

---

## Card audit notes (Gemini + ChatGPT)

**Vertical vs horizontal card:**
- Gemini: vertical clearly wins — natural reading pattern, bars scan in one direction
- ChatGPT: keep both — vertical = "clean profile," horizontal = "readability-first for Discord/desktop social"
- Recommendation: keep both, but optimize the vertical as the default/primary export

**Single-season EDGE card:**
- Both audits flagged the right panel as visually overloaded (bars + split bars + progress meters + text)
- Fix: create a clear visual split — left = HGB Model Profile, right = NHL Edge Tracking — with unified grid alignment on the right

**WAR/Impact blocks on vertical card** (ChatGPT):
- Currently show only "2025-26" under the percentile in the top modules
- Add raw values: `99% / +3.92 WAR`, `100% / +2.30 GS avg`

---

## Sprint schedule

| Period | Focus |
|--------|-------|
| Jun 16–18 | P0 data bugs (#1-8): MacKinnon rating, goalie label, playoffs, teams default, clean slugs, internal labels, card fallback |
| Jun 19–22 | P1 UX: Homepage analytics section (#9), sub-nav redesign (#10), metric naming (#11), percentile labels (#12), games page (#14) |
| Jun 23–25 | P1 continued: Lines/WOWY header migration (#15), WOWY examples (#16), Impact min GP (#18), contrast fixes (#19) |
| Jun 26–27 | P2 polish: Account value prop, mobile filters, sitemap, remaining label fixes |
| Jun 28–29 | QA pass, cross-browser/mobile device check, external model follow-up (Grok pending) |
| Jun 30 | Staging review, go/no-go decision |
| Jul 1 | 🚀 |

---

## Pending

- Grok audit (service was down — retry)
- External model follow-up: send corrected player/goalie screenshots to ChatGPT/Gemini ✅ (done — integrated above)
- Cloudflare WAF check: verify og: unfurlers (Twitter/Bluesky/Discord/iMessage) are not blocked
- MacKinnon 2013-14 rating bug: root cause investigation in pipeline scripts
