import React, { useState, useEffect, useCallback, useRef } from 'react';
import PlayerSearch, { type PlayerSearchItem } from './PlayerSearch';

interface Props {
  players: PlayerSearchItem[];
}

export default function StatsSearchModal({ players }: Props) {
  const [open, setOpen] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  const openModal  = useCallback(() => setOpen(true), []);
  const closeModal = useCallback(() => setOpen(false), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); openModal(); }
      if (e.key === 'Escape') closeModal();
    };
    const onCustom = () => openModal();
    document.addEventListener('keydown', onKey);
    document.addEventListener('hgb:open-search', onCustom);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('hgb:open-search', onCustom);
    };
  }, [openModal, closeModal]);

  const handleSelect = useCallback((p: PlayerSearchItem) => {
    closeModal();
    const path = p.type === 'goalie' ? `/stats/goalies/${p.slug}` : `/stats/player/${p.slug}`;
    window.location.href = path;
  }, [closeModal]);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current) closeModal(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(13,13,20,0.55)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: '15vh',
      }}
    >
      <div style={{
        width: '100%', maxWidth: '560px', margin: '0 16px',
        background: 'var(--surface, #fff)',
        border: '2px solid var(--ink, #0d0d14)',
        boxShadow: '0 8px 32px rgba(13,13,20,0.24)',
      }}>
        <div style={{
          padding: '10px 14px 6px',
          borderBottom: '1px solid rgba(13,13,20,0.1)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{
            fontFamily: 'var(--mono, monospace)', fontSize: '9px', fontWeight: 700,
            letterSpacing: '0.14em', textTransform: 'uppercase',
            color: 'rgba(13,13,20,0.4)',
          }}>Search players &amp; goalies</span>
          <span style={{
            fontFamily: 'var(--mono, monospace)', fontSize: '9px',
            color: 'rgba(13,13,20,0.32)', letterSpacing: '0.06em',
          }}>ESC to close</span>
        </div>
        <div style={{ padding: '0' }}>
          <PlayerSearch
            players={players}
            placeholder="McDavid, Shesterkin, Hughes…"
            navigateTo={false}
            maxResults={8}
            onSelect={handleSelect}
          />
        </div>
      </div>
    </div>
  );
}
