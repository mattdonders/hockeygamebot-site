/**
 * PlayerSearch — Autocomplete search component for NHL players.
 *
 * Features:
 * - 2+ char query triggers dropdown (matches against pre-computed search_text)
 * - Sorted: exact last-name match first, then partial matches
 * - Keyboard nav: ArrowUp/Down, Enter, Escape
 * - Click outside to close
 * - Optional navigation to /stats/player/{slug} on select
 * - Optional onSelect callback for custom handling
 * - Team logo via NHL CDN (light SVGs, 20×20)
 * - HGB design system: mono font, ink palette, BG #EFEEE8
 * - Fully accessible: aria-autocomplete, aria-activedescendant, role=listbox
 */

import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useId,
} from 'react';

// ── Types ────────────────────────────────────────────────────────────────────

export type PlayerSearchItem = {
  display_name: string;
  first_name: string;
  last_name: string;
  team_abbrev: string;
  pos: string;
  gp: number;
  slug: string;
  search_text: string; // pre-computed: "connor mcdavid c. mcdavid edm"
};

export type PlayerSearchProps = {
  players: PlayerSearchItem[];
  placeholder?: string;
  onSelect?: (player: PlayerSearchItem) => void;
  navigateTo?: boolean;   // if true, Enter/click navigates to /stats/player/{slug}
  maxResults?: number;    // default 8
};

// ── Style constants ───────────────────────────────────────────────────────────

const INK          = '#0d0d14';
const BORDER       = '1px solid rgba(13,13,20,0.14)';
const MUTED        = 'rgba(13,13,20,0.48)';
const HOVER_BG     = 'rgba(13,13,20,0.04)';
const SELECTED_BG  = 'rgba(13,13,20,0.08)';
const MONO: React.CSSProperties = { fontFamily: "'JetBrains Mono', monospace" };
const BODY: React.CSSProperties = { fontFamily: "'Barlow', sans-serif" };

// ── Matching logic ────────────────────────────────────────────────────────────

function matchPlayers(
  players: PlayerSearchItem[],
  query: string,
  maxResults: number,
): PlayerSearchItem[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];

  const exactLastName: PlayerSearchItem[] = [];
  const partial: PlayerSearchItem[] = [];

  for (const p of players) {
    if (!p.search_text.includes(q)) continue;
    // Exact last-name match: last_name starts with query token
    if (p.last_name.toLowerCase().startsWith(q)) {
      exactLastName.push(p);
    } else {
      partial.push(p);
    }
  }

  return [...exactLastName, ...partial].slice(0, maxResults);
}

// ── Sub-components ────────────────────────────────────────────────────────────

function TeamLogo({ abbrev }: { abbrev: string }) {
  const src = `https://assets.nhle.com/logos/nhl/svg/${abbrev}_light.svg`;
  return (
    <img
      src={src}
      alt={abbrev}
      width={20}
      height={20}
      style={{ display: 'block', flexShrink: 0, objectFit: 'contain' }}
      onError={(e) => {
        // Hide broken logo without layout shift
        (e.currentTarget as HTMLImageElement).style.visibility = 'hidden';
      }}
    />
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PlayerSearch({
  players,
  placeholder = 'Search players…',
  onSelect,
  navigateTo = false,
  maxResults = 8,
}: PlayerSearchProps) {
  const [query, setQuery]       = useState('');
  const [results, setResults]   = useState<PlayerSearchItem[]>([]);
  const [open, setOpen]         = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);

  const inputRef    = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef     = useRef<HTMLUListElement>(null);

  const uid = useId();
  const listboxId = `player-search-listbox-${uid}`;

  // ── Compute results when query changes ──────────────────────────────────────

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setOpen(false);
      setActiveIdx(-1);
      return;
    }
    const matched = matchPlayers(players, trimmed, maxResults);
    setResults(matched);
    setOpen(matched.length > 0 || trimmed.length >= 2);
    setActiveIdx(-1);
  }, [query, players, maxResults]);

  // ── Click outside to close ──────────────────────────────────────────────────

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setActiveIdx(-1);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ── Scroll active item into view ────────────────────────────────────────────

  useEffect(() => {
    if (activeIdx < 0 || !listRef.current) return;
    const el = listRef.current.children[activeIdx] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleSelect = useCallback(
    (player: PlayerSearchItem) => {
      setQuery('');
      setOpen(false);
      setActiveIdx(-1);
      inputRef.current?.blur();
      onSelect?.(player);
      if (navigateTo) {
        window.location.href = `/stats/player/${player.slug}`;
      }
    },
    [onSelect, navigateTo],
  );

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIdx(i => Math.min(i + 1, results.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIdx(i => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (activeIdx >= 0 && results[activeIdx]) {
          handleSelect(results[activeIdx]);
        } else if (results.length === 1) {
          handleSelect(results[0]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setOpen(false);
        setActiveIdx(-1);
        break;
      default:
        break;
    }
  }

  function handleClear() {
    setQuery('');
    setResults([]);
    setOpen(false);
    setActiveIdx(-1);
    inputRef.current?.focus();
  }

  const activeDescendant =
    activeIdx >= 0 ? `player-search-option-${uid}-${activeIdx}` : undefined;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', width: '100%' }}
      role="combobox"
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-owns={listboxId}
    >
      {/* Input row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          background: '#fff',
          border: BORDER,
          gap: 0,
        }}
      >
        {/* Search icon */}
        <span
          aria-hidden="true"
          style={{
            ...MONO,
            padding: '8px 8px 8px 12px',
            fontSize: 12,
            color: MUTED,
            userSelect: 'none',
            lineHeight: 1,
          }}
        >
          ⌕
        </span>

        <input
          ref={inputRef}
          type="text"
          role="textbox"
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-activedescendant={activeDescendant}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (results.length > 0) setOpen(true);
          }}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          style={{
            ...MONO,
            flex: 1,
            border: 'none',
            outline: 'none',
            background: 'transparent',
            fontSize: 12,
            padding: '8px 4px',
            color: INK,
            minWidth: 0,
          }}
        />

        {/* Clear button */}
        {query.length > 0 && (
          <button
            type="button"
            onClick={handleClear}
            aria-label="Clear search"
            style={{
              ...MONO,
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              padding: '8px 12px',
              fontSize: 14,
              color: MUTED,
              lineHeight: 1,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            ×
          </button>
        )}
      </div>

      {/* Dropdown */}
      {open && (
        <ul
          id={listboxId}
          ref={listRef}
          role="listbox"
          aria-label="Player suggestions"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 100,
            background: '#fff',
            border: BORDER,
            boxShadow: '0 4px 12px rgba(13,13,20,0.10)',
            maxHeight: `${maxResults * 52}px`,
            overflowY: 'auto',
            margin: 0,
            padding: 0,
            listStyle: 'none',
          }}
        >
          {results.length === 0 ? (
            <li
              style={{
                ...MONO,
                fontSize: 11,
                color: MUTED,
                padding: '12px 14px',
                userSelect: 'none',
              }}
            >
              No results for &ldquo;{query}&rdquo;
            </li>
          ) : (
            results.map((player, i) => {
              const isActive = i === activeIdx;
              const optionId = `player-search-option-${uid}-${i}`;
              return (
                <li
                  key={player.slug}
                  id={optionId}
                  role="option"
                  aria-selected={isActive}
                  onMouseDown={e => {
                    e.preventDefault(); // prevent input blur before click fires
                    handleSelect(player);
                  }}
                  onMouseEnter={() => setActiveIdx(i)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 14px',
                    cursor: 'pointer',
                    background: isActive ? SELECTED_BG : 'transparent',
                    borderBottom: i < results.length - 1 ? '1px solid rgba(13,13,20,0.06)' : 'none',
                    transition: 'background 80ms ease',
                    minHeight: 48,
                  }}
                >
                  {/* Team logo */}
                  <TeamLogo abbrev={player.team_abbrev} />

                  {/* Player info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Primary line: display_name + team abbrev */}
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'baseline',
                        gap: 8,
                      }}
                    >
                      <span
                        style={{
                          ...BODY,
                          fontWeight: 600,
                          fontSize: 13,
                          color: INK,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {player.display_name}
                      </span>
                      <span
                        style={{
                          ...MONO,
                          fontSize: 10,
                          color: MUTED,
                          flexShrink: 0,
                          letterSpacing: '0.06em',
                        }}
                      >
                        {player.team_abbrev}
                      </span>
                    </div>

                    {/* Secondary line: full name · pos · gp GP */}
                    <div
                      style={{
                        ...MONO,
                        fontSize: 10,
                        color: MUTED,
                        marginTop: 2,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {player.first_name} {player.last_name} &middot; {player.pos} &middot; {player.gp} GP
                    </div>
                  </div>
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
