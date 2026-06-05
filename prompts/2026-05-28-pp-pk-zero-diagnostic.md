# Engineer Briefing — PP+0.00 / PK+0.00 Diagnostic (HIGHEST PRIORITY)

**Filed:** 2026-05-27
**Repo:** `hgb-analytics` (pipeline + export) — likely fix lands in `export_stats_data.py` or upstream RAPM CSV
**Status:** Open. **Do this first** — blocks public trust in WAR components and may be a 30-minute fix.
**Strategic context:** The ChatGPT methodology peer review (`~/Downloads/ChatGPT-RAPM WAR Methodology Review.md`, May 27 2026) flagged this directly:

> "McDavid, Kucherov, Makar, Hughes, Bouchard, etc. should not all have zero-looking PP contribution if total WAR includes PP RAPM. Maybe this is rounding or your sample output is EV-only despite the label. But if users see elite PP players with `PP+0.00`, they will distrust the component. Fix the display or component plumbing before launch."

Sample output from the audit confirms it: every top-15 forward + defenseman shows `PP+0.00 PK+0.00`, including McDavid, MacKinnon, Kucherov, Makar, Hughes, Bouchard, Werenski. That cannot be right.

This is the cheapest, highest-impact fix in the whole sprint. Methodology memory: `/Users/mattdonders/.claude/projects/-Users-mattdonders-Development-hgb/memory/methodology_rapm_war_principles.md` (the 3-product principle assumes PP/PK plumbing works).

---

## What we're building

A diagnostic script (or a 30-minute manual trace) that prints, for 5 obvious PP players, every value in the chain from RAPM CSV → JSON export → rendered card. Whichever stage drops the value to zero is the bug.

### The 5 players to trace

```
Connor McDavid       (EDM)  — elite PP1 C
Nikita Kucherov      (TBL)  — elite PP1 RW
Cale Makar           (COL)  — elite PP1 D
Quinn Hughes         (VAN)  — elite PP1 D
Evan Bouchard        (EDM)  — elite PP1 D
```

All five should have meaningful `pp_off_rapm` and nontrivial `pp_toi_min`. If any of them comes out at 0.0 in any stage, that's the bug.

---

## The diagnostic table

For each player, print:

```
player_id
player_name
pp_toi_min                      (from bayesian_rapm_{season}.csv)
pp_off_rapm                     (from bayesian_rapm_{season}.csv)
pp_factor                       (the conversion constant — see export_stats_data.py _PP_VALUE)
pp_war_component                (pp_off_rapm * pp_factor * toi term)
final_total_war                 (the value going into players.json)
card_json_pp_value              (the value as serialized in players.json)
rendered_card_pp_value          (what the player card actually displays)
```

If any of these are inconsistent → that's where the bug is.

### Interpretation

| Where the zero shows up | Likely cause |
|---|---|
| DB / RAPM CSV has 0.0 | Model / input / filter bug. Check `MIN_PP_TOI_MIN = 50.0` threshold, PP design-matrix encoding, or strength-state filter in `fit_hgb_rating_bayesian.py` |
| DB has nonzero, players.json has 0.0 | Export bug — likely in `export_stats_data.py` (the join, the rounding, or the column lookup) |
| players.json has nonzero, card has 0.0 | Render / formatting bug in the site (likely truncation or wrong field name) |

---

## First thing to check (probable root cause)

**Are PP rows keyed by `player_name` while EV rows are keyed by `player_id`?**

This is the silent zero pattern that causes nothing to merge:

- If the Bayesian RAPM CSV writes PP rows with `player_name` as the join key but the export expects `player_id`, the join silently returns nothing and PP=0.0 for everyone.
- Same for PK.
- The EV columns work fine because they share the join key with the main table.

Check `scripts/fit_hgb_rating_bayesian.py` PP/PK output section — does it write `player_id` consistently? Then check `export_stats_data.py:_load_bayesian_rapm()` (around line 244) — does the lookup use `player_id` as the dict key?

If the join key is mismatched, fix that single line and rerun. Probably the entire ticket.

---

## Second thing to check

**MIN_PP_TOI_MIN = 50.0 threshold.** From `fit_hgb_rating_bayesian.py:84`:

```python
MIN_PP_TOI_MIN = 50.0  # minimum PP TOI for pp_off_rapm to be reported
MIN_PK_TOI_MIN = 50.0  # minimum PK TOI for pk_def_rapm to be reported
```

McDavid plays >250 PP minutes a year, so the threshold shouldn't be tripping on the audit-list players. But verify the threshold logic isn't backward — if it's `<` instead of `>=`, every player gets nulled out.

---

## Third thing to check

**Rounding to 4 decimals followed by `if row.get("pp_off_rapm")` truthiness checks.** From `export_stats_data.py:267`:

```python
pp_rapm = float(row["pp_off_rapm"]) if row.get("pp_off_rapm") else None
```

`row.get("pp_off_rapm")` returns the string `"0.0"` if the CSV cell is literally `0.0`, but `"0.0"` is truthy → that's fine. But if the cell is empty string `""`, that returns None which is correct. The bug would be if all cells in the CSV are empty strings. Verify by opening the CSV.

---

## Acceptance criteria

- [ ] Diagnostic table printed for all 5 players showing every stage value
- [ ] Root cause identified — one of: model, export join, render
- [ ] Fix applied + rerun for current season
- [ ] All 5 players show nonzero PP component on the rendered card (McDavid in particular should be visibly large)
- [ ] PK component non-zero for known PK forwards (Bergeron-tier — pick a current example like Trocheck or O'Reilly)
- [ ] Sample of 10 forwards + 10 D shown in CLI output to confirm distribution looks healthy (most PP1 guys >0, most non-PP guys near zero)

## Stop-points

- If the bug is in the RAPM regression itself (rare) and re-fitting the model takes >2 hours, **stop and surface to Matt** before kicking off a full re-fit. Surface the diagnostic findings + the proposed fix for sign-off.
- If the issue turns out to be that PP RAPM was never wired to total WAR at all (i.e., the WAR formula ignores PP component), that's a methodology change — file separately, don't silently rewire.

## Time budget

- **Manual trace of 5 players: 30-45 minutes**
- Fix + rerun: 30-60 minutes
- Verification (10-player audit): 15 minutes

**Total: 1-2 hours.** If it's taking longer than 2 hours, the bug is deeper than expected — stop and surface.

## Reporting back

Single report after diagnosis + fix:

1. Which stage was the zero coming from (model / export / render)
2. The fix (one-line diff if possible)
3. A 5-row audit table showing before/after values for the 5 named players
4. A 10-row sanity audit showing the distribution looks healthy (some non-zero PP, some zero, in the expected pattern)

Once this lands, the PP/PK columns become trustable inputs for tickets 2-5.
