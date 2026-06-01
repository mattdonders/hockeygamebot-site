# Engineer Briefing — `teams.json` Pipeline Export

**Filed:** 2026-05-27
**Repo:** `hgb-analytics` (pipeline) — output consumed by `hockeygamebot-site` via R2
**Status:** Open. UI side is DONE — `/stats/teams` is shipping with mock data. This ticket replaces the mock with real pipeline output.
**Related:** Original full ticket at `hockeygamebot-site/prompts/2026-05-27-teams-stats-page.md` (Phase 1 was the pipeline, Phase 2 was the UI). UI is shipped at commit `e238186` on `hockeygamebot-site/rewrite`. This ticket scopes Phase 1 only.

---

## What we're building

A new pipeline export `teams.json` containing per-team season aggregates. The `/stats/teams` page already exists with the full UI and is consuming inline mock data. When this ticket lands, swap the mock for real data at the marked TODO location.

**Swap point on the site:**
- File: `hockeygamebot-site/src/pages/stats/teams.astro`
- Line 19 (marker): `// TODO: replace with R2 fetch when teams.json ships`
- Single-line swap: `const teams = mockTeams;` → `const teams = await fetchTeamsJson();`

---

## Schema required

One row per team per game_type (regular/playoffs). All 32 teams represented in regular_season; ~16 teams represented in playoffs depending on cutoff.

```ts
{
  team_abbrev: string,            // "CAR"
  team_name_full: string,         // "Carolina Hurricanes"
  team_name_city: string,         // "Carolina"
  team_name_nickname: string,     // "Hurricanes"
  division: string,               // "Metropolitan"
  conference: string,             // "Eastern"
  season: string,                 // "2025-26" — surfaced as a column on the page
  game_type: "regular" | "playoffs",

  // Standings (regular season; for playoffs, wins/losses are series-record style)
  gp: number,
  wins: number,
  losses: number,
  ot_losses: number,              // 0 for playoffs
  points: number,                 // 0 for playoffs

  // All-situations totals
  toi_all_sec: number,            // total ice time (all situations) across all games
  gf: number,
  ga: number,

  // 5v5 splits
  toi_5v5_sec: number,
  gf_5v5: number,
  ga_5v5: number,
  gf_pct_5v5: number,             // gf_5v5 / (gf_5v5 + ga_5v5)
  xgf_5v5: number,
  xga_5v5: number,
  xgf_pct_5v5: number,            // xgf_5v5 / (xgf_5v5 + xga_5v5)
  sf_5v5: number,
  sa_5v5: number,
  sf_pct_5v5: number,
  sh_pct_5v5: number,             // gf_5v5 / sf_5v5
  sv_pct_5v5: number,             // 1 - (ga_5v5 / sa_5v5)
  pdo_5v5: number,                // sh_pct_5v5 + sv_pct_5v5
  cf_5v5: number,                 // Corsi for
  ca_5v5: number,
  cf_pct_5v5: number,
  hdcf_5v5: number,               // High-danger chances for
  hdca_5v5: number,
  hdcf_pct_5v5: number,

  // Special teams (all relevant strength states)
  pp_pct: number,                 // PP conversion rate (gf / pp_opportunities)
  pk_pct: number,                 // PK success rate (1 - ga_on_pk / pk_against_opportunities)
  pp_xgf_60: number,              // PP xG per 60 minutes of PP ice time
  pk_xga_60: number               // PK xG against per 60 minutes of PK ice time
}
```

**Important:** The UI needs BOTH all-situations totals (`gf`, `ga`, `toi_all_sec`) AND 5v5 splits (`*_5v5`). The All/5v5 toggle on the page swaps between them. Currently the mock fakes a ~8% bump for all-sit when only 5v5 data is available — this ticket should provide both legitimately.

---

## Data sources you already have

In `hgb_analytics.sqlite`:

- **`team_game_stats.json`** (existing export) — per-team per-game rows with 5v5 xGF/xGA. **Aggregate this** for season totals on 5v5 fields.
- **Events table in SQLite** — has every shot/goal event with `strength_state`, `team`, `opponent`. Aggregate to get:
  - 5v5 GF/GA, SF/SA, xGF/xGA, CF/CA, HDCF/HDCA, totals per team
  - All-situations GF/GA, SF/SA, etc.
  - PP/PK events for special teams calculations
- **`games` table** — has W/L/OT results per game per team. Aggregate for standings.

**Likely new pipeline file:** `hgb-analytics/scripts/export_teams_json.py` modeled on existing `export_stats_data.py` patterns.

---

## What's likely tricky

1. **PP%/PK% denominator semantics** — `PP%` is goals-per-power-play-opportunity, not goals-per-PP-minute. Need to count distinct PP opportunities (number of times a team entered a PP state during a game), not just minutes. The events table should have this via successive `PENL` events that create the PP state.

2. **PK denominator** — same logic inverted. Number of times the team was killing a penalty.

3. **Division / conference / team identity metadata** — these don't change game-to-game. Either:
   - Add a static lookup constant in the pipeline (preferred — 32 hardcoded rows isn't bloat)
   - OR pull from NHL API once at pipeline startup
   
   Static lookup is simpler. Reference `hockeygamebot-site/src/pages/stats/teams.astro` lines ~50-150 for the existing team identity data — copy that into the pipeline as canonical.

4. **Playoffs row count** — playoff teams have very different `gp` (4-28 games). Don't compute `wins/losses` as "team_wins / team_losses" series-style — use **game-level wins/losses** like regular season (e.g., CAR played 15 playoff games, won 9, lost 6 — that's `9-6-0` even though it's a playoff record).

5. **Ranking the playoff "teams" list** — only teams that played a postseason game appear in the playoff variant. ~16 teams in round 1, fewer as rounds progress.

6. **Score-adjusted variants** — NOT in scope for this ticket. We have `xgf_5v5` (raw). Score-adjusted Corsi/xG variants would be separate columns and are deferred until the D1 layer (see `hgb-docs/docs/plans/data-layer-architecture-d1-vs-json-2026-05.md`).

---

## Acceptance criteria

- [ ] New script at `hgb-analytics/scripts/export_teams_json.py`
- [ ] Hooked into the nightly pipeline (`nightly_pipeline.py` or equivalent)
- [ ] Produces `teams.json` at the standard R2 path (`stats/teams.json` matching the player/goalies/lines pattern)
- [ ] One row per team per game_type — all 32 teams in regular, playoff teams in playoffs
- [ ] All schema fields populated for current season (2025-26)
- [ ] Math sanity checks:
  - `gf_5v5 + ga_5v5 ≤ gf + ga` (can't have more 5v5 goals than total)
  - `gf_pct_5v5` matches `gf_5v5 / (gf_5v5 + ga_5v5)` exactly
  - `xgf_pct_5v5` matches `xgf_5v5 / (xgf_5v5 + xga_5v5)`
  - `pp_pct` between 0 and 1 (typical NHL range: 0.15–0.30)
  - `pk_pct` between 0 and 1 (typical NHL range: 0.72–0.88)
- [ ] Records check: top teams in regular season have `wins ≥ 45`; bottom teams `≤ 25`
- [ ] Spot-check 3-5 teams against `naturalstattrick.com` or `hockey-reference.com` to confirm numbers are sane (within ~2% — small variance is expected from different xG models)
- [ ] Verify the schema field names exactly match the UI's expectations (the UI consumer at `teams.astro` lines ~50-150 is the canonical source for what's expected)

## Stop-point

If any of these data fields **can't be derived** from existing pipeline tables, stop and surface to Matt before estimating major new pipeline work:

- HDCF/HDCA (high-danger chances) — requires shot location categorization
- PP%/PK% — requires distinct opportunity counting
- All-situations TOI separate from 5v5 TOI — requires per-event strength tracking

If any of these need a new feature build in the pipeline, file separate ticket and ship a partial `teams.json` (with the available fields) so the UI can swap from mock to real for the columns we DO have, and the rest fall back to "—".

---

## Reporting back

Two checkpoints:

1. **After schema sanity check (~30 min):** post the field-by-field availability against the existing pipeline. "Have these fields, can compute; can't compute these without X." Get Matt's approval before building.
2. **After build (~2-3 hours):** sample JSON for one team (CAR) showing all fields populated + sanity check numbers vs NST.

After the JSON ships to R2, swap the mock at `teams.astro:19`. The UI will pick up real data on the next CF Pages rebuild.

## Time budget

- Schema check: ~30 min
- Script build + integration: ~2-3 hours
- Spot-check + validation: ~30 min

Total: ~3-4 hours.
