# HGB Site — Branding Reference

Enforced typography and font-token rules for hockeygamebot-site. This is the site-level complement to `hgb-docs/BRAND.md` (card system) and `hgb-docs/BRAND_LIGHT.md` (light-mode cards).

Last updated: 2026-06-23

---

## Font Tokens

Three canonical CSS custom properties, defined in `src/components/Nav.astro` (`:root`) and synchronized in `src/styles/site-tokens.css` and `src/styles/stats-tokens.css`:

| Token | Font | Loaded via |
|-------|------|-----------|
| `--display` | `'Barlow Condensed', sans-serif` | `@fontsource/barlow-condensed` 700, 800, 900 |
| `--body` | `'Geist', system-ui, sans-serif` | `@fontsource/geist` 400, 500, 600, 700 |
| `--semi` | `'Barlow Semi-Condensed', sans-serif` | `@fontsource/barlow-semi-condensed` 700 |
| `--mono` | `'JetBrains Mono', monospace` | `@fontsource/jetbrains-mono` 400, 500 |

All are loaded in `src/components/Fonts.astro`, which is imported by every production page. Barlow plain (400–700) is also loaded there — used by the canvas card pipeline (`ctx.font` hardcoded strings) and the player page's local `--body` override.

> **Why `--body` is Geist, not Barlow:** The site shell (nav, home, scoreboard, support pages) was designed and weight-tuned with Geist. Barlow reads noticeably thinner at small sizes (11–13px) even at the same weight number. The canvas card pipeline hardcodes Barlow directly and is unaffected by this token. The player page sets its own local `--body: 'Barlow'` override for its UI context.

> `--semi` is a site-only extension of the brand spec (not in `BRAND.md`). Use it only for table column headers (small-caps, 12px, uppercase) where a middle-density between `--body` and `--display` improves readability in dense data tables.

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

Token definition hierarchy (last wins in CSS cascade):

1. `src/styles/site-tokens.css` — home page dark shell tokens (`:root`)
2. `src/styles/stats-tokens.css` — stats page two-layer token system (`:root` + `[data-mode="light"]`)
3. `src/components/Nav.astro` — canonical font token override (`:root` in component style block, loads after global sheets)

All three must stay in sync. If you change a font token value, update all three.

---

## Audit History

| Date | Audit | Status |
|------|-------|--------|
| 2026-06-03 | Full typography compliance audit vs BRAND_LIGHT.md | Completed — 47 files, 338 line changes. See `docs/typography-audit-2026-06-03.md`. |
| 2026-06-23 | Font token standardization — Geist removal, old token cleanup | Completed — 5 files fixed. |
