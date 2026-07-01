/**
 * PlayerSearchMulti — Demo wrapper around PlayerSearch that accumulates
 * selected players into a visible list. Used by the search-poc page to
 * demonstrate the onSelect callback pattern.
 */

import React, { useState, useCallback } from 'react';
import PlayerSearch, { type PlayerSearchItem } from './PlayerSearch';

type Props = {
  players: PlayerSearchItem[];
  maxResults?: number;
};

const INK    = '#0d0d14';
const MUTED  = 'rgba(13,13,20,0.48)';
const BORDER = '1px solid rgba(13,13,20,0.14)';
const MONO: React.CSSProperties = { fontFamily: 'var(--mono)' };
const BODY: React.CSSProperties = { fontFamily: 'var(--body)' };

export default function PlayerSearchMulti({ players, maxResults = 8 }: Props) {
  const [selected, setSelected] = useState<PlayerSearchItem[]>([]);

  const handleSelect = useCallback((player: PlayerSearchItem) => {
    setSelected(prev => {
      // Ignore duplicates by slug
      if (prev.some(p => p.slug === player.slug)) return prev;
      return [...prev, player];
    });
  }, []);

  const handleRemove = (slug: string) => {
    setSelected(prev => prev.filter(p => p.slug !== slug));
  };

  const handleClear = () => setSelected([]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PlayerSearch
        players={players}
        placeholder="Add a player…"
        onSelect={handleSelect}
        navigateTo={false}
        maxResults={maxResults}
      />

      {selected.length > 0 && (
        <div>
          {/* List header */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              marginBottom: 8,
            }}
          >
            <span style={{ ...MONO, fontSize: 10, color: MUTED, letterSpacing: '0.06em' }}>
              {selected.length} PLAYER{selected.length !== 1 ? 'S' : ''} SELECTED
            </span>
            <button
              type="button"
              onClick={handleClear}
              style={{
                ...MONO,
                fontSize: 10,
                color: MUTED,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
                textDecoration: 'underline',
                letterSpacing: '0.04em',
              }}
            >
              clear all
            </button>
          </div>

          {/* Selected list */}
          <ul
            style={{
              listStyle: 'none',
              margin: 0,
              padding: 0,
              border: BORDER,
              background: '#fff',
            }}
          >
            {selected.map((player, i) => (
              <li
                key={player.slug}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 12px',
                  borderBottom: i < selected.length - 1 ? '1px solid rgba(13,13,20,0.06)' : 'none',
                }}
              >
                {/* Team logo */}
                <img
                  src={`https://assets.nhle.com/logos/nhl/svg/${player.team_abbrev}_light.svg`}
                  alt={player.team_abbrev}
                  width={18}
                  height={18}
                  style={{ display: 'block', flexShrink: 0, objectFit: 'contain' }}
                  onError={e => {
                    (e.currentTarget as HTMLImageElement).style.visibility = 'hidden';
                  }}
                />

                {/* Name + meta */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ ...BODY, fontWeight: 600, fontSize: 13, color: INK }}>
                    {player.display_name}
                  </span>
                  <span
                    style={{
                      ...MONO,
                      fontSize: 10,
                      color: MUTED,
                      marginLeft: 8,
                    }}
                  >
                    {player.team_abbrev} &middot; {player.pos} &middot; {player.gp} GP
                  </span>
                </div>

                {/* Remove button */}
                <button
                  type="button"
                  onClick={() => handleRemove(player.slug)}
                  aria-label={`Remove ${player.display_name}`}
                  style={{
                    ...MONO,
                    fontSize: 14,
                    color: MUTED,
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '0 4px',
                    lineHeight: 1,
                    flexShrink: 0,
                  }}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {selected.length === 0 && (
        <p style={{ ...MONO, fontSize: 10, color: MUTED }}>
          No players selected yet.
        </p>
      )}
    </div>
  );
}
