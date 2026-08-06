/**
 * PassportOnboarding — first-visit onboarding + compact "What's New"
 * announcement for /puck-passport.
 *
 * Two independent gates now (previously one version-string comparison):
 *   - Onboarding: `hgb_pp_onboarding_completed` (passport-version.ts). First
 *     visit on this device → the 3-step how-to tour.
 *   - Changelog: `puck_passport_changelog_seen_through`, a monotonic sequence
 *     cursor (passport-changelog.ts). Existing device/account with entries
 *     newer than its cursor → the compact unread announcement below.
 *
 * Close semantics differ by action (plan §6):
 *   - Explicit "Got it" / "×" → ACKNOWLEDGES: persists the cursor (or
 *     onboarding-completed) so it never shows again for those entries.
 *   - Backdrop click / Escape → closes WITHOUT acknowledging. The same
 *     unread entries reappear next load. Onboarding has no "ambient" case in
 *     practice (there's nothing to leave unread), but the same handler shape
 *     is reused for both bodies.
 *
 * The PERMANENT "See all updates" history is a separate surface
 * (PassportWhatsNew.tsx) — this modal only ever shows the unread delta.
 *
 * Guardrails: client-side only. Renders null on the server / before
 * hydration, and safely degrades (no crash, nothing shown) if the changelog
 * endpoint or localStorage is unavailable.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  migrateLegacyChangelogState,
  readOnboardingCompleted,
  writeOnboardingCompleted,
} from '../../lib/passport-version';
import {
  acknowledgeSeenThrough,
  fetchChangelog,
  mergeSeenThroughOnLogin,
  readLocalSeenThrough,
  resolveLocalSeenThrough,
  unreadEntries,
  type ChangelogEntry,
} from '../../lib/passport-changelog';
import { getSessionToken } from '../../lib/auth-client';

type Mode = 'onboarding' | 'whats-new' | null;

export default function PassportOnboarding() {
  // null until the mount effect resolves which modal (if any) to show. This keeps
  // SSR / first paint empty and avoids a flash before we've read localStorage.
  const [mode, setMode] = useState<Mode>(null);
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);
  const [latestSequence, setLatestSequence] = useState(0);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      migrateLegacyChangelogState();

      if (!readOnboardingCompleted()) {
        if (!cancelled) setMode('onboarding');
        return;
      }

      // Existing user/device. Merge local + account cursors when logged in
      // (mirrors auth-client's mergeLocalPresets lifecycle) before deciding
      // what's unread.
      if (getSessionToken()) {
        await mergeSeenThroughOnLogin();
      }
      if (cancelled) return;

      const changelog = await fetchChangelog();
      if (cancelled) return;

      const seenThrough = resolveLocalSeenThrough(readLocalSeenThrough());
      const unread = unreadEntries(changelog.entries, seenThrough);
      if (unread.length === 0) return; // nothing new — no modal

      setEntries(unread);
      setLatestSequence(changelog.latest_sequence);
      setMode('whats-new');
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const acknowledge = useCallback(() => {
    if (mode === 'onboarding') {
      writeOnboardingCompleted();
      // New-device path (plan §3): a first-time user shouldn't see launch
      // entries as unread the moment onboarding finishes. Best-effort —
      // failure just leaves the cursor unset, resolved later via baseline.
      fetchChangelog().then((c) => acknowledgeSeenThrough(c.latest_sequence));
    } else if (mode === 'whats-new') {
      acknowledgeSeenThrough(latestSequence);
    }
    setMode(null);
  }, [mode, latestSequence]);

  const dismissWithoutAcknowledging = useCallback(() => {
    setMode(null);
  }, []);

  // Esc-to-close while a modal is open — ambient close, does not persist.
  useEffect(() => {
    if (!mode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismissWithoutAcknowledging();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mode, dismissWithoutAcknowledging]);

  if (!mode) return null;

  return (
    <div
      className="pp-modal-overlay"
      role="presentation"
      // Backdrop click (only when the click lands on the overlay itself, not the
      // card) — ambient close, does not persist.
      onClick={(e) => {
        if (e.target === e.currentTarget) dismissWithoutAcknowledging();
      }}
    >
      <div
        className="pp-modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pp-modal-title"
      >
        <button type="button" className="pp-modal-close" aria-label="Close" onClick={acknowledge}>
          ×
        </button>

        {mode === 'onboarding' ? (
          <OnboardingBody onDismiss={acknowledge} />
        ) : (
          <WhatsNewBody entries={entries} onDismiss={acknowledge} />
        )}
      </div>
    </div>
  );
}

// ── First-visit onboarding ───────────────────────────────────────────────────
// Copy is fixed per the operator. Note "level up" (NOT "tier up"). The single
// primary button only closes the modal — no scroll, no side effect.
function OnboardingBody({ onDismiss }: { onDismiss: () => void }) {
  return (
    <>
      <span className="pp-modal-eyebrow">New here</span>
      <h2 className="pp-modal-title" id="pp-modal-title">
        Welcome to Puck <span className="pp-modal-nowrap">Passport <span className="pp-modal-emoji" aria-hidden="true">🎟️</span></span>
      </h2>
      <p className="pp-modal-lede">Track every NHL game you’ve been to in person.</p>

      <ol className="pp-modal-steps">
        <li>
          <span className="pp-modal-step-n">1</span>
          <span className="pp-modal-step-body">
            <strong>Log a game</strong> — pick a team and season, or search by date.
          </span>
        </li>
        <li>
          <span className="pp-modal-step-n">2</span>
          <span className="pp-modal-step-body">
            <strong>Collect</strong> — earn badges, level up your milestones, and fill in all 32 home rinks.
          </span>
        </li>
        <li>
          <span className="pp-modal-step-n">3</span>
          <span className="pp-modal-step-body">
            <strong>Save + share</strong> — sign in to sync across devices and claim your own shareable passport.
          </span>
        </li>
      </ol>

      <div className="pp-modal-actions">
        <button type="button" className="pp-modal-primary" onClick={onDismiss}>
          Log your first game →
        </button>
      </div>
    </>
  );
}

// ── Returning-user "What's New" ──────────────────────────────────────────────
// Compact unread delta only — the full history lives in PassportWhatsNew.tsx.
function WhatsNewBody({ entries, onDismiss }: { entries: ChangelogEntry[]; onDismiss: () => void }) {
  return (
    <>
      <span className="pp-modal-eyebrow">What’s new</span>
      <h2 className="pp-modal-title" id="pp-modal-title">
        Fresh in Puck Passport
      </h2>

      <div className="pp-modal-changelog">
        {entries.map((e) => (
          <div className="pp-modal-release" key={e.id}>
            <div className="pp-modal-release-head">
              <span className="pp-modal-release-title">{e.title}</span>
            </div>
            <p className="pp-modal-release-summary">{e.summary}</p>
          </div>
        ))}
      </div>

      <div className="pp-modal-actions">
        <button type="button" className="pp-modal-primary" onClick={onDismiss}>
          Got it
        </button>
      </div>
    </>
  );
}
