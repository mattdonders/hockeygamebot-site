/**
 * "Find my game" — a manual escape hatch from Tonight's Game's automatic inference
 * (geolocation, then rooting team). Overlay pattern copied from StatsSearchModal.tsx —
 * there's no shared Modal.tsx in this codebase; every modal rolls its own.
 *
 * Lists every server-eligible game, excluding only games ALREADY LOGGED — not dismissed
 * ones. "Not this one" means "don't auto-suggest this," not "hide it forever," so a
 * mistakenly-dismissed game must stay recoverable here.
 */
import React, { useEffect, useRef } from 'react';
import type { TonightGame } from '../../lib/tonight-client';

type Props = {
  games: TonightGame[];
  loggedGameIds: Set<string>;
  onPick: (game: TonightGame) => void;
  onClose: () => void;
};

/** Loggable ("open") games sort first, then by how recently they started/are starting;
 *  not-yet-open games trail behind, upcoming-soonest first. The TonightGame contract only
 *  distinguishes 'pre' vs 'open' windows, so live-vs-just-finished isn't separately
 *  orderable here — both fall in the "open" bucket, sorted by start time like everything
 *  else. */
function sortKey(g: TonightGame): [number, number] {
  const bucket = g.window === 'open' ? 0 : 1;
  const t = g.start_time ? Date.parse(g.start_time) : Date.parse(`${g.date}T00:00:00Z`);
  return [bucket, Number.isFinite(t) ? t : 0];
}

export default function TonightGamePicker({ games, loggedGameIds, onPick, onClose }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const visible = games
    .filter((g) => !loggedGameIds.has(g.game_id))
    .slice()
    .sort((a, b) => {
      const [ba, ta] = sortKey(a);
      const [bb, tb] = sortKey(b);
      return ba !== bb ? ba - bb : ta - tb;
    });

  return (
    <div
      ref={overlayRef}
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
      className="tn-picker-overlay"
    >
      <div className="tn-picker-box">
        <div className="tn-picker-head">
          <span className="tn-picker-title">Find my game</span>
          <button type="button" className="tn-picker-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="tn-picker-list">
          {visible.length === 0 ? (
            <div className="tn-picker-empty">No eligible games.</div>
          ) : (
            visible.map((g) => {
              const time = g.start_time
                ? new Date(g.start_time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
                : '';
              return (
                <button
                  key={g.game_id}
                  type="button"
                  className={`tn-picker-row${!g.loggable ? ' disabled' : ''}`}
                  disabled={!g.loggable}
                  onClick={() => onPick(g)}
                >
                  <span className="tn-picker-teams">
                    {g.away.abbrev} @ {g.home.abbrev}
                  </span>
                  <span className="tn-picker-meta">
                    {g.venue ?? ''}
                    {time ? ` · ${time}` : ''}
                  </span>
                  {!g.loggable ? <span className="tn-picker-reason">Opens at puck drop</span> : null}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
