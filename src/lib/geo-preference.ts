/**
 * Geo detection preference for Tonight's Game — device-scoped on purpose.
 *
 * Browser location permission is per-browser/per-device, so unlike
 * tracked_teams/rooting-anchor (which round-trip through PUT /v1/account/prefs)
 * this preference lives in localStorage only. There is no server or D1 side
 * to this file.
 *
 * `disabled` vs `suppressed` are kept distinct: `disabled` means the user
 * explicitly clicked "Turn off". `suppressed` means the product stopped
 * proposing automatically after repeated soft declines or a real browser
 * permission denial — the user never said "turn this off", so the status
 * line must never claim "Off" for that case.
 */

const PREF_KEY = 'hgb_pp_geo_pref_v1';
const NOTNOW_SESSION_KEY = 'hgb_pp_tonight_geo_notnow'; // sessionStorage: muted this tab only
const LEGACY_GRANTED_KEY = 'hgb_pp_tonight_geo_granted'; // pre-migration flag

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export type GeoPrefState = 'unset' | 'enabled' | 'deferred' | 'suppressed' | 'disabled';

export type GeoPreference = {
  state: GeoPrefState;
  declineCount: number;
  nextPromptAt: string | null; // ISO; null = no backoff pending
  updatedAt: string;
  version: 1;
};

function defaults(nowMs: number): GeoPreference {
  return { state: 'unset', declineCount: 0, nextPromptAt: null, updatedAt: new Date(nowMs).toISOString(), version: 1 };
}

function write(pref: GeoPreference): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PREF_KEY, JSON.stringify(pref));
  } catch {
    /* storage blocked — preference simply won't survive a refresh */
  }
}

/**
 * Reads the persisted preference, migrating the legacy one-shot grant flag
 * on first read and failing safe (back to defaults, never a throw or a
 * prompt-loop) on malformed JSON or an unrecognized `version`. Idempotent —
 * re-running the legacy migration once the old key is gone is a no-op.
 */
export function readGeoPreference(nowMs: number = Date.now()): GeoPreference {
  if (typeof window === 'undefined') return defaults(nowMs);

  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(PREF_KEY);
  } catch {
    // Storage blocked (private mode / SecurityError) — fail safe to defaults
    // rather than crashing the flagged Tonight card's init.
    return defaults(nowMs);
  }
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.version === 1 && typeof parsed.state === 'string') {
        return {
          state: parsed.state,
          declineCount: Number.isFinite(parsed.declineCount) ? parsed.declineCount : 0,
          nextPromptAt: typeof parsed.nextPromptAt === 'string' ? parsed.nextPromptAt : null,
          updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date(nowMs).toISOString(),
          version: 1,
        };
      }
    } catch {
      /* corrupt JSON — fall through to defaults */
    }
    // Malformed or a future version we don't understand — fail safe rather
    // than silently misinterpret it.
    return defaults(nowMs);
  }

  // No v1 record yet — migrate the legacy one-shot grant flag if present.
  try {
    if (window.localStorage.getItem(LEGACY_GRANTED_KEY) === '1') {
      window.localStorage.removeItem(LEGACY_GRANTED_KEY);
      const migrated: GeoPreference = { ...defaults(nowMs), state: 'enabled' };
      write(migrated);
      return migrated;
    }
  } catch {
    /* non-fatal */
  }
  return defaults(nowMs);
}

/** A prior visit succeeded — turn automatic detection on. */
export function recordGrant(nowMs: number = Date.now()): void {
  write({ ...readGeoPreference(nowMs), state: 'enabled', nextPromptAt: null, updatedAt: new Date(nowMs).toISOString() });
}

/**
 * A soft in-app "Not now". Owns BOTH the persisted ladder state and the
 * ephemeral per-session mute — callers make exactly one call, never split
 * across two stores.
 *   1st decline → 'deferred', session-only mute (no nextPromptAt: a fresh
 *                 session correctly falls through to "may prompt again").
 *   2nd decline → nextPromptAt = +7d
 *   3rd decline → nextPromptAt = +30d
 *   4th+        → 'suppressed', indefinitely, until the user explicitly
 *                 re-enables (NOT the same as an explicit 'disabled').
 */
export function recordDecline(nowMs: number = Date.now()): void {
  const pref = readGeoPreference(nowMs);
  const declineCount = pref.declineCount + 1;
  const iso = new Date(nowMs).toISOString();

  try {
    window.sessionStorage.setItem(NOTNOW_SESSION_KEY, '1');
  } catch {
    /* non-fatal */
  }

  let next: GeoPreference;
  if (declineCount === 1) {
    next = { state: 'deferred', declineCount, nextPromptAt: null, updatedAt: iso, version: 1 };
  } else if (declineCount === 2) {
    next = { state: 'deferred', declineCount, nextPromptAt: new Date(nowMs + SEVEN_DAYS_MS).toISOString(), updatedAt: iso, version: 1 };
  } else if (declineCount === 3) {
    next = { state: 'deferred', declineCount, nextPromptAt: new Date(nowMs + THIRTY_DAYS_MS).toISOString(), updatedAt: iso, version: 1 };
  } else {
    next = { state: 'suppressed', declineCount, nextPromptAt: null, updatedAt: iso, version: 1 };
  }
  write(next);
}

/**
 * A real browser permission denial (not a soft in-app "not now", and never
 * a transient timeout/unavailable — those must leave the preference
 * untouched, since they're retryable next load). Gets real backoff.
 */
export function recordPermissionDenied(nowMs: number = Date.now()): void {
  const pref = readGeoPreference(nowMs);
  write({
    ...pref,
    state: 'suppressed',
    nextPromptAt: new Date(nowMs + THIRTY_DAYS_MS).toISOString(),
    updatedAt: new Date(nowMs).toISOString(),
  });
}

/** Explicit user "Turn off" — distinct from backoff-exhausted 'suppressed'. */
export function disableGeo(nowMs: number = Date.now()): void {
  write({ ...readGeoPreference(nowMs), state: 'disabled', nextPromptAt: null, updatedAt: new Date(nowMs).toISOString() });
}

/** May we show the discovery/pre-prompt right now? */
export function canPromptNow(nowMs: number = Date.now()): boolean {
  const pref = readGeoPreference(nowMs);
  if (pref.state === 'disabled') return false; // explicit "Turn off" — never auto-prompt
  try {
    if (typeof window !== 'undefined' && window.sessionStorage.getItem(NOTNOW_SESSION_KEY) === '1') return false;
  } catch {
    /* non-fatal — treat as not muted */
  }
  if (pref.nextPromptAt) {
    // A real backoff window is set (2nd/3rd decline, or a permission denial) — honor its
    // expiry even though state is 'suppressed'. Without this check running BEFORE the
    // bare state==='suppressed' case below, recordPermissionDenied's documented 30-day
    // backoff would never actually expire, since both it and the 4th+-decline indefinite
    // suppression share the same `state` value.
    const t = Date.parse(pref.nextPromptAt);
    if (Number.isFinite(t) && nowMs < t) return false;
    return true;
  }
  if (pref.state === 'suppressed') return false; // indefinite (4th+ decline) — no expiry set
  return true;
}

// ── Fresh-fix cache ────────────────────────────────────────────────────────
// Session-scoped, short-lived cache of the last successful getCurrentPosition
// result. Protects against remounts/lifecycle changes re-triggering a GPS
// call within the same visit — the mount-effect gate alone doesn't cover
// that once React re-runs effects for reasons unrelated to a real reload.

const FIX_KEY = 'hgb_pp_tonight_geo_fix_v1';
const FIX_TTL_MS = 20 * 60 * 1000;

type CachedFix = { lat: number; lon: number; acquiredAt: number };

export function recordFreshFix(lat: number, lon: number, nowMs: number = Date.now()): void {
  if (typeof window === 'undefined') return;
  try {
    const entry: CachedFix = { lat, lon, acquiredAt: nowMs };
    window.sessionStorage.setItem(FIX_KEY, JSON.stringify(entry));
  } catch {
    /* non-fatal */
  }
}

/** Returns the cached fix if still fresh, else null. */
export function readFreshFix(nowMs: number = Date.now()): { lat: number; lon: number } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(FIX_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedFix>;
    if (typeof parsed.lat !== 'number' || typeof parsed.lon !== 'number' || typeof parsed.acquiredAt !== 'number') return null;
    if (nowMs - parsed.acquiredAt > FIX_TTL_MS) return null;
    return { lat: parsed.lat, lon: parsed.lon };
  } catch {
    return null;
  }
}
