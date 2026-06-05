/**
 * Season format utilities — handles both pipeline formats:
 *   "20252026"  (8-digit legacy, used in career_seasons)
 *   "2025-26"   (standardized current format)
 *
 * Long form:  "2025–26"  (used in page titles, badges, headings)
 * Short form: "25-26"    (used in table cells)
 */

export function fmtSeasonLong(s: string | null | undefined): string {
  if (!s) return '—';
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}–${s.slice(6)}`;
  if (s.includes('-')) return s.replace('-', '–');
  return s;
}

export function fmtSeasonShort(s: string | null | undefined): string {
  if (!s) return '—';
  if (/^\d{8}$/.test(s)) return `${s.slice(2, 4)}-${s.slice(6)}`;
  if (s.length > 5 && s.includes('-')) return s.slice(2);
  return s; // already short e.g. "25-26"
}
