/**
 * PlayerGameLogTable — Per-game stats for a player's current season.
 *
 * Columns: Date, Opp (logo + abbrev), H/A badge, Result, G, A, PTS, GS, ixG, TOI
 * Default sort: date descending (most recent first)
 * Optional opponent search filter.
 * Row click → game page when game_id is available.
 * Mobile: hides TOI and ixG columns.
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type SortingState,
  type VisibilityState,
  type ColumnDef,
} from '@tanstack/react-table';
import { TEAM_LOGO_SIZE, TEAM_LOGO_STYLE, teamLogoSrc, SEMI } from './HGBTable';
import type { GameLogEntry } from '../../lib/stats-loader';

// ── Style constants ──────────────────────────────────────────────────────────

const MONO: React.CSSProperties = { fontFamily: "'JetBrains Mono', monospace" };
const BODY: React.CSSProperties = { fontFamily: "'Barlow', sans-serif" };
// Dark mode resolved at runtime — see useEffect in component
function ink(dark: boolean)    { return dark ? '#EFEEE8' : '#0d0d14'; }
function surface(dark: boolean){ return dark ? '#1A1A26' : '#fff'; }
function bg(dark: boolean)     { return dark ? '#14141E' : '#EFEEE8'; }
function border(dark: boolean) { return dark ? '1px solid rgba(239,238,232,0.12)' : '1px solid rgba(13,13,20,0.14)'; }
function muted(dark: boolean)  { return dark ? 'rgba(239,238,232,0.48)' : 'rgba(13,13,20,0.48)'; }
function rowBg(dark: boolean, even: boolean) {
  return even ? surface(dark) : (dark ? 'rgba(239,238,232,0.03)' : 'rgba(13,13,20,0.02)');
}
const OT_COLOR = 'rgba(13,13,20,0.48)';
const POS = '#137333';
const NEG = '#991b1b';

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: string): string {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const [, mm, dd] = d.split('-');
  return `${months[parseInt(mm) - 1]} ${parseInt(dd)}`;
}

function fmtToi(sec: number | undefined): string {
  if (sec == null) return '—';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ── Mobile hook ──────────────────────────────────────────────────────────────

function useIsMobile() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)');
    setMobile(mq.matches);
    const fn = (e: MediaQueryListEvent) => setMobile(e.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);
  return mobile;
}

// ── Computed row type ────────────────────────────────────────────────────────

type GameRow = GameLogEntry & {
  date_fmt: string;
  vs_label: string;  // "vs" or "@"
  result_str: string;
  result_w: boolean;
  result_ot: boolean;
  points: number;
};

// ── Props ────────────────────────────────────────────────────────────────────

type Props = {
  games: GameLogEntry[];
  playerTeam: string;
};

// ── Component ────────────────────────────────────────────────────────────────

export default function PlayerGameLogTable({ games }: Props) {
  const isMobile = useIsMobile();
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    const check = () => setIsDark(document.documentElement.dataset.theme === 'dark');
    check();
    const obs = new MutationObserver(check);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);

  const [sorting, setSorting] = useState<SortingState>([
    { id: 'game_date', desc: true },
  ]);
  const [oppSearch, setOppSearch] = useState('');

  // Compute derived rows
  const allRows = useMemo<GameRow[]>(() => {
    return games.map(g => {
      const win    = g.team_score > g.opp_score;
      const result = win ? 'W' : (g.team_score < g.opp_score ? 'L' : 'OT');
      return {
        ...g,
        date_fmt:   fmtDate(g.game_date),
        vs_label:   g.is_home ? 'vs' : '@',
        result_str: `${result} ${g.team_score}–${g.opp_score}`,
        result_w:   win,
        result_ot:  result === 'OT',
        points:     g.goals + g.assists,
      };
    });
  }, [games]);

  // Filter by opponent search
  const filteredRows = useMemo(() => {
    if (!oppSearch.trim()) return allRows;
    const q = oppSearch.toLowerCase();
    return allRows.filter(r => r.opp_abbrev.toLowerCase().includes(q));
  }, [allRows, oppSearch]);

  // Column visibility: hide TOI + ixG on mobile
  const columnVisibility = useMemo<VisibilityState>(() => {
    if (isMobile) return { toi: false, ixg: false };
    return {};
  }, [isMobile]);

  // Determine if TOI / ixG data exists in this player's game log
  const hasToi = useMemo(() => allRows.some(r => r.toi_sec != null), [allRows]);
  const hasIxg = useMemo(() => allRows.some(r => r.ixg != null), [allRows]);

  const columns = useMemo<ColumnDef<GameRow>[]>(() => {
    const cols: ColumnDef<GameRow>[] = [
      {
        id: 'game_date',
        header: 'Date',
        accessorFn: (r) => r.game_date, // raw ISO for sorting
        cell: (info) => (
          <span style={{ ...MONO, whiteSpace: 'nowrap' }}>
            {info.row.original.date_fmt}
          </span>
        ),
        sortingFn: 'alphanumeric',
      },
      {
        id: 'opp',
        header: 'Opp',
        accessorFn: (r) => r.opp_abbrev,
        cell: (info) => {
          const row = info.row.original;
          return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
              <img
                src={teamLogoSrc(row.opp_abbrev)}
                width={TEAM_LOGO_SIZE}
                height={TEAM_LOGO_SIZE}
                style={TEAM_LOGO_STYLE}
                alt={row.opp_abbrev}
              />
              <span style={{ ...MONO, fontSize: 11, color: 'rgba(13,13,20,0.72)' }}>{row.opp_abbrev}</span>
            </div>
          );
        },
        enableSorting: true,
      },
      {
        id: 'ha',
        header: 'H/A',
        accessorFn: (r) => r.is_home ? 'H' : 'A',
        cell: (info) => {
          const isHome = info.row.original.is_home;
          return (
            <span
              style={{
                ...MONO,
                fontSize: 10,
                letterSpacing: '0.08em',
                padding: '2px 6px',
                border: border(isDark),
                background: isHome ? 'rgba(13,13,20,0.06)' : 'transparent',
                color: isHome ? ink(isDark) : muted(isDark),
              }}
            >
              {isHome ? 'H' : 'A'}
            </span>
          );
        },
        enableSorting: true,
      },
      {
        id: 'result',
        header: 'Result',
        accessorFn: (r) => r.result_str,
        cell: (info) => {
          const row = info.row.original;
          const color = row.result_w ? 'var(--stats-pos, #137333)' : row.result_ot ? OT_COLOR : 'var(--stats-neg, #991b1b)';
          return (
            <span style={{ ...MONO, fontWeight: 700, color, whiteSpace: 'nowrap' }}>
              {row.result_str}
            </span>
          );
        },
        enableSorting: false,
      },
      {
        id: 'goals',
        header: 'G',
        accessorFn: (r) => r.goals,
        cell: (info) => <span>{info.getValue<number>()}</span>,
      },
      {
        id: 'assists',
        header: 'A',
        accessorFn: (r) => r.assists,
        cell: (info) => <span>{info.getValue<number>()}</span>,
      },
      {
        id: 'points',
        header: 'PTS',
        accessorFn: (r) => r.points,
        cell: (info) => <span>{info.getValue<number>()}</span>,
      },
      {
        id: 'gs',
        header: 'Impact',
        accessorFn: (r) => r.gs_display,
        cell: (info) => {
          const v = info.getValue<number>();
          const color = v >= 0 ? POS : NEG;
          return (
            <span style={{ ...MONO, fontWeight: 700, color }}>
              {(v >= 0 ? '+' : '') + Number(v).toFixed(2)}
            </span>
          );
        },
      },
    ];

    if (hasIxg) {
      cols.push({
        id: 'ixg',
        header: 'xG',
        accessorFn: (r) => r.ixg ?? null,
        cell: (info) => {
          const v = info.getValue<number | null>();
          return <span>{v == null ? '—' : Number(v).toFixed(2)}</span>;
        },
      });
    }

    if (hasToi) {
      cols.push({
        id: 'toi',
        header: 'TOI',
        accessorFn: (r) => r.toi_sec ?? null,
        cell: (info) => {
          const v = info.getValue<number | null>();
          return <span>{fmtToi(v ?? undefined)}</span>;
        },
      });
    }

    return cols;
  }, [hasToi, hasIxg]);

  const table = useReactTable({
    data: filteredRows,
    columns,
    state: { sorting, columnVisibility },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div style={{ ...BODY, color: ink(isDark) }}>

      {/* Toolbar — matches HGBTable toolbar language */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 14px',
          borderBottom: border(isDark),
        }}
      >
        <input
          type="search"
          placeholder="Filter opponent…"
          value={oppSearch}
          onChange={e => setOppSearch(e.target.value)}
          style={{
            ...MONO,
            fontSize: 11,
            padding: '5px 10px',
            border: border(isDark),
            background: surface(isDark),
            outline: 'none',
            color: ink(isDark),
            width: isMobile ? 130 : 180,
          }}
        />
        <span style={{ ...MONO, fontSize: 10, color: isDark ? 'rgba(239,238,232,0.32)' : 'rgba(13,13,20,0.32)', marginLeft: 'auto', letterSpacing: '0.04em' }}>
          {filteredRows.length} games
        </span>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', maxHeight: 400, overflowY: 'auto' }}>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: 12,
            background: surface(isDark),
            border: border(isDark),
            minWidth: isMobile ? 'unset' : 520,
          }}
        >
          <thead>
            {table.getHeaderGroups().map(hg => (
              <tr key={hg.id} style={{ borderBottom: border(isDark), background: bg(isDark) }}>
                {hg.headers.map((h, hi) => {
                  const isSorted = h.column.getIsSorted();
                  const canSort = h.column.getCanSort();
                  return (
                    <th
                      key={h.id}
                      onClick={canSort ? h.column.getToggleSortingHandler() : undefined}
                      style={{
                        ...SEMI,
                        fontSize: 12,
                        letterSpacing: '0.10em',
                        textTransform: 'uppercase',
                        color: isSorted ? ink(isDark) : muted(isDark),
                        fontWeight: 700,
                        padding: '8px 10px',
                        textAlign: hi === 0 ? 'left' : 'center',
                        cursor: canSort ? 'pointer' : 'default',
                        userSelect: 'none',
                        whiteSpace: 'nowrap',
                        position: 'sticky',
                        top: 0,
                        background: bg(isDark),
                        zIndex: 1,
                      }}
                    >
                      {flexRender(h.column.columnDef.header, h.getContext())}
                      {isSorted === 'asc' ? ' ↑' : isSorted === 'desc' ? ' ↓' : ''}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td
                  colSpan={table.getVisibleLeafColumns().length}
                  style={{
                    ...MONO,
                    fontSize: 11,
                    color: muted(isDark),
                    textAlign: 'center',
                    padding: '32px 16px',
                  }}
                >
                  No games found.
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row, i) => {
                const href = row.original.game_id ? `/games/${row.original.game_id}` : undefined;
                const evenBg = rowBg(isDark, true);
                const oddBg  = rowBg(isDark, false);
                const rowStyle: React.CSSProperties = {
                  borderBottom: isDark ? '1px solid rgba(239,238,232,0.05)' : '1px solid rgba(13,13,20,0.05)',
                  background: i % 2 === 0 ? evenBg : oddBg,
                  cursor: href ? 'pointer' : 'default',
                };
                return (
                  <tr
                    key={row.id}
                    style={rowStyle}
                    onClick={href ? () => { window.location.href = href; } : undefined}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLElement).style.background = isDark ? 'rgba(239,238,232,0.06)' : 'rgba(13,13,20,0.04)';
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLElement).style.background = i % 2 === 0 ? evenBg : oddBg;
                    }}
                  >
                    {row.getVisibleCells().map((cell, ci) => (
                      <td
                        key={cell.id}
                        style={{
                          ...MONO,
                          fontSize: isMobile ? 13 : 12,
                          padding: isMobile ? '10px 8px' : '10px 10px',
                          textAlign: ci === 0 ? 'left' : 'center',
                          whiteSpace: 'nowrap',
                          borderRight: '1px solid rgba(13,13,20,0.03)',
                        }}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile hint */}
      {isMobile && (
        <p
          style={{
            ...MONO,
            fontSize: 9,
            color: 'rgba(13,13,20,0.32)',
            marginTop: 6,
            letterSpacing: '0.06em',
          }}
        >
          Tap a column header to sort · swipe to scroll
        </p>
      )}
    </div>
  );
}
