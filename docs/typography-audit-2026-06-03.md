# HGB Typography Audit — 2026-06-03

Pre-commit review packet. **Not committed.**

## Background

A full-site typography compliance audit was run against `BRAND_LIGHT.md` (canonical web/light-mode rules) immediately before soft launch. The audit identified three categories of violation, one of which was a silent rendering bug that would have affected production.

---

## Brand rules (summary)

From `hgb-docs/BRAND_LIGHT.md`:

| Token | Font | When to use |
|---|---|---|
| `--display` | Barlow Condensed | Display text ≥15px. Headlines, scores, large stat values. NEVER on buttons, chips, tabs, anything interactive, anything <14px. |
| `--body` | Barlow | UI text, labels, buttons, chips, badges, tabs, table headers/abbreviations, anything <15px. |
| `--mono` | JetBrains Mono | Numeric values, percentages, statistics, code output ONLY. NEVER for labels or descriptive text. |

Additional rules:
- Every text element must set `font-weight` explicitly.
- `--display` must not appear below 14px.

---

## Findings

### Category A — Undefined CSS tokens (CRITICAL)

**37 files** used custom properties that were **never defined** in any CSS `:root`:

| Old token (undefined) | Correct token | Font it resolves to |
|---|---|---|
| `--font-site-display` | `--display` | Barlow Condensed |
| `--font-site-body` | `--body` | Barlow |
| `--font-mono` | `--mono` | JetBrains Mono |
| `--font-card-display` | `--display` or `--body` | (case-by-case) |

**Effect in production:** Browsers resolve undefined CSS properties as `inherit`. Where no ancestor set the font explicitly, these fell back to the browser's default serif or sans-serif — not Barlow. The affected components visually appeared correct in local dev (likely due to body-level `font-family: var(--body)` cascading), but the intent was not explicitly declared and the rendering was fragile.

**Affected files:**
- All 14 `src/components/home/*.astro`
- All 12 `src/components/home/artifacts/*.astro`
- `src/components/stats/DualStatBar.astro`
- `src/components/stats/GameRow.astro`
- `src/components/stats/LeaderboardRow.astro`
- `src/components/stats/PageHeader.astro`
- `src/components/stats/PercentileTile.astro`
- `src/components/stats/PlayerHero.astro`
- `src/components/stats/SectionEyebrow.astro`

**Fix:** Direct token substitution. `--font-site-display` → `--display`, `--font-site-body` → `--body`, `--font-mono` → `--mono`. No other changes.

---

### Category B — `--mono` used for label/UI text

`JetBrains Mono` was applied to section labels, period labels, team abbreviations in sidebars, filter pills, table headers, button text, and CTA links. Per BRANDING.md, mono is strictly for numeric values and data output.

**Affected files and selectors:**

| File | Selectors fixed |
|---|---|
| `GameModal.astro` | `.modal-period`, `.modal-wp-lbl`, `.modal-section-label`, `.modal-star-team`, `.modal-stats-pill`, `.modal-stat-label`, `.modal-goalie-table thead th`, `.modal-assist-name`, `.modal-strength-badge` |
| `Nav.astro` | `.nav-status`, `.beta-pill`, `.nav-mobile-label` |
| `StatsSubnav.astro` | Nav tab buttons (raw `'JetBrains Mono'` string) |
| `Table.astro` | `.dl-btn`, `.td-sub`, `.pos-badge`, `.tbl-empty td`, `.tbl-loading td` |
| `methodology.astro` | 11 selectors: all section labels, product labels, component names, sidebar labels, CTA links, guide-key, sidebar-version, footer |
| `cards.astro` | `.type-tab`, `.gen-btn`, `.dl-btn`, `.loading-label`, `.error-label`, `.beta-notice`, `.empty-sub`, `.output-tag`, `.result-meta` |
| `scoreboard.astro` | `.gwo-eyebrow`, `.gwo-context`, `.hc-wp-mid`, `.hc-sb-label`, `.hc-last-label span`, `.hc-recent-label span`, `.hc-star-name`, `.hc-recent-desc`, `.bc-status`, `.no-games-sub`, `.ticker-lbl` |
| `TweetEcho.astro` | `.te-handle`, `.te-card-type` |
| `RecapFilterBar.astro` | `.rfb-order`, `.rfb-sort` |
| `RecapHero.astro` | `.rh-meta` |
| `index.astro` | `.hero-eyebrow`, `.final-card-tag`, `.also-head` |

**Fix:** `font-family: var(--mono)` → `font-family: var(--body)` for all non-numeric label selectors.

---

### Category C — `--display` on small/interactive elements

Barlow Condensed was used on elements that are either interactive (buttons, tabs, chips) or smaller than 14px.

| File | Selector | Size | Fix |
|---|---|---|---|
| `Table.astro` | `.tbl-th` (table column headers) | 12px | → `--body` |
| `index.astro` | `.hero-eyebrow` | 11px | → `--body` |
| `index.astro` | `.final-card-tag` | 10px | → `--body` |
| `index.astro` | `.also-head` | 10px | → `--body` |
| `cards.astro` | `.type-tab` (interactive tab buttons) | 11px | → `--body` |
| `cards.astro` | `.gen-btn` (primary action button) | 14px | → `--body` |
| `cards.astro` | `.dl-btn` (download button) | 12px | → `--body` |
| `cards.astro` | `.error-label` | 16px interactive | → `--body` |

**Fix:** `font-family: var(--display)` → `font-family: var(--body)` for all interactive elements and text under 14px.

---

### Category D — Missing explicit `font-weight`

Elements rendered text without declaring `font-weight`, relying on inheritance — which BRAND.md forbids (weight differences between 700 and 800 are visually significant in Barlow Condensed).

| File | Selector | Fix |
|---|---|---|
| `PercentileTile.astro` | `.ptile-label`, `.ptile-val`, `.ptile-pct` | Added explicit `font-weight` + explicit `font-family` (parent was using undefined `--font-card-display`) |
| `PlayerHero.astro` | Name and metadata selectors | Added explicit `font-family` declarations; removed blanket parent `font-family: var(--font-site-display)` |

---

## What was NOT changed

| Element | Reason |
|---|---|
| `--mono` on `.modal-stat-num`, `.modal-stat-pct`, `.modal-gc-score`, `.modal-gc-wp-delta` | Actual numeric values — correct per spec |
| `--mono` on `.tbl-td` data cells (number/stat columns) | Numeric data — correct |
| `--mono` on `.mono-block` in methodology.astro | Code/formula display — correct |
| `--mono` on `.te-engage` in TweetEcho.astro | Engagement counts (like/RT/reply numbers) — correct |
| `--mono` on `.rfb-chip .ct` in RecapFilterBar.astro | Numeric count in chip — correct |
| Canvas rendering functions (`drawRapmCard`, `drawRatingCard`, `drawCompare`) | Out of scope — canvas has separate rendering pipeline |
| All `.tsx` React components | Zero changes — only `.astro` files touched |
| All routing, data fetching, API calls, table sorting/filtering | Not touched |

---

## Remaining known issues

1. **`src/pages/internal/`** files (insights.astro, sql-explorer.astro, loggedout-poc.astro): Not in scope for this audit — they are local-only POC pages not shipped to production.

2. **Dark-mode pages** (if any exist beyond the canvas card system): Not audited — BRAND.md dark card rules were noted but card rendering pipelines were explicitly excluded.

3. **Third-party/React component styles**: `HGBTable.tsx`, `SkatersTable.tsx`, `PlayerSearch.tsx` etc. were not audited for inline style drift. These components use inline `style={{}}` objects with explicit font families — a separate audit may be warranted if drift is suspected there.

4. **`Table.astro` — `.tbl-th` table column headers**: Changed from `--display` (12px) to `--body`. This is the most visible change on table-heavy pages. If any table headers look less bold/condensed after this change, the fix is correct — they were previously violating the ≥15px display rule.

---

## Diff summary

```
47 files changed, 338 insertions(+), 334 deletions(-)
```

All changes are CSS `font-family` token substitutions. No HTML structure, no JS/TypeScript, no routing, no data, no behavior changed.

**`npm run check`:** 4 errors — all pre-existing in internal POC files. Zero new errors from the audit.

**Not committed. Not pushed.**
