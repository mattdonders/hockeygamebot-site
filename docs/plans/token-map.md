# HGB Token Map — implementation brief

**Status:** ready to execute. **Audience:** the session doing the token consolidation.
**Reference design:** `docs/plans/statement-mockup-a.html` (System tab names the six components).
**Written:** after auditing every `:root` block, every `var()` reference, and every hardcoded
colour literal in `src/`. Contrast figures below are measured, not estimated.

Read Section 1 before touching anything. Several assumptions in the original brief were wrong,
and one of them is a live bug.

---

## 1. The actual state

### 1.1 It is not five competing `:root` blocks. It is 32.

| Location | Count |
|---|---|
| Files declaring their own `:root` | **32** |
| of those, production pages/components | **22** |
| of those, `_internal/` or `_dev/` | 10 |
| Files declaring `--display:` | **30** |

The "five blocks" framing in `CLAUDE.md` describes the *intended* architecture. The real
architecture is that most pages redeclare the whole palette locally.

### 1.2 Two of the five stylesheets are already dead in production

Neither `site-tokens.css` nor `stats-tokens.css` is imported by `Base.astro`, `Nav.astro`, or any
production page. Their only importers are dev harnesses:

```
src/_dev/stats/components.astro     imports stats-tokens.css
src/_dev/artifacts/index.astro      imports site-tokens.css
```

Every other mention of them in `src/` is a code comment.

`table-tokens.css` **is** live, `@import`ed by exactly four pages: `stats/series/[slug].astro`,
`stats/wowy.astro`, `support.astro`, `methodology.astro`.

The only token layer that reaches every page is the `<style is:global>` block in
**`src/components/Nav.astro`**. `Base.astro` has a near-duplicate `:root` that Nav re-declares.

### 1.3 Live bug: ~115 token references resolve to nothing

The `--site-*` namespace is defined only in `site-tokens.css` and `stats-tokens.css`, which do not
load in production. But it is referenced in production components:

```
src/components/stats/GameRow.astro, LeaderboardRow.astro, DualStatBar.astro,
PageHeader.astro, PlayerHero.astro, SectionEyebrow.astro,
src/components/home/TomorrowHero.astro, PageHero.astro, TweetEcho.astro, and Nav.astro
```

None of these define `--site-*` locally, and no consumer page defines it either.

| Reference form | Count | Behaviour today |
|---|---|---|
| `var(--site-white)` and similar, **no fallback** | **115** | Declaration is invalid, property falls back to inherited/initial |
| `var(--site-white, #f5f5f5)` and similar, **with fallback** | 26 | Renders the fallback, which is a **dark-mode** value on a light page |

The fallbacks in use are `#f5f5f5`, `#1c1c1c`, `#0f0f0f`, `#555`, `#2e2e2e`, `#999`. Those come
from the dark-only home page palette. Anywhere one of those 26 renders on a light surface, it is
wrong today.

**Do not faithfully preserve this. Fixing it is the point of the exercise.** Expect visible
changes in those components, and treat those changes as corrections.

`--semi` has the same problem: 9 references, defined only in the three non-loading stylesheets.
Barlow Semi-Condensed *is* loaded by `Fonts.astro`, so only the token is missing.

### 1.4 Which tokens are actually load-bearing

Reference counts across `src/`:

| Heavy use, keep the name | | Dead, delete | |
|---|---|---|---|
| `--mono` | 741 | `--ink-03` | 0 |
| `--ink` | 656 | `--site-rule` | 0 |
| `--ink-48` | 441 | `--card-bg` | 0 |
| `--display` | 402 | `--card-brand` | 0 |
| `--ink-32` | 361 | `--hover-bg` | 0 |
| `--body` | 352 | `--grad-poor` / `--grad-neutral` | 0 |
| `--ink-14` | 310 | `--hgb-red-hover` | 0 |
| `--red` | 294 | `--red-bg` | 0 |
| `--surface` | 236 | `--sp-*` (all) | 0 |
| `--ink-20` | 188 | `--radius-lg` | 0 |
| `--ink-06` | 154 | `--shadow-modal` | 0 |
| `--bg` | 147 | | |
| `--ink-10` | 85 | Barely used, fold in | |
| `--ink-72` | 87 | `--site-dim` | 2 |
| `--ink-56` | 78 | `--card-muted` | 2 |
| `--status-live` | 55 | `--card-rule` | 1 |
| `--hgb-red` | 44 | `--card-panel-bg` | 1 |
| `--ink-04` | 37 | `--grad-elite` | 1 |
| `--green` | 28 | `--topbar-h` | 1 |
| `--grid-line` | 24 | `--ink-86` | 1 |

**This is a consolidation, not a rename.** `--ink`, `--red`, `--surface`, `--bg`, `--ink-XX`,
`--display`, `--body`, `--mono` carry over 3,000 references between them. Renaming them to
Statement's private names would be pure churn with no user-visible benefit. Keep the winning
names, change the values, and delete the duplicates.

### 1.5 Hardcoded literals that should be tokens

| Literal | Occurrences |
|---|---|
| `rgba(13,13,20,x)` in any form | **~650** |
| `#0d0d14` | 127 |
| `#E8002D` | 120 |
| `#EFEEE8` | 112 |

The ink scale has **47 distinct alpha values** hardcoded against 12 defined steps, including
spelling drift for identical values: `0.1`/`0.10`, `0.2`/`0.20`, `0.3`/`0.30`, `0.4`/`0.40`.
Off-scale values in real use include 0.018, 0.025, 0.05, 0.09, 0.12, 0.15, 0.16, 0.18, 0.22,
0.24, 0.25, 0.28, 0.35, 0.36, 0.38, 0.42, 0.45, 0.5, 0.52, 0.55, 0.62, 0.65, 0.8, 0.85, 0.9, 0.92.

### 1.6 Canvas cards are not coupled to CSS at all

`src/pages/stats/player/[slug].astro` contains **78 hardcoded hex strings** inside the
`define:vars` draw block. Only three files anywhere read CSS variables into canvas via
`getComputedStyle` (`stats/lines/[slug].astro`, `stats/explore.astro`, `games/index.astro`).

So changing a token value **will silently desync the site from the share cards**, with nothing
failing. See Section 5.

---

## 2. Rulings on every collision

Each ruling is final for this pass. Contrast is measured; ratios are against the surface named.

### 2.1 Dark page shell: `#090909` wins, `#1c1c1f` loses

| Source | Value |
|---|---|
| `Nav.astro` `html[data-theme="dark"]` | `--bg: #1c1c1f`, `--surface: #262629` |
| `stats-tokens.css` + `BRANDING.md` + design brief | shell `#090909`, card `#0f0f0f`, tile `#0d0d14` |

**Ruling: the three-shade split wins.** It is documented as deliberate, it matches the Python
card pipeline's `_PALETTES["dark"]`, and the brief calls it out explicitly. Nav's `#1c1c1f` was a
local invention.

**Blast radius is low.** `Nav.astro` currently force-sets `data-theme="light"` and hides the
toggle, so dark mode is not reachable by users today. Change it freely; do not un-hide the toggle
in this pass.

Note the three shades sit at 1.03–1.04:1 against each other. That is intentional. They are
separated by borders, not luminance. Do not "fix" them.

### 2.2 Brand red: `#E8002D` in both modes, plus a text-safe variant

Measured:

| Pair | Ratio | Verdict |
|---|---|---|
| `#E8002D` on `#EFEEE8` | **4.04** | fails AA normal text, passes large |
| `#E8002D` on `#090909` | **4.24** | fails AA normal text, passes large |
| `#FF3D50` on `#090909` (Nav's dark red) | 5.72 | passes |

Nav's dark red was a *correct* instinct for contrast, but wrong as a token name: it redefined the
brand constant. **Ruling:** `--red` stays `#E8002D` in both modes as the identity and
large-element colour. Add `--red-text` for small text.

| Token | Light | Ratio | Dark | Ratio |
|---|---|---|---|---|
| `--red` | `#E8002D` | 4.04 | `#E8002D` | 4.24 |
| `--red-text` | `#B8001C` | **5.91** | `#FF5A6E` | **6.58** |

Rule: `--red` for fills, borders, dots, the wordmark, and text at 19px+ bold or 24px+ regular.
`--red-text` for anything smaller. Red remains identity and active-UI only, never a data series
and never a team.

### 2.3 The ink scale fails AA at the two most-used steps

Measured on `#EFEEE8`:

| Token | Rendered | Ratio | AA normal (4.5) | AA large (3.0) | Uses |
|---|---|---|---|---|---|
| `--ink-32` | `#a7a6a4` | **2.09** | fail | fail | 361 |
| `--ink-48` | `#838282` | **3.30** | fail | pass | 441 |
| `--ink-56` | `#707071` | **4.26** | fail (marginal) | pass | 78 |
| `--ink-72` | `#4c4c4f` | 7.36 | pass | pass | 87 |

**Ruling for this pass:** keep all twelve steps at their current values. Do **not** silently
re-map 800 references. Instead:

1. Add one new step `--ink-60: rgba(13,13,20,0.60)` (renders `#6b6b6c`, **4.58:1**, passes AA).
2. Where `--ink-48` or `--ink-32` is used for **body copy or a label under 15px**, switch that
   specific declaration to `--ink-60`.
3. Leave `--ink-32` and `--ink-48` in place for rules, borders, dividers, disabled states, and
   large type. Those uses are legitimate.

This is a bounded fix, not an accessibility overhaul. Log anything you cannot classify rather
than guessing.

### 2.4 Green and positive/negative: consolidate to `--pos` / `--neg`

Currently `--green` is `#14803c` in `Base.astro` and `#4ade80` in Nav dark. `--stats-pos` is
`#166534` in `Base.astro` and redefined in `teams/[abbr].astro` for both modes. There is also a
hardcoded `#22c55e` override block in Nav for five specific selectors.

**Ruling:** one pair, `--pos` and `--neg`, mode-aware. Keep `--green` and `--stats-pos` as
aliases pointing at `--pos` during migration, then delete them. Delete Nav's five-selector
`#22c55e` override once `--pos` is mode-aware, since it exists only to work around the token not
flipping.

| Token | Light | Ratio | Dark | Ratio |
|---|---|---|---|---|
| `--pos` | `#166534` | 6.13 | `#35D08E` | 10.02 |
| `--neg` | `#B0001F` | 6.30 | `#FF5A6E` | 6.58 |

### 2.5 Blue: it already exists, it was never a token

The card system uses `#4285f4` for context metrics ("read with caution", not a grade) and
`#1a56c4` as the cold end of the shot-map diverging scale. Both are hardcoded in
`stats/player/[slug].astro` and in the `.pct-row` markup. This is a real semantic colour with a
defined meaning and it deserves a token.

Measured on `#EFEEE8`: `#4285f4` is **3.07** (large text only), `#1a56c4` is **5.69** (passes).

**Ruling:** two tokens, because they do different jobs.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--ctx-fill` | `#4285F4` | `#4285F4` | context **bar fills** only. Matches the card pipeline exactly, so site and card agree. |
| `--ctx` | `#1A56C4` | `#6BA4FF` | context **text and numerals**. 5.69 light / 7.95 dark. |

Blue is never a team colour and never a fifth status. It means one thing: context, not a grade.

### 2.6 Status colours: the spec values are dark-mode values

The brief's status values (`live #00e5ff`, `OT #ff9800`, `scheduled #ffca28`, `final #555`) are
correct on the dark shell and unusable on cream. Measured on `#EFEEE8`: live **2.07**, OT 3.26,
scheduled 2.71, goal 3.11. Only `final` passes.

**Ruling:** status colours are **indicators** (dot, fill, border, bar) in both modes. When the
status *word* is set in that colour at small size, use the `-ink` variant.

| Token | Light | Dark | Light `-ink` (AA text) |
|---|---|---|---|
| `--status-live` | `#00B8CC` | `#00E5FF` | `--status-live-ink: #007784` (4.55) |
| `--status-ot` | `#C96A00` | `#FF9800` | `--status-ot-ink: #9D5300` (4.92) |
| `--status-fut` | `#B88A00` | `#FFCA28` | `--status-fut-ink: #876500` (4.64) |
| `--status-goal` | `#0E9A5E` | `#00E676` | `--status-goal-ink: #0B7849` (4.76) |
| `--status-final` | `#6A6A62` (4.69) | `#7D7D7D` (4.84) | n/a, already passes |

Note `--status-final` in dark is lifted from `#555555`, which is only 2.67:1 on `#090909`.

`--status-scheduled`, `--status-intermission`, `--status-danger` exist in `site-tokens.css` with
1–6 uses each. Map `--status-scheduled` to `--status-fut` and keep `--status-intermission` and
`--status-danger` only if a real consumer survives; otherwise delete.

### 2.7 The two-layer `--site-*` / `--card-*` namespace: delete it

Its stated purpose was to let analytics tiles match the Python card exports. In practice it does
not load, 115 of its references are broken, and the values it defines are dark-only.

**Ruling:** delete both namespaces. Preserve the *intent* with the three surface tokens `--bg`,
`--surface`, `--tile`, which carry the three-shade split into the single layer. Migrate each
`--site-*` reference by meaning, not by name:

| Old | New | Note |
|---|---|---|
| `--site-bg` | `--bg` | |
| `--site-card` | `--surface` | |
| `--site-border` | `--ink-14` | it was a border |
| `--site-border2` | `--ink-20` | |
| `--site-dim` | `--ink-10` | |
| `--site-muted` | `--ink-48` | check size; use `--ink-60` if body copy |
| `--site-text` | `--ink-60` | it was body text at `#999` on dark |
| `--site-white` | `--ink` | "strongest text in context", which is what `--ink` means |
| `--site-rule` | `--hair` | |
| `--card-bg` | `--tile` | |
| `--card-text` | `--ink` | |
| `--card-muted` | `--ink-60` | |
| `--card-rule` | `--ink-14` | |
| `--card-panel-bg` | `--ink-04` | |
| `--card-brand-rule` | `--red` | |

**These 141 references are the highest-risk part of the job.** They are currently rendering
either nothing or a dark value on light. Screenshot each of the 10 affected components before and
after.

### 2.8 Light surface stays `#EFEEE8`

`statement-mockup-a.html` uses `#F1F0EA`. That was drift on my part while building the mockup.
`BRANDING.md` and 112 hardcoded literals say `#EFEEE8`. **The site value wins; the mockup is
wrong.** Do not propagate `#F1F0EA`.

---

## 3. The target token layer

Create **`src/styles/tokens.css`**. This is the complete file.

```css
/* ============================================================
   HGB — the single token layer.
   Imported once, in Base.astro, BEFORE Nav.astro's style block.
   Nothing else in src/ may declare :root.
   ============================================================ */

:root {
  /* ── Surfaces: three shades, deliberate ─────────────────── */
  --bg:      #EFEEE8;   /* page shell */
  --bg-2:    #E8E7E0;   /* lifted band inside the page */
  --surface: #FFFFFF;   /* card */
  --tile:    #EFEEE8;   /* analytics tile inside a card */

  /* ── Ink ────────────────────────────────────────────────── */
  --ink:     #0D0D14;
  --ink-04:  rgba(13,13,20,0.04);
  --ink-06:  rgba(13,13,20,0.06);
  --ink-10:  rgba(13,13,20,0.10);
  --ink-14:  rgba(13,13,20,0.14);
  --ink-20:  rgba(13,13,20,0.20);
  --ink-32:  rgba(13,13,20,0.32);   /* rules, disabled, large type only */
  --ink-48:  rgba(13,13,20,0.48);   /* borders, large type only */
  --ink-56:  rgba(13,13,20,0.56);
  --ink-60:  rgba(13,13,20,0.60);   /* NEW — the AA-safe muted text step, 4.58:1 */
  --ink-64:  rgba(13,13,20,0.64);
  --ink-72:  rgba(13,13,20,0.72);
  --ink-86:  rgba(13,13,20,0.86);

  /* ── Brand: identity and active UI only. Never a data series. */
  --red:      #E8002D;   /* fills, dots, borders, wordmark, type >= 19px bold */
  --red-text: #B8001C;   /* small text, 5.91:1 */

  /* ── Semantic ───────────────────────────────────────────── */
  --pos: #166534;
  --neg: #B0001F;
  --ctx:      #1A56C4;   /* context metrics as TEXT — not a grade */
  --ctx-fill: #4285F4;   /* context metrics as BAR FILL — matches the card pipeline */

  /* ── Percentile ramp (RGB triplets, used as rgb(var(--x))) ─ */
  --pct-lo:  232, 0, 45;
  --pct-mid: 207, 206, 198;
  --pct-hi:  0, 192, 120;

  /* ── Status: indicators. Use -ink variants for small text. ─ */
  --status-live:      #00B8CC;
  --status-live-ink:  #007784;
  --status-ot:        #C96A00;
  --status-ot-ink:    #9D5300;
  --status-fut:       #B88A00;
  --status-fut-ink:   #876500;
  --status-goal:      #0E9A5E;
  --status-goal-ink:  #0B7849;
  --status-final:     #6A6A62;

  /* ── Type: four faces, four jobs ────────────────────────── */
  --display: 'Barlow Condensed', sans-serif;  /* names, numerals, headlines. >= 15px. never interactive */
  --body:    'Barlow', sans-serif;            /* copy, labels, and every interactive element */
  --semi:    'Barlow Semi-Condensed', sans-serif; /* table <th> only */
  --mono:    'JetBrains Mono', monospace;     /* every number, time, percentile */

  /* ── Structure ──────────────────────────────────────────── */
  --hair: 1px solid var(--ink-10);
  --rule: 1px solid var(--ink-14);
  --radius-sm:  2px;
  --radius-md:  3px;
  --nav-height: 60px;
  --grid-line:  rgba(13,13,20,0.04);
}

/* Specificity 0-1-1 beats any :root, so this wins wherever the attribute is set. */
html[data-theme="dark"] {
  --bg:      #090909;   /* broadcast black shell */
  --bg-2:    #141418;
  --surface: #0F0F0F;   /* card */
  --tile:    #0D0D14;   /* analytics tile — matches _PALETTES["dark"] */

  --ink:     #EFEEE8;
  --ink-04:  rgba(239,238,232,0.04);
  --ink-06:  rgba(239,238,232,0.06);
  --ink-10:  rgba(239,238,232,0.10);
  --ink-14:  rgba(239,238,232,0.14);
  --ink-20:  rgba(239,238,232,0.20);
  --ink-32:  rgba(239,238,232,0.40);
  --ink-48:  rgba(239,238,232,0.56);
  --ink-56:  rgba(239,238,232,0.64);
  --ink-60:  rgba(239,238,232,0.68);
  --ink-64:  rgba(239,238,232,0.74);
  --ink-72:  rgba(239,238,232,0.82);
  --ink-86:  rgba(239,238,232,0.92);

  --red:      #E8002D;
  --red-text: #FF5A6E;

  --pos: #35D08E;
  --neg: #FF5A6E;
  --ctx:      #6BA4FF;
  --ctx-fill: #4285F4;

  --pct-mid: 58, 58, 66;

  --status-live:      #00E5FF;
  --status-live-ink:  #00E5FF;
  --status-ot:        #FF9800;
  --status-ot-ink:    #FF9800;
  --status-fut:       #FFCA28;
  --status-fut-ink:   #FFCA28;
  --status-goal:      #00E676;
  --status-goal-ink:  #00E676;
  --status-final:     #7D7D7D;

  --grid-line: rgba(239,238,232,0.04);
}
```

### Temporary alias block

Add this **in the same file**, and delete it at the end of step 6. It keeps the site rendering
while the migration is in flight.

```css
:root, html[data-theme="dark"] {
  --hgb-red: var(--red);
  --green:   var(--pos);
  --stats-pos: var(--pos);
  --stats-neg: var(--neg);
  --status-scheduled: var(--status-fut);
  --ink-03: var(--ink-04);
}
```

---

## 4. Migration, in order

Each step is a separate commit. Do not batch them.

**Step 1 — add the layer, change nothing.**
Create `src/styles/tokens.css` exactly as above, including aliases. Import it in `Base.astro`
before `<Nav />`. Do not delete anything yet. Build and confirm zero visual change on
`/`, `/stats/skaters`, `/stats/player/jack-hughes-8481559`, `/games/…`, `/scoreboard`.

**Step 2 — strip the duplicate declarations.**
Delete the `:root` and `html[data-theme="dark"]` blocks from `Nav.astro` and `Base.astro`.
Delete the `:root` block from the 20 other production files that declare one. Keep every rule
that *uses* tokens. `_internal/` and `_dev/` pages: leave alone, they are out of scope.
Re-check the five routes after each batch of five files.

**Step 3 — fix the broken `--site-*` references.**
Apply the mapping table in 2.7 to all 141 references across the 10 components listed in 1.3.
Screenshot each component before and after at both 1400px and 390px. This step *should* produce
visible changes. Note each one in the commit message.

**Step 4 — snap hardcoded literals to tokens.**
In this order, and only in `.astro`/`.tsx`/`.css` **style** blocks:
`#EFEEE8` → `var(--bg)`; `#0d0d14` → `var(--ink)`; `#E8002D` → `var(--red)`;
`rgba(13,13,20,0.XX)` → the nearest defined step.
Snap off-scale alphas to the nearest token: 0.018/0.02/0.025/0.03 → `--ink-04`; 0.05/0.07 → `--ink-06`;
0.08/0.09/0.12 → `--ink-10`; 0.15/0.16 → `--ink-14`; 0.18/0.22/0.24 → `--ink-20`;
0.25/0.28/0.30/0.35/0.36 → `--ink-32`; 0.38/0.40/0.42/0.45/0.50/0.52 → `--ink-48`;
0.55/0.56 → `--ink-56`; 0.62/0.64/0.65 → `--ink-64`; 0.80/0.85/0.86 → `--ink-86`.
**Do not touch any hex inside a `define:vars` script block or any `ctx.` canvas call.** See Section 5.

**Step 5 — the AA fix from 2.3.**
Only where `--ink-32` or `--ink-48` sets text under 15px, switch to `--ink-60`. Leave every other
use. If a case is ambiguous, leave it and list it in the commit message.

**Step 6 — fold in `table-tokens.css` and delete the dead files.**
Rewrite `table-tokens.css` to use tokens instead of its hardcoded `rgba(13,13,20,…)` values, keep
it as the four-page `@import` it already is. Then delete `site-tokens.css` and `stats-tokens.css`,
and repoint the two `_dev/` importers at `tokens.css`. Finally delete the alias block from
Section 3 and fix whatever breaks.

**Step 7 — update the docs.**
`CLAUDE.md`: replace the five-blocks description with "one layer, `src/styles/tokens.css`, nothing
else declares `:root`". `BRANDING.md`: update the "Where Tokens Are Defined" section, and record
that `--semi` is now live.

---

## 5. Out of scope — do not touch

- **Every canvas card.** The 78 hardcoded hex values in `stats/player/[slug].astro`'s
  `define:vars` block, and the same pattern in the goalie page, stay exactly as they are. That
  block cannot import ES modules, and the values are deliberately synchronised with the Python
  pipeline. Changing them desyncs the share cards with nothing failing.
- **`src/lib/team-colors.ts`** and its two mirrors in `public/js/hgb-charts.js` and the bot repo's
  `utils/team_details.py`. Team colour is a separate system.
- **The theme toggle.** `Nav.astro` force-sets `data-theme="light"` and hides the control. Leave
  both. Dark mode values are being corrected in this pass, not shipped.
- **`_internal/` and `_dev/` pages.** 10 of the 32 `:root` blocks. Leave them.
- **Any layout, spacing, type-scale or component change.** This pass changes colour token
  *definitions and references* only. The Statement redesign is a separate pass.

---

## 6. Verification

Baseline as of this audit, so you can measure progress. Each must reach the target.

| Check | Today | Target |
|---|---|---|
| `:root` blocks outside `tokens.css`, excluding `_internal`/`_dev` | **24** | 0 |
| `var(--site-*)` and `var(--card-*)` references | **147** | 0 |
| `#EFEEE8` / `#0d0d14` / `#E8002D` literals in `.astro` | **183** | canvas blocks only |

Before opening the PR:

1. `npm run build` clean.
2. `grep -rn "^\s*:root" src/ | grep -v _internal | grep -v _dev | grep -v styles/tokens.css`
   returns **nothing**.
3. `grep -rn "var(--site-\|var(--card-" src/` returns **nothing**.
4. `grep -rn "#EFEEE8\|#0d0d14\|#E8002D" src/ --include=*.astro` returns only matches inside
   `define:vars` blocks or `ctx.` canvas calls.
5. Screenshots at 1400px and 390px, both `data-theme` values, for: `/`, `/stats/skaters`,
   `/stats/player/jack-hughes-8481559`, `/stats/goalies`, `/games/[id]`, `/scoreboard`,
   `/teams/NJD`, `/methodology`. Set `data-theme="dark"` manually in devtools to check dark.
6. Contrast spot-check: no text under 15px renders below 4.5:1 against its surface.
7. Confirm a share card still downloads correctly from the player page and is pixel-identical to
   one generated before the change.

---

## 7. Decisions that need Matt, not the implementer

Ask before assuming. Each has a default so the work is not blocked.

1. **`--red-text` at `#B8001C`.** It is a visibly deeper red than the brand. Acceptable for small
   text, or would you rather keep `#E8002D` everywhere and accept 4.04:1?
   *Default if no answer: ship `--red-text`, since it only affects small text.*
2. **The `--ink-48` body-text fix.** It touches a lot of muted labels and makes the site slightly
   higher-contrast overall. Ship in this pass or split into a follow-up?
   *Default: ship it, bounded as described in 2.3.*
3. **Blue as a token.** Confirmed as "context, not a grade" plus the shot-map cold end, and
   nothing else? Any other intended meaning would need its own token.
   *Default: those two meanings only.*
4. **The `--site-*` corrections in step 3 will change how ten components look**, because they are
   broken today. Do you want to review those screenshots before the rest of the migration lands?
   *Default: yes, review before step 4.*
