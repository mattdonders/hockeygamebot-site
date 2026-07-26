/**
 * PassportOnboarding — first-visit onboarding + "What's New" modals for
 * /puck-passport. A small, self-contained companion island (decoupled from the
 * large AttendedTracker) that decides, once per page load, whether to greet the
 * user based on their stored `lastSeen` version:
 *
 *   - First visit (no lastSeen)        → ONBOARDING modal (the 3-step how-to).
 *   - lastSeen < current version       → "What's New" modal (changelog delta).
 *   - lastSeen >= current version      → nothing.
 *
 * Dismissing EITHER (primary button / X / backdrop / Esc) stamps
 * localStorage[hgb_pp_last_seen_version] = PUCK_PASSPORT_VERSION, so it never
 * shows again for this version. The onboarding CTA is guidance-only — it just
 * closes the modal, leaving the Add Games UI visible underneath (per the
 * operator: the CTA needs no scroll/action).
 *
 * Guardrails: client-side only, no network. Renders null on the server / before
 * hydration, and safely no-ops if localStorage is unavailable.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  changelogSince,
  pickModalMode,
  readLastSeenVersion,
  writeLastSeenVersion,
  type ChangelogEntry,
  type PassportModalMode,
} from '../../lib/passport-version';

export default function PassportOnboarding() {
  // null until the mount effect resolves which modal (if any) to show. This keeps
  // SSR / first paint empty and avoids a flash before we've read localStorage.
  const [mode, setMode] = useState<PassportModalMode>(null);
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);

  useEffect(() => {
    const lastSeen = readLastSeenVersion();
    const next = pickModalMode(lastSeen);
    if (next === 'whats-new') {
      const delta = changelogSince(lastSeen ?? '0');
      // Defensive: if the delta is somehow empty, there's nothing to show — treat
      // as current and stamp, so we don't render an empty "What's New".
      if (delta.length === 0) {
        writeLastSeenVersion();
        return;
      }
      setEntries(delta);
    }
    setMode(next);
  }, []);

  const dismiss = useCallback(() => {
    writeLastSeenVersion(); // stamp current version → never shows again this version
    setMode(null);
  }, []);

  // Esc-to-close while a modal is open.
  useEffect(() => {
    if (!mode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mode, dismiss]);

  if (!mode) return null;

  return (
    <div
      className="pp-modal-overlay"
      role="presentation"
      // Backdrop click (only when the click lands on the overlay itself, not the card).
      onClick={(e) => {
        if (e.target === e.currentTarget) dismiss();
      }}
    >
      <div
        className="pp-modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pp-modal-title"
      >
        <button type="button" className="pp-modal-close" aria-label="Close" onClick={dismiss}>
          ×
        </button>

        {mode === 'onboarding' ? (
          <OnboardingBody onDismiss={dismiss} />
        ) : (
          <WhatsNewBody entries={entries} onDismiss={dismiss} />
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
// Won't fire at launch (everyone is either brand-new → onboarding, or already
// current). Lists CHANGELOG entries newer than the user's lastSeen.
function WhatsNewBody({ entries, onDismiss }: { entries: ChangelogEntry[]; onDismiss: () => void }) {
  return (
    <>
      <span className="pp-modal-eyebrow">What’s new</span>
      <h2 className="pp-modal-title" id="pp-modal-title">
        Fresh in Puck Passport
      </h2>

      <div className="pp-modal-changelog">
        {entries.map((e) => (
          <div className="pp-modal-release" key={e.version}>
            <div className="pp-modal-release-head">
              <span className="pp-modal-release-ver">v{e.version}</span>
              <span className="pp-modal-release-title">{e.title}</span>
            </div>
            <ul className="pp-modal-release-items">
              {e.items.map((it, i) => (
                <li key={i}>{it}</li>
              ))}
            </ul>
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
