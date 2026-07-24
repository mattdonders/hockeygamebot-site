# DE Prompt — Confirm the season window for each Rating-card field

**Filed:** 2026-06-07
**Why:** The Rating card's 11 profile bars appear to span **three different windows**, so no short caption can describe them accurately. Before we change the front-end label again (we already got burned once labeling on inference), confirm the exact window behind each field.

## Confirm the window for each field

For each, state the exact window — e.g. "current season only", "flat/equal-weighted 3-season", "current + N prior, ice-time-weighted", etc.

**Profile bars:**
| Card bar | Field | Window? |
|---|---|---|
| EV Offense | `hgb_rating_off_pct` | ? |
| EV Defense | `hgb_rating_def_pct` | ? |
| Goals/60 | `g_60_pct_3yr` | ? |
| A1/60 | `a1_60_pct_3yr` | ? |
| xG/60 | `xg_60_pct_3yr` | ? |
| Finishing | `finishing_pct_3yr` | ? |
| Pen Diff | `pen_diff_pct_3yr` | ? |
| Power Play | `percentiles_vs_pos.pp_off` | ? |
| Penalty Kill | `percentiles_vs_pos.pk_def` | ? |
| Opp Quality | `qoc_pct_3yr` | ? |
| Mate Quality | `qot_pct_3yr` | ? |

**Hero tiles:**
| Tile | Field | Window? |
|---|---|---|
| HGB RATING | `hgb_rating_percentile` (+ `hgb_rating_components` blend) | ? |
| HGB WAR | single-season WAR percentile (site computes from `player.war`) | ? |
| HGB IMPACT | `gs_pct` (game score percentile) | ? |

## Specific questions

1. Is the `*_pct_3yr` window the **same** ice-time-weighted "current + up to 3 prior" blend that `hgb_rating` uses (per `hgb_rating_components`: `current_weight` / `prior1-3_weight`)? Or is `_3yr` a **flat/equal-weighted 3-season** computation — i.e. a different methodology than the rating blend?
2. Are `percentiles_vs_pos.pp_off` / `pk_def` **current-season only**, or multi-year? (There's no `pp_off_3yr` / `pk_def_3yr` field, so the card uses these directly — we *suspect* current-season but haven't confirmed.)
3. **Can PP and PK get a percentile on the same window as the other bars** (3yr or rating-blend), so all 11 bars share **one** window? If yes, we label the card cleanly ("3-year profile" or "rating blend"). If not feasible, just confirm each field's window and we'll label the mix honestly.

## Front-end status

No label changes pending your answer. Current live caption is the neutral "HGB RATING PROFILE · vs FORWARDS" + "Ice-time-weighted multi-season blend" — the second line is only accurate for the EV bars, so we'll correct it once you confirm. One-line change either way.
