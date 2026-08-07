import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readClaimedPending, setClaimedPending } from '../passport-local-ownership';
import { installFakeWindow, uninstallFakeWindow, type StorageHandles } from './test-storage';

const CLAIMED_PENDING_KEY = 'hgb_puck_passport_claimed_pending_v1';

type Game = { game_id: string };

let store: StorageHandles;

beforeEach(() => {
  store = installFakeWindow();
});

afterEach(() => {
  uninstallFakeWindow();
});

describe('readClaimedPending', () => {
  it('returns [] when nothing is claimed for this account', () => {
    expect(readClaimedPending('account-a')).toEqual([]);
  });

  it('fails safe to [] on corrupt JSON', () => {
    store.localStorage.setItem(CLAIMED_PENDING_KEY, '{not json');
    expect(readClaimedPending('account-a')).toEqual([]);
  });

  it('fails safe to [] when the top-level value is an array, not a map', () => {
    store.localStorage.setItem(CLAIMED_PENDING_KEY, JSON.stringify(['g1', 'g2']));
    expect(readClaimedPending('account-a')).toEqual([]);
  });

  it('fails safe to [] when this account has an entry that is not an array', () => {
    store.localStorage.setItem(CLAIMED_PENDING_KEY, JSON.stringify({ 'account-a': 'oops' }));
    expect(readClaimedPending('account-a')).toEqual([]);
  });

  it('reflects records written by setClaimedPending', () => {
    const games: Game[] = [{ game_id: 'g1' }, { game_id: 'g2' }];
    setClaimedPending('account-a', games);
    expect(readClaimedPending<Game>('account-a')).toEqual(games);
  });

  it('survives a simulated reload (localStorage persists, only sessionStorage resets)', () => {
    setClaimedPending('account-a', [{ game_id: 'g1' }]);
    store.newSession();
    expect(readClaimedPending<Game>('account-a')).toEqual([{ game_id: 'g1' }]);
  });
});

describe('setClaimedPending', () => {
  it('fully replaces a prior claim for the same account (not an append)', () => {
    setClaimedPending('account-a', [{ game_id: 'g1' }]);
    setClaimedPending('account-a', [{ game_id: 'g2' }]);
    expect(readClaimedPending<Game>('account-a')).toEqual([{ game_id: 'g2' }]);
  });

  it('clears the claim when given an empty array', () => {
    setClaimedPending('account-a', [{ game_id: 'g1' }]);
    setClaimedPending('account-a', []);
    expect(readClaimedPending('account-a')).toEqual([]);
  });

  it('is a safe no-op when clearing an account with no existing claim', () => {
    expect(() => setClaimedPending('account-a', [])).not.toThrow();
    expect(readClaimedPending('account-a')).toEqual([]);
  });

  it('keys claims independently per account — the cross-account contamination guard', () => {
    setClaimedPending('account-a', [{ game_id: 'a1' }]);
    setClaimedPending('account-b', [{ game_id: 'b1' }]);
    expect(readClaimedPending<Game>('account-a')).toEqual([{ game_id: 'a1' }]);
    expect(readClaimedPending<Game>('account-b')).toEqual([{ game_id: 'b1' }]);
  });

  it("clearing one account's claim does not disturb another account's claim", () => {
    setClaimedPending('account-a', [{ game_id: 'a1' }]);
    setClaimedPending('account-b', [{ game_id: 'b1' }]);
    setClaimedPending('account-a', []);
    expect(readClaimedPending('account-a')).toEqual([]);
    expect(readClaimedPending<Game>('account-b')).toEqual([{ game_id: 'b1' }]);
  });
});

describe('end-to-end ownership lifecycle', () => {
  it('Scenario A — Account A pending records are never visible to Account B', () => {
    // Account A's partial merge failure claims g1 for account-a.
    setClaimedPending('account-a', [{ game_id: 'g1' }]);
    // Account B signs in on the same browser; B's own claim slot is untouched.
    expect(readClaimedPending('account-b')).toEqual([]);
    // A's record is still exactly where it was.
    expect(readClaimedPending<Game>('account-a')).toEqual([{ game_id: 'g1' }]);
  });

  it('Scenario B — a claim for older records does not attach to a differently-keyed new anonymous record', () => {
    // Account A has an older claimed/pending record.
    setClaimedPending('account-a', [{ game_id: 'old-1' }]);
    // A signs out. A new anonymous game is created — this module never sees
    // it (it lives in AttendedTracker's separate, unscoped STORAGE_KEY), so
    // it cannot inherit A's claim merely by A having one.
    expect(readClaimedPending('account-c')).toEqual([]);
    // A signs back in: A's own claim resumes untouched, unaffected by
    // whatever anonymous history has accumulated in the meantime.
    expect(readClaimedPending<Game>('account-a')).toEqual([{ game_id: 'old-1' }]);
  });

  it('Scenario D — Account A can resume and clear its retained pending records without data loss', () => {
    setClaimedPending('account-a', [{ game_id: 'g1' }, { game_id: 'g2' }]);
    // Retry: g1 now syncs, g2 still fails — full replace with only what's left.
    setClaimedPending('account-a', [{ game_id: 'g2' }]);
    expect(readClaimedPending<Game>('account-a')).toEqual([{ game_id: 'g2' }]);
    // Final retry: everything syncs — claim clears, nothing left behind.
    setClaimedPending('account-a', []);
    expect(readClaimedPending('account-a')).toEqual([]);
  });
});
