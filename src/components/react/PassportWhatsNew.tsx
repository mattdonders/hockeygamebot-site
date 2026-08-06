/**
 * PassportWhatsNew — permanent "See all updates" history surface.
 *
 * Separate from PassportOnboarding.tsx's compact unread announcement (plan
 * §3: "build the permanent history as a separate component/surface; reuse
 * the modal shell only for the compact unread announcement"). This renders
 * ALL published entries, newest-first, regardless of read state.
 *
 * Cursor behavior: opening the link alone does NOT advance the cursor —
 * only a SUCCESSFUL render that had unread entries at open time does,
 * advancing through the newest displayed entry via acknowledgeSeenThrough()
 * (local write now, immediate account push when signed in, Sentry-reported
 * on failure — see passport-changelog.ts). A failed/empty fetch
 * (fetchChangelog() fails closed to an empty response) naturally can't have
 * unread entries, so it can't trigger a write — no separate try/catch
 * needed. Already-current history (nothing unread) also performs no write.
 *
 * Mounted at the top level of the Puck Passport page (AttendedTracker.tsx,
 * right below the stats counters) rather than inside any collapsible/gated
 * panel — this is the ONE permanent entry point, visible signed in or
 * logged out, and unaffected by hiding the Public Passport section. See
 * docs/plans/puck-passport-whats-new-implementation-plan-2026-08-06.md and
 * the corrective-follow-up notes in the same plan directory (2026-08-06).
 *
 * Shows a small unread-count badge (styled off the existing `.cel-badge`
 * pill) when there are entries newer than the local cursor, computed on
 * mount and refreshed whenever `hgb:changelog-acknowledged` fires — the
 * cross-island sync event PassportOnboarding's auto-popup and this
 * component's own "had unread at open" path both go through via
 * acknowledgeSeenThrough(), so acknowledging in one place clears the badge
 * in the other without a reload.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  acknowledgeSeenThrough,
  fetchChangelog,
  readLocalSeenThrough,
  readOnboardingCompleted,
  resolveLocalSeenThrough,
  unreadEntries,
  type ChangelogEntry,
} from '../../lib/passport-changelog';

export default function PassportWhatsNew() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState<ChangelogEntry[] | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  const refreshUnreadCount = useCallback(() => {
    // A brand-new device is mid-onboarding (PassportOnboarding's tour, a
    // separate modal) before its cursor is ever written — resolving that
    // unset cursor to the launch baseline would flag the launch entries as
    // "unread" under a tour the visitor hasn't finished yet. Stay quiet until
    // onboarding completes; "Got it" acknowledges the latest sequence and
    // fires hgb:changelog-acknowledged, which re-runs this check.
    if (!readOnboardingCompleted()) {
      setUnreadCount(0);
      return;
    }
    const seenThrough = resolveLocalSeenThrough(readLocalSeenThrough());
    fetchChangelog().then((c) => setUnreadCount(unreadEntries(c.entries, seenThrough).length));
  }, []);

  useEffect(() => {
    refreshUnreadCount();
    window.addEventListener('hgb:changelog-acknowledged', refreshUnreadCount);
    return () => window.removeEventListener('hgb:changelog-acknowledged', refreshUnreadCount);
  }, [refreshUnreadCount]);

  const openHistory = useCallback(() => {
    setOpen(true);
    if (entries === null) {
      setLoading(true);
      // Snapshot the cursor BEFORE the fetch — this is "at open time," used
      // below to decide whether there was anything unread to advance past.
      const seenThroughAtOpen = resolveLocalSeenThrough(readLocalSeenThrough());
      fetchChangelog()
        .then((c) => {
          setEntries(c.entries);
          const hadUnread = unreadEntries(c.entries, seenThroughAtOpen).length > 0;
          if (hadUnread) {
            // c.entries is newest-first; its head is the newest entry just displayed.
            acknowledgeSeenThrough(c.entries[0].sequence);
            setUnreadCount(0); // instant feedback — the event listener above also catches this
          }
        })
        .finally(() => setLoading(false));
    }
  }, [entries]);

  const close = useCallback(() => setOpen(false), []);

  return (
    <div className="pp-whats-new-anchor">
      <button type="button" className="pp-whats-new-link" onClick={openHistory}>
        <span>What's new</span>
        {unreadCount > 0 ? (
          <span className="cel-badge pp-whats-new-badge">
            {unreadCount} new
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          className="pp-modal-overlay"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div
            className="pp-modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pp-whats-new-title"
          >
            <button type="button" className="pp-modal-close" aria-label="Close" onClick={close}>
              ×
            </button>

            <span className="pp-modal-eyebrow">Puck Passport</span>
            <h2 className="pp-modal-title" id="pp-whats-new-title">
              All updates
            </h2>

            {loading ? (
              <p className="pp-modal-history-empty">Loading…</p>
            ) : entries && entries.length > 0 ? (
              <div className="pp-modal-history-list">
                {entries.map((e) => (
                  <div className="pp-modal-release" key={e.id}>
                    <div className="pp-modal-release-head">
                      <span className="pp-modal-release-title">{e.title}</span>
                      <span className="pp-modal-release-date">
                        {new Date(e.published_at).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    </div>
                    <p className="pp-modal-release-summary">{e.summary}</p>
                    {e.body ? <p className="pp-modal-release-body">{e.body}</p> : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="pp-modal-history-empty">No updates yet.</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
