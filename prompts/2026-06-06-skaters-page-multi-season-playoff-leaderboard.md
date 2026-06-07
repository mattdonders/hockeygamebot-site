# Engineer Briefing — Skaters Page: Multi-Season Leaderboard with Playoffs + Season Range

**Filed:** 2026-06-06
**Repo:** `hockeygamebot-site`
**Status:** Open. Larger feature — do the player page playoff toggle first.
**Context:** The current `/stats/skaters` table only shows the current season. To answer "who had the most playoff points since 2022?" or "how does Marner rank vs peers in playoff IxG?" we need season range filtering and a Playoffs game type toggle on the leaderboard.

---

## What we're building

Upgrade `/stats/skaters` to support:
1. **Game type toggle**: Regular Season / Playoffs
2. **Season range selector**: "From" + "To" dropdowns filtering which seasons are included
3. When using multi-season or playoff view: **aggregate stats** across selected seasons (sum GP, sum goals, sum points, sum TOI — not just most recent season)

---

## Current state

`/stats/skaters` currently fetches `GET /v1/stats/players` which returns a single current-season record per player. That endpoint is not suitable for multi-season or playoff aggregation.

**New data source:** `GET https://api.hockeygamebot.com/v1/stats/player-season-stats`

Response: `{ [player_id]: { regular: [...], playoffs: [...] } }` — all seasons, all players.

This endpoint returns ~2,264 players × all historical seasons. It's ~7.6 MB — fetch once at page load and process client-side, same pattern as the current players table.

---

## Data shape per season row

```json
{
  "season": "2025-26",
  "team": "VGK",
  "pos": "R",
  "gp": 18,
  "toi_5v5_sec": 15723,
  "goals": 7,
  "a1": 14,
  "a2": 3,
  "assists": 17,
  "points": 24,
  "shots": 36,
  "ixg": 4.47,
  "xgf_pct_5v5": 54.1,
  "cf_pct_5v5": 52.3,
  "goals_pct": 77,
  "a1_pct": 98,
  "ixg_pct": 53,
  "pen_diff_pct": 75,
  "qoc_pct": 35,
  "qot_pct": 91,
  "limited": false
}
```

Available seasons in the data: 2010-11 through 2025-26 (regular season); 2022-23 through 2025-26 (playoffs, older being backfilled).

---

## Feature spec

### Game type toggle
Pill toggle: **Regular Season / Playoffs**. Default: Regular Season (preserves current behavior).

When Playoffs is selected, use the `playoffs` array instead of `regular`.

### Season range selector
Two dropdowns: **From** season and **To** season.

- Populate options dynamically from seasons present in the data for the selected game type
- Default: current season only (matches current behavior — single season)
- When a range spans multiple seasons, aggregate rows (see below)
- "All time" shortcut button is nice-to-have

### Multi-season aggregation

When the selected range covers more than one season, sum the counting stats across seasons per player:
- Sum: `gp`, `goals`, `a1`, `a2`, `assists`, `points`, `shots`, `ixg`, `toi_5v5_sec`
- Rate stats (`xgf_pct_5v5`, `cf_pct_5v5`): weighted average by `toi_5v5_sec`
- Per-season percentiles (`goals_pct`, `war_pct`, etc.): **do not aggregate** — hide these columns in multi-season view (they're season-specific ranks, not meaningful summed)
- `team`: show most recent team (or a multi-team indicator like "2 teams" if traded mid-range)
- `limited`: true if player is `limited` in **any** season within the range

Minimum display threshold for multi-season view: ≥ 5 GP total across selected range (avoids noise from players with single emergency callup games).

### Min GP filter
Already exists on the current skaters table. Keep it, but apply it to the **aggregated** GP, not per-season GP.

---

## Implementation notes

- The `player-season-stats` endpoint does not include player name directly in each row — it's keyed by player_id. You'll need to join to a name source. Options:
  - Cross-reference with `/v1/stats/players` for current players (covers most cases)
  - Each row does have `pos` and `team` — that's enough for display; names can come from a separate lookup
- Playoff data availability: 2022-23+ fully populated, older seasons in progress. For the season range dropdown in Playoffs mode, only offer seasons that have data. Check `playoffs` array length > 0 per player to determine available range.
- `toi_5v5_sec` is 5v5 TOI only — label column "5v5 TOI" with a tooltip.

---

## What to preserve

- All existing regular season / current season behavior must be unchanged when no range is selected (default state)
- All existing column visibility, sorting, and min TOI/GP filters carry over
- Existing color coding and thresholds unchanged

---

## Out of scope for this prompt

- Individual player page career table (separate prompt: `2026-06-06-player-page-playoff-career-table.md`)
- Season-by-season row view within this table (that's the player page's job)
- Advanced column picker (future sprint)

---

## Acceptance criteria

- [ ] Regular Season / Playoffs toggle works; default is Regular Season
- [ ] Season "From/To" dropdowns populate correctly for each game type
- [ ] Single-season selection matches current behavior exactly
- [ ] Multi-season view correctly sums counting stats, weighted-averages rate stats
- [ ] Per-season percentile columns hidden in multi-season view
- [ ] Min GP filter applies to aggregated GP
- [ ] "Most recent team" shown correctly for traded players in multi-season range
- [ ] Playoff season dropdown only shows seasons with data
- [ ] Light + dark mode, mobile layout all work

## Reporting back

Two checkpoints:
1. After data wiring: paste the aggregated row for Marner (filter by name) with Playoffs, All Available Seasons — confirm GP/G/A/P totals look right
2. After UI complete: screenshot of table in Playoffs mode sorted by points descending
