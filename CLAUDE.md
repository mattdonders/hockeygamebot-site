# hockeygamebot-site — Claude Code Instructions

## Table System

**HGBTable is the canonical base for all interactive tables.**

- New table surfaces must be thin wrapper components around `HGBTable` (`src/components/react/HGBTable.tsx`).
- Wrappers own: page-specific filters, defaults, column definitions, export chips, row actions.
- HGBTable owns: sorting, filtering, virtualization, CSV/PNG export, toolbar.
- `Table.astro` is for Astro/SSR static tables (no React interactivity). It is NOT the canonical foundation for interactive tables.
- `PlayerCareerTable` is a justified exception — it cannot be expressed through HGBTable's declarative API because it owns: (1) a Regular/Playoffs mode toggle that switches the entire column set and data source, (2) `document.dispatchEvent('hgb:season-select')` on row click to update EV bars on the Astro page, (3) a `<tfoot>` career totals row, (4) a PNG export path via `window.HGB_Export.downloadTablePng`, and (5) different column schemas for the two modes (career_seasons feed for regular, player_season_stats playoffs[] for playoffs).
- `PlayerGameLogTable` uses HGBTable as its base (migrated Jun 2026). If you see it re-implemented with a raw TanStack table, that is a regression.

**Do not add new table surfaces outside this pattern without a documented reason.**

## Export Pattern

Wrappers with custom filter UIs should use `onExportReady` to get export functions from HGBTable:

```tsx
const exportFnsRef = useRef<{ exportCsv: () => void; exportPng: () => void } | null>(null);
const handleExportReady = useCallback((fns) => { exportFnsRef.current = fns; }, []);
// ...
<button onClick={() => exportFnsRef.current?.exportCsv()}>↓ CSV</button>
<HGBTable toolbar={{ show: false }} onExportReady={handleExportReady} ... />
```

Do not use `toolbar={{ hiddenExports: true }}` or proxy-click DOM patterns (`document.getElementById(...).click()`).

## Stats Cards (canvas)

- Player/goalie share cards are `<canvas>` drawn **client-side** inside a `<script define:vars={{...}}>` block (`src/pages/stats/player/[slug].astro`, `.../goalies/[slug].astro`). That script **cannot import ES modules** — share logic via build-time frontmatter + `define:vars`/props; inline only tiny per-card logic.
- **Team colour:** `pickTeamColor()` in `src/lib/team-colors.ts` (falls back to the secondary when the primary is near-black, L<0.15). Canonical list mirrored in **three** places — `team-colors.ts`, `public/js/hgb-charts.js`, and the bot repo's `utils/team_details.py`; update all three.
- **Age:** `src/lib/age.ts` `ageFromBirthDate()` — current age *as of today* (birthday-aware), not season-start.
- **Bar percentile value size:** one shared `PCT_VALUE_FONT` (`800 19px "Barlow Condensed"`) per card file — keep all cards consistent.
- **Card sidebar:** collapsed carousels via `window.HGB_Export.showCardModal([{canvas, filename, label}, ...])`.
- Fixed bars/grid are hardcoded (fine); hero centering is the one spot worth measuring — but **render-test any canvas layout change before shipping** (an untested `measureText()` hero refactor broke a live card).

## Git / Deployment

- Do NOT push to `main` without explicit user approval — the site auto-deploys from GitHub.
- Feature branches only. Push to remote branch, then confirm with user before merging.
