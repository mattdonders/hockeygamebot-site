# Player Card — Talent-v1 Migration + Hero Redesign

**Branch:** `feat/player-card-talent-v1` · **Status:** card FROZEN / APPROVED 2026-08-23 ·
**Scope:** local implementation only — NOT deployed. Site auto-deploys from `main`; do
not push/merge without explicit approval.

## What shipped (approved, frozen)

Migrated the Player Talent card from legacy `hgb_rating_percentile` → verified
`hgb_talent_v1_percentile`, and redesigned the Talent+Shotmap hero into a
Talent / current-role split.

### 1. Schema (`src/lib/stats-schemas.ts`)
Added three fields to `PlayerRecordSchema` (Zod `.object()` STRIPS unknown keys, so
un-declared fields would silently vanish from the parsed payload):
- `hgb_talent_v1` — `z.number().nullable().optional()`
- `hgb_talent_v1_percentile` — `z.number().nullable().optional()`
- `hgb_talent_v1_confidence` — `z.enum(['full','limited_sample']).nullable().optional()`

Prod payload states (871 players, verified 2026-08-22): percentile present 765 /
null 54 / absent 52; confidence full 575 / limited_sample 244 / absent 52.
`limited_sample` = thin prior multi-season TOI depth (NOT current-season GP).

### 2. Displayed percentiles migrated to Talent-v1
- Masthead Talent tile (`[slug].astro` ~L800): value → `hgb_talent_v1_percentile`.
- Peer-compare table (rating mode): display `hgb_talent_v1_percentile`; sort key →
  raw `hgb_talent_v1`; mode-aware progressive-widening bands recalibrated for the
  new scale (`hgb_talent_v1` raw sd≈0.036 vs `hgb_rating` sd≈0.90 — bands are
  scale-dependent, percentiles are not).
- History card hero (`drawHistoryCard`): Talent tile → `D.talentV1Pct`.
- **Excluded** (deliberate): bar percentiles `hgb_rating_off_pct` /
  `hgb_rating_def_pct` — shared RAPM component percentiles with no talent_v1
  equivalent field.

### 3. Talent+Shotmap hero redesign (`drawTalentShotmapCard`, ~L2410)
Single Talent% headline → a two-block hero:
- **Talent (subject):** 63% of hero width, 58px BLACK Barlow Condensed, team colour,
  dominant. Label `HGB TALENT · MULTI-YEAR`. `LTD SAMPLE` tinted-red chip beneath
  when `confidence === 'limited_sample'`.
- **Current role (context):** 37% width, 40px BLACK Barlow Condensed, muted grey
  (`rgba(13,13,20,0.72)`). Stacks `CURRENT ROLE` / value / `TOI/G · {season}` /
  `EARLY SAMPLE · {gp} GP` chip (when `gp < 20`). The label framing explains WHY
  ice-time sits beside a multi-year rank rather than reading as a 2nd headline.
- Both values vertically centred on a common midline (`textBaseline='middle'`).
- Unavailable Talent → small muted 34px `—` centred in the slot + `LTD SAMPLE`
  beneath (intentional "unavailable", not a failed-render giant dash).
- Hierarchy is carried by SPACE + SIZE + CONTRAST, not a foreign font weight —
  both values keep the card's heavy/black weight.

Removed (dead/legacy): `drawRatingCardHorizontal` (5×2 social) and
`drawRatingCardPortrait`. Carousel binding simplified to the single Talent card.

### 4. Counting strips / labels
Renamed `TOI/GP` → `TOI/G` at the season-card counting strips.

### 5. Empty-state WAR strip (`drawTalentShotmapCard` white strip)
No-prior-WAR state rewritten as an intentional card-system state: a calm centred
two-line unit `PAST SINGLE-SEASON WAR` / `NO PRIOR WAR ON RECORD`, both condensed
uppercase JetBrains Mono (message lighter/smaller + 0.5px tracking, muted grey) —
rhymes with `MULTI-YEAR SHOT MAP UNAVAILABLE`, not body copy.

## Verification
- Tests: 155/155 (11 files), incl. new `talent-v1-schema.test.ts` (fixture-locked
  parse of all four prod nullability states + hero qualifier boundary predicates).
- Typecheck: `[slug].astro` at 16-error baseline (all pre-existing client-script DOM
  typing noise) — zero new errors introduced.
- Render-tested all three hero states via `scripts/render_talent_hero_check.mjs`
  (serves dist/, Playwright reads the canvas dataURL): McDavid (full),
  Schaefer (limited_sample+value), Luneau (null pct + gp1 → dash + empty WAR).

## Design iteration log (hero)
Locked after 6 tuning passes with the user's engineer:
50/50 equal → TOI 48px → 42px semibold → revert to 42px black + vertical-centre →
63/37 split + `CURRENT ROLE` reframe → TOI 40px → empty-state metadata voice.
Approved 2026-08-23.

## Deferred items — RESOLVED 2026-08-23

Both decisions were made against real-pixel mocks (rendered in-page so the
production `@font-face` set applies — JetBrains Mono ships only 400/500 latin, so
700 faux-bolds identically to the live card; embedded fonts would misrepresent
that). Mocks: `scripts/render_decision_mocks.mjs`; impl verify:
`scripts/verify_deferred_impl.mjs`.

- **Masthead LTD SAMPLE badge — DONE.** `limited_sample` now shows an `LTD SAMPLE`
  chip (same red-on-tint grammar as the Talent share card) *absolutely positioned*
  bottom-center inside the Talent tile. A shared `min-height:118px` (mobile 86px)
  on `.hero-tile` keeps all three tiles the same box and the values on one baseline
  — the chip is overlaid into reserved whitespace, so it does **not** grow the tile
  or shift the value; WAR/Impact carry no fake badge row. Rejected: asterisk (would
  overload the provisional-WAR `*` with a 2nd meaning on the same page) and
  `TALENT · LTD` suffix (too cryptic).
- **History-card TOI/G column — DONE.** Added as the first value column
  (`SEASON | TOI/G | WAR | IMPACT | GF% | xGF%`, `VAL_AREA/5`), per-season from
  `s.toi_avg_sec`, muted monospace `rgba(13,13,20,0.72)` (context, not a
  percentile). Chosen over a 4th hero tile, which would only show current TOI/G
  (already on the Talent+Shotmap hero) and squeeze the percentile tiles.

- **Season-card LTD flag — DONE (2026-08-23).** The HGB WAR hero tile's gray
  `limited sample` note is now the same `LTD SAMPLE` tinted-red pill
  (`drawSeasonCard`, ~L1854 + draw loop). Provisional note stays plain text (a
  softer, different state). Before/after render-verified on Kastelic 2021-22
  (`scripts/render_season_ltd.mjs`, `PHASE=before|after`). All three card variants
  (Talent / History / Season) now share the locked chip grammar.
