import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { claimPendingOwner, isForeignOwned, readPendingOwner, releasePendingOwner } from '../passport-local-ownership';
import { installFakeWindow, uninstallFakeWindow, type StorageHandles } from './test-storage';

const PENDING_OWNER_KEY = 'hgb_puck_passport_pending_owner_v1';

let store: StorageHandles;

beforeEach(() => {
  store = installFakeWindow();
});

afterEach(() => {
  uninstallFakeWindow();
});

describe('readPendingOwner', () => {
  it('returns null when nothing is stored (genuine anonymous history)', () => {
    expect(readPendingOwner()).toBeNull();
  });

  it('fails safe to null on corrupt JSON', () => {
    store.localStorage.setItem(PENDING_OWNER_KEY, '{not json');
    expect(readPendingOwner()).toBeNull();
  });

  it('fails safe to null on a malformed object (missing userId)', () => {
    store.localStorage.setItem(PENDING_OWNER_KEY, JSON.stringify({ notUserId: 'account-a' }));
    expect(readPendingOwner()).toBeNull();
  });

  it('fails safe to null on a non-string userId', () => {
    store.localStorage.setItem(PENDING_OWNER_KEY, JSON.stringify({ userId: 42 }));
    expect(readPendingOwner()).toBeNull();
  });

  it('reflects a claim written by claimPendingOwner', () => {
    claimPendingOwner('account-a');
    expect(readPendingOwner()).toEqual({ userId: 'account-a' });
  });

  it('survives a simulated reload (localStorage persists, only sessionStorage resets)', () => {
    claimPendingOwner('account-a');
    store.newSession();
    expect(readPendingOwner()).toEqual({ userId: 'account-a' });
  });
});

describe('claimPendingOwner', () => {
  it('is idempotent — reclaiming by the same owner leaves the same state', () => {
    claimPendingOwner('account-a');
    claimPendingOwner('account-a');
    expect(readPendingOwner()).toEqual({ userId: 'account-a' });
  });

  it('overwrites a prior claim when a new owner claims (used only for the same-account retry path)', () => {
    claimPendingOwner('account-a');
    claimPendingOwner('account-b');
    expect(readPendingOwner()).toEqual({ userId: 'account-b' });
  });
});

describe('releasePendingOwner', () => {
  it('clears an existing claim', () => {
    claimPendingOwner('account-a');
    releasePendingOwner();
    expect(readPendingOwner()).toBeNull();
  });

  it('is a safe no-op when nothing is claimed', () => {
    expect(() => releasePendingOwner()).not.toThrow();
    expect(readPendingOwner()).toBeNull();
  });
});

describe('isForeignOwned — the cross-account contamination guard', () => {
  it('is false for the anonymous viewer when nothing is claimed (ordinary anonymous history stays visible/mergeable)', () => {
    expect(isForeignOwned(null)).toBe(false);
  });

  it('is true for the anonymous viewer once ANY account has claimed the local list', () => {
    claimPendingOwner('account-a');
    expect(isForeignOwned(null)).toBe(true);
  });

  it('is false for the SAME account retrying (resumes/sees its own pending data)', () => {
    claimPendingOwner('account-a');
    expect(isForeignOwned('account-a')).toBe(false);
  });

  it('is true for a DIFFERENT account signing in on the same browser (the regression scenario)', () => {
    claimPendingOwner('account-a');
    expect(isForeignOwned('account-b')).toBe(true);
  });

  it('is false again once the owning account fully syncs and releases the claim', () => {
    claimPendingOwner('account-a');
    releasePendingOwner();
    expect(isForeignOwned('account-a')).toBe(false);
    expect(isForeignOwned('account-b')).toBe(false);
    expect(isForeignOwned(null)).toBe(false);
  });

  it('repeated reads do not themselves mutate or clear a claim (no accidental reset to anonymous)', () => {
    claimPendingOwner('account-a');
    isForeignOwned('account-b');
    isForeignOwned(null);
    isForeignOwned('account-a');
    expect(readPendingOwner()).toEqual({ userId: 'account-a' });
  });
});

describe('end-to-end ownership lifecycle (mirrors the account.astro sign-out / re-login sequence)', () => {
  it('claim persists through sign-out (no code path clears it except a successful same-owner sync)', () => {
    // Account A's partial merge failure claims the list.
    claimPendingOwner('account-a');
    // Sign-out only clears the session token elsewhere; nothing here does that,
    // by construction — this module is never touched by the sign-out handler.
    expect(readPendingOwner()).toEqual({ userId: 'account-a' });

    // Account B signs in on the same browser.
    expect(isForeignOwned('account-b')).toBe(true);

    // Account A signs back in later — the claim is still theirs to resume.
    expect(isForeignOwned('account-a')).toBe(false);

    // A's retry now fully succeeds — the claim is released.
    releasePendingOwner();
    expect(readPendingOwner()).toBeNull();

    // A later, genuinely anonymous session syncs freely to whoever signs in next.
    expect(isForeignOwned('account-c')).toBe(false);
  });
});
