import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  canPromptNow,
  disableGeo,
  readFreshFix,
  readGeoPreference,
  recordDecline,
  recordFreshFix,
  recordGrant,
  recordPermissionDenied,
} from '../geo-preference';
import { installFakeWindow, uninstallFakeWindow, type StorageHandles } from './test-storage';

const PREF_KEY = 'hgb_pp_geo_pref_v1';
const NOTNOW_SESSION_KEY = 'hgb_pp_tonight_geo_notnow';
const LEGACY_GRANTED_KEY = 'hgb_pp_tonight_geo_granted';

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.parse('2026-01-15T18:00:00.000Z');

let store: StorageHandles;

beforeEach(() => {
  store = installFakeWindow();
});

afterEach(() => {
  uninstallFakeWindow();
});

describe('readGeoPreference', () => {
  it('returns defaults when nothing is stored', () => {
    const pref = readGeoPreference(T0);
    expect(pref).toEqual({
      state: 'unset',
      declineCount: 0,
      nextPromptAt: null,
      updatedAt: new Date(T0).toISOString(),
      version: 1,
    });
  });

  it('fails safe to defaults on corrupt JSON', () => {
    store.localStorage.setItem(PREF_KEY, '{not json');
    expect(readGeoPreference(T0).state).toBe('unset');
  });

  it('fails safe to defaults on an unrecognized future version', () => {
    store.localStorage.setItem(
      PREF_KEY,
      JSON.stringify({ state: 'suppressed', declineCount: 9, nextPromptAt: null, updatedAt: 'x', version: 2 }),
    );
    expect(readGeoPreference(T0)).toMatchObject({ state: 'unset', declineCount: 0 });
  });

  it('coerces a non-finite declineCount to 0', () => {
    store.localStorage.setItem(
      PREF_KEY,
      JSON.stringify({ state: 'deferred', declineCount: 'lots', nextPromptAt: null, updatedAt: 'x', version: 1 }),
    );
    expect(readGeoPreference(T0).declineCount).toBe(0);
  });

  it('migrates the legacy one-shot grant flag exactly once', () => {
    store.localStorage.setItem(LEGACY_GRANTED_KEY, '1');

    expect(readGeoPreference(T0).state).toBe('enabled');
    expect(store.localStorage.getItem(LEGACY_GRANTED_KEY)).toBeNull();
    // Persisted, so a second read is a no-op that returns the same thing.
    expect(readGeoPreference(T0 + DAY).state).toBe('enabled');
  });
});

describe('the decline ladder', () => {
  it('1st decline → deferred, session-only mute, no backoff timestamp', () => {
    recordDecline(T0);

    const pref = readGeoPreference(T0);
    expect(pref).toMatchObject({ state: 'deferred', declineCount: 1, nextPromptAt: null });
    expect(store.sessionStorage.getItem(NOTNOW_SESSION_KEY)).toBe('1');

    // Muted in THIS session...
    expect(canPromptNow(T0)).toBe(false);
    // ...but a fresh tab may prompt again immediately (that's the point of
    // leaving nextPromptAt null on the first decline).
    store.newSession();
    expect(canPromptNow(T0)).toBe(true);
  });

  it('2nd decline → +7 day backoff', () => {
    recordDecline(T0);
    store.newSession();
    recordDecline(T0 + DAY);

    const pref = readGeoPreference(T0);
    expect(pref).toMatchObject({ state: 'deferred', declineCount: 2 });
    expect(pref.nextPromptAt).toBe(new Date(T0 + DAY + 7 * DAY).toISOString());

    store.newSession();
    expect(canPromptNow(T0 + DAY + 6 * DAY)).toBe(false);
    expect(canPromptNow(T0 + DAY + 8 * DAY)).toBe(true);
  });

  it('3rd decline → +30 day backoff', () => {
    recordDecline(T0);
    store.newSession();
    recordDecline(T0);
    store.newSession();
    recordDecline(T0);

    const pref = readGeoPreference(T0);
    expect(pref).toMatchObject({ state: 'deferred', declineCount: 3 });
    expect(pref.nextPromptAt).toBe(new Date(T0 + 30 * DAY).toISOString());

    store.newSession();
    expect(canPromptNow(T0 + 29 * DAY)).toBe(false);
    expect(canPromptNow(T0 + 31 * DAY)).toBe(true);
  });

  it('4th decline → indefinitely suppressed with no expiry', () => {
    for (let i = 0; i < 4; i += 1) {
      recordDecline(T0);
      store.newSession();
    }

    const pref = readGeoPreference(T0);
    expect(pref).toMatchObject({ state: 'suppressed', declineCount: 4, nextPromptAt: null });
    expect(canPromptNow(T0)).toBe(false);
    expect(canPromptNow(T0 + 3650 * DAY)).toBe(false);
  });

  it('5th+ declines keep counting but stay suppressed', () => {
    for (let i = 0; i < 6; i += 1) {
      recordDecline(T0);
      store.newSession();
    }
    expect(readGeoPreference(T0)).toMatchObject({ state: 'suppressed', declineCount: 6, nextPromptAt: null });
  });

  it('is promptable exactly AT the backoff boundary, not one ms before', () => {
    recordDecline(T0);
    store.newSession();
    recordDecline(T0); // → +7d
    store.newSession();

    const boundary = T0 + 7 * DAY;
    expect(canPromptNow(boundary - 1)).toBe(false);
    expect(canPromptNow(boundary)).toBe(true);
  });

  it('treats an unparseable stored nextPromptAt as expired rather than blocking forever', () => {
    store.localStorage.setItem(
      PREF_KEY,
      JSON.stringify({ state: 'deferred', declineCount: 2, nextPromptAt: 'not-a-date', updatedAt: 'x', version: 1 }),
    );
    expect(canPromptNow(T0)).toBe(true);
  });
});

describe('recordPermissionDenied', () => {
  it('suppresses with a real 30-day expiry (unlike 4th+-decline suppression)', () => {
    recordPermissionDenied(T0);

    const pref = readGeoPreference(T0);
    expect(pref.state).toBe('suppressed');
    expect(pref.nextPromptAt).toBe(new Date(T0 + 30 * DAY).toISOString());

    expect(canPromptNow(T0 + 29 * DAY)).toBe(false);
    expect(canPromptNow(T0 + 30 * DAY)).toBe(true);
  });

  it('does not increment declineCount', () => {
    recordPermissionDenied(T0);
    expect(readGeoPreference(T0).declineCount).toBe(0);
  });

  it('does NOT set the session mute, so the 30-day window is the only gate', () => {
    recordPermissionDenied(T0);
    expect(store.sessionStorage.getItem(NOTNOW_SESSION_KEY)).toBeNull();
  });

  // Documents current behaviour, NOT an endorsement: a soft "not now" after a
  // hard OS denial rewrites the record from scratch (declineCount 0 → 1), which
  // downgrades the 30-day backoff to a session-only mute. See report.
  it('a later soft decline downgrades the denial backoff to a session mute', () => {
    recordPermissionDenied(T0);
    recordDecline(T0 + DAY);

    const pref = readGeoPreference(T0);
    expect(pref).toMatchObject({ state: 'deferred', declineCount: 1, nextPromptAt: null });
    store.newSession();
    expect(canPromptNow(T0 + DAY)).toBe(true);
  });
});

describe('disableGeo — explicit "Turn off"', () => {
  it('is a distinct state from suppressed and never auto-prompts', () => {
    disableGeo(T0);

    expect(readGeoPreference(T0)).toMatchObject({ state: 'disabled', nextPromptAt: null });
    expect(canPromptNow(T0)).toBe(false);
    expect(canPromptNow(T0 + 3650 * DAY)).toBe(false);
  });

  it('is reversible via recordGrant, and clears any pending backoff', () => {
    recordDecline(T0);
    store.newSession();
    recordDecline(T0); // +7d pending
    disableGeo(T0);
    recordGrant(T0);

    const pref = readGeoPreference(T0);
    expect(pref).toMatchObject({ state: 'enabled', nextPromptAt: null });
    // declineCount is history, deliberately preserved across a re-enable.
    expect(pref.declineCount).toBe(2);
  });

  it('preserves declineCount so the ladder resumes where it left off', () => {
    recordDecline(T0);
    store.newSession();
    disableGeo(T0);
    expect(readGeoPreference(T0).declineCount).toBe(1);
  });

  it('beats the session mute check — disabled short-circuits first', () => {
    recordDecline(T0);
    disableGeo(T0);
    store.newSession();
    expect(canPromptNow(T0)).toBe(false);
  });
});

describe('canPromptNow defaults', () => {
  it('allows prompting on a clean slate', () => {
    expect(canPromptNow(T0)).toBe(true);
  });

  it('allows prompting when already enabled (the caller gates on state, not this)', () => {
    recordGrant(T0);
    expect(canPromptNow(T0)).toBe(true);
  });
});

describe('fresh-fix cache', () => {
  it('round-trips a fix inside the 20 minute TTL', () => {
    recordFreshFix(40.7505, -73.9934, T0);
    expect(readFreshFix(T0 + 19 * 60 * 1000)).toEqual({ lat: 40.7505, lon: -73.9934 });
  });

  it('expires after 20 minutes', () => {
    recordFreshFix(40.7505, -73.9934, T0);
    expect(readFreshFix(T0 + 20 * 60 * 1000 + 1)).toBeNull();
  });

  it('returns null when nothing is cached or the entry is malformed', () => {
    expect(readFreshFix(T0)).toBeNull();
    store.sessionStorage.setItem('hgb_pp_tonight_geo_fix_v1', JSON.stringify({ lat: 'x', lon: 1, acquiredAt: T0 }));
    expect(readFreshFix(T0)).toBeNull();
  });

  it('does not survive a new session', () => {
    recordFreshFix(1, 2, T0);
    store.newSession();
    expect(readFreshFix(T0)).toBeNull();
  });
});

describe('SSR safety', () => {
  it('returns defaults and never throws without a window', () => {
    uninstallFakeWindow();
    expect(readGeoPreference(T0).state).toBe('unset');
    expect(readFreshFix(T0)).toBeNull();
    expect(() => recordFreshFix(1, 2, T0)).not.toThrow();
  });
});
