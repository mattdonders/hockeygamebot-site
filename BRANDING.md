# HGB Site — Branding Reference

Enforced typography and font-token rules for hockeygamebot-site. This is the site-level complement to `hgb-docs/BRAND.md` (card system) and `hgb-docs/BRAND_LIGHT.md` (light-mode cards).

Last updated: 2026-09-02

---

## Font Tokens

Four canonical CSS custom properties, defined once in `src/styles/tokens.css` (see "Where Tokens Are Defined" below):

| Token | Font | Loaded via |
|-------|------|-----------|
| `--display` | `'Barlow Condensed', sans-serif` | `@fontsource/barlow-condensed` 700, 800, 900 |
| `--body` | `'Barlow', sans-serif` | `@fontsource/barlow` 400, 500, 600, 700 |
| `--semi` | `'Barlow Semi-Condensed', sans-serif` | `@fontsource/barlow-semi-condensed` 700 |
| `--mono` | `'JetBrains Mono', monospace` | `@fontsource/jetbrains-mono` 400, 500 |

All are loaded in `src/components/Fonts.astro`, which is imported by every production page. Barlow plain (400–700) is also used by the canvas card pipeline (`ctx.font` hardcoded strings).

> `--semi` is a site-only extension of the brand spec (not in `BRAND.md`). Use it only for table column headers (small-caps, 12px, uppercase) where a middle-density between `--body` and `--display` improves readability in dense data tables. **`--semi` is now live**: before the token consolidation (see `docs/plans/token-map.md`) it was defined only in `site-tokens.css`/`stats-tokens.css`, neither of which loaded on any production page — so the token was unreachable everywhere it mattered. It now resolves from `tokens.css`, which every production page imports.

---

## Usage Rules

### `--display` (Barlow Condensed)

- Use at `font-size ≥ 15px` only.
- Correct: player names, section headers, large stat values, score displays.
- **Never** on buttons, chips, badges, tabs, pills, or any interactive element.
- **Never** below 14px — condensed letterforms become unreadable at small sizes.

### `--body` (Barlow)

- Use at `font-size < 15px`, OR any interactive element regardless of size.
- Correct: buttons, chips, filter labels, badges, status pills, modal tabs, table abbreviations, body copy, sub-labels, meta descriptions.
- Default for anything not explicitly `--display` or `--mono`.

### `--semi` (Barlow Semi-Condensed)

- Restricted to: table `<th>` column headers (small, uppercase, 700 weight).
- Do not use elsewhere. If uncertain, default to `--body`.

### `--mono` (JetBrains Mono)

- Use for all numeric values, percentages, statistics, timestamps.
- Use for code-like data output.
- **Never** for labels, headings, or non-numeric descriptive text.

---

## Font Weight Scale

Always set `font-weight` explicitly on every text element. Never rely on inheritance.

| Use case | Font | Weight |
|----------|------|--------|
| Large stat value / hero score | `--display` | 800 |
| Player name headline (≥20px) | `--display` | 700 |
| Section header | `--display` | 700 |
| Table column header (th) | `--semi` | 700 |
| Button / chip / badge | `--body` | 600 |
| Body text / sub-label | `--body` | 400–500 |
| Numeric data cell | `--mono` | 400–500 |
| Timestamp / meta numeric | `--mono` | 400 |

---

## What Not To Do

- **Do not use `--display` below 14px.** Change to `--body`.
- **Do not use `--display` on interactive elements** (buttons, tabs, chips). Change to `--body`.
- **Do not use `--mono` for label text** (section labels, team names, filter pills). Change to `--body`.
- **Do not use old token names** (`--font-site-display`, `--font-site-body`, `--font-mono`, `--font-card-display`). These are undefined and resolved as `inherit`. Use `--display`, `--body`, `--mono`.
- **Do not reference `'Geist'` anywhere in production CSS.** Geist is not a brand font. The `--body` token was incorrectly set to Geist during development and has been corrected.
- **Do not load fonts outside of `Fonts.astro`.** Per-page `<link>` Google Fonts imports are for internal POC pages only and must not appear in production pages.
- **Do not add `font-family` declarations without a matching `font-weight`.** The Barlow family has distinct render differences between weights; a missing `font-weight` produces inconsistent cross-browser output.

---

## Where Tokens Are Defined

One layer: `src/styles/tokens.css`. Nothing else in `src/` declares `:root` (outside `_internal/`/`_dev/`, which are excluded from the production token layer by design). It's imported once in `src/layouts/Base.astro`, and directly in the handful of pages that build their own `<head>` instead of using `Base.astro` — see the import list in `docs/plans/token-map.md` §4 step 1 for the full set.

`site-tokens.css`, `stats-tokens.css`, and the `:root` block that used to live in `src/components/Nav.astro` are gone — they were three separate, drifting copies of the same values (that's what made `--semi` unreachable in production, above). There is now exactly one place to change a font token.

---

## Audit History

| Date | Audit | Status |
|------|-------|--------|
| 2026-06-03 | Full typography compliance audit vs BRAND_LIGHT.md | Completed — 47 files, 338 line changes. See `docs/typography-audit-2026-06-03.md`. |
| 2026-06-23 | Font token standardization — Geist removal, old token cleanup | Completed — 5 files fixed. |
| 2026-09-02 | Token consolidation — single `tokens.css` layer, `--site-*`/`--card-*` namespace fix, literal-to-token snap, AA muted-text pass | Completed. See `docs/plans/token-map.md`. |
