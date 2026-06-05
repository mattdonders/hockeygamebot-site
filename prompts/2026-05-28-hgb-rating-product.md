# Engineer Briefing — HGB Rating Product (Post-Calc TOI-Weighted Talent Estimate)

**Filed:** 2026-05-27
**Repo:** `hgb-analytics` (pipeline — new computation alongside existing WAR output)
**Status:** Open. New product line. Stores alongside (NOT replacing) current-season WAR.
**Strategic context:** The ChatGPT methodology review's core recommendation was to **separate three concepts** that today get blurred together:

> "WAR = what happened this season. Rating = what we think the player is (talent estimate). Game Score = how much he shows up game-to-game. These answer DIFFERENT questions. Don't combine them into one 'overall' number."

Today HGB has WAR and Game Score, but no separate "Rating" product. Without it, anyone asking "is this player actually good or just having a season?" has no clean answer. JFresh owns that lane today with his 3-year weighted card. This ticket builds the HGB Rating product — and the methodology rule is locked: **prior blending happens AFTER the regression, NOT via `LAMBDA_PRIOR > 0` in the ridge fit.**

See methodology memory: `/Users/mattdonders/.claude/projects/-Users-mattdonders-Development-hgb/memory/methodology_rapm_war_principles.md` section 1 for the locked rule, and the ChatGPT review's "post-calculated blend" section (around line 968) for the rationale.

---

## What we're building

A **separate** talent estimate stored alongside the current-season WAR. The pipeline produces:

```
war_current          (existing — current season only)
hgb_rating_current   (new — prior-informed talent estimate)
rating_confidence    (new — flag for limited-sample players)
```

Both values are exported per player. The site (ticket 5) will display them on separate cards.

**Critical methodology rule (do not violate):** Keep `LAMBDA_PRIOR = 0` in the regression. Prior blending is a post-calc weighted average, NOT a regression penalty.

---

## The formula

### Core blend

```
Rating = w_current * current_season_RAPM
       + w_prior1  * prior_season_RAPM (age-adjusted)
       + w_prior2  * two_seasons_ago_RAPM (age-adjusted)
       + w_prior3  * three_seasons_ago_RAPM (age-adjusted)
```

### Steady-state weights (when player has full 3+ years of NHL data)

```
60% current + 25% previous + 10% two-years-ago + 5% three-years-ago
```

Sum = 100%.

### Early-season weights (TOI-based)

Early in a season, the player's current minutes are small and the prior should dominate. The methodology memory specifies:

```
current_weight = current_TOI / (current_TOI + prior_equivalent_TOI)
```

Where `prior_equivalent_TOI = 1200` minutes.

#### How this plays out:

- After 100 current minutes: `current_weight = 100 / (100 + 1200) = 0.077` → prior dominates
- After 600 current minutes: `current_weight = 600 / (600 + 1200) = 0.333` → prior still ~67%
- After 1200 current minutes: `current_weight = 0.5` → balanced
- After 2400 current minutes (full season): `current_weight = 0.667` → current dominates

Then within the remaining `prior_weight = 1 - current_weight`, distribute across the three prior seasons using the steady-state ratios (25 / 10 / 5 → re-normalized to sum to `prior_weight`).

Concretely, after `prior_weight` is set:

```
w_prior1 = prior_weight * (25 / 40)   # 0.625 of remaining
w_prior2 = prior_weight * (10 / 40)   # 0.25  of remaining
w_prior3 = prior_weight * ( 5 / 40)   # 0.125 of remaining
```

So at season's end with a full season under the player's belt, weights converge to:

```
w_current ≈ 0.60
w_prior1  ≈ 0.25
w_prior2  ≈ 0.10
w_prior3  ≈ 0.05
```

Matching the steady-state.

### Age adjustment

The prior seasons need to be adjusted to estimate "what this player's talent would be at his current age" — not "what he showed at age 23 raw." Reuse the existing aging curve from `fit_hgb_rating_bayesian.py`:

```python
C_AGE    = 0.0025
PEAK_AGE = 25.0

# For each year-of-age delta from the prior season to current season:
delta = 2 * C_AGE * (age_at_prior_season + 0.5 - PEAK_AGE)
age_adjusted_prior = raw_prior + (current_age - prior_age) * delta
```

For a 30-year-old looking back at his age-28 season: aging delta ≈ -0.027 per year × 2 years = -0.054 subtracted from the prior value (he's expected to have declined).

---

## Rookies and limited-sample handling

### Rookies (no prior NHL data)

Use a **position-average prior, slightly below average**:

```python
ROOKIE_PRIOR_OFFENSE_F = -0.02   # slightly below positional avg
ROOKIE_PRIOR_DEFENSE_F = -0.01
ROOKIE_PRIOR_OFFENSE_D = -0.02
ROOKIE_PRIOR_DEFENSE_D = -0.01
```

These represent "average AHL call-up" expectations. Adjust empirically if rookie WARs look systematically too high or too low after first pipeline run.

The TOI-weighted formula then applies normally — after 200 minutes, current data still dominates against the rookie prior because we're using `prior_equivalent_TOI = 1200`.

### Players with limited recent NHL minutes

For players whose total NHL minutes across the last 3 seasons is below 1000, set the `rating_confidence` flag to `"limited_sample"`. This becomes a "limited sample" badge on the card (ticket 5).

```python
if sum_prior_3_seasons_toi_min < 1000:
    rating_confidence = "limited_sample"
else:
    rating_confidence = "full"
```

The Rating still computes — we don't hide the player. The badge just signals to the viewer that the estimate is noisier.

### Don't gate showing the Rating card

Per methodology memory section 4: "Show Rating card if player has 200+ current-season NHL minutes." This is the same threshold as the existing public WAR leaderboard.

---

## Traded players

The existing pipeline encodes traded players as a single column across both teams. That's the right pattern for Rating too — the post-calc blend uses each season's value as the unit, and doesn't need to disaggregate stints.

Concrete handling:
- Current season: use the single-coefficient value (already what RAPM produces)
- Prior seasons: same — the historical CSV will have one row per player per season already

No special logic needed for traded players. Verify by spot-checking a known mid-season trade (e.g., a 2024-25 trade): Rating should compute cleanly.

---

## What gets stored

In the pipeline output (`players.json`):

```json
{
  "player_id": 8478402,
  "name": "Connor McDavid",
  "war_current": 5.14,
  "war_percentile": 100,

  "hgb_rating_current": 5.62,
  "rating_percentile": 99,
  "rating_confidence": "full",

  "rating_components": {
    "current_weight": 0.62,
    "prior1_weight": 0.24,
    "prior2_weight": 0.09,
    "prior3_weight": 0.05,
    "current_rapm": 0.24,
    "prior1_rapm_age_adjusted": 0.31,
    "prior2_rapm_age_adjusted": 0.28,
    "prior3_rapm_age_adjusted": 0.22
  },

  "game_score_avg": 8.4,
  ...
}
```

The `rating_components` block is for debugging and the site's "explain this rating" tooltip. Not required on the card by default but useful for the methodology page.

---

## Files to touch

1. **New script:** `hgb-analytics/scripts/compute_hgb_rating.py` — runs after `fit_hgb_rating_bayesian.py` and `export_stats_data.py`. Reads prior-season RAPM CSVs, applies age adjustment + TOI-weighted blend, writes rating values into the `players.json` enrichment step.
2. **`hgb-analytics/scripts/export_stats_data.py`** — add the `hgb_rating_current`, `rating_percentile`, `rating_confidence`, `rating_components` fields to the output schema. Should call into the new helper.
3. **Pipeline orchestration** — `compute_hgb_rating.py` runs after RAPM fit + WAR computation, before final `players.json` write.
4. **Documentation:** add a `hgb-docs/analytics/08-hgb-rating.md` describing the methodology. Public-facing version (the tweet-ready line):

> "HGB Rating is a prior-informed talent estimate. It blends current-season RAPM with the player's age-adjusted performance from the last 3 seasons, weighted by current-season minutes — so early-season Ratings lean heavily on prior years and late-season Ratings lean heavily on this year's data."

---

## Percentile computation

After all players have `hgb_rating_current` computed:

1. Group by position (F vs D, separately)
2. Compute percentile rank within each position
3. Store as `rating_percentile` (integer 1-100)

This is the same percentile pattern as existing WAR percentile in `export_stats_data.py`.

---

## Acceptance criteria

- [ ] New script `compute_hgb_rating.py` produces per-player rating values
- [ ] `players.json` includes `hgb_rating_current`, `rating_percentile`, `rating_confidence`, `rating_components` fields
- [ ] `LAMBDA_PRIOR` in `fit_hgb_rating_bayesian.py` remains 0.0 (no regression-level prior; this is post-calc only)
- [ ] Steady-state weights (60/25/10/5) apply for a full-season player with 3+ years of prior data
- [ ] Early-season TOI-weighted formula correctly increases prior weight when current minutes are low
- [ ] Age adjustment uses the same `C_AGE = 0.0025`, `PEAK_AGE = 25.0` curve as the regression
- [ ] Rookie players (no prior NHL data) use the position-average rookie prior
- [ ] Players with <1000 NHL minutes across last 3 seasons flagged as `rating_confidence = "limited_sample"`
- [ ] Traded players compute cleanly (one row per season, no double-counting)
- [ ] Spot-check sanity (steady-state players, current season as of 2025-26):
  - McDavid: Rating should be ~5.5-6.0 (close to WAR since he's been elite for years)
  - Celebrini (sophomore): Rating should be more conservative than WAR — let's say WAR=3.4 → Rating around 2.6 because only 1 prior year of NHL data
  - A pure rookie like Schaefer: Rating should be slightly below WAR because the rookie prior is below average
  - A 31-year-old declining vet (e.g., a Pacioretty-tier player if still active): Rating should be slightly higher than current WAR if last 2 years were better, age-adjusted

## Stop-points

- If the TOI-weighted formula produces ratings that swing wildly run-to-run as a player adds 5-10 more games, the smoothing isn't working. **Stop and surface** — likely a bug in the weight normalization.
- If a known rookie ends up with a Rating dramatically higher than his WAR, the rookie prior may be too aggressive — surface for tuning.
- If the methodology-rules check fails (e.g., LAMBDA_PRIOR somehow ended up non-zero in the regression), **stop immediately**. That violates the locked methodology rule and the entire product separation breaks down.

## Time budget

- Helper script (`compute_hgb_rating.py`): ~2 hours
- Age-adjustment logic (carefully — sign of the delta matters): ~30 min
- Rookie + limited-sample handling: ~30 min
- Integration into export pipeline: ~1 hour
- Spot-check validation: ~1 hour
- Documentation: ~30 min

**Total: 4-6 hours.**

## Reporting back

Two checkpoints:

1. **After helper script computes (~3 hours in):** post a 20-player audit table showing player, war_current, hgb_rating_current, rating_components weights, rating_confidence — let Matt sanity-check the early values before they hit the export pipeline. Especially watch for: rookies showing implausible ratings, declining vets being over-valued by stale priors, and traded players double-counting.
2. **After pipeline ships:** confirm `players.json` has all new fields populated for current season + cross-reference with ticket 1's PP/PK fix (if elite PP players still have PP=0.0, both their WAR and Rating are wrong upstream).

This ticket ships before ticket 5 — the site's HGB Rating Card consumes these new fields.
