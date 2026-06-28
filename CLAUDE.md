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

## Git / Deployment

- Do NOT push to `main` without explicit user approval — the site auto-deploys from GitHub.
- Feature branches only. Push to remote branch, then confirm with user before merging.
