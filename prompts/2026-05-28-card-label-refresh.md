# Engineer Briefing — Card Label Refresh + Season Card vs Rating Card Split

**Filed:** 2026-05-27
**Repo:** `hockeygamebot-site` (rewrite branch) — site work, NOT pipeline
**Status:** Open. **Ships AFTER tickets 1-4** because it consumes the new pipeline outputs (PP/PK fix, validation framework, empirical constants, and HGB Rating).
**Strategic context:** The ChatGPT methodology review (and methodology memory: `/Users/mattdonders/.claude/projects/-Users-mattdonders-Development-hgb/memory/methodology_rapm_war_principles.md`) lands the public-facing piece of the strategy:

> "Make the card extremely clear about what each number means. The best public product is not one magical number. It is a clean split: WAR = season value. RAPM/components = why. Game Score = night-to-night impact. Rating = optional prior-informed talent."

Today HGB has one card type ("Season Card") with mixed labels ("HGB WAR 100%" and "HGB IMPACT 98%" — the latter is actually Dom-style Game Score, not a WAR-equivalent). The ChatGPT review's reaction:

> "HGB IMPACT 98% reads like another season-value stat. Since it's a Dom-style game score model, call it 'Avg Game Impact' or 'HGB Game Score' — never put it side-by-side with WAR like another value metric."

This ticket: refresh labels on the existing card (Card A: Season Card), and build the new HGB Rating Card (Card B) that competes with JFresh.

See `hgb-docs/BRAND.md` for design tokens (colors, type scale, etc.).

---

## What we're building

**Two card types**, both consuming the pipeline outputs from tickets 1-4:

### Card Type A — Season Card (existing, refresh labels)

Refresh labels and section the component bars. No new card asset — just edit the existing one.

### Card Type B — HGB Rating Card (NEW product)

New Canvas-direct PNG export, new share URL pattern (`/cards/rating/{slug}`). Both cards accessible from each player page.

---

## Card Type A — Season Card label refresh

### Top of card

Current:
```
HGB WAR          HGB IMPACT
100%             98%
4.72 WAR         10.2 GS avg
```

New:
```
HGB WAR Percentile          Avg Game Impact
93rd                        98th percentile
2.19 WAR                    10.2 Game Score Avg
```

Key changes:
- Replace `100%` with `93rd` (the literal ordinal — clearer than a percentage)
- Replace `HGB WAR` label with `HGB WAR Percentile` (no ambiguity about what 93 means)
- Rename `HGB IMPACT` → `Avg Game Impact` (it's Dom-style game score, NOT a WAR-equivalent)
- Drop `GS avg` shorthand → `10.2 Game Score Avg`
- Drop `%` symbol throughout, use ordinal language (`93rd`, `98th percentile`)

### Footer line

Add a tiny methodology line at the footer:

```
Single-season value · Percentile vs position · 2025-26
```

This is the trust-builder. Prevents the "is this season-only or prior-informed?" Twitter arguments.

### Component bars — SECTION them

Today the bars are one flat list mixing isolated impact, box-score stats, and context. The methodology memory locks the sectioning:

```
IMPACT
  EV Offense
  EV Defense
  Finishing
  Penalties
  PP
  PK

SCORING
  Goals/60
  A1/60
  xG/60
  Shots/60

CONTEXT
  Opp Quality
  Mate Quality
```

Each section gets a section header (small caps, muted color) above its bars. Same percentile bar styling as today, just visually grouped.

---

## Card Type B — HGB Rating Card (NEW)

### Layout

Same overall structure as the Season Card, but the headline number is the Rating, not the WAR.

### Top of card

```
HGB Rating Percentile
88th
2.45 Rating
```

If the player's `rating_confidence` field is `"limited_sample"`, add a small badge below the value:

```
[Limited sample]   — small chip in muted/yellow color, no border to keep it subtle
```

### Footer line

```
Prior-informed talent estimate · 3-year weighted · Percentile vs position
```

### Component bars

Same three sections as Season Card (IMPACT / SCORING / CONTEXT), but using Rating-derived values. The component bars on this card should reflect the *blended* values, not the single-season ones.

Concretely: when computing the IMPACT section bars (EV Offense, EV Defense, etc.) for the Rating card, multiply each component by the player's `current_weight` and add `prior_weight * blended_prior_components`. The Rating Components block in `players.json` (`rating_components`) gives you the weights — apply them to each sub-component the same way they were applied to total Rating.

Edge case: if the player is a rookie, the component bars will basically be current-season components (because the rookie prior is undifferentiated). That's fine and expected.

---

## Card asset (PNG export)

Both cards need PNG export at the same dimensions as the existing Season Card.

For the Rating Card:
- Same Canvas-direct render pattern as the existing card export
- Same dimensions / aspect ratio (~1200 × 1200 or whatever the existing standard is)
- Same logo + branding positioning
- Different headline number + footer line + (optional) confidence badge

### New share URL pattern

```
/cards/season/{slug}    — existing Season Card URL pattern
/cards/rating/{slug}    — NEW Rating Card URL pattern
```

Both should be reachable from the player detail page via two share buttons or a single share button with a card-type toggle. UX is at the engineer's discretion — match existing patterns on the site.

---

## Player page integration

On `/stats/skaters/{slug}` (player detail page):

1. Show both card types as previews — Season Card first (it's the headline product), Rating Card second (it's the supporting product).
2. Each card preview has a "Share" button that links to the corresponding PNG export URL.
3. The card-explainer tooltip (if it exists) should highlight the distinction: "Season cards show what happened this year. Rating cards show what we expect going forward."

---

## Accessibility / mobile

- Mobile rendering: card content should stack vertically without breaking the percentile bars
- Card sections (IMPACT / SCORING / CONTEXT) headers should still read clearly at 320px viewport width
- PNG export must be the same pixel-perfect output regardless of viewer device

---

## Acceptance criteria

### Season Card refresh
- [ ] Top labels updated: `HGB WAR Percentile` / `Avg Game Impact` (no `%`, ordinal language)
- [ ] Raw values shown beneath: `2.19 WAR` / `10.2 Game Score Avg`
- [ ] Footer line added: `Single-season value · Percentile vs position · 2025-26`
- [ ] Component bars sectioned into IMPACT / SCORING / CONTEXT
- [ ] No regression in PNG export quality or dimensions
- [ ] Mobile rendering verified

### Rating Card (new)
- [ ] New card asset rendering `HGB Rating Percentile / 88th / 2.45 Rating` headline
- [ ] "Limited sample" badge shows when `rating_confidence === "limited_sample"`
- [ ] Footer: `Prior-informed talent estimate · 3-year weighted · Percentile vs position`
- [ ] Same component bar structure (IMPACT / SCORING / CONTEXT) using Rating-derived values
- [ ] PNG export available at `/cards/rating/{slug}`
- [ ] Reachable from player detail page

### Both cards
- [ ] BRAND.md tokens applied — colors, type scale, spacing consistent
- [ ] Light + dark mode both work
- [ ] Spot-check 5 players (McDavid, Makar, Celebrini, a rookie, a known limited-sample call-up):
  - McDavid: both cards show high values, no badge
  - Celebrini: Rating slightly more conservative than WAR (1 year of prior data)
  - A rookie: Rating is conservative, no `limited_sample` badge unless prior-3-season total <1000 min
  - A known limited-sample player: `limited_sample` badge appears

## Out of scope (do NOT build in this ticket)

- Projection cards (forward-looking — separate product)
- Career trend charts on either card (separate ticket)
- A combined "Season + Rating" comparison view (interesting but not load-bearing for v1)
- Rating Card historical archive (only current season needs to ship)

## Stop-points

- If the pipeline outputs from ticket 4 (`hgb_rating_current`, `rating_percentile`, `rating_confidence`) aren't yet in `players.json` when you start, **stop and confirm ticket 4 has shipped**. This ticket consumes those fields directly — building UI on missing data wastes hours.
- If the Rating values look implausible for a sanity-check player (e.g., McDavid Rating < 3 or a 4th-liner Rating > 4), **stop and surface to Matt + the engineer who built ticket 4**. The site shouldn't ship cards built on suspicious data.
- If splitting component bars into IMPACT / SCORING / CONTEXT requires significant refactoring of the existing card render code (>1 hour just to support sectioning), surface to Matt before continuing — this is a polish improvement, not a load-bearing change.

## Time budget

- Season Card label refresh + section bars: ~1 hour
- Rating Card scaffolding (reusing Season Card layout): ~1 hour
- Component-bar Rating-derived values + confidence badge: ~30 min
- PNG export pipeline for new card type: ~30 min
- Player page integration (preview + share button): ~30 min

**Total: ~2-3 hours** assuming the existing card system is component-based and adding a second card type is mostly composition.

## Reporting back

Single checkpoint after both cards ship:

1. Screenshots of both cards for 3 players: a steady-state star (McDavid), a sophomore (Celebrini), and a limited-sample player
2. Confirm light + dark + mobile all render
3. PNG export URLs working for both card types
4. The methodology footer lines render exactly as specified — these are the trust-move language and matter for Twitter consumption

After this ships, the public can compare HGB cards directly against JFresh's. HGB's lane (per the review): season-value cards. JFresh's lane: projected multi-year. The Rating Card is HGB's optional foot in JFresh's lane without abandoning the season-value differentiation.
