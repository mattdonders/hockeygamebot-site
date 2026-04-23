# hockeygamebot-site TODO

## Known Issues

- [ ] WSH/NYR random WP dip — single bad data point, user chose not to fix unless cause is obvious
- [ ] Rangers blowout: late-game goals showing +0.0% WP delta when model is already near 100% ceiling

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

## Proposals

- [ ] Review hockeygamebot.com site for improvements
- [ ] Review ig.hockeygamebot.com subdomain

## Stats Site Sprint (SS-*)

- [x] **SS-0**: `/stats` route, data pipeline (`players.json`, `leaderboards.json`, `methodology.json`, `_meta.json`), `stats-loader.ts`
- [x] **SS-1**: Design token system (`stats-tokens.css`), dual light/dark mode, anti-FOUC
- [x] **SS-2a/b**: 7 components (PageHeader, SectionEyebrow, PercentileTile, PlayerHero, LeaderboardRow, DualStatBar, GameRow), mode toggle + localStorage persistence
- [x] **SS-3**: `/stats` landing page — hero, Season Leader (PlayerHero + PercentileTile 2×2), side-by-side skater/xG leaderboards, methodology teaser. `team-colors.ts`, `loadPlayerOfTheWeek()`. PercentileTile: 5-segment gradient, fixed text colors per mode, 97th+ glow.
- [ ] **SS-4**: Player page `/stats/player/{slug}`
- [ ] **SS-5**: Full leaderboards page `/stats/leaderboards` (F/D toggle, all metrics)
- [ ] **SS-6**: Methodology page `/stats/methodology`
- [ ] **SS-7**: Mobile polish pass
- [ ] **SS-8**: Merge stats into main site nav
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
