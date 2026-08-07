/**
 * Puck Passport "What's New" changelog — sequence-cursor model.
 *
 * Replaces passport-version.ts's version-string CHANGELOG/lastSeen model for
 * changelog purposes. Onboarding (the first-visit tour) is a SEPARATE concern
 * now — see passport-version.ts and ONBOARDING_COMPLETED_KEY below.
 *
 * Content is developer-published to R2 by hgb-api's
 * scripts/publish_passport_changelog.js and served read-only via
 * GET /v1/passport/changelog. Git (in hgb-api) is the review/history/rollback
 * source; that endpoint is the runtime source for both web and (later) iOS.
 *
 * See docs/plans/puck-passport-whats-new-implementation-plan-2026-08-06.md.
 */

import * as Sentry from '@sentry/browser';
import { API_BASE, getPrefs, putPrefs, getSessionToken } from './auth-client';

export type ChangelogCategory = 'new' | 'improved' | 'privacy' | 'fixed';

export type ChangelogEntry = {
  sequence: number;
  id: string;
  published_at: string;
  title: string;
  summary: string;
  body: string;
  category: ChangelogCategory;
  platforms?: string[];
};

export type ChangelogResponse = {
  schema_version: number;
  latest_sequence: number;
  entries: ChangelogEntry[];
};

const EMPTY_CHANGELOG: ChangelogResponse = { schema_version: 1, latest_sequence: 0, entries: [] };

/** GET /v1/passport/changelog. Fails closed (empty response) on any error —
 *  a broken/unreachable endpoint must never crash the Puck Passport page. */
export async function fetchChangelog(): Promise<ChangelogResponse> {
  // Preview-only: see passport-changelog-preview-fixture.ts. Statically false
  // (and dead-code-eliminated) in every production build.
  if (import.meta.env.PUBLIC_CHANGELOG_FIXTURE) {
    const { PREVIEW_CHANGELOG_FIXTURE } = await import('./passport-changelog-preview-fixture');
    return PREVIEW_CHANGELOG_FIXTURE;
  }
  try {
    const r = await fetch(`${API_BASE}/v1/passport/changelog`);
    if (!r.ok) return EMPTY_CHANGELOG;
    const data = await r.json();
    if (!data || !Array.isArray(data.entries) || typeof data.latest_sequence !== 'number') {
      return EMPTY_CHANGELOG;
    }
    return data as ChangelogResponse;
  } catch {
    return EMPTY_CHANGELOG;
  }
}

// ── Local state: onboarding-completed + changelog cursor, split ────────────

/** Whether the first-visit onboarding tour has been completed on this device. */
export const ONBOARDING_COMPLETED_KEY = 'hgb_pp_onboarding_completed';
/** Highest changelog `sequence` acknowledged on this device. Stringified int. */
export const CHANGELOG_SEEN_THROUGH_KEY = 'puck_passport_changelog_seen_through';
/** Superseded single-key model (see passport-version.ts). Migrated once, then deleted. */
const LEGACY_LAST_SEEN_KEY = 'hgb_pp_last_seen_version';

// In-memory fallback so state still holds for the session when localStorage is
// blocked (private mode / quota) — mirrors passport-version.ts's precedent.
let inMemoryOnboardingCompleted = false;
let inMemorySeenThrough: number | null = null;

/**
 * One-time migration: a non-null legacy key is evidence onboarding was already
 * completed on this device, so mark onboarding completed and leave the
 * changelog cursor UNSET — it must resolve via the existing-user launch-baseline
 * path (resolveLocalSeenThrough), not be treated as a brand-new device. Safe to
 * call on every load; it's a no-op once the legacy key is gone.
 */
export function migrateLegacyChangelogState(): void {
  if (typeof window === 'undefined') return;
  let legacy: string | null;
  try {
    legacy = window.localStorage.getItem(LEGACY_LAST_SEEN_KEY);
  } catch {
    return; // storage blocked — nothing to migrate, nothing to write
  }
  if (legacy === null) return;
  try {
    window.localStorage.setItem(ONBOARDING_COMPLETED_KEY, 'true');
    window.localStorage.removeItem(LEGACY_LAST_SEEN_KEY);
  } catch {
    /* private mode / quota — leave the legacy key in place for a later retry */
  }
}

export function readOnboardingCompleted(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const stored = window.localStorage.getItem(ONBOARDING_COMPLETED_KEY);
    if (stored !== null) return stored === 'true';
  } catch {
    /* fall through to in-memory */
  }
  return inMemoryOnboardingCompleted;
}

export function writeOnboardingCompleted(): void {
  if (typeof window === 'undefined') return;
  inMemoryOnboardingCompleted = true;
  try {
    window.localStorage.setItem(ONBOARDING_COMPLETED_KEY, 'true');
  } catch {
    /* in-memory fallback keeps it dismissed for the session */
  }
}

/** Raw stored cursor, or null if unset/unavailable — NOT yet baseline-resolved. */
export function readLocalSeenThrough(): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = window.localStorage.getItem(CHANGELOG_SEEN_THROUGH_KEY);
    if (stored !== null) {
      const n = Number(stored);
      return Number.isFinite(n) ? n : null;
    }
  } catch {
    /* fall through to in-memory */
  }
  return inMemorySeenThrough;
}

export function writeLocalSeenThrough(sequence: number): void {
  if (typeof window === 'undefined') return;
  inMemorySeenThrough = sequence;
  try {
    window.localStorage.setItem(CHANGELOG_SEEN_THROUGH_KEY, String(sequence));
  } catch {
    /* in-memory fallback keeps it dismissed for the session */
  }
}

/**
 * The single acknowledgement primitive — call this from every place that
 * marks the changelog read (compact modal's Got it / × / ambient-tour
 * completion, and the full history view's "had unread at open" advance).
 *
 * Writes the local cursor SYNCHRONOUSLY (so the UI never waits on network),
 * then — when signed in — pushes the same value to the account immediately
 * in the background. This is the fast path for cross-device read state;
 * mergeSeenThroughOnLogin()'s monotonic MAX merge remains the fallback if
 * this push is lost (offline, tab closed mid-request, etc.), so a missed
 * push here is a UX staleness risk, not a correctness bug — worth surfacing
 * to Sentry, not worth blocking or retrying inline.
 */
export function acknowledgeSeenThrough(sequence: number): void {
  writeLocalSeenThrough(sequence);
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('hgb:changelog-acknowledged', { detail: { sequence } }));
  if (!getSessionToken()) return;
  putPrefs({ changelog_seen_through: sequence })
    .then((result) => {
      if (!result) {
        Sentry.captureException(
          new Error('passport-changelog: putPrefs returned null acknowledging changelog_seen_through'),
        );
      }
    })
    .catch((err) => {
      Sentry.captureException(err);
    });
}

// ── NULL-cursor resolution + launch baseline (plan §5) ──────────────────────

/**
 * Fixed changelog-launch-baseline timestamp. Used ONLY to disambiguate a NULL
 * cursor (pre-existing account/device vs. genuinely new) — not a feature flag.
 * Append-only: do not move this once real accounts exist on either side of it.
 */
export const CHANGELOG_LAUNCH_TIMESTAMP = '2026-08-06T00:00:00Z';

/**
 * One less than the oldest POST-launch entry's sequence (4, gordie-howe-fight-
 * accuracy), so only entries announced at/after the changelog's own launch
 * read as unread the first time an existing user/device resolves against this
 * baseline. Sequences 1-3 (team-records-perspective, ticket-stubs,
 * milestone-tiers) are backfilled historical entries — they shipped to
 * production before the changelog feature existed, so they must NOT read as
 * unread; they're still visible in the permanent history, just not flagged as
 * new. See docs/plans/puck-passport-whats-new-implementation-plan-2026-08-06.md §16.
 */
export const CHANGELOG_LAUNCH_BASELINE_SEQUENCE = 3;

/**
 * Resolve a possibly-NULL SERVER cursor (plan §5's account_created_at vs.
 * launch-baseline rule). `accountCreatedAt` is only consulted when `raw` is
 * null; a signed-in account with no created_at on record falls back to
 * "seen through latest" rather than assuming it predates launch.
 */
export function resolveSeenThrough(
  raw: number | null,
  accountCreatedAt: string | null,
  latestSequence: number,
): number {
  if (raw != null) return raw;
  if (accountCreatedAt != null && accountCreatedAt < CHANGELOG_LAUNCH_TIMESTAMP) {
    return CHANGELOG_LAUNCH_BASELINE_SEQUENCE;
  }
  return latestSequence;
}

/**
 * Resolve a possibly-NULL LOCAL cursor (plan §3): an existing device with the
 * cursor left unset by migrateLegacyChangelogState() resolves via the same
 * launch-baseline path as an existing server account. A brand-new device
 * instead calls writeLocalSeenThrough(latestSequence) directly on onboarding
 * completion and never goes through this path.
 */
export function resolveLocalSeenThrough(raw: number | null): number {
  return raw ?? CHANGELOG_LAUNCH_BASELINE_SEQUENCE;
}

/** Entries strictly newer than `seenThrough`. Server already returns entries
 *  newest-first, so this is a plain filter — no re-sort needed. */
export function unreadEntries(entries: ChangelogEntry[], seenThrough: number): ChangelogEntry[] {
  return entries.filter((e) => e.sequence > seenThrough);
}

// ── Local ↔ account merge (plan §4, mirrors auth-client.mergeLocalPresets) ──

export function mergeSeenThrough(local: number | null, account: number | null): number {
  return Math.max(local ?? -1, account ?? -1);
}

/**
 * Recovery/fallback path (acknowledgeSeenThrough is the fast path — this is
 * the backstop for whatever it missed, e.g. an account push that failed or
 * a device that went offline mid-acknowledge). On login/session-restore:
 * fetch account prefs + the changelog (for latest_sequence), resolve both
 * sides' NULLs, take the max, and push/pull whichever side is behind.
 * Mirrors mergeLocalPresets()'s shape/lifecycle. No-ops when logged out.
 * Runs once per session-restore — no polling.
 */
export async function mergeSeenThroughOnLogin(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (!getSessionToken()) return;

  const [prefs, changelog] = await Promise.all([getPrefs(), fetchChangelog()]);
  if (!prefs) return;

  const local = resolveLocalSeenThrough(readLocalSeenThrough());
  const account = resolveSeenThrough(prefs.changelog_seen_through, prefs.account_created_at, changelog.latest_sequence);
  const merged = mergeSeenThrough(local, account);

  if (merged !== account) {
    await putPrefs({ changelog_seen_through: merged });
  }
  if (merged !== local) {
    writeLocalSeenThrough(merged);
  }
}
