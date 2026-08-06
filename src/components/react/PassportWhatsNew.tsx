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
 * Rendered inside PublicPassportPanel.tsx (the closest existing account
 * surface) as a small trigger link, per the plan's decision not to build new
 * settings infrastructure.
 */

import React, { useCallback, useState } from 'react';
import {
  acknowledgeSeenThrough,
  fetchChangelog,
  readLocalSeenThrough,
  resolveLocalSeenThrough,
  unreadEntries,
  type ChangelogEntry,
} from '../../lib/passport-changelog';

export default function PassportWhatsNew() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState<ChangelogEntry[] | null>(null);

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
          }
        })
        .finally(() => setLoading(false));
    }
  }, [entries]);

  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <button type="button" className="pp-whats-new-link" onClick={openHistory}>
        What's new
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
    </>
  );
}
