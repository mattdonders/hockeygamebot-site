# hockeygamebot-site TODO

## Known Issues

- [ ] WSH/NYR random WP dip — single bad data point, user chose not to fix unless cause is obvious
- [ ] Rangers blowout: late-game goals showing +0.0% WP delta when model is already near 100% ceiling
- [ ] **Leaderboards scatter margins** (`/stats/leaderboards` xG×Finishing plot): dots cluster upper-right, leaving large empty lower-left dead zone. The real fix is a proper axis range trim or log/sqrt x-scale — `preserveAspectRatio="none"` and `xMin=min*0.85` didn't resolve it visually. Defer to SS-7 or a dedicated scatter polish pass.
- [ ] **Elo-flip series_id duplication on `series_predictions`** (recurring during 2026 R1/R2): when an underdog wins a series, their Elo can overtake the higher-seed team mid-series, which flips the `_series_id_for(hs, ls)` order in `scripts/playoff_morning_predictions.py` (Python bot) and creates a NEW row instead of updating the existing one. Manual D1 deletes done for `pit-phi`, `edm-ana`, `dal-min`, `tbl-mtl` so far. Fix options: (a) make `_series_id_for()` use alphabetical-sort key — `f"{min(a,b)}-{max(a,b)}"` — so the id is stable across Elo flips, or (b) migrate to NHL bracket letter (`series_a`, `series_b`, …) as the stable id. Site-side defensive fix during rewrite: dedupe by team-pair frozenset when building `SERIES` so a stale row never duplicates a card on the page.

## Pending Action Items

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

### Phase 3 — Card generation
- [ ] Card generation pipeline: D1 `card_jobs` table, Hetzner 30s poller, R2 upload, client progress UI
- [ ] Expose Tier 1 cards: grid card, RAPM card, with/without card (start with 3, not all 26)
- [ ] Rate limiting: 3/day IP-limited free, unlimited for paid
- [ ] **Card audit: consolidate A-F variants → pick 2 "official" formats, deprecate rest**

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

## Teams Page — post-session

- [ ] QA division-grouped redesign on real playoff data (clinch/eliminated badges, opacity treatment)
- [ ] Consider adding per-team recent post preview (last tweet/skeet from the bot feed)

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
- [x] **SS-8**: Merge stats into main site nav (Home · Scoreboard · Playoffs · Stats · Teams · Support across all editorial pages)
- [ ] **Export script**: Add `player_of_the_week` to `_meta.json` in `hgb-bot scripts/export_stats_data.py` (7-day rolling, min 3 GP/40min TOI) — site already reads it, fallback to season avg until then
- [ ] **Goalie metrics**: Add GSAx to leaderboards when export pipeline has it — xG section in `/stats` has a comment marking the swap point

## Completed

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
