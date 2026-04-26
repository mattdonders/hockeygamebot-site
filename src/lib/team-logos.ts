/**
 * Static import map for NHL team `_dark.svg` logos.
 *
 * Uses Vite's `import.meta.glob` with `{ eager: true, query: '?raw', import: 'default' }`
 * so every logo file under `src/data/team-logos/*_dark.svg` is bundled
 * inline at build time as a string. The TeamLogo component then renders
 * the raw SVG markup via `set:html`, keeping the browser in vector mode
 * end-to-end (no rasterization at intrinsic size like `<img src="…svg">`).
 *
 * Cron-managed: `.github/workflows/refresh-team-logos.yml` updates the
 * source SVG files weekly. New teams / rebrands flow in automatically
 * without any code change.
 */
const RAW_LOGOS = import.meta.glob('../data/team-logos/*_dark.svg', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

/** Map of `ABBR -> inline SVG string`. Built once at module load. */
export const TEAM_LOGOS: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const [path, svg] of Object.entries(RAW_LOGOS)) {
    // path looks like `../data/team-logos/TOR_dark.svg`
    const match = path.match(/\/([A-Z]{2,3})_dark\.svg$/);
    if (match) {
      map[match[1]] = svg;
    }
  }
  return map;
})();

/**
 * Lookup an inline SVG by team abbreviation. Returns `null` if missing
 * (e.g. brand-new team during the brief window before the cron has
 * fetched the file). Callers should render a placeholder.
 */
export function getTeamLogoSvg(abbr: string): string | null {
  return TEAM_LOGOS[abbr] ?? null;
}
