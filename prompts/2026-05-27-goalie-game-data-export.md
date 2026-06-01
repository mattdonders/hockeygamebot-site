# Engineer Briefing — Extend Goalie Game-Level Data Export

**Filed:** 2026-05-27
**Repo:** `hgb-analytics` (pipeline) + `hockeygamebot-site` (schema)
**Status:** Open. Blocks the goalie-page UI work below.
**Trigger:** Goalies competitive audit (2026-05-27) identified missing basic counting stats on the goalie detail page (no record, no GAA, no game log). When the site agent went to implement, it discovered `goalie.games` doesn't carry the needed fields — schema only has 7 fields per game (`game_date, team_abbrev, game_type, sa, ga, xga, gsax`), and the array is empty for all goalies locally because the source CSV doesn't exist.

This ticket extends the upstream pipeline so the UI work becomes possible.

---

## What we're building

Three coordinated changes across two repos:

1. **`hgb-analytics`:** Extend `goalie_gsax_{season}_games.csv` (or equivalent source) to include `decision`, `toi_sec`, `opp_abbrev`, `sv_pct` per game. Make sure the CSV ships.
2. **`hgb-analytics`:** Update `export_stats_data.py` (line ~378) to pass through the new fields when writing `goalies.json`.
3. **`hockeygamebot-site`:** Update `GoalieGameSchema` in `src/lib/stats-schemas.ts` (lines 250-258) to accept the new fields (mark optional for back-compat during rollout).

---

## Required new fields per goalie game

Field-by-field source guidance:

### `decision: 'W' | 'L' | 'OT' | 'SO' | null`
- Source: derive from `games` table — if the goalie's team had higher final score → W; lower → L (regulation) or OT (OT/SO). If goalie was relieved mid-game and didn't get the decision → null.
- NHL API has `decision` field per goalie performance — if you're already ingesting that, use it directly.

### `toi_sec: number`
- Source: how long was THIS goalie in net during this game (in seconds). Most goalies played the full game (3600 sec). Relief appearances are shorter.
- NHL API `boxscore` endpoint provides goalie TOI directly.

### `opp_abbrev: string`
- Source: the opposing team's 3-letter abbreviation (e.g., goalie on WPG playing vs BOS → `opp_abbrev: 'BOS'`).
- Derive from the game's home/away teams + which team the goalie was on.

### `sv_pct: number | null`
- Source: computed as `1 - (ga / sa)` if `sa > 0`, else null.
- Could be derived client-side from existing `ga` and `sa` — but cleaner to canonicalize in the pipeline.

---

## Acceptance criteria

- [ ] `goalie_gsax_{season}_games.csv` (or successor source) includes the 4 new fields for every goalie game
- [ ] Pipeline can be re-run successfully (no schema breaks)
- [ ] `goalies.json` ships to R2 with `games[]` populated (currently empty) and the new fields present per game
- [ ] Site's `GoalieGameSchema` updated — new fields optional during rollout, can become required after pipeline + site land together
- [ ] Spot-check Hellebuyck (WPG) — should show 60+ games with proper W/L/OT decisions
- [ ] Spot-check a goalie who was relieved mid-game — should show shorter TOI + may have null decision

## Stop-points

- If the source CSV doesn't exist or wasn't being computed — surface to Matt. We may need to rebuild the upstream computation, which is a larger ticket.
- If the data sources for `decision` don't unambiguously work for shootout games or empty-net situations — surface.

## Time budget

- Pipeline + CSV extension: ~2-3 hours (depends on how the source data is being computed)
- Schema update on site: ~15 minutes
- Total: ~2.5-3.5 hours

---

## What waits for this ticket to land

**`prompts/2026-05-27-goalies-page-hero-and-game-log.md`** — the site UI work:

- Hero card adds W/L/OT record, GAA, SO count, TOI as second stat strip
- Game-by-game log section rendered as a Table.astro consumer with date, opp, decision, SA, GA, SV%, GSAx
- Sortable, PNG export, click-through to game pages

Site work is ~1.5-2 hours once this pipeline ticket ships.

## Why this matters

Per the 2026-05-27 goalies competitive audit verdict:
> "HGB falls short of table-stakes on goalies — more than it does on skaters."

The goalie page currently shows GSAx and SV% but no record, no GAA, no game log. Casual fans bounce immediately because they can't find what they came for. These fields are the foundation, not nice-to-haves.

## Reporting back

1. Confirm the source CSV exists (or report whether it needs to be rebuilt)
2. After pipeline ships: sample a Hellebuyck record from the updated goalies.json showing all 4 new fields populated
3. Confirm site schema PR can land alongside (back-compat optional during rollout)
