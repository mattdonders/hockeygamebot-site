# Engineer Briefing — WAR Validation Framework

**Filed:** 2026-05-27
**Repo:** `hgb-analytics` (new script + report outputs)
**Status:** Open. Foundational — every future methodology change validates against this.
**Strategic context:** The ChatGPT methodology review (`~/Downloads/ChatGPT-RAPM WAR Methodology Review.md`, May 27 2026) named this as the **#1 fix** to do first:

> "Stop validating mainly against EH WAR. EH WAR is not ground truth. It is another model with its own philosophy. The question becomes: did those weights find true player value, or did they learn EH's taste? Keep EH correlation as a sanity check, not the training target."

Today HGB validates WAR by grid-searching against EvolvingHockey on 449 matched forwards (ρ = 0.812). That's circular — we're fitting to another model's preferences. This ticket replaces "EH correlation as scoreboard" with three independent validations.

See methodology memory: `/Users/mattdonders/.claude/projects/-Users-mattdonders-Development-hgb/memory/methodology_rapm_war_principles.md` — the validation framework section locks the three views and the component-split benchmarks.

---

## What we're building

A new validation script that runs after every pipeline rebuild and produces a report comparing HGB's outputs to three independent views of model quality:

1. **Split-season stability** — first half vs second half Spearman correlation, by component
2. **Year-to-year persistence** — Year N vs Year N+1, age-adjusted, by component
3. **Team-level conservation check** — sum player WAR by team, compare to team goal differential / standings / xG differential

Output: `hgb-analytics/scripts/validate_war_methodology.py` + a JSON/markdown report saved alongside the regular pipeline outputs.

---

## View 1 — Split-season stability

### What it answers

"Does HGB WAR/component value computed on the first half of a season agree with the same player's value computed on the second half? If not, the model is over-fitting to small samples or noise."

### Implementation

For each season in the DB (start with 2024-25, expand to all-seasons later):

1. Bisect each player's shifts at the median date of the season.
2. Fit RAPM independently on first half and second half (same regression code, just two halves).
3. For players with ≥100 minutes in both halves, compute Spearman ρ between first-half and second-half values for each component:
   - `total_war`
   - `war_per_60`
   - `ev_off_rapm`
   - `ev_def_rapm`
   - `finishing` (individual offense bonus)
   - `game_score_avg`
4. Report ρ separately for forwards and defensemen.

### Benchmarks (from methodology memory)

Component-split, NOT a universal threshold:

| Component | Good | Acceptable | Concerning |
|---|---|---|---|
| Total WAR | 0.45-0.60 | 0.35-0.45 | <0.30 |
| WAR/60 | 0.35-0.50 | 0.25-0.35 | <0.20 |
| EV Offense RAPM | 0.35-0.50 | 0.25-0.35 | <0.20 |
| EV Defense RAPM | 0.25-0.40 | 0.15-0.25 | <0.10 |
| Finishing | 0.25-0.40 | 0.15-0.25 | <0.10 |
| Game Score | 0.50-0.70 | 0.40-0.50 | <0.35 |

Color-flag each value in the output (green/yellow/red) per the table above.

---

## View 2 — Year-to-year persistence

### What it answers

"Does Year N predict Year N+1? Defensive RAPM is known to be noisier than offensive — TopDownHockey's published priors are 0.446 (F offense) / 0.280 (F defense), so don't penalize defense for being lower."

### Implementation

For each pair of consecutive seasons in the DB (e.g., 2022-23 → 2023-24, 2023-24 → 2024-25):

1. Filter to players with ≥200 minutes in both seasons (use the existing `MIN_TOI_MIN = 200` threshold).
2. Apply the age curve from `fit_hgb_rating_bayesian.py` (`C_AGE = 0.0025`, `PEAK_AGE = 25.0`) to age-adjust the Year N value to the player's Year N+1 age.
3. Compute Spearman ρ between age-adjusted Year N and raw Year N+1 for each component.
4. Report by position and by season pair.

### Use the same component-split benchmarks as View 1

TopDownHockey's 0.446 / 0.280 are **directional sanity checks**, not hard targets. The table above is the operational benchmark.

---

## View 3 — Team-level conservation check

### What it answers

"If the model says player X is +2 WAR and player Y is -1 WAR, those numbers should aggregate to something resembling the team's actual goal differential / standings points / xG differential. If the team sum is wildly off, individual numbers are unreliable even if they correlate with EH."

### Implementation

For the current season:

1. Sum `total_war` across all skaters on each team (32 teams).
2. Pull team-level stats from existing exports (`team_game_stats.json` or the events table):
   - Team goal differential (GF - GA)
   - Team standings points
   - Team xG differential (xGF - xGA at 5v5)
3. For each team-level metric, compute:
   - Spearman ρ between sum-of-player-WAR and team metric across 32 teams
   - Pearson r as well (since the relationship should be roughly linear)
   - Identify outliers (teams >2σ from the regression line) — these are model failure cases worth investigating

### Expected pattern

If the model is healthy:
- Sum-of-WAR should correlate ~0.7-0.85 with team goal differential
- Sum-of-WAR should correlate ~0.75-0.90 with team xG differential (closer correlation because the model is built on xG)
- Sum-of-WAR should correlate ~0.6-0.75 with standings points (looser because goalies + luck)

If correlations are dramatically lower → the per-player attribution isn't aggregating sensibly and something in the RAPM or WAR layer is broken.

### Goalie handling

Skater WAR excludes goalies. When comparing to team metrics:
- Goal differential includes goalie performance
- xG differential roughly cancels out goalies (xG is shot-quality, not save outcome)
- So expect closer fit to xG diff than to goal diff — that's actually a useful sanity sub-check

---

## Output format

Save report to: `hgb-analytics/scripts/reports/validation_war_{season}_{YYYYMMDD}.{json,md}`

### JSON shape

```json
{
  "generated_at": "2026-05-28T07:00:00Z",
  "season": "20252026",
  "split_season": {
    "forwards": {
      "total_war": { "rho": 0.42, "n": 387, "flag": "acceptable" },
      "war_per_60": { "rho": 0.31, "n": 387, "flag": "acceptable" },
      ...
    },
    "defensemen": { ... }
  },
  "year_to_year": {
    "2024-25_to_2025-26": {
      "forwards": { "total_war": { "rho": 0.48, "n": 312, "flag": "good" }, ... },
      "defensemen": { ... }
    },
    "2023-24_to_2024-25": { ... }
  },
  "team_conservation": {
    "vs_goal_diff": { "rho": 0.78, "pearson": 0.81, "outliers": ["TOR", "ANA"] },
    "vs_xg_diff": { "rho": 0.85, "pearson": 0.87, "outliers": [] },
    "vs_standings_pts": { "rho": 0.66, "pearson": 0.70, "outliers": ["FLA"] }
  }
}
```

### Markdown shape

Human-readable summary with the same three sections, color-coded flags, and a "What to investigate next" section listing outliers and concerning flags. This is the artifact that gets reviewed after each pipeline rebuild.

---

## Acceptance criteria

- [ ] New script at `hgb-analytics/scripts/validate_war_methodology.py`
- [ ] Runs against the latest pipeline outputs without re-fitting RAPM (consumes existing `bayesian_rapm_{season}.csv` and `players.json`)
- [ ] Produces both JSON and markdown reports at `scripts/reports/validation_war_{season}_{date}.{json,md}`
- [ ] All three views populated for the current season (2025-26)
- [ ] Year-to-year view computes at least 2 season-pairs (e.g., 23-24→24-25 and 24-25→25-26)
- [ ] Components are flagged green/yellow/red against the benchmarks
- [ ] Team-level outliers flagged (>2σ from regression line)
- [ ] Spot-check: defensive RAPM year-to-year ρ lands in the 0.15-0.30 range. If it's >0.40, suspicious (over-stable, likely a chained-prior leak). If <0.10, suspicious (too noisy).
- [ ] Script is hooked into the nightly pipeline OR documented for manual run after pipeline rebuilds

## Stop-points

- If split-season fit requires re-fitting RAPM on two halves and that takes >2 hours of pipeline work, **stop and surface to Matt** with an estimate before continuing. The split-half fit doesn't need to be production-grade — a cheap "fit on first 41 games / fit on last 41 games" using the same regression code is fine.
- If year-to-year ρ comes out below the "concerning" threshold for multiple components, **stop the sprint** — that's a model integrity issue more important than continuing to tickets 3-5.
- If team-conservation correlation is below 0.5 against xG diff, **stop and surface** — something is fundamentally broken in attribution.

## Time budget

- View 1 (split-season): ~2 hours (assumes existing regression code can be reused for two halves cheaply)
- View 2 (year-to-year): ~1-2 hours (mostly data wrangling — the math is straightforward)
- View 3 (team-conservation): ~1 hour
- Report serialization + markdown formatting: ~1 hour

**Total: 4-6 hours.**

## Reporting back

Two checkpoints:

1. **After View 1 (~2 hours):** post the first-half/second-half table. Get sign-off before continuing to Views 2 + 3 in case the split-season values reveal the model is over-fitting and we need to course-correct.
2. **After full script ships:** post the markdown report. Matt will review against the benchmarks and decide whether the model needs adjustment before tickets 3-5 land.

This becomes the standing artifact reviewed after every pipeline rebuild — replaces "what's our EH correlation today?" as the trust metric.
