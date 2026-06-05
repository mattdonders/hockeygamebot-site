# Engineer Briefing — Card System Refresh (WAR / Rating / Impact Separation)

**Filed:** 2026-05-28
**Repos:** `hockeygamebot-site` (site player page) + `hgb-bot` (PNG card scripts)
**Status:** Open. Depends on Ticket 4 (HGB Rating pipeline) being merged first — this ticket consumes `hgb_rating` and `hgb_rating_percentile` fields from `players.json`.
**Supersedes:** `prompts/2026-05-28-card-label-refresh.md` (now absorbed into this ticket)

---

## The three-product separation (load-bearing principle)

From the 2026-05-27 ChatGPT methodology review + our own validation work:

```
HGB WAR         = what happened this season (single-season accounting)
HGB Rating      = how good is this player right now (prior-informed talent estimate)
HGB Impact      = how much did they show up game-to-game (Dom-style game score)
```

These answer DIFFERENT questions. They must be labeled clearly, displayed at different hierarchy levels, and never confused with each other.

**JFresh's "Proj WAR %" = our HGB Rating** (both are prior-informed multi-year talent estimates).
**HGB WAR** is our single-season accounting metric — a different product.
**HGB Impact / Game Score** is our per-game performance metric — shown on game pages and as a season-average trend.

---

## Surface 1 — Site player page (`src/pages/stats/player/[slug].astro`)

### Current state

The masthead hero currently shows two large percentage tiles side by side:
- `HGB WAR` (percentile within position)
- `HGB IMPACT` (percentile within position)

### What to change

**Step 1: Add HGB Rating as the new primary hero**

Once Ticket 4 ships, `players.json` has `hgb_rating` and `hgb_rating_percentile`. Add a new hero tile as the PRIMARY headline number:

```
HGB RATING PERCENTILE     ← new primary (prior-informed talent)
93rd
+0.42 blended RAPM
```

**Step 2: Demote WAR to secondary**

```
HGB WAR                   ← secondary (this season only)
2.19 WAR  ·  42 GP
```

**Step 3: Rename HGB Impact label**

`HGB IMPACT` → `Avg Game Impact` or `HGB Game Score`

Add a small descriptor: "Per-game production + involvement"

This makes it obvious it's a different type of metric than WAR/Rating.

**Step 4: Add limited-sample badge for Rating**

If `hgb_rating_confidence === 'limited'` (player has <1000 total NHL minutes over 3 seasons):

```html
<span class="limited-badge">Limited sample</span>
```

Small badge below the Rating percentile number. Don't hide the number — just flag it.

**Step 5: Reorder component bars into sections**

Current bars mix impact, scoring, and context all together. Separate into visual sections:

```
SEASON VALUE (RAPM-derived)
  EV Offense
  EV Defense
  Finishing
  Penalties
  PP
  PK

SCORING PROFILE
  Goals / 60
  A1 / 60
  xG / 60
  Shots / 60

USAGE CONTEXT
  Opp Quality
  Mate Quality
```

This makes the card feel like a model, not a stat dump. Matches ChatGPT's recommendation.

**Step 6: Add small methodology footer line**

Below the masthead, above the component bars:

```
HGB Rating · Prior-informed talent estimate · Percentile vs {position}
```

For WAR:
```
HGB WAR · Single-season value · 2025-26
```

This prevents "your WAR is reputation-based" Twitter arguments.

---

## Surface 2 — PNG player card (`hgb-bot/scripts/cards/generate_player_card.py`)

This is the **Game Score / Impact card** — single-game or season-average performance. It does NOT need WAR or Rating. Its job is: "justify the Impact number."

### Changes

1. **Rename hero label**: `HGB IMPACT` → `HGB GAME SCORE` or `Avg Game Impact`
2. **Add descriptor**: small text "Per-game production · season average" (or per-game if it's a single-game card)
3. **Drop "%" from the percentile display**: `98%` → `98th percentile` (cleaner framing)
4. **Add methodology footer**: `Game Score = production + involvement + context`

### What NOT to change on this card
- The component decomposition (this is the card's value — justify the number)
- The seasonal trend line chart

---

## Surface 3 — PNG rating card (`hgb-bot/scripts/cards/generate_hgb_rating_card.py`)

This card already exists as a "three-circle Offense / Net / Defense + QoT/QoC bars" design. Once Ticket 4 ships the `hgb_rating` field, this card should consume that directly.

### Changes

1. **Hero label**: `HGB RATING` (already correct name)
2. **Hero value**: show `hgb_rating_percentile` as primary + `hgb_rating` (raw) as secondary
3. **Descriptor**: `Prior-informed talent estimate · {season}` or add multi-year indicator
4. **Limited-sample badge**: if `confidence === 'limited'` show small badge
5. **Distinguish clearly from Season Card**: add "3-yr weighted" to the footer or subtitle

### What NOT to change
- The three-circle offense/net/defense layout (this is the card's identity)
- QoT/QoC bars

---

## What TWO CARD TYPES means for social posting

There should be two distinct shareable artifacts going forward:

| Card | When to post | Best for |
|---|---|---|
| **HGB Season Card (WAR)** | During season, game recaps, award debates | "How valuable is he THIS season?" |
| **HGB Rating Card** | Offseason, trade rumors, preseason previews | "How good is he RIGHT NOW?" |
| **HGB Game Score Card** | After big individual games, game nights | "How much did he show up tonight?" |

The bot infrastructure already has separate scripts for these — they just need the label + hierarchy updates.

---

## Acceptance criteria

### Site player page
- [ ] `hgb_rating` and `hgb_rating_percentile` consumed from `players.json`
- [ ] Rating tile is the PRIMARY hero (largest, first)
- [ ] WAR tile is secondary (smaller, with GP context: "2.19 WAR · 42 GP")
- [ ] Impact/Game Score tile is tertiary with correct label ("Avg Game Impact")
- [ ] Limited-sample badge renders when `hgb_rating_confidence === 'limited'`
- [ ] Component bars sectioned: SEASON VALUE / SCORING PROFILE / USAGE CONTEXT
- [ ] Methodology footer lines present on both Rating and WAR tiles
- [ ] Light + dark mode render correctly
- [ ] Mobile: tiles stack cleanly

### PNG Game Score card
- [ ] Hero label reads `HGB GAME SCORE` or `Avg Game Impact` (not `HGB IMPACT`)
- [ ] Percentile reads `98th` not `98%`
- [ ] Methodology footer: "Game Score = production + involvement + context"

### PNG Rating card
- [ ] Consumes `hgb_rating_percentile` from pipeline (not recomputed)
- [ ] Limited-sample badge when applicable
- [ ] Footer distinguishes from season card: "Prior-informed · 3-yr weighted"

---

## Out of scope for this ticket

- Color-coding on stat cells (deferred — potential copy of hockeystats.com pattern, needs design decision first)
- Column selection UI on tables (Table.astro v2, deferred)
- New card layouts / redesigns beyond label hierarchy changes
- iOS app card updates (separate ticket)

---

## Stop-points

- **Don't start until Ticket 4 is merged** — the `hgb_rating` field must exist in `players.json` before the site page can consume it
- If the PNG card scripts require significant refactor to adopt new labels, surface to Matt before spending >2 hours on them

## Time budget

- Site player page changes: ~3-4 hours
- PNG Game Score card labels: ~1 hour
- PNG Rating card + pipeline consumption: ~2 hours

Total: ~6-7 hours. Can be split across two engineers or done sequentially after Ticket 4.

## Reporting back

1. Screenshot of updated player page masthead (Rating primary, WAR secondary, Impact tertiary)
2. Sample PNG of updated Game Score card with new label
3. Sample PNG of updated Rating card with `hgb_rating_percentile` from pipeline
4. Confirm limited-sample badge works on a known rookie (Celebrini, Bedard)
