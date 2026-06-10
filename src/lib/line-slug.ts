import type { LineRecord } from './stats-schemas';

function stripDiacritics(str: string): string {
    return str.normalize('NFD').replace(/\p{M}/gu, '');
}

/**
 * Generate a URL-safe slug for a line/pair.
 *
 * Format: {team}-{sorted-lastnames...}-{season}-{game-type}
 * Example: mtl-caufield-slafkovsky-suzuki-2025-26-playoffs
 *
 * Last names are extracted from the abbreviated players string (e.g. "C. Caufield – N. Suzuki"),
 * stripped of diacritics, lowercased, and sorted alphabetically for consistency.
 */
export function toLineSlug(line: LineRecord): string {
  const team = line.team.toLowerCase();
  const lastNames = line.players
    .split('–') // en-dash separator used by NHL API
    .map(part => {
      const trimmed = stripDiacritics(part.trim());
      const words = trimmed.split(/\s+/);
      return (words[words.length - 1] ?? 'unknown')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
    })
    .sort(); // alphabetical — makes slug deterministic regardless of API order
  // season may be raw "20252026" or already formatted "2025-26"
  const season = /^\d{8}$/.test(line.season)
    ? line.season.slice(0, 4) + '-' + line.season.slice(6)
    : line.season;
  const gameType = line.game_type === 3 ? 'playoffs' : 'regular';
  return [team, ...lastNames, season, gameType].join('-');
}

/**
 * Same slug logic as a self-contained JS string for `<script is:inline>` blocks.
 * Paste into a page script to enable client-side slug generation.
 */
export const LINE_SLUG_JS = `
(function() {
  function _sd(s) { return s.normalize('NFD').replace(/[\\u0300-\\u036f]/g, ''); }
  window._toLineSlug = function(line) {
    var team = line.team.toLowerCase();
    var names = line.players.split('\\u2013').map(function(p) {
      var parts = _sd(p.trim()).split(/\\s+/);
      return (parts[parts.length - 1] || 'unknown').toLowerCase().replace(/[^a-z0-9]/g, '');
    }).sort();
    var season = /^\d{8}$/.test(line.season) ? line.season.slice(0,4) + '-' + line.season.slice(6) : line.season;
    var gt = line.game_type === 3 ? 'playoffs' : 'regular';
    return [team].concat(names).concat([season, gt]).join('-');
  };
})();
`;
