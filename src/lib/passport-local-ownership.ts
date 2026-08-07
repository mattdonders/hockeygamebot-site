/**
 * Puck Passport local-history ownership marker — closes the cross-account
 * contamination gap in the anonymous→account merge-on-login flow.
 *
 * `hgb_puck_passport_games` (AttendedTracker.tsx's STORAGE_KEY) is a single,
 * unscoped localStorage array. Merge-on-login intentionally RETAINS that array
 * when one or more upserts to the server fail (never drop unsynced data), but
 * historically nothing recorded WHOSE attempted sync left it there. Sign-out
 * clears only the session token — the array survives untouched — so a second,
 * different account signing in on the same browser saw the retained array as
 * indistinguishable from genuine anonymous history and merged it into itself.
 *
 * This module adds exactly one bit of state: which account (if any) the
 * CURRENT contents of STORAGE_KEY are claimed by. It does not touch the game
 * list itself, does not delete anything, and is the only file that reads or
 * writes PENDING_OWNER_KEY — callers (AttendedTracker.tsx) only ever consult
 * `isForeignOwned` / call `claim` / `release`.
 *
 * The four ownership states from the identity-architecture investigation map
 * onto this as:
 *   1. unclaimed anonymous local records   → no marker (readPendingOwner() === null)
 *   2/3. claimed / pending for account X   → marker present, userId = X
 *   4. confirmed server-backed cache for X → out of scope here; that's D1, not
 *      this file — once a merge fully succeeds the local array is cleared and
 *      the marker released, so state 2/3 collapses back to "nothing local".
 */

const PENDING_OWNER_KEY = 'hgb_puck_passport_pending_owner_v1';

export type PendingOwner = { userId: string };

/**
 * Whoever's login attempt most recently left the local list non-empty, or
 * null if the list (if any) is genuine, unclaimed anonymous history. Fails
 * safe to null (never throws, never blocks the anonymous path) on missing
 * window, storage errors, or malformed JSON.
 */
export function readPendingOwner(): PendingOwner | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(PENDING_OWNER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && typeof parsed.userId === 'string' && parsed.userId) {
      return { userId: parsed.userId };
    }
    return null;
  } catch {
    return null;
  }
}

/** Marks the current local list as belonging to `userId` (a failed/partial
 *  merge attempt). Idempotent — re-claiming by the same owner is a no-op
 *  write. */
export function claimPendingOwner(userId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PENDING_OWNER_KEY, JSON.stringify({ userId }));
  } catch {
    /* private mode / quota — the retained list stays functionally the same,
       it just won't carry the safety marker across a reload */
  }
}

/** Releases the claim — call ONLY once the owning account's merge has fully
 *  succeeded (the local list itself is cleared at the same time). Safe to
 *  call when nothing is claimed. */
export function releasePendingOwner(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(PENDING_OWNER_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * True when the current local list is claimed by an account OTHER than
 * `currentUserId` — i.e. it must not be merged into (or displayed as
 * belonging to) whoever is asking. Pass `null` for the anonymous viewer (no
 * one is signed in): ANY claim at all makes the list foreign in that case,
 * since a claimed list is no longer "genuine anonymous history" available to
 * whoever looks next.
 */
export function isForeignOwned(currentUserId: string | null): boolean {
  const owner = readPendingOwner();
  if (!owner) return false;
  return currentUserId == null || owner.userId !== currentUserId;
}
