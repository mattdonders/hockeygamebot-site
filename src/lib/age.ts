/**
 * Player/goalie age in whole years, as of `asOf` (defaults to *today*).
 *
 * Birthday-aware (decrements if this year's birthday hasn't happened yet).
 * Returns null for a missing/invalid birth date.
 *
 * NOTE: age used to be computed against the season start (Oct 1 of the season),
 * which under-counted a player's age for most of the calendar year. The site now
 * shows current age. Client-side card chips that run inside a `define:vars`
 * <script> can't import this — they inline the same `new Date()` reference date.
 */
export function ageFromBirthDate(
  birthDate: string | null | undefined,
  asOf: Date = new Date(),
): number | null {
  if (!birthDate) return null;
  const b = new Date(birthDate);
  if (Number.isNaN(b.getTime())) return null;
  let age = asOf.getFullYear() - b.getFullYear();
  const m = asOf.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && asOf.getDate() < b.getDate())) age -= 1;
  return age;
}
