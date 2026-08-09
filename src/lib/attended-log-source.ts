/**
 * 0R.3 (locked): one logical write = one primary result surface.
 *
 * `AttendedTracker.addGame` is shared by every add path on the dashboard — Tonight's
 * Game, manual entry, search results, and the bulk "Add N games" fan-out. Every one
 * of those EXCEPT Tonight relies on the global `att-logprompt` (AttendedTracker's
 * `justAdded`) as its only post-write result surface. Tonight's Game already renders
 * its own consolidated in-card result (TonightGameCard's `cel-list`, with its own
 * "Share ticket stub" CTA) for that same write — showing the global prompt too would
 * double-confirm one write with two success surfaces and two share CTAs.
 *
 * Pulled out as a pure function (rather than an inline `!== 'tonight'` check) so the
 * source→surface mapping is unit-testable without rendering AttendedTracker.
 */
export type AttendedAddSource = 'tonight' | 'manual' | 'import';

/**
 * Should this add surface the global att-logprompt result banner?
 *
 * @param source  the add's origin — 'tonight' (TonightGameCard's doLog), 'manual'
 *                (search/manual-entry pick), 'import' (bulk "Add N games" fan-out),
 *                or undefined (legacy call sites that predate source-threading —
 *                treated the same as 'manual', preserving their existing behavior).
 */
export function shouldShowLogPrompt(source?: AttendedAddSource): boolean {
  return source !== 'tonight';
}
