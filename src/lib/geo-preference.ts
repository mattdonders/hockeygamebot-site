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

/**
 * How restrictive a stored preference is. Every *negative* signal (soft
 * decline, OS-level permission denial) is merged through `mergeRestriction`
 * so it can only ever hold or raise this rank — never lower it. Without the
 * ranking, whichever negative event fired LAST won outright, so a 1st soft
 * "Not now" landing after a hard OS denial silently downgraded a 30-day
 * block to a session-only mute.
 *
 *   4  disabled                       explicit user "Turn off"
 *   3  suppressed, nextPromptAt null  indefinite (4th+ decline)
 *   2  any state with a nextPromptAt  time-bounded backoff (ties break on expiry)
 *   1  deferred, no nextPromptAt      session-only mute (1st decline)
 *   0  unset / enabled                no restriction
 *
 * Positive user actions (`recordGrant`, `disableGeo`) deliberately bypass the
 * merge: they're explicit, so they write straight through.
 */
function restrictionRank(pref: GeoPreference): number {
  if (pref.state === 'disabled') return 4;
  if (pref.state === 'suppressed' && !pref.nextPromptAt) return 3;
  if (pref.nextPromptAt) return 2;
  if (pref.state === 'deferred') return 1;
  return 0;
}

function expiryMs(pref: GeoPreference): number {
  const t = pref.nextPromptAt ? Date.parse(pref.nextPromptAt) : NaN;
  return Number.isFinite(t) ? t : -Infinity;
}

/**
 * Applies `candidate` only insofar as it does not weaken `existing`.
 * `declineCount` is always carried forward as the max of the two, so the
 * ladder can never rewind even when the state itself is held.
 */
function mergeRestriction(existing: GeoPreference, candidate: GeoPreference, nowMs: number): GeoPreference {
  const declineCount = Math.max(existing.declineCount, candidate.declineCount);
  const updatedAt = new Date(nowMs).toISOString();
  const er = restrictionRank(existing);
  const cr = restrictionRank(candidate);

  // Existing is strictly stronger (disabled, or an indefinite suppression) —
  // hold its state/expiry entirely.
  if (er > cr) return { ...existing, declineCount, updatedAt, version: 1 };

  if (er === cr && er === 2) {
    // Both are time-bounded: keep whichever window runs longer, and prefer the
    // harder 'suppressed' label if either side carries it.
    const keepExisting = expiryMs(existing) >= expiryMs(candidate);
    const base = keepExisting ? existing : candidate;
    const state: GeoPrefState =
      existing.state === 'suppressed' || candidate.state === 'suppressed' ? 'suppressed' : base.state;
    return { ...base, state, declineCount, updatedAt, version: 1 };
  }

  return { ...candidate, declineCount, updatedAt, version: 1 };
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
 *
 * The computed rung is merged through `mergeRestriction`, so a soft decline
 * can never weaken a stronger state already in effect (an explicit 'disabled',
 * an indefinite suppression, or a longer backoff window from an OS denial).
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
  write(mergeRestriction(pref, next, nowMs));
}

/**
 * A real browser permission denial (not a soft in-app "not now", and never
 * a transient timeout/unavailable — those must leave the preference
 * untouched, since they're retryable next load). Gets real backoff.
 *
 * A denial is worth the SAME rung as the 3rd soft decline: 'suppressed' with a
 * 30-day window, and `declineCount` raised to at least 3. Raising the count is
 * what stops the next soft "Not now" from computing rung 1 and downgrading the
 * block to a session-only mute; it also means the next soft decline correctly
 * lands on the indefinite 4th rung.
 *
 * REPEATED denials EXTEND, they don't escalate: each one re-bases the 30-day
 * window on `now` (via the merge's longer-window-wins rule) and holds
 * declineCount at 3. Rationale — a denial usually reflects a standing OS/browser
 * setting rather than fresh per-visit annoyance, so N denials shouldn't be
 * harsher than N soft "no thanks" clicks. Escalation past 30 days stays reserved
 * for the user actually dismissing our own in-app prompt again.
 *
 * Merged through `mergeRestriction`, so a denial can never downgrade an
 * explicit 'disabled', add an expiry to an indefinite suppression, or shorten
 * a longer window that's already running.
 */
export function recordPermissionDenied(nowMs: number = Date.now()): void {
  const pref = readGeoPreference(nowMs);
  const candidate: GeoPreference = {
    state: 'suppressed',
    declineCount: Math.max(pref.declineCount, 3),
    nextPromptAt: new Date(nowMs + THIRTY_DAYS_MS).toISOString(),
    updatedAt: new Date(nowMs).toISOString(),
    version: 1,
  };
  write(mergeRestriction(pref, candidate, nowMs));
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
