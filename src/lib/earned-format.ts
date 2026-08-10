/**
 * Shared earned-result formatting helpers — milestone labels, ordinals, and badge
 * label resolution.
 *
 * Extracted verbatim from `TonightGameCard.tsx` (Block 1C, 2026-08) so the same
 * copy/behavior is reused by the historical-add earned-result surface
 * (`earned-result.ts` / `EarnedResultCard.tsx`) instead of re-implemented. Tonight's
 * Game re-imports these from here — its rendered output is unchanged.
 */

/** `earned.earned.milestones` ids are wire-shape thresholds crossed by this log —
 *  `games-50`, `arenas-10` (see hgb-api `deriveEarned`'s GAME_MILESTONES/
 *  ARENA_MILESTONES) — not display labels. Unrecognized shapes render verbatim
 *  rather than being dropped, so a future milestone kind still shows *something*.
 *
 *  PROVISIONAL COPY, not reviewed: verified 2026-08-04 that no canonical display
 *  label exists anywhere for this exact id shape. Three independent, differently-
 *  numbered "milestone" concepts already coexist in this codebase and none is
 *  authoritative for the others — hgb-api's GAME_MILESTONES/ARENA_MILESTONES (this
 *  formatter's source), hgb-api's separate tier-ladder rungs in
 *  attended_summary.js (different thresholds, has its own `label`/`rung_name`),
 *  and AttendedTracker.tsx's own STUB_MILESTONES/milestoneNoteFor (~2647/2707, a
 *  third list). Do not treat "50th game"/"10th arena" as final wording — defer to
 *  the supervised UI review round. */
export function formatMilestoneLabel(id: string): string {
  const [kind, raw] = id.split('-');
  const n = Number(raw);
  if (!Number.isFinite(n)) return id;
  if (kind === 'games') return `${ordinal(n)} game`;
  if (kind === 'arenas') return `${ordinal(n)} arena`;
  return id;
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

/** Minimal shape a badge catalog entry needs for label resolution — both
 *  `AttendedSummary['badges']['catalog']` entries and the leaner `CatalogBadge`
 *  shape satisfy this structurally. */
export type CatalogLabelEntry = { id: string; label: string };

/** Resolve badge ids → display labels via the catalog, falling back to the raw id
 *  when a badge isn't in the catalog (same fallback TonightGameCard's inline
 *  `labelFor` map already used — an unrecognized id still shows *something*). */
export function resolveBadgeLabels(ids: string[], catalog: CatalogLabelEntry[]): string[] {
  const labelFor = new Map(catalog.map((c) => [c.id, c.label]));
  return ids.map((id) => labelFor.get(id) ?? id);
}
