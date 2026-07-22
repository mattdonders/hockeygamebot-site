/**
 * Draft Capital is only relevant in the run-up to the NHL draft — showing it
 * year-round on a "your dashboard" surface makes a personalized page feel
 * stale 10 months a year. Date-gated to a single window; the const below is
 * the only place that window is defined.
 */
export const DRAFT_CAPITAL_WINDOW = { startMonthDay: '05-01', endMonthDay: '07-15' } as const;

export function isDraftCapitalWindowActive(now: Date = new Date()): boolean {
  const md = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return md >= DRAFT_CAPITAL_WINDOW.startMonthDay && md <= DRAFT_CAPITAL_WINDOW.endMonthDay;
}
