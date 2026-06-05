/**
 * PlayerCareerTable — Career season-by-season stats for a player.
 *
 * Columns: Season, Team (logo), GP, TOI/GP, GF%, xGF%
 * Default sort: season descending (most recent first)
 * No filters needed — always small (~10-15 rows).
 */

import React, { useState, useMemo, useEffect } from 'react';
import { fmtSeasonLong } from '../../lib/format-season';
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
  // Enriched from player_season_stats — may be null until pipeline delivers
  rapm_net_pct?: number | null;
  war_pct?: number | null;
};

type Props = {
  seasons: CareerSeason[];
  playerTeam: string;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const MONO: React.CSSProperties = { fontFamily: "'JetBrains Mono', monospace" };
const BODY: React.CSSProperties = { fontFamily: "'Barlow', sans-serif" };
const INK_LIGHT = '#0d0d14';
const INK_DARK  = '#EFEEE8';
const BG_LIGHT  = '#EFEEE8';
const BG_DARK   = '#1A1A26';
const BORDER_LIGHT = '1px solid rgba(13,13,20,0.14)';
const BORDER_DARK  = '1px solid rgba(239,238,232,0.12)';
const MUTED_LIGHT  = 'rgba(13,13,20,0.48)';
const MUTED_DARK   = 'rgba(239,238,232,0.48)';
const POS = '#137333';
const NEG = '#991b1b';

const fmtSeason = fmtSeasonLong;

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

// Percentile tier coloring: ≥70 green, ≤30 red, mid neutral
function rapmPctColor(v: number | null): string {
  if (v == null) return 'rgba(13,13,20,0.32)';
  if (v >= 70) return '#137333';
  if (v <= 30) return '#991b1b';
  return 'rgba(13,13,20,0.72)';
}

// ── Row type (computed from CareerSeason) ────────────────────────────────────

type CareerRow = CareerSeason & {
  season_fmt: string;
  toi_gp: string;
  is_current: boolean;
  season_normalized: string; // e.g. "2025-26" for event dispatch
};

const CURRENT_SEASON = '20252026';

// ── Component ────────────────────────────────────────────────────────────────

// Normalize "20252026" → "2025-26", already "2025-26" passes through
function normalizeSeasonKey(s: string | undefined): string {
  if (!s) return '';
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(6)}`;
  return s;
}

export default function PlayerCareerTable({ seasons }: Props) {
  const [isDark, setIsDark] = useState(false);
  // Active season: defaults to most recent (first after desc sort)
  const [activeSeason, setActiveSeason] = useState<string>('');

  useEffect(() => {
    const check = () => setIsDark(document.documentElement.dataset.theme === 'dark');
    check();
    const obs = new MutationObserver(check);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);

  function handleSeasonClick(seasonNorm: string) {
    setActiveSeason(seasonNorm);
    // Dispatch event so the Astro page JS can update EV bars
    document.dispatchEvent(new CustomEvent('hgb:season-select', { detail: { season: seasonNorm } }));
  }

  const INK    = isDark ? INK_DARK  : INK_LIGHT;
  const BG     = isDark ? BG_DARK   : BG_LIGHT;
  const BORDER = isDark ? BORDER_DARK  : BORDER_LIGHT;
  const MUTED  = isDark ? MUTED_DARK   : MUTED_LIGHT;
  const SURFACE = isDark ? '#1A1A26' : '#fff';

  const [sorting, setSorting] = useState<SortingState>([
    { id: 'season', desc: true },
  ]);

  const rows = useMemo<CareerRow[]>(() => {
    const mapped = seasons.map(row => ({
      ...row,
      season_fmt: fmtSeason(row.season ?? ''),
      toi_gp: fmtToi5v5(row.toi_5v5_sec ?? 0, row.gp ?? 0),
      is_current: (row.season ?? '') === CURRENT_SEASON,
      season_normalized: normalizeSeasonKey(row.season),
    }));
    return mapped;
  }, [seasons]);

  // Set initial active season to most recent (first after desc sort)
  useEffect(() => {
    if (rows.length > 0 && !activeSeason) {
      const sorted = [...rows].sort((a, b) =>
        (b.season ?? '').localeCompare(a.season ?? '')
      );
      setActiveSeason(sorted[0].season_normalized);
    }
  }, [rows]);

  const columns = useMemo<ColumnDef<CareerRow>[]>(
    () => [
      {
        id: 'season',
        header: 'Season',
        size: 90,
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
        size: 100,
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
        size: 60,
        accessorFn: (r) => r.gp ?? 0,
        cell: (info) => <span>{info.getValue<number>()}</span>,
      },
      {
        id: 'toi_gp',
        header: 'TOI/GP',
        size: 80,
        accessorFn: (r) => (r.toi_5v5_sec ?? 0) / Math.max(r.gp ?? 1, 1), // sort by actual seconds
        cell: (info) => <span>{info.row.original.toi_gp}</span>,
      },
      {
        id: 'gf_pct',
        header: 'GF%',
        size: 72,
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
        size: 72,
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
      {
        id: 'hgb_rating_pct',
        header: 'RATING %',
        size: 90,
        accessorFn: (r) => (r as any).hgb_rating_pct ?? -1,
        cell: (info) => {
          const v = (info.row.original as any).hgb_rating_pct;
          const color = rapmPctColor(v);
          return (
            <span style={{ ...MONO, fontWeight: v != null ? 700 : 400, color }}>
              {v == null ? '—' : `${Math.round(Number(v))}%`}
            </span>
          );
        },
      },
      {
        id: 'war_pct',
        header: 'WAR %',
        size: 90,
        accessorFn: (r) => r.war_pct ?? -1,
        cell: (info) => {
          const v = info.row.original.war_pct;
          const color = rapmPctColor(v);
          return (
            <span style={{ ...MONO, fontWeight: v != null ? 700 : 400, color }}>
              {v == null ? '—' : `${Math.round(Number(v))}%`}
            </span>
          );
        },
      },
      {
        id: 'impact_pct',
        header: 'IMPACT %',
        size: 90,
        accessorFn: (r) => (r as any).impact_pct ?? -1,
        cell: (info) => {
          const v = (info.row.original as any).impact_pct;
          const color = rapmPctColor(v);
          return (
            <span style={{ ...MONO, fontWeight: v != null ? 700 : 400, color }}>
              {v == null ? '—' : `${Math.round(Number(v))}%`}
            </span>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          background: SURFACE,
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
                      ...(h.column.getSize() !== 150 ? { width: h.column.getSize() } : {}),
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
          {table.getRowModel().rows.map((row, i) => {
            const orig = row.original;
            const isActive = orig.season_normalized === activeSeason;
            const nextRow = table.getRowModel().rows[i + 1];
            const currYear = parseInt(orig.season_normalized?.slice(0, 4) || '0');
            const nextYear = nextRow ? parseInt(nextRow.original.season_normalized?.slice(0, 4) || '0') : null;
            const hasGap = nextYear !== null && currYear - nextYear > 1;
            return (
              <React.Fragment key={row.id}>
                <tr
                  data-career-season={orig.season_normalized}
                  onClick={() => handleSeasonClick(orig.season_normalized)}
                  style={{
                    borderBottom: '1px solid rgba(13,13,20,0.05)',
                    background: isActive
                      ? (isDark ? 'rgba(239,238,232,0.07)' : 'rgba(13,13,20,0.05)')
                      : (i % 2 === 0 ? SURFACE : (isDark ? 'rgba(239,238,232,0.03)' : 'rgba(13,13,20,0.02)')),
                    borderLeft: isActive ? `3px solid rgba(13,13,20,0.45)` : '3px solid transparent',
                    cursor: 'pointer',
                  }}
                  title={`Click to view ${orig.season_fmt} percentiles`}
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
                {hasGap && (
                  <tr style={{ background: 'transparent' }}>
                    <td
                      colSpan={row.getVisibleCells().length}
                      style={{
                        ...MONO,
                        fontSize: 10,
                        textAlign: 'center',
                        padding: '4px 0',
                        color: isDark ? 'rgba(239,238,232,0.20)' : 'rgba(13,13,20,0.22)',
                        letterSpacing: '0.25em',
                        borderTop: `1px dashed ${isDark ? 'rgba(239,238,232,0.08)' : 'rgba(13,13,20,0.08)'}`,
                        borderBottom: `1px dashed ${isDark ? 'rgba(239,238,232,0.08)' : 'rgba(13,13,20,0.08)'}`,
                      }}
                    >
                      · · ·
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
      <p
        style={{
          ...MONO,
          fontSize: 10,
          color: 'rgba(13,13,20,0.40)',
          margin: '12px 18px 14px',
          letterSpacing: '0.04em',
          lineHeight: 1.5,
          textAlign: 'right',
        }}
      >
        hockeygamebot.com · HGB Stats · 5v5 percentiles vs position<br />RATING % = Blended HGB Rating · WAR % = Single-Season WAR · IMPACT % = HGB Game Score
      </p>
    </div>
  );
}
