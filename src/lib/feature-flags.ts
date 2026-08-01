/**
 * Client-side feature flags.
 *
 * Purpose: merge unfinished UI to main WITHOUT users seeing it, test it against real
 * production data, and switch it off instantly if it misbehaves — no deploy required in
 * either direction. That last property is why this is URL + localStorage rather than a
 * build-time env var: during a live game there is no time to ship a revert.
 *
 * Usage:
 *   ?tonight=1  → enable and remember (persists across navigations on this browser)
 *   ?tonight=0  → disable and remember
 *   isFeatureEnabled('tonight')
 *
 * SSR-safe: always false on the server, so a flagged component never renders into the
 * prerendered HTML and can't cause a hydration mismatch.
 */

export type FeatureFlag = 'tonight';

const STORAGE_PREFIX = 'hgb_ff_';

/**
 * Read a flag. A `?<flag>=1|0` query param wins and is PERSISTED, so a shared link
 * turns the feature on for that browser and it stays on for subsequent visits.
 */
export function isFeatureEnabled(flag: FeatureFlag): boolean {
  if (typeof window === 'undefined') return false; // SSR / prerender

  const key = `${STORAGE_PREFIX}${flag}`;

  try {
    const param = new URLSearchParams(window.location.search).get(flag);
    if (param === '1' || param === 'true') {
      window.localStorage.setItem(key, '1');
      return true;
    }
    if (param === '0' || param === 'false') {
      window.localStorage.setItem(key, '0');
      return false;
    }
  } catch {
    /* malformed URL / storage blocked — fall through to the stored value */
  }

  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    // Private mode / storage blocked: default OFF. A flagged feature must never
    // switch itself on just because we couldn't read the preference.
    return false;
  }
}
