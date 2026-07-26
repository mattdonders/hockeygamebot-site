/**
 * Puck Passport — versioning + changelog + "last seen" bookkeeping.
 *
 * Single source of truth for the Passport product version and its release notes.
 * Bumping the product is a ONE-LINE change: raise PUCK_PASSPORT_VERSION and
 * prepend a CHANGELOG entry. The onboarding / "What's New" modals on
 * /puck-passport read from here (see PassportOnboarding.tsx).
 *
 * Persistence is localStorage-only tonight (per-device). The seam for a future
 * cross-device `lastSeen` (via the existing D1 prefs endpoint) is marked below.
 */

/** Current Puck Passport product version. Bump this + add a CHANGELOG entry. */
export const PUCK_PASSPORT_VERSION = '1.0';

/** localStorage key holding the last version whose notes the user has seen. */
export const LAST_SEEN_KEY = 'hgb_pp_last_seen_version';

export type ChangelogEntry = {
  /** Semantic-ish version string, e.g. "1.0", "1.1". Compared numerically. */
  version: string;
  /** Human date, e.g. "2026-07-25". Display-only. */
  date: string;
  /** Short headline for the release. */
  title: string;
  /** Bullet points describing what shipped. */
  items: string[];
};

/**
 * Release notes, NEWEST FIRST. The "What's New" modal shows every entry strictly
 * newer than the user's stored lastSeen. To ship a release: prepend an entry and
 * raise PUCK_PASSPORT_VERSION to match its `version`.
 */
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0',
    date: '2026-07-25',
    title: 'Puck Passport is here',
    items: [
      'Track every NHL game you’ve been to in person — log by team + season or search by date.',
      'Earn badges and level up milestone tiers as your history adds up.',
      'Collect all 32 home rinks and see every arena you’ve visited.',
      'Sign in to sync across devices and claim your own shareable passport.',
    ],
  },
];

/**
 * Compare two version strings numerically by dotted segments.
 * Returns <0 if a<b, 0 if equal, >0 if a>b. Missing segments count as 0
 * ("1.0" === "1.0.0"). Non-numeric segments coerce to 0 (never throws).
 */
export function compareVersions(a: string, b: string): number {
  const pa = String(a).split('.');
  const pb = String(b).split('.');
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const na = Number(pa[i] ?? 0) || 0;
    const nb = Number(pb[i] ?? 0) || 0;
    if (na !== nb) return na - nb;
  }
  return 0;
}

/** CHANGELOG entries strictly newer than `sinceVersion` (newest first). */
export function changelogSince(sinceVersion: string): ChangelogEntry[] {
  return CHANGELOG.filter((e) => compareVersions(e.version, sinceVersion) > 0);
}

/**
 * Read the last-seen version from localStorage. SSR/private-mode safe: returns
 * null if unavailable or unset (which the caller treats as "first visit").
 *
 * TODO (D1 cross-device fast-follow): today `lastSeen` is per-device localStorage
 * only. To make onboarding/"What's New" honor dismissals across devices, read a
 * server-side `pp_last_seen_version` from the existing prefs endpoint
 * (GET /v1/account/prefs via auth-client) when logged in, falling back to this
 * localStorage value when logged out. Take the MAX of the two so a dismissal on
 * any device wins. Keep this localStorage path as the offline/logged-out default.
 */
export function readLastSeenVersion(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(LAST_SEEN_KEY);
  } catch {
    return null;
  }
}

/**
 * Persist the last-seen version. No-ops safely if localStorage is unavailable
 * (private mode / quota / SSR) — the modal still closes in-memory either way.
 *
 * TODO (D1 cross-device fast-follow): when logged in, ALSO PATCH
 * `pp_last_seen_version` to the prefs endpoint so the dismissal follows the user
 * across devices (see readLastSeenVersion). Fire-and-forget; localStorage stays
 * the source of truth for logged-out users.
 */
export function writeLastSeenVersion(version: string = PUCK_PASSPORT_VERSION): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LAST_SEEN_KEY, version);
  } catch {
    /* private mode / quota — nothing to do; the modal is already dismissed in-memory */
  }
}

export type PassportModalMode = 'onboarding' | 'whats-new' | null;

/**
 * Decide which (if any) modal to show, given a stored lastSeen value.
 *   - null (no record)                 → 'onboarding' (first visit)
 *   - lastSeen < current version       → 'whats-new'
 *   - lastSeen >= current version      → null (nothing to show)
 */
export function pickModalMode(lastSeen: string | null): PassportModalMode {
  if (lastSeen == null) return 'onboarding';
  if (compareVersions(lastSeen, PUCK_PASSPORT_VERSION) < 0) return 'whats-new';
  return null;
}
