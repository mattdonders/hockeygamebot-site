/**
 * PlayerCareerTable — Career season-by-season stats for a player.
 *
 * Columns: Season, Team (logo), GP, TOI/GP, GF%, xGF%
 * Default sort: season descending (most recent first)
 * No filters needed — always small (~10-15 rows).
 */

import React, { useState, useMemo } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type SortingState,
  type ColumnDef,
} from '@tanstack/react-table';
import { TEAM_LOGO_SIZE, TEAM_LOGO_STYLE, teamLogoSrc } from './HGBTable';

// ── Types ────────────────────────────────────────────────────────────────────

// Mirrors the Zod schema for career_seasons — all fields optional because the
// parent array is .optional().nullable() in stats-schemas.ts, which causes
// TypeScript to widen inner field types when accessed via player.career_seasons.
export type CareerSeason = {
  season?: string;
  team?: string;
  gp?: number;
  toi_5v5_sec?: number;
  gf_pct?: number | null;
  xgf_pct?: number | null;
};

type Props = {
  seasons: CareerSeason[];
  playerTeam: string;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const MONO: React.CSSProperties = { fontFamily: "'JetBrains Mono', monospace" };
const BODY: React.CSSProperties = { fontFamily: "'Barlow', sans-serif" };
const INK = '#0d0d14';
const BG = '#EFEEE8';
const BORDER = '1px solid rgba(13,13,20,0.14)';
const MUTED = 'rgba(13,13,20,0.48)';
const POS = '#137333';
const NEG = '#991b1b';

function fmtSeason(s: string): string {
  return s.length === 8 ? `${s.slice(0, 4)}–${s.slice(6, 8)}` : s;
}

function fmtToi5v5(sec: number, gp: number): string {
  const avg = gp > 0 ? sec / gp : 0;
  const m = Math.floor(avg / 60);
  const s = Math.round(avg % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function pctColor(v: number | null): string | undefined {
  if (v == null) return undefined;
  if (v >= 55) return POS;
  if (v <= 45) return NEG;
  return undefined;
}

// ── Row type (computed from CareerSeason) ────────────────────────────────────

type CareerRow = CareerSeason & {
  season_fmt: string;
  toi_gp: string;
  is_current: boolean;
};

const CURRENT_SEASON = '20252026';

// ── Component ────────────────────────────────────────────────────────────────

export default function PlayerCareerTable({ seasons }: Props) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'season', desc: true },
  ]);

  const rows = useMemo<CareerRow[]>(
    () =>
      seasons.map(row => ({
        ...row,
        season_fmt: fmtSeason(row.season ?? ''),
        toi_gp: fmtToi5v5(row.toi_5v5_sec ?? 0, row.gp ?? 0),
        is_current: (row.season ?? '') === CURRENT_SEASON,
      })),
    [seasons],
  );

  const columns = useMemo<ColumnDef<CareerRow>[]>(
    () => [
      {
        id: 'season',
        header: 'Season',
        accessorFn: (r) => r.season ?? '', // sort key (raw "20252026")
        cell: (info) => {
          const row = info.row.original;
          return (
            <span
              style={{
                ...MONO,
                fontWeight: row.is_current ? 700 : 500,
                color: row.is_current ? INK : 'rgba(13,13,20,0.72)',
              }}
            >
              {row.season_fmt}
            </span>
          );
        },
        sortingFn: 'alphanumeric',
      },
      {
        id: 'team',
        header: 'Team',
        accessorFn: (r) => r.team ?? '',
        cell: (info) => {
          const abbr = info.getValue<string>();
          return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <img
                src={teamLogoSrc(abbr)}
                width={TEAM_LOGO_SIZE}
                height={TEAM_LOGO_SIZE}
                style={TEAM_LOGO_STYLE}
                alt={abbr}
              />
              <span style={{ ...MONO, fontSize: 11, color: 'rgba(13,13,20,0.72)' }}>{abbr}</span>
            </div>
          );
        },
        enableSorting: false,
      },
      {
        id: 'gp',
        header: 'GP',
        accessorFn: (r) => r.gp ?? 0,
        cell: (info) => <span>{info.getValue<number>()}</span>,
      },
      {
        id: 'toi_gp',
        header: 'TOI/GP',
        accessorFn: (r) => (r.toi_5v5_sec ?? 0) / Math.max(r.gp ?? 1, 1), // sort by actual seconds
        cell: (info) => <span>{info.row.original.toi_gp}</span>,
      },
      {
        id: 'gf_pct',
        header: 'GF%',
        accessorFn: (r) => r.gf_pct,
        cell: (info) => {
          const v = info.getValue<number | null>();
          const color = pctColor(v);
          return (
            <span style={{ fontWeight: 700, color: color ?? 'rgba(13,13,20,0.72)' }}>
              {v == null ? '—' : `${Number(v).toFixed(1)}%`}
            </span>
          );
        },
      },
      {
        id: 'xgf_pct',
        header: 'xGF%',
        accessorFn: (r) => r.xgf_pct,
        cell: (info) => {
          const v = info.getValue<number | null>();
          const color = pctColor(v);
          return (
            <span style={{ fontWeight: 700, color: color ?? 'rgba(13,13,20,0.72)' }}>
              {v == null ? '—' : `${Number(v).toFixed(1)}%`}
            </span>
          );
        },
      },
    ],
    [],
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div style={{ ...BODY, color: INK, overflowX: 'auto' }}>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: 12,
          background: '#fff',
          border: BORDER,
        }}
      >
        <thead>
          {table.getHeaderGroups().map(hg => (
            <tr key={hg.id} style={{ borderBottom: BORDER, background: BG }}>
              {hg.headers.map((h, hi) => {
                const isSorted = h.column.getIsSorted();
                const canSort = h.column.getCanSort();
                return (
                  <th
                    key={h.id}
                    onClick={canSort ? h.column.getToggleSortingHandler() : undefined}
                    style={{
                      ...MONO,
                      fontSize: 11,
                      letterSpacing: '0.12em',
                      textTransform: 'uppercase',
                      color: isSorted ? INK : MUTED,
                      fontWeight: isSorted ? 700 : 500,
                      padding: '8px 10px',
                      textAlign: hi === 0 ? 'left' : 'center',
                      cursor: canSort ? 'pointer' : 'default',
                      userSelect: 'none',
                      whiteSpace: 'nowrap',
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
          {table.getRowModel().rows.map((row, i) => (
            <tr
              key={row.id}
              style={{
                borderBottom: '1px solid rgba(13,13,20,0.05)',
                background: i % 2 === 0 ? '#fff' : 'rgba(13,13,20,0.02)',
              }}
            >
              {row.getVisibleCells().map((cell, ci) => (
                <td
                  key={cell.id}
                  style={{
                    ...MONO,
                    fontSize: 12,
                    padding: '10px 10px',
                    textAlign: ci === 0 ? 'left' : 'center',
                    whiteSpace: 'nowrap',
                    borderRight: '1px solid rgba(13,13,20,0.03)',
                  }}
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p
        style={{
          ...MONO,
          fontSize: 9,
          color: 'rgba(13,13,20,0.32)',
          marginTop: 6,
          letterSpacing: '0.06em',
        }}
      >
        Click a column header to sort · 5v5 only · min 600 TOI
      </p>
    </div>
  );
}
