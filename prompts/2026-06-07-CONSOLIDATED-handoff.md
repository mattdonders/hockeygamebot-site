# Consolidated Handoff — HGB Stats Site + Data Engineering

**Date:** 2026-06-07. Written to merge the frontend (site) and data-engineering threads
into one agent. Read this first; it captures state, decisions, conventions, and gotchas.

---

## Environment & workflow

- **Repo:** `hockeygamebot-site` (Astro 5, `output: 'static'`, deployed on Cloudflare Pages).
  Primary working dir: `/Users/mattdonders/Development/hgb/hockeygamebot-site`, on branch
  **`main`** (we converged from a worktree split earlier — `-fix` worktree removed; a
  separate `-r2` worktree on `feat/playoffs-r2` still exists, leave it alone).
- **Commit straight to main** now (no feature-branch dance). Always `git push origin main`
  after committing. Co-author trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **Dev server:** `npx astro dev` on `http://localhost:4321`. Restart it after changes to
  `stats-loader.ts` / Zod schemas / `define:vars` data (build-time data is fetched once at
  server start).
- **Data source:** all feeds fetched at **build time** from `https://api.hockeygamebot.com/v1/stats/*`
  (R2 static exports) + a few D1/live endpoints. `stats-loader.ts` is the single fetch layer.
- **Working style the user expects:** for visual/UX work, **mock up locally + screenshot for
  approval BEFORE committing**. Verify with Playwright (venv:
  `/Users/mattdonders/.virtualenvs/hockeygamebot/bin/python`, has `playwright`). Be honest
  about data gaps; don't fabricate. Push back with real analysis when asked.
- **Safety Net** blocks destructive git/rm (`checkout --`, `worktree remove --force`, `rm -rf`).
  Use `git stash` instead of `checkout --`; have the user run `rm -rf` themselves.

---

## Shipped this session (all on `main`)

**Player Season Card** (`stats/player/[slug].astro`, canvas `drawSeasonCard`):
counting strip, hero shows real values, EDGE panel padding/alignment, all ordinals via
`ordinalSuffix()`/`ordinal()`, whole-number hero percentiles, historical-season support
(per-season EDGE via `edge_history`, counting from `_seasonStats`, narrow card when no EDGE
i.e. pre-2021-22, full historical **team theming** — chip/color/accent follow the season's
team via `allTeamColors` map; headshot stays current jersey = known limitation).

**Player page career table** (`PlayerCareerTable.tsx`): Regular/Playoffs toggle (shared
ChipGroup style), gap markers only when sorted by season, **PNG export button** (right-aligned
`↓ PNG` chip → `window.HGB_Export.downloadTablePng` from `/js/table-export.js`; exports active
mode + sort, bold+arrow on sorted column).

**Rating card:** labels corrected to "HGB RATING PROFILE" + "Multi-season blend" (the old
"3-YEAR / PP-PK current season" was inaccurate; DE confirmed all 11 bars are now multi-season,
PP/PK TOI-weighted).

**Skaters multi-season leaderboard** (`SkatersTable.tsx` + `lib/aggregate-seasons.ts` +
`pages/data/skater-season-stats.json.ts`): From/To season range + All-time, sum/rate
aggregation, hybrid data path (build-time slimmed `/data/skater-season-stats.json`, ~2.7MB,
name-joined, client-fetched). Playoffs + regular. Names now resolve for all 2267 players
(DE added `name`/`slug` to `player-season-stats`).

**Series page** (`stats/series/[slug].astro`) — made **this-series-only**: removed the
"All Playoffs" toggle, real rink shot map (team-colored, `buildSeriesShotMapSVG`), game chips
tinted by winner's team color, fixed a season-format bug (see gotchas) so series 5v5 xG
renders. Hid Top Skaters + Lines/Pairs (no series data — see open items).

**Perf:** consolidated `signals.json` double-fetch into one memoized `loadAllSignals()`.

---

## Open / in-flight

### 2B — Series PNG card (NOT started; awaiting user's content decision)
Downloadable/tweetable card for `/stats/series/[slug]` "as of last game." Proposed contents
(given what's actually series-specific): matchup + series score + Monte Carlo win% + the
series 5v5 xG line (xGF/xGA/xGF%/GF-GA) + maybe a shot-map thumbnail. **Leave out per-player
scorers** — series player points don't exist yet (DE gap below). User will confirm contents.

### DE data gaps (logged, not yet built) — blocks restoring hidden series sections
1. **Series-filtered line/pair aggregates** — `game_log` was removed from `lines.json`
   ("too large"), so `seriesLineRows()` is always empty. Need per-series line/pair data (or
   re-add game_log). FE sections are gated on `hasSeriesLines` → auto-return when data lands.
2. **Series-specific player points** — Top Skaters currently can only show regular-season or
   whole-playoff totals; need points vs the series opponent. Section is behind `{false &&}`.

### Career merge (held diff ready)
DE is embedding `career_seasons` into `players.json` and retiring `player-career`. When shipped,
apply `prompts/2026-06-07-career-merge-removal-DIFF.md` (3 edits in `stats-loader.ts`). **Prereq:**
embed career into ALL players who get a page (3130 in old feed vs 715 active) or retired-player
career tables break.

---

## Data-contract audit decisions (FE-confirmed, grep-verified)

Full audit: `prompts/2026-06-07-data-contract-audit.md`. FE verdicts:

**players.json — site-droppable:** `sc_pct`, `xgar`, `l7_games`.
**Keep:** `avg_gs_centered`, `hdc_pct`, `qoc`, `qot`, `l7_avg` (+ all core fields).

**teams.json — site-droppable:** `gf_all`, `ga_all`, `sf_5v5`, `sa_5v5`, `sh_pct_5v5`,
`sv_pct_5v5`, `pdo_5v5`, `pp_xgf_60`, `pk_xga_60`.
**Keep:** `toi_all_sec`, `sf_pct_5v5`, `gf_5v5`, `ga_5v5`, `gf_pct_5v5`.

**signals.json:** site uses only `entity_type, entity_id, category, severity, copy, cta_href`
(+ `priority` for sorting). Other 13 unused by site.

**CAVEAT on all "droppable":** verdicts are **site-only**. iOS (`hgb-ios` repo) not checked —
grep it before dropping, especially `l7_games`, the PDO trio, and signals `stat_key`/`value`/
`threshold`/`expires_at`/`dedup_key` (likely iOS/notifications candidates). Now that the threads
are merged, the consolidated agent CAN grep iOS — do that before slimming.

---

## Conventions & gotchas (learned the hard way)

- **Season format is inconsistent across feeds:** `players.json`/playoffs API use 8-digit
  `"20252026"`; `series-stats`/`player-season-stats`/career use dashed `"2025-26"`. **Always
  normalize before comparing** (this caused the series-xG bug). Helpers: `fmtSeasonShort/Long`
  in `lib/format-season.ts`; normalize via `/^\d{8}$/.test(s) ? `${s.slice(0,4)}-${s.slice(6)}` : s`.
- **Zod strips unknown fields.** Any new field on a feed must be added to `stats-schemas.ts` or
  it's silently dropped before the page sees it (this hid `edge_history` until added).
- **Ordinals:** use `ordinalSuffix()` (frontmatter) / `ordinal()` (canvas). Never `Math.round(n)+'th'`
  (gives "32th"). A few hardcoded ones remain in the on-page EDGE grid which is behind `{false &&}`.
- **NHL EDGE data exists 2021-22+ only** (`edge_history` keys). Pre-2021-22 = no EDGE.
- **Per-shot xG:** player-shots endpoint has it; **series shots endpoint does NOT**. Series shot
  map intentionally uses uniform dots + no xGF bar (`showXgBar:false`); user confirmed fine.
- **PNG table export:** `public/js/table-export.js` → `window.HGB_Export.downloadTablePng({title,
  filterChips, rows, columns, filename})`. Page must include the script + `--stats-pos`/`--stats-neg`
  CSS vars. Columns support `sorted`/`sortDir` for the bold+arrow header.
- **Rink SVG:** `lib/rink-svg.ts` — `buildSeriesShotMapSVG(sf, sa, opts)` (full rink, opts =
  team colors/labels + `showXgBar`); `buildPlayerShotMapSVG` (offensive-zone). Series shots
  folded via `abs(x)`.
- **Astro `<style is:global>`** required when JS inserts elements via innerHTML (scoped CSS
  won't apply). Astro `<script>` tags are bundled ESM (imports work, e.g. rink-svg client-side).
- **The skaters leaderboard hybrid** is the model for "big feed → slim build-time endpoint":
  `pages/data/*.json.ts` with `export const prerender = true`.

---

## Prompt docs in `prompts/` (reference)
- `2026-06-07-data-contract-audit.md` — full audit
- `2026-06-07-career-merge-removal-DIFF.md` — held diff for the career merge
- `2026-06-06-OUTSTANDING-followups.md` — running follow-up list (incl. series DE gaps at A0)
- `2026-06-07-rating-card-field-windows-DE.md` — rating card field windows (resolved)
- `2026-06-06-skaters-name-join-DE.md` — name join (resolved)
