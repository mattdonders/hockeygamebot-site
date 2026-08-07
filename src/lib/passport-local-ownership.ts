/**
 * Puck Passport local-history ownership — closes the cross-account
 * contamination gap in the anonymous→account merge-on-login flow.
 *
 * `hgb_puck_passport_games` (AttendedTracker.tsx's STORAGE_KEY) is written to
 * ONLY while logged out, so by construction it holds genuinely anonymous,
 * unclaimed history — nothing in this module touches it.
 *
 * The gap was elsewhere: when a merge-on-login upload partially failed, the
 * failed records had to stay somewhere so they weren't silently lost, but
 * nothing recorded WHOSE attempt left them there. Sign-out doesn't clear
 * anything, so a second, different account signing in on the same browser
 * could pick up a first account's failed records right alongside its own
 * genuine anonymous history.
 *
 * This module gives failed/unsynced records a home SEPARATE from the
 * anonymous list: a sidecar keyed by user id
 * (`hgb_puck_passport_claimed_pending_v1` → `Record<userId, T[]>`). A record
 * only ever lives here because a specific account's upload attempt on it
 * failed — it is never derived from, and never mixed back into, the
 * unscoped anonymous list. That separation is what lets a brand-new
 * anonymous game created after account A signs out stay ordinary anonymous
 * history (eligible for whichever account signs in next) instead of
 * inheriting A's claim, while A's own retained records stay isolated to A
 * no matter who else signs in first.
 *
 * The four ownership states from the identity-architecture investigation map
 * onto this as:
 *   1. unclaimed anonymous local records   → STORAGE_KEY (untouched here)
 *   2/3. claimed / pending for account X   → this sidecar, keyed by X
 *   4. confirmed server-backed cache for X → out of scope; that's D1, not
 *      this file — once a merge fully succeeds the record is removed from
 *      the sidecar (setClaimedPending(X, [])), collapsing back to "nothing
 *      local for X".
 */

const CLAIMED_PENDING_KEY = 'hgb_puck_passport_claimed_pending_v1';

function readAll(): Record<string, unknown[]> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = JSON.parse(window.localStorage.getItem(CLAIMED_PENDING_KEY) ?? '{}');
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  } catch {
    return {};
  }
}

function writeAll(all: Record<string, unknown[]>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CLAIMED_PENDING_KEY, JSON.stringify(all));
  } catch {
    /* private mode / quota — the retained records stay functionally the
       same, they just won't carry the claim across a reload */
  }
}

/**
 * Records still claimed/pending for `userId` — i.e. a previous upload
 * attempt by this SAME account left them unsynced. Empty array (never
 * throws) if this account has nothing pending, on missing window, storage
 * errors, or malformed JSON.
 */
export function readClaimedPending<T = unknown>(userId: string): T[] {
  const all = readAll();
  const v = all[userId];
  return Array.isArray(v) ? (v as T[]) : [];
}

/**
 * Replaces the full set of records claimed/pending for `userId` with
 * `games` — call with whatever a merge/retry attempt still failed to sync,
 * INCLUDING records that were already claimed for this same account before
 * the attempt (this is a full replace, not an append). Passing an empty
 * array clears the claim entirely (call only once every record for this
 * account is confirmed synced).
 */
export function setClaimedPending<T>(userId: string, games: T[]): void {
  const all = readAll();
  if (games.length === 0) {
    if (!(userId in all)) return;
    delete all[userId];
  } else {
    all[userId] = games;
  }
  writeAll(all);
}
