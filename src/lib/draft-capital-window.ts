/**
 * Draft Capital is only relevant in the run-up to the NHL draft — showing it
 * year-round on a "your dashboard" surface makes a personalized page feel
 * stale 10 months a year. Date-gated to a single window; the const below is
 * the only place that window is defined.
 *
 * This must be evaluated CLIENT-SIDE at render time, not in Astro frontmatter
 * — the site is `output: 'static'`, so a frontmatter check bakes the gate's
 * result into the HTML at `astro build` time (in the build machine's local
 * timezone) and it never changes again until the next deploy. The date is
 * computed in America/New_York (hockey-date convention) rather than the
 * visitor's or build machine's local timezone, so the gate doesn't flip a
 * few hours early/late for people west of the Eastern time zone.
 */
export const DRAFT_CAPITAL_WINDOW = { startMonthDay: '05-01', endMonthDay: '07-15', timezone: 'America/New_York' } as const;

function monthDayInTimezone(now: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const month = parts.find(p => p.type === 'month')?.value ?? '01';
  const day = parts.find(p => p.type === 'day')?.value ?? '01';
  return `${month}-${day}`;
}

export function isDraftCapitalWindowActive(now: Date = new Date()): boolean {
  const md = monthDayInTimezone(now, DRAFT_CAPITAL_WINDOW.timezone);
  return md >= DRAFT_CAPITAL_WINDOW.startMonthDay && md <= DRAFT_CAPITAL_WINDOW.endMonthDay;
}
