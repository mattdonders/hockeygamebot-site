# Pipeline + Methodology Sprint Overview — 2026-05-28

**Filed:** 2026-05-27 (for 2026-05-28 sprint)
**Status:** All 5 tickets specced and ready for engineer review.
**Strategic context:** This is the **pivot from site work to methodology shoring**. The site rewrite + competitive audits (May 21-27) closed the presentation gap against NST / hockey-statistics.com / MoneyPuck. The remaining trust gap is the methodology layer itself — specifically the WAR formula's brittle constants and the lack of independent validation.

Triggered by a ChatGPT methodology peer review on the night of 2026-05-27 (`~/Downloads/ChatGPT-RAPM WAR Methodology Review.md`). The verdict was "model is defensible, but easy tears exist in the WAR layer." Methodology decisions locked in `/Users/mattdonders/.claude/projects/-Users-mattdonders-Development-hgb/memory/methodology_rapm_war_principles.md`.

The 5 tickets below execute the recommendations.

---

## The 5 tickets

1. **`2026-05-28-pp-pk-zero-diagnostic.md`** — Diagnose why every elite PP player shows `PP+0.00 PK+0.00`. Likely a 1-2 hour fix (probable cause: PP rows keyed by player_name while EV rows keyed by player_id).
2. **`2026-05-28-war-validation-framework.md`** — Build `validate_war_methodology.py` with three views: split-season stability, year-to-year persistence, team-level conservation check. Replaces "EH correlation as scoreboard" with independent validation.
3. **`2026-05-28-replacement-and-divisor-empirical.md`** — Replace fixed `REPLACEMENT_LEVEL = -0.10` and `WAR_DIVISOR = 4.58` with league-pooled empirical computation + rolling 3-year smoothing. Both versioned.
4. **`2026-05-28-hgb-rating-product.md`** — New `hgb_rating_current` product alongside `war_current`. Post-calc TOI-weighted blend of current + 3 prior seasons. `LAMBDA_PRIOR` stays 0.0 (rule locked).
5. **`2026-05-28-card-label-refresh.md`** — Site work: refresh Season Card labels, build new HGB Rating Card. Consumes outputs from tickets 1-4.

---

## Recommended execution order

### Day 1 (morning)

**Ticket 1 first** — it's a diagnostic, possibly a 30-minute fix, and unlocks trust in PP/PK plumbing before any downstream work runs against it. Should not block anything else.

### Day 1 (afternoon + Day 2)

**Tickets 2 and 3 in parallel** if engineer has bandwidth — they're independent:
- Ticket 2 (validation framework) is a new script that consumes existing outputs
- Ticket 3 (empirical constants) modifies the export pipeline

If single engineer: do **ticket 3 first** (empirical constants), then **ticket 2** (validation framework can now validate against the new constants).

### Day 2-3

**Ticket 4** (HGB Rating product) — depends on ticket 3's empirical constants being in place so the Rating uses the same divisor + replacement level as WAR. Otherwise the two products are slightly inconsistent.

### Day 3 (or later, after backend ships)

**Ticket 5** (card label refresh) — site-side, consumes ticket 4's new fields. Don't start until ticket 4's `hgb_rating_current` and `rating_confidence` are in `players.json`.

---

## Total estimated effort

| Ticket | Hours |
|---|---|
| 1 — PP/PK diagnostic | 1-2 |
| 2 — Validation framework | 4-6 |
| 3 — Replacement + divisor | 3-4 |
| 4 — HGB Rating product | 4-6 |
| 5 — Card label refresh | 2-3 |

**Total: 16-22 engineer hours = 2-3 day sprint** depending on parallelism + how clean the existing code is.

---

## What this sprint buys

Once all 5 land:

1. **PP/PK numbers are trustworthy** on all current and future cards
2. **Three independent validation views** replace circular EH correlation as the trust metric
3. **Empirical replacement level + rolling divisor** make the WAR formula defensible in a tweet
4. **HGB Rating product** gives HGB a foothold in JFresh's "projected multi-year" lane without abandoning the season-value differentiation
5. **Card labels** make the three-product split (WAR / Rating / Game Score) obvious to viewers

The cumulative effect: the model that ships after this sprint is "defensible for public consumption" by the ChatGPT review's standard — not just because the math is sound, but because the methodology layer can be explained in a tweet AND validated against independent signals.

---

## What's deliberately deferred

- **Re-fitting RAPM with new threshold (MIN_TOI_MIN = 200 → fit everyone)** — the ChatGPT review recommended fitting all players including <200-min call-ups, then hiding low-minute players from public output. This is a real improvement but adds noise to the regression and requires a full pipeline rebuild. Deferred to a separate sprint.
- **Individual offense bonus refactor (z-scored goals/A1 → regressed individual-offense component)** — the ChatGPT review called this "the brittlest part of the WAR layer." The locked methodology memory doesn't address it. Worth a separate methodology decision before any refactor — leave as-is for this sprint.
- **`LAMBDA_FE = 500` re-tuning** — review suggested grid-testing FE shrinkage. Lower priority than the bundled tickets here.
- **Projection card (Card Type C)** — forward-looking product. Out of scope until Rating ships and is validated.

---

## Handoff notes

- All tickets reference the methodology memory at `/Users/mattdonders/.claude/projects/-Users-mattdonders-Development-hgb/memory/methodology_rapm_war_principles.md` — engineer should read it before starting any ticket
- All tickets reference the original ChatGPT review at `~/Downloads/ChatGPT-RAPM WAR Methodology Review.md`
- Tickets specify stop-points clearly — surface to Matt rather than push through when something doesn't match expectations
- Ticket 1 is the highest priority because it's both the cheapest and the most user-visible. Even if the rest of the sprint slips, fixing PP+0.00 makes the existing model dramatically more trustworthy on social.

Engineer should review all 5 tickets, ask any clarifying questions, then start with ticket 1 to scope confidence before committing to the multi-day plan.
