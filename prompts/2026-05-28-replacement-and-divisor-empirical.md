# Engineer Briefing — Empirical Replacement Level + Rolling WAR Divisor

**Filed:** 2026-05-27
**Repo:** `hgb-analytics` (pipeline — `export_stats_data.py` and a new helper module)
**Status:** Open. Bundled because both replace fixed constants in the same WAR formula with empirical, league-derived values.
**Strategic context:** The ChatGPT methodology review flagged both of these as "fix third" — the WAR layer's brittle constants:

> "Replacement level at -0.10 xGD/60 is empirical. But it is too hand-wavy if someone digs."
>
> "The 6.1 goals per win part should be season-adjusted or rolling, not frozen forever. EH uses a rolling approach for goals-to-wins because there are few team observations per season."

Today both are hard-coded constants in `export_stats_data.py`:

```python
_REPLACEMENT_LEVEL = -0.10  # xGD per 60 below average that = replacement caliber
_WAR_DIVISOR       = 4.58   # = 6.1 (goals-per-win) ÷ 1.331 (xG-to-goal scale)
```

This ticket replaces both with empirically computed values, smoothed over multiple seasons. The methodology becomes defensible in a tweet:

> "Replacement level is the average performance of non-regular skaters — forwards outside each team's top 13 by EV TOI, defensemen outside the top 7. WAR conversion uses a rolling league scoring environment, so one win always reflects the current NHL goal environment."

See methodology memory: `/Users/mattdonders/.claude/projects/-Users-mattdonders-Development-hgb/memory/methodology_rapm_war_principles.md` sections 2 and 3 for the locked rules.

---

## Part 1 — Empirical replacement level

### What we're replacing

```python
_REPLACEMENT_LEVEL = -0.10   # single global constant
```

### What it becomes

Two values per season (F and D separately), smoothed over 3 seasons:

```python
replacement_level_f_{season}
replacement_level_d_{season}
```

### Computation

For each season in the DB:

1. **Per team**, rank all skaters by EV TOI:
   - For each of the 32 teams, sort forwards descending by 5v5 TOI
   - Mark forwards **outside the top 13** (i.e., ranks 14+) as "replacement pool" for forwards
   - Sort defensemen descending by 5v5 TOI
   - Mark defensemen **outside the top 7** (i.e., ranks 8+) as "replacement pool" for defense
2. **Pool league-wide** (not per team — this is the key rule, see methodology memory section 2). All the marked players from all 32 teams go into one shared pool for F, one shared pool for D.
3. **TOI-weighted average** of `net_rapm` (the xGD/60 value from RAPM output) within each pool:
   - For each player in the pool: weight = `min(toi_min, 300)` — cap at 300 EV minutes per player
   - The 300-minute cap prevents injury-ravaged teams from dominating the pool (a backup who plays 1000 minutes because of injuries to top-6 shouldn't be the "average replacement player")
   - Take the weighted average of `net_rapm` (off + def combined, same units as existing `_REPLACEMENT_LEVEL`)
4. **Smooth over 3 seasons:**
   - `replacement_f_{season} = 0.5 * current + 0.3 * prior + 0.2 * two_seasons_ago`
   - Same for D
   - For first 2 seasons in DB where prior data doesn't exist, fall back to weighting available seasons and re-normalizing

### Where the constant gets used

In `export_stats_data.py`, the line:

```python
ev5_war = (off_v2 + def_v2 - REPLACEMENT_LEVEL) * toi_ev_hr / WAR_DIVISOR
```

Becomes position-dependent:

```python
rep_level = replacement_level_f if pos_group == "F" else replacement_level_d
ev5_war = (off_v2 + def_v2 - rep_level) * toi_ev_hr / WAR_DIVISOR
```

### Expected output range

Spot-check sanity:
- Replacement F should be in the range -0.12 to -0.06 (xGD/60)
- Replacement D should be in the range -0.10 to -0.04 (D pool is smaller and noisier)
- If either comes out positive, the pool isn't correctly filtered (replacement-caliber players should be below average by definition)

### Versioning

When replacement values change between pipeline runs, **store the value in the export JSON** so old cards (referencing old values) and new cards stay consistent:

```json
{
  "methodology_constants": {
    "replacement_level_f": -0.087,
    "replacement_level_d": -0.062,
    "war_divisor": 4.42,
    "version": "v3.2026-05-28",
    "computed_at": "2026-05-28T07:00:00Z"
  }
}
```

---

## Part 2 — Rolling WAR divisor

### What we're replacing

```python
_WAR_DIVISOR = 4.58   # = 6.1 (goals-per-win) ÷ 1.331 (xG-to-goal scale)
```

### What it becomes

```python
war_divisor_{season} = rolling_goals_per_win / rolling_xg_to_goal_scale
```

### Computation

Two rolling components:

#### A) Rolling goals-per-win

Compute league-wide goals per win for each season:

```
goals_per_win = total_league_goals_for_winning_teams / total_league_wins
```

Or, more practically, use the established formula:

```
goals_per_win = league_GF / league_wins
```

Smooth with the methodology-memory weights:

```
rolling_goals_per_win = 0.5 * current + 0.3 * prior + 0.2 * two_seasons_ago
```

#### B) Rolling xG-to-goal scale factor

For each season:

```
xg_to_goal_scale = league_total_goals_5v5 / league_total_xg_5v5
```

This captures the scaling between the xG model's predictions and actual goals. A value of 1.331 means our RAPM (in xG units) is ~75% the magnitude of goal-equivalent units, so we divide by less.

Smooth the same way:

```
rolling_xg_to_goal_scale = 0.5 * current + 0.3 * prior + 0.2 * two_seasons_ago
```

#### Final divisor

```python
war_divisor_{season} = rolling_goals_per_win / rolling_xg_to_goal_scale
```

### Switch logic (engineer-friendly)

The methodology memory specifies:

- Use prior 3 completed seasons (no current-season data) until current season reaches **600 total league games**
- After 600 games played league-wide, blend in current season at the 50%-current weight
- At season end (typically ~1,312 games for an 82-game schedule × 32 teams ÷ 2), the smoothing finalizes

Implementation:

```python
def compute_war_divisor(current_season_games_played: int) -> float:
    if current_season_games_played < 600:
        # Use prior 3 completed seasons only
        return rolling_average(prior_3_seasons)
    else:
        # Current is mature enough to blend in
        return (0.5 * current_season_value
              + 0.3 * prior_season_value
              + 0.2 * two_seasons_ago_value)
```

### Expected output range

- `_WAR_DIVISOR` historically lands 4.2 - 4.8 depending on scoring environment.
- If your computation produces a value outside 3.5 - 5.5, double-check the league GF / xG sums (likely a strength-state filter is wrong, e.g., including PP goals but not PP xG).

### Versioning

Same as Part 1 — store in `methodology_constants` block in the export JSON. **This is load-bearing** for the public methodology page and for any cards that need to display consistent values across versions.

---

## Public methodology language

Once both changes land, the methodology page / about page text should read:

> "Replacement level is computed empirically as the TOI-weighted average performance of non-regular skaters — forwards outside each team's top 13 by even-strength time-on-ice, defensemen outside the top 7. The pool is league-wide and smoothed over 3 seasons. Per-player contributions are capped at 300 EV minutes so that injury-ravaged teams don't dominate the pool."
>
> "WAR conversion uses a rolling league scoring environment — `goals_per_win / xG_to_goal_scale`, both averaged over the prior 3 seasons — so one win always reflects the current NHL goal environment, not a frozen historical constant."

These two sentences are the trust move. Both are short enough to fit in a tweet and both reference real, defensible mechanics.

---

## Files to touch

1. **New helper:** `hgb-analytics/scripts/compute_methodology_constants.py` — the function that runs both computations and writes a constants JSON.
2. **`hgb-analytics/scripts/export_stats_data.py`** — replace the two constants with reads from the methodology constants JSON. Add the constants block to the exported `players.json` so the site can display them.
3. **Pipeline orchestration** — run `compute_methodology_constants.py` BEFORE `export_stats_data.py` in the nightly pipeline.
4. **Documentation update** — add a short section to `hgb-docs/analytics/00-stats-primer.md` describing both empirical methods. Link to the new helper.

---

## Acceptance criteria

- [ ] `compute_methodology_constants.py` produces a constants JSON with replacement_f, replacement_d, war_divisor for the current season
- [ ] Values are computed using league-pooled (not per-team) replacement and 3-year smoothing
- [ ] 300-minute cap is enforced in replacement-level computation (verify with a test player who has >300 EV minutes)
- [ ] Switch logic correctly uses prior-3 until 600 league games played, then blends in current
- [ ] `export_stats_data.py` reads from the JSON instead of using hardcoded constants
- [ ] `players.json` includes a `methodology_constants` block at the top level with all values + version + computed_at
- [ ] Smoothed values are stable run-to-run (re-running the script with no data changes produces identical output)
- [ ] Sanity check: replacement_f is between -0.12 and -0.06, replacement_d is between -0.10 and -0.04, war_divisor is between 3.5 and 5.5
- [ ] Old `_REPLACEMENT_LEVEL` and `_WAR_DIVISOR` constants in `export_stats_data.py` are removed (not left as dead code)
- [ ] Re-run pipeline end-to-end and verify player WAR values shift by no more than ~5-10% from previous run (this should be a smooth refinement, not a complete reordering)

## Stop-points

- If the smoothed replacement value comes out positive (replacement player better than league average), the pool is misfiltered. **Stop and surface.**
- If WAR values shift by more than 20% for top-30 players, something is wrong in the new constants and the pipeline shouldn't ship until investigated.
- If you can't unambiguously identify "EV TOI per team" rankings — e.g., if a player was traded mid-season and shows up on two teams — pause and clarify. Methodology memory says one player coefficient across both teams in regression; for the replacement-pool ranking, count the player on each team-stint separately (so a player who was top-13 on team A and bottom-13 on team B is in the pool from his time on B).

## Time budget

- Part 1 (replacement level): ~1.5 hours
- Part 2 (rolling divisor): ~1 hour
- Integration into `export_stats_data.py` + JSON serialization: ~30 min
- Re-run pipeline + spot-checks: ~30 min
- Documentation update: ~15 min

**Total: 3-4 hours.**

## Reporting back

Single checkpoint after both parts ship:

1. The computed constants for the current season (replacement_f, replacement_d, war_divisor)
2. Top-30 forward WAR list before/after the change — should be roughly the same ordering with values shifted ~5-10%
3. A check that the methodology_constants block is in `players.json` and ready for the site to consume
4. Confirm the public methodology page text is committed (or a TODO for Matt to wordsmith)

Once this ships, ticket 4 (HGB Rating) can use the empirical constants instead of the old hardcoded ones.
