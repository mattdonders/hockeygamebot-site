/**
 * EarnedResultCard — inline result surface for a single HISTORICAL earned-result
 * add (Block 1C, 2026-08): team search, date search, and manual entry. Renders an
 * `EarnedResultVM` (`src/lib/earned-result.ts`) at the SAME anchor the generic
 * `att-logprompt` banner used to occupy for those paths (see AttendedTracker.tsx).
 *
 * NOT a modal, NOT a browser alert — a plain inline card so it never blocks the
 * rest of the dashboard. Mirrors TonightGameCard's in-card `cel-list` in spirit
 * (same role-token typography, same "✦" mark) without touching that component.
 */
import React, { useEffect, useRef } from 'react';
import type { EarnedResultVM } from '../../lib/earned-result';

type Props = {
  vm: EarnedResultVM;
  onDismiss: () => void;
};

export default function EarnedResultCard({ vm, onDismiss }: Props) {
  const dismissRef = useRef<HTMLButtonElement | null>(null);

  // a11y: move focus onto the card's dismiss affordance the moment it mounts, so a
  // screen-reader / keyboard user lands on the new result instead of it silently
  // appearing off-screen from their current focus.
  useEffect(() => {
    dismissRef.current?.focus();
  }, []);

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onDismiss();
    }
  };

  return (
    <div className="earned-card" role="status" aria-live="polite" onKeyDown={onKeyDown}>
      <div className="earned-top">
        <div className="earned-eyebrow">{vm.eyebrow}</div>
        <button
          type="button"
          className="earned-dismiss"
          ref={dismissRef}
          onClick={onDismiss}
        >
          Done
        </button>
      </div>
      <div className={`earned-hero earned-hero-${vm.heroKind}`}>
        <span className="earned-hero-mark" aria-hidden="true">
          {vm.heroKind === 'bare' ? '✓' : '✦'}
        </span>
        <div className="earned-hero-text">
          <div className="earned-hero-title">{vm.heroTitle}</div>
          {vm.heroSubtitle ? <div className="earned-hero-sub">{vm.heroSubtitle}</div> : null}
        </div>
      </div>
      {vm.secondary.length > 0 ? (
        <div className="earned-secondary">
          <div className="earned-secondary-label">Also unlocked</div>
          <ul className="earned-secondary-list">
            {vm.secondary.map((item, i) => (
              <li key={`${item.label}-${i}`}>
                <span className="earned-secondary-mark" aria-hidden="true">
                  {item.icon}
                </span>
                {item.label}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {vm.totals ? <div className="earned-totals">{vm.totals}</div> : null}
    </div>
  );
}
