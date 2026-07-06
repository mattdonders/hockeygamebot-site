# hockeygamebot-site TODO

## Known Issues

- [ ] WSH/NYR random WP dip — single bad data point, user chose not to fix unless cause is obvious
- [ ] Rangers blowout: late-game goals showing +0.0% WP delta when model is already near 100% ceiling
- [ ] **Leaderboards scatter margins** (`/stats/leaderboards` xG×Finishing plot): dots cluster upper-right, leaving large empty lower-left dead zone. The real fix is a proper axis range trim or log/sqrt x-scale — `preserveAspectRatio="none"` and `xMin=min*0.85` didn't resolve it visually. Defer to SS-7 or a dedicated scatter polish pass.
- [ ] **Elo-flip series_id duplication on `series_predictions`** (recurring during 2026 R1/R2): when an underdog wins a series, their Elo can overtake the higher-seed team mid-series, which flips the `_series_id_for(hs, ls)` order in `scripts/playoff_morning_predictions.py` (Python bot) and creates a NEW row instead of updating the existing one. Manual D1 deletes done for `pit-phi`, `edm-ana`, `dal-min`, `tbl-mtl` so far. Fix options: (a) make `_series_id_for()` use alphabetical-sort key — `f"{min(a,b)}-{max(a,b)}"` — so the id is stable across Elo flips, or (b) migrate to NHL bracket letter (`series_a`, `series_b`, …) as the stable id. Site-side defensive fix during rewrite: dedupe by team-pair frozenset when building `SERIES` so a stale row never duplicates a card on the page.
- [ ] **No "no games" empty state on the goal ticker** (`index.astro` `fetchGoals`, `scoreboard.astro` `fetchGoals`/`fetchYesterdayGoals`): both fall back today→yesterday, but if *both* days have zero goals (an off day between series games), the ticker never renders and the static placeholder markup (`index.astro`'s empty `#ticker-track`, `scoreboard.astro:461` "Loading game data…") just sits there forever instead of showing an explicit "no games today" message. Confirmed pre-existing during D1-11/D1-12 QA (2026-07-06), not caused by that migration — `getGoals()`'s behavior is unchanged from the pre-migration code.
- [ ] **`/games/[gameId]` throws "gameId is not defined"** — confirmed broken for a few weeks per user, unrelated to the D1-11/D1-12 shared-client migration (same error reproduces on `main`). Needs its own investigation/fix pass.

## Pending Action Items

- [ ] **Mathematical hero alignment (card centering)** — replace the hardcoded y-offsets in the player Talent+Shotmap hero (and ideally all card heroes) with measured centering: `ctx.measureText().actualBoundingBoxAscent/Descent` → sum `eyebrow + gap + number + gap + sublabel`, center that stack in the hero region. Auto-centers for any value (95% / 100% / —). First attempt (commit `4d5bcd3`) mis-positioned the big number OVER the eyebrow on the LIVE card and was reverted (`ecd2595`) — likely font-not-loaded-when-measured or a descent-handling bug. Redo carefully and **render-test before shipping** (await `document.fonts`, verify across 1/2/3-char values). Target: week of 2026-07-07.
- [ ] **Denser single-year card story** ("what's next" — build from what's *ours*, not JFresh's): the single-season card blurs with the multi-year Talent card because they share a layout; JFresh differentiates via AllThreeZones *manual tracking* micro-stats we don't have. Our untapped edge = **NHL Edge** micro-data (already on the Season card) + **shot-level data** (coordinates, danger zones, shot types, rebound sequences in `data/shot_sequences.json`). Lean into that for a distinctly-HGB dense single-year layer.
- [ ] **Sync Kraken (SEA) color in the BOT repo**: applied `#99D9D9 → #355464` (Boundless Blue) to site `team-colors.ts` + `public/js/hgb-charts.js`; the canonical `utils/team_details.py` in the **hockeygamebot bot repo** still needs the same one-liner (comment in team-colors.ts flags all 3).
- [ ] **`/admin/player-compare` age** still computes season-based — point it at `src/lib/age.ts` `ageFromBirthDate()` for consistency (player + goalie pages/cards already switched to today-based).
- [ ] **Add 4am ET cron on hgb-prod**: `0 8 * * * /Users/hgb/.virtualenvs/hockeygamebot/bin/python /Users/hgb/hockeygamebot/scripts/playoff_morning_predictions.py >> /Users/hgb/hockeygamebot/logs/playoff_morning.log 2>&1` (server TZ is UTC, 08:00 UTC = 04:00 ET)
- [ ] **Smoke test the full playoff data flow** end-to-end after a real playoff game: GAME_END piggyback fires → D1 upsert visible at `GET /v1/playoffs/round/1` → site modal reflects new WP within seconds
- [ ] **Commit the GAME_END piggyback in `generate_playoff_series_card.py`** (Python bot) — staged locally but not committed with session's other changes because the file had pre-existing uncommitted Discord webhook WIP mixed in. User needs to resolve the webhook (either commit it consciously or remove) before pushing the piggyback.

## V3 Prediction Model Roadmap (offseason)

- [ ] Bootstrap CI grid search for V1 Elo hyperparameters (current K=8 / HCA=25 was picked in statistical noise)
- [ ] Calibrate `ot_winner_score` (V1) and `_OT_HOME_WIN_PROB` (V2) against historical OT/SO data
- [ ] Shrinkage on goalie GSAx by shots-faced (current `gsax_cap=0.3` is a crude version)
- [ ] Fix additive→multiplicative goalie adjustment in `rate_model.py compute_lambdas`
- [ ] Time-weighted xGF (exponential decay, ~20-game half-life) in V2 `load_team_rates`
- [ ] Playoff xGF deflator (~0.92× multiplier) for V2 playoff simulations
- [ ] Port V1 walk-forward harness to V2 for apples-to-apples log-loss comparison
- [ ] Player-level xGF roster plugin (ingest Evolving Hockey RAPM or MoneyPuck GAR) — biggest remaining signal
- [ ] Fix `simulate_series_v2` hardcoded `random.Random(42)` on line ~225 (should use the caller's seed)

## Game Modal Rewrite (`rewrite` branch)

Mockup: `public/mockups/game-modal.html` — approved section order:
**Score + WP strip → Three Stars (final only) → Charts → Team Stats → Goalie Stats → Goals → Bot Cards**

### Home page polish
- [ ] **1-2 games yesterday**: skip featured card entirely, show all games in a single "Yesterday's Results" grid — no point picking a "best" from 1-2 games

### Port mockup → real components (once approved)
- [ ] Move WP strip into header zone in `GameModal.astro` + `game-modal.js`
- [ ] Three Stars: hide when not yet posted (gate on `data.three_stars` presence)
- [ ] Charts: already wired — just carry tab structure from mockup
- [ ] Team Stats section: pill filter (ALL/5V5/PP/SH) + split-bar rows
- [ ] Goalie Stats: `<table>` with SV/SV%/xGA/GSAx + team-color left border per row
- [ ] Goals: CSS grid `70px 48px 1fr 90px 68px 28px` — already in `game-modal.js`
- [ ] Bot Cards strip: placeholder until B2 card URLs wired in

### Backend data needed for Team Stats section
- [ ] **Shots on goal**: available from NHL boxscore API (`liveData.boxscore.teams.*.teamStats.teamSkaterStats.shots`) — pull at game end or on demand
- [ ] **Fenwick (unblocked shot attempts)**: need to sum `SHOT_ON_GOAL + MISSED_SHOT` events from D1 per team per game — or pull from NHL boxscore `blockedShots` + `shotAttempts`
- [ ] **Corsi (all shot attempts)**: `SHOT_ON_GOAL + MISSED_SHOT + BLOCKED_SHOT` — same source
- [ ] **xG all-situations**: already have 5v5 xG in `game_state`; need PP/SH xG summed from events payload
- [ ] **Strength split (5v5 / PP / SH)**: filter events by `payload.situation_code` — already stored, just needs query support
- [ ] **Recommended path**: add `team_stats` JSON blob to `game_state` table (written at game end or via 30s live poll from NHL boxscore) — site reads it from `/v1/games/:id/flow` or a new `?include=boxscore` param

## Editorial Homepage — post-session

- [ ] Wire real bot activity stream into live hero bot feed (currently mocked with static entries)
- [ ] Integrate Haiku for featured game editorial headline/dek (< $0.01/call; replace auto-derived `editCopy()`)
- [ ] Wire real card images into bot cards rail (B2 CDN URLs) once bot rewrite ships
- [ ] QA live hero score alignment and ghost opacity on real live game data — capture mock state during next live game (`bash scripts/capture-mock-state.sh live-p3-close`)
- [ ] **WP chart: fix goal dot y-position** — dots plot at pre-goal WP y; should be post-goal (GOAL events store post-goal WP since Apr 2026)
- [ ] **Bigcard right panel** — wire real event feed and restore xG mini-bars, delta-since-period-start strip (ref: `public/mockups/live-hero-opus.html:463–586`)

## Stats Site Redesign — Offseason 2026

Full plan: `docs/plans/stats-redesign.md`

### Phase 1 — Data foundation
- [ ] Split `player_games.json` → per-player files (`src/data/stats/game-log/{player_id}.json`) — kills 9.4 MB load bottleneck
- [ ] Add `goalies.json` to export (`player_game_features.gsax` → GSAx/GSAA/sv%/xSv%) — `export_stats_data.py`
- [ ] Add player headshot URL to skater export (`https://assets.nhle.com/mugs/nhl/60x60/{player_id}.png`)
- [ ] Add `lines.json` to export (forward lines + D-pairs from `line_stats_*.csv`)
- [ ] Add `teams.json` to export (32-team aggregates)

### Phase 2 — Flagship pages
- [x] **Player detail page** (`/stats/player/[slug]`) — editorial rewrite: headshot, RAPM block (×60), percentile bars, game log, Generate Card CTA sidebar, Similar Players sidebar
- [ ] **Goalie page** (`/stats/goalies` + `/stats/goalie/[slug]`)
- [ ] Sortable/filterable full skater table — vanilla JS island, sort/filter/search across all 715

### Skater Shot Map
- [ ] Add goal markers to shot map — overlay dots where goals were scored vs just shot density; interesting to compare location of goals vs all shots

### Phase 3 — Card generation
- [ ] Card generation pipeline: D1 `card_jobs` table, Hetzner 30s poller, R2 upload, client progress UI
- [ ] Expose Tier 1 cards: grid card, RAPM card, with/without card (start with 3, not all 26)
- [ ] Rate limiting: 3/day IP-limited free, unlimited for paid
- [ ] **Card audit: consolidate A-F variants → pick 2 "official" formats, deprecate rest**
- [ ] **Card carousel ("scroll thingy")** — dot/pill indicator on Season Card to switch between WITH EDGE and WITHOUT EDGE variants; same mechanic on Rating Card to switch between portrait and new horizontal layout
- [ ] **Horizontal Rating card** — landscape (Twitter-friendly) variant of Card 2; large hero numbers (Rating/WAR/Impact), cream/white editorial style with chips, no bar chart
- [ ] **Player age display** — backfill `birth_date` from NHL API for all ~3,200 players (`backfill_player_birthdates.py`), add to `players.json` export, show age on player page and season card

### Phase 4 — Auth + monetization
- [ ] Auth MVP: email magic link + D1 `users` table + Workers KV sessions (no passwords at v1)
- [ ] Google + X OAuth (second)
- [ ] Patreon billing link flow (separate from identity) — unlock unlimited cards + no watermark
- [ ] Patreon webhook handler (`POST /api/webhooks/patreon`) + nightly re-verify cron

### Phase 5 — Personalization
- [ ] Favoriting: `user_prefs` D1 table (`fav_teams`, `fav_players`)
- [ ] Personalized home hero — "Your Teams Tonight" surfaced above the pre-state card grid
- [ ] Compare page (`/stats/compare`) — two-player overlay, dual fingerprints

### Deferred (post v1)
- [ ] Historical season selector
- [ ] Lines page (`/stats/lines`)
- [ ] Teams page (`/stats/teams`)
- [ ] xG recalibration (apply 1.46× stopgap → xG v2 rebuild is longer project)

## Table Reconciliation — Remaining

- [ ] **`/games/index.astro` table font standardization** — 5 raw HTML tables (`.goals`, `.ps`, `.cg-table`, `.lc`) built via JS string templates; can't just add `.hgb-t` class. Needs either: (a) CSS targeting those class names directly in `table-tokens.css`, or (b) refactoring the JS template strings. Low urgency — offseason.

## Season String Hardcodes — Remaining (low priority)

Three literals intentionally deferred from the Jun 2026 cohesion-pass cleanup:

- `src/components/react/DashboardPersonalized.tsx:79` — `t.season === '2025-26'` filter; needs season passed as prop from parent page
- `src/components/react/ImpactTable.tsx:114` — `'2025-26'` in `exportChips` label; cosmetic only
- `src/pages/stats/wowy.astro:250` — `<option value="20252026">2025–26</option>` in season dropdown; needs `_meta` loaded + options derived dynamically

## Component Refactor

- [ ] **Extract SparklineSvg.astro** — same 72×22 sparkline logic copy-pasted in leaderboards, impact, player page, games page. Extract to `src/components/SparklineSvg.astro` with props: `values: number[]`, `color?: string`, `min?`, `max?`.
- [ ] **Extract MastCard.astro** — the mast/header section (eyebrow + title + corners) is duplicated across all stats pages. Props: `eyebrow`, `title`, `accentWord`, `lede`.
- [ ] **Extract SortableTable pattern** — the `sortBy/sortDir/render/attach` client JS pattern appears in leaderboards, impact, goalies, and goalie detail pages. Extract to a shared `src/lib/sortable-table.ts` utility.
- [ ] **Rename "Leaderboards" internal references** to "Skaters" for symmetry with "Goalies" — nav already updated, but page title/eyebrow copy still says "Leaderboards".

## Dark Mode — follow-up

- [ ] **Team colors in dark mode**: Many primary team colors (navy BUF, dark blue COL, black PIT etc.) are nearly illegible on the dark `#1c1c1f` surface. Need a `--team-color-display` companion token computed at build time (e.g. `color-mix(in srgb, <primaryColor> 60%, white 40%)`) that's used anywhere team color appears as text or a small accent — while keeping the raw color for large fills (bars, borders). Affected: games page team abbr + xG share values, player page hero border, team cards abbr color. Also requires switching logo `src` from `_light.svg` → `_dark.svg` on theme toggle (via JS listener on `data-theme` mutation).

## Teams Page — post-session

- [ ] QA division-grouped redesign on real playoff data (clinch/eliminated badges, opacity treatment)
- [ ] Consider adding per-team recent post preview (last tweet/skeet from the bot feed)

## Interactive / Explore Section (`/stats/interactive`)

Currently a beta page with a leaderboard table + EV Off vs EV Def scatter plot. Surfacing in nav now. Expand into a full data exploration hub:

- [ ] Selectable players (multi-select autocomplete, compare up to N players)
- [ ] Selectable teams (filter scatter/charts by team)
- [ ] Additional chart types: xGF% vs PP%, WAR vs Impact, finishing vs xG, etc.
- [ ] Image export for any chart (PNG download, matches card design system)
- [ ] Rename page from "Interactive Analytics" to "Explore" or "Viz"
- [ ] Tooltip on hover showing player name + full stat breakdown
- [ ] Axis selector dropdowns (x-axis stat, y-axis stat) — tableau-style

## Proposals

- [ ] Review ig.hockeygamebot.com subdomain

## Stats Site Sprint (SS-*)

- [x] **SS-0**: `/stats` route, data pipeline (`players.json`, `leaderboards.json`, `methodology.json`, `_meta.json`), `stats-loader.ts`
- [x] **SS-1**: Design token system (`stats-tokens.css`), dual light/dark mode, anti-FOUC
- [x] **SS-2a/b**: 7 components (PageHeader, SectionEyebrow, PercentileTile, PlayerHero, LeaderboardRow, DualStatBar, GameRow), mode toggle + localStorage persistence
- [x] **SS-3**: `/stats` landing page — hero, Season Leader (PlayerHero + PercentileTile 2×2), side-by-side skater/xG leaderboards, methodology teaser. `team-colors.ts`, `loadPlayerOfTheWeek()`. PercentileTile: 5-segment gradient, fixed text colors per mode, 97th+ glow.
- [x] **SS-4**: Player page `/stats/player/{slug}` — hero, percentile bars, radar, heatmap + sparkline + game log
- [x] **SS-5**: Leaderboards `/stats/leaderboards` — HGBScore ranked lists, shots/60 bars, xG×finishing scatter, goals/60
- [x] **SS-FIX-01**: Polish pass — phantom red stripe, hero ticker removed, heatmap shine, font floor audit, sparkline with adaptive zero line + white trendline, section C typography
- [ ] **SS-6**: Methodology page `/stats/methodology`
- [ ] **SS-7**: Mobile polish pass
  - [ ] Player page: shrink the Season/Rating·3yr chip group above WAR breakdown to fit on a single line on mobile
- [x] **SS-8**: Merge stats into main site nav (Home · Scoreboard · Playoffs · Stats · Teams · Support across all editorial pages)
- [ ] **Export script**: Add `player_of_the_week` to `_meta.json` in `hgb-bot scripts/export_stats_data.py` (7-day rolling, min 3 GP/40min TOI) — site already reads it, fallback to season avg until then
- [ ] **Goalie metrics**: Add GSAx to leaderboards when export pipeline has it — xG section in `/stats` has a comment marking the swap point
- [ ] **Table strength/mode toggle — don't rename column headers**: When switching to 5v5 (or per60), keep column headers as "SA", "GA", "GSAx", "SV%", "TOI" — the export chip already labels the mode (e.g. "5V5"). Renaming to "5V5 SA", "5V5 GSAX" etc. adds noise with no benefit. Applies to GoaliesTable and SkatersTable.
- [ ] **Goalie/player card age may be wrong**: Age is computed as floor((Oct 1 season start − birth_date) / 365.25). Some cards reportedly show incorrect ages — audit whether the bug is (a) wrong birth_date in the export pipeline, (b) off-by-one in the birthday-crossing logic, or (c) the wrong season year being used. Compare against NHL.com profile ages for a sample of affected players.
- [ ] **Historical goalie cards missing percentile bars**: Pre-2025-26 cards only show GSAx % bar (from `career_seasons.gsax_pct`); GSAx/60, SV%, dSV%, HD SV%, and GAA bars all show `—` because those cross-sectional percentiles aren't stored per historical season in the pipeline. Fix: export per-season percentile ranks for all metrics in `_load_goalie_career_stats()` on Hetzner, add to `career_seasons` schema.

## Completed

- [x] **Player career table — gap indicators** (`PlayerCareerTable.tsx`): non-consecutive seasons separated by `· · ·` dashed rows
- [x] **Player career table — remove 600-min TOI floor** (`export_stats_data.py` on Hetzner, commit `1bb6997`): depth forwards with full seasons were being excluded
- [x] **Expanded Card (`drawExpandedCard`)** — 1040×auto landscape canvas: left panel = Rating bars, right panel = season history table with RAPM %s
- [x] **History Card chip placement** — moved HOCKEYGAMEBOT chip from inline left chips to right-aligned (matches Rating Card pattern)

- [x] **Chips/Pills/Badges migration** (2026-05-28, `docs/plans/chips-migration-workflow.mjs`) — migrated all hand-rolled `.btn-group`/status-span/badge UI to the shared `ChipGroup`/`StatusPill`/`Badge` components per `hgb-docs/CHIPS.md`. 21 candidates audited → 11 correctly skipped as out-of-scope (§10), 10 migrated: `stats/{skaters,goalies,lines,interactive,index,player/[slug]}.astro`, `index.astro`, `games/index.astro`, `scoreboard.astro`, `components/home/LiveHero.astro`. Consolidated the drifted pulse keyframes (`pulse-bg`/`pulse-dot`/`ringPulse`) into the component-owned `hgb-status-pulse`. JS-`innerHTML` status indicators emit the global `.status-pill`/`data-state` markup primed by an SSR component instance. Clean build = 5242 pages (unchanged). NOTE: light/dark visual sign-off still pending (all CSS uses tokens, should flip automatically). Out-of-scope leftovers flagged for a later pass: `stats/lines` & `interactive` `.pos-badge` (owned by Table.astro), `player/[slug]` dead `.badge`/`.hero-*` CSS, `scoreboard`/`LiveHero` per-strength color coding collapsed to `matchup`/`default` (no blue/amber/green Badge kinds exist).
- [x] `/playoffs/2026` modal: color overrides for red/red (OTT→gold #C2912C) and orange/orange (ANA→gold #FCD116) matchups
- [x] `/playoffs/2026` modal: a11y focus-on-open, telemetry bullet removal, unit spacing fix
- [x] `/playoffs/2026` modal: consolidate game-times + series-status into one carousel fetch
- [x] `/playoffs/2026` modal: `loadModelData()` — fetch hgb-api `/v1/playoffs/round/1`, overlay onto SERIES, staleness header, complete-series UI branch
- [x] hgb-api: new `/v1/playoffs/series` (POST, auth) + `/v1/playoffs/round/:round` (GET, 5min CF cache)
- [x] D1 migration 0016 (series_predictions table)
- [x] Python bot: unify in-progress series card to same 60/40 Elo/xGF blend as the preview (was pure V2)
- [x] Python bot: `scripts/playoff_morning_predictions.py` for daily cron regen
- [x] Python bot: GAME_END piggyback — reuse sim_result computed for the card and POST to hgb-api within ~1s
- [x] Python bot: shared `prediction/blend.py` with `blend_results()` exported from the `prediction` package
- [x] Python bot: `gsax_cap=0.3` as default on both card scripts
- [x] WP chart dot alignment — dots now sit on the WP line via `interpWp(pts, dotT)` interpolation
- [x] Fix "no win probability available" on early-game opens (threshold `>= 2`, tMax stretched to period end)
- [x] Sparse WP data — added SHOT_ON_GOAL to WP storage condition (~10 → ~50-70 pts/game)
- [x] Backfill 14 days of historical WP data (34,706 events updated via `scripts/apply_wp_backfill.py`)
- [x] WP% badge team colors with luminance-based text color (white on dark, black on bright)
- [x] Period separator dividers in modal goals list
- [x] WP chart — drop goal dashed lines, bigger labels, bolder period lines
- [x] Period labels at boundary lines instead of zone midpoints
- [x] Single-column chronological goals in modal, two-column for share card
