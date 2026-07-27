// Freeform date harvesting for Puck Passport "paste a list" import.
//
// Deliberately NOT a CSV parser. Fans keep their game logs in wildly different
// shapes (Excel columns in any order, Notes app lines, a copy-pasted email), so
// instead of detecting a format we just SCRAPE anything that looks like a date out
// of the blob and normalize it to YYYY-MM-DD. The review step downstream resolves
// which game on each date the user actually attended, so false-positive dates that
// have no NHL games simply drop out harmlessly.

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

// Plausible NHL attendance window — anything outside is almost certainly a
// mis-scrape (a score, a phone number, a row index) and is discarded.
const MIN_YEAR = 1917;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Expand a 2-digit year the way a hockey fan means it: 00–29 → 2000s, 30–99 →
 *  1900s. (A "26" log entry is 2026, a "98" entry is 1998.) */
function expandYear(yy: number): number {
  return yy <= 29 ? 2000 + yy : 1900 + yy;
}

function valid(y: number, m: number, d: number, maxYear: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  if (y < MIN_YEAR || y > maxYear) return null;
  // Reject impossible day-of-month (e.g. Feb 30) via a round-trip.
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Harvest every plausible date from freeform text, normalized + de-duplicated +
 *  sorted ascending. `maxYear` bounds the future (defaults to next year so an
 *  upcoming-season log still parses); pass a fixed value in tests. */
export function harvestDates(text: string, maxYear = new Date().getFullYear() + 1): string[] {
  if (!text) return [];
  const found = new Set<string>();
  const add = (s: string | null) => { if (s) found.add(s); };

  // 1) ISO: 2006-03-15  (also tolerates 2006/03/15)
  for (const m of text.matchAll(/\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b/g)) {
    add(valid(+m[1], +m[2], +m[3], maxYear));
  }

  // 2) Month name: Mar 15 2006 / March 15, 2006 / 15 Mar 2006 (2-digit years too,
  //    e.g. Mar 15 06 — the month name anchors it, so false positives stay low).
  const yr = (raw: string) => (raw.length === 2 ? expandYear(+raw) : +raw);
  for (const m of text.matchAll(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{2}|\d{4})\b/g)) {
    const mo = MONTHS[m[1].slice(0, 3).toLowerCase()];
    if (mo) add(valid(yr(m[3]), mo, +m[2], maxYear));
  }
  for (const m of text.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s+(\d{2}|\d{4})\b/g)) {
    const mo = MONTHS[m[2].slice(0, 3).toLowerCase()];
    if (mo) add(valid(yr(m[3]), mo, +m[1], maxYear));
  }

  // 3) US numeric: 3/15/2006, 03-15-06, 3.15.2006 (month-first — the North
  //    American norm for a hockey log). 4-digit and 2-digit years both handled.
  for (const m of text.matchAll(/\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2}|\d{4})\b/g)) {
    add(valid(yr(m[3]), +m[1], +m[2], maxYear));
  }

  return [...found].sort();
}
