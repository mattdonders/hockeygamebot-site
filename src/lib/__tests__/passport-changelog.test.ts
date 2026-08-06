import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CHANGELOG_LAUNCH_BASELINE_SEQUENCE,
  CHANGELOG_LAUNCH_TIMESTAMP,
  mergeSeenThrough,
  resolveLocalSeenThrough,
  resolveSeenThrough,
  unreadEntries,
  type ChangelogEntry,
} from '../passport-changelog';
import { installFakeWindow, uninstallFakeWindow, type StorageHandles } from './test-storage';

const LEGACY_KEY = 'hgb_pp_last_seen_version';

let store: StorageHandles;

// The module under test keeps a module-level in-memory fallback (for
// private-mode/quota-blocked localStorage) that persists across calls —
// correct for a single page load, but it would leak across tests in this
// file unless each localStorage-touching test gets a fresh module instance.
async function freshModule() {
  vi.resetModules();
  return import('../passport-changelog');
}

beforeEach(() => {
  store = installFakeWindow();
});

afterEach(() => {
  uninstallFakeWindow();
});

function entry(sequence: number): ChangelogEntry {
  return {
    sequence,
    id: `e${sequence}`,
    published_at: '2026-08-01T00:00:00Z',
    title: `Entry ${sequence}`,
    summary: 'summary',
    body: 'body',
    category: 'new',
  };
}

describe('resolveSeenThrough (server NULL-cursor disambiguation, plan §5)', () => {
  it('returns the raw cursor unchanged when non-null', () => {
    expect(resolveSeenThrough(3, null, 10)).toBe(3);
    expect(resolveSeenThrough(0, '2020-01-01T00:00:00Z', 10)).toBe(0);
  });

  it('a pre-launch account with a null cursor resolves to the launch baseline', () => {
    const before = '2026-08-01T00:00:00Z';
    expect(before < CHANGELOG_LAUNCH_TIMESTAMP).toBe(true);
    expect(resolveSeenThrough(null, before, 10)).toBe(CHANGELOG_LAUNCH_BASELINE_SEQUENCE);
  });

  it('a post-launch account with a null cursor resolves to latest (nothing unread)', () => {
    const after = '2026-09-01T00:00:00Z';
    expect(after > CHANGELOG_LAUNCH_TIMESTAMP).toBe(true);
    expect(resolveSeenThrough(null, after, 10)).toBe(10);
  });

  it('an unknown created_at with a null cursor resolves to latest, not baseline', () => {
    expect(resolveSeenThrough(null, null, 10)).toBe(10);
  });
});

describe('resolveLocalSeenThrough (plan §3)', () => {
  it('passes a non-null cursor through', () => {
    expect(resolveLocalSeenThrough(5)).toBe(5);
  });

  it('an unset local cursor resolves to the launch baseline', () => {
    expect(resolveLocalSeenThrough(null)).toBe(CHANGELOG_LAUNCH_BASELINE_SEQUENCE);
  });
});

describe('unreadEntries', () => {
  it('keeps only entries strictly newer than the cursor', () => {
    const entries = [entry(3), entry(2), entry(1)];
    expect(unreadEntries(entries, 1)).toEqual([entry(3), entry(2)]);
    expect(unreadEntries(entries, 3)).toEqual([]);
    expect(unreadEntries(entries, 0)).toEqual(entries);
  });
});

describe('mergeSeenThrough (plan §4 local/account merge)', () => {
  it('takes the max of the two sides', () => {
    expect(mergeSeenThrough(2, 5)).toBe(5);
    expect(mergeSeenThrough(5, 2)).toBe(5);
  });

  it('treats null as behind everything', () => {
    expect(mergeSeenThrough(null, 3)).toBe(3);
    expect(mergeSeenThrough(3, null)).toBe(3);
    expect(mergeSeenThrough(null, null)).toBe(-1);
  });
});

describe('local onboarding/cursor storage', () => {
  it('round-trips onboarding-completed', async () => {
    const m = await freshModule();
    expect(m.readOnboardingCompleted()).toBe(false);
    m.writeOnboardingCompleted();
    expect(m.readOnboardingCompleted()).toBe(true);
    expect(store.localStorage.getItem(m.ONBOARDING_COMPLETED_KEY)).toBe('true');
  });

  it('round-trips the local changelog cursor', async () => {
    const m = await freshModule();
    expect(m.readLocalSeenThrough()).toBeNull();
    m.writeLocalSeenThrough(7);
    expect(m.readLocalSeenThrough()).toBe(7);
    expect(store.localStorage.getItem(m.CHANGELOG_SEEN_THROUGH_KEY)).toBe('7');
  });
});

describe('acknowledgeSeenThrough (immediate local + account write)', () => {
  it('writes the local cursor synchronously even when logged out', async () => {
    vi.doMock('../auth-client', () => ({
      getSessionToken: () => null,
      putPrefs: vi.fn(),
      getPrefs: vi.fn(),
      API_BASE: 'https://api.test',
    }));
    const m = await freshModule();
    m.acknowledgeSeenThrough(5);
    expect(m.readLocalSeenThrough()).toBe(5);
    vi.doUnmock('../auth-client');
  });

  it('pushes the account cursor immediately when signed in', async () => {
    const putPrefs = vi.fn().mockResolvedValue({ changelog_seen_through: 5 });
    vi.doMock('../auth-client', () => ({
      getSessionToken: () => 'tok',
      putPrefs,
      getPrefs: vi.fn(),
      API_BASE: 'https://api.test',
    }));
    const m = await freshModule();
    m.acknowledgeSeenThrough(5);
    expect(m.readLocalSeenThrough()).toBe(5); // local write is synchronous
    await Promise.resolve(); // flush the fire-and-forget putPrefs().then()
    expect(putPrefs).toHaveBeenCalledWith({ changelog_seen_through: 5 });
    vi.doUnmock('../auth-client');
  });

  it('does not push to the account when logged out', async () => {
    const putPrefs = vi.fn();
    vi.doMock('../auth-client', () => ({
      getSessionToken: () => null,
      putPrefs,
      getPrefs: vi.fn(),
      API_BASE: 'https://api.test',
    }));
    const m = await freshModule();
    m.acknowledgeSeenThrough(5);
    await Promise.resolve();
    expect(putPrefs).not.toHaveBeenCalled();
    vi.doUnmock('../auth-client');
  });

  it('reports to Sentry (does not throw) when the account push fails, without touching the local write', async () => {
    const captureException = vi.fn();
    vi.doMock('@sentry/browser', () => ({ captureException }));
    vi.doMock('../auth-client', () => ({
      getSessionToken: () => 'tok',
      putPrefs: vi.fn().mockResolvedValue(null), // putPrefs fails closed to null, never throws
      getPrefs: vi.fn(),
      API_BASE: 'https://api.test',
    }));
    const m = await freshModule();
    expect(() => m.acknowledgeSeenThrough(5)).not.toThrow();
    expect(m.readLocalSeenThrough()).toBe(5);
    await Promise.resolve();
    await Promise.resolve();
    expect(captureException).toHaveBeenCalledTimes(1);
    vi.doUnmock('@sentry/browser');
    vi.doUnmock('../auth-client');
  });
});

describe('migrateLegacyChangelogState (one-time key split)', () => {
  it('is a no-op when the legacy key was never set', async () => {
    const m = await freshModule();
    m.migrateLegacyChangelogState();
    expect(m.readOnboardingCompleted()).toBe(false);
    expect(m.readLocalSeenThrough()).toBeNull();
  });

  it('marks onboarding completed and leaves the cursor unset when the legacy key exists', async () => {
    const m = await freshModule();
    store.localStorage.setItem(LEGACY_KEY, '1.4.0');
    m.migrateLegacyChangelogState();
    expect(m.readOnboardingCompleted()).toBe(true);
    expect(m.readLocalSeenThrough()).toBeNull();
    expect(store.localStorage.getItem(LEGACY_KEY)).toBeNull();
  });

  it('is idempotent — a second call after migration is a no-op', async () => {
    const m = await freshModule();
    store.localStorage.setItem(LEGACY_KEY, '1.4.0');
    m.migrateLegacyChangelogState();
    m.migrateLegacyChangelogState();
    expect(m.readOnboardingCompleted()).toBe(true);
    expect(store.localStorage.getItem(LEGACY_KEY)).toBeNull();
  });
});

describe('fetchChangelog (fails closed — a broken/unreachable endpoint must never crash the page)', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns the empty changelog when the network request rejects', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network down'));
    const m = await freshModule();
    await expect(m.fetchChangelog()).resolves.toEqual({
      schema_version: 1,
      latest_sequence: 0,
      entries: [],
    });
  });

  it('returns the empty changelog on a non-OK HTTP response', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    const m = await freshModule();
    await expect(m.fetchChangelog()).resolves.toEqual({
      schema_version: 1,
      latest_sequence: 0,
      entries: [],
    });
  });

  it('returns the empty changelog on a malformed response body', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ oops: true }) });
    const m = await freshModule();
    await expect(m.fetchChangelog()).resolves.toEqual({
      schema_version: 1,
      latest_sequence: 0,
      entries: [],
    });
  });

  it('returns the empty changelog when response.json() itself throws', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => {
        throw new Error('invalid JSON');
      },
    });
    const m = await freshModule();
    await expect(m.fetchChangelog()).resolves.toEqual({
      schema_version: 1,
      latest_sequence: 0,
      entries: [],
    });
  });
});
