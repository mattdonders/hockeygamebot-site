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
import { TEAM_LOGO_SIZE, TEAM_LOGO_STYLE, teamLogoSrc, SEMI } from './HGBTable';

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

// Playoff season row from player-season-stats (playoffs[] array). Shape differs
// from regular career rows: raw counting stats present, RAPM/WAR null, GF/xGF
// suffixed _5v5.
export type PlayoffSeason = {
  season?: string;
  team?: string;
  gp?: number;
  toi_5v5_sec?: number;
  goals?: number;
  assists?: number;
  points?: number;
  ixg?: number;
  gf_pct_5v5?: number | null;
  xgf_pct_5v5?: number | null;
  limited?: boolean;
};

type Props = {
  seasons: CareerSeason[];
  playoffSeasons?: PlayoffSeason[];
  playerTeam: string;
  playerName?: string;
  playerSlug?: string;
  currentSeason?: string; // e.g. "20252026" — passed from page, avoids hardcoding
  leaderboardHref?: string; // "See in Skater Stats" link shown in toolbar
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const MONO: React.CSSProperties = { fontFamily: "'JetBrains Mono', monospace" };
const BODY: React.CSSProperties = { fontFamily: "'Barlow', sans-serif" };
const CELL_FONT_SIZE = 14; // matches HGBTable.CELL_FONT_SIZE
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

type PlayoffRow = PlayoffSeason & {
  season_fmt: string;
  toi_gp: string;
  is_current: boolean;
  season_normalized: string;
  gax: number | null; // goals - ixg
};

// CURRENT_SEASON and CURRENT_SEASON_NORM are now passed as the `currentSeason` prop
// from the parent page (which derives them from _meta.season). These fallbacks are
// only used if the prop is not provided.
const _FALLBACK_SEASON = '20252026';
const _FALLBACK_SEASON_NORM = '2025-26';

// ── Component ────────────────────────────────────────────────────────────────

// Normalize "20252026" → "2025-26", already "2025-26" passes through
function normalizeSeasonKey(s: string | undefined): string {
  if (!s) return '';
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(6)}`;
  return s;
}

export default function PlayerCareerTable({ seasons, playoffSeasons = [], playerName = 'Player', playerSlug = 'player', currentSeason, leaderboardHref }: Props) {
  const CURRENT_SEASON      = currentSeason ?? _FALLBACK_SEASON;
  const CURRENT_SEASON_NORM = currentSeason ? normalizeSeasonKey(currentSeason) : _FALLBACK_SEASON_NORM;
  const [isDark, setIsDark] = useState(false);
  // Active season: defaults to most recent (first after desc sort)
  const [activeSeason, setActiveSeason] = useState<string>('');
  // Regular / Playoffs toggle
  const [mode, setMode] = useState<'regular' | 'playoffs'>('regular');

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

  const playoffRows = useMemo<PlayoffRow[]>(() => {
    return playoffSeasons.map(row => {
      const norm = normalizeSeasonKey(row.season);
      const gax = row.goals != null && row.ixg != null
        ? Math.round((row.goals - row.ixg) * 100) / 100
        : null;
      return {
        ...row,
        season_fmt: fmtSeason(row.season ?? ''),
        toi_gp: fmtToi5v5(row.toi_5v5_sec ?? 0, row.gp ?? 0),
        is_current: norm === CURRENT_SEASON_NORM,
        season_normalized: norm,
        gax,
      };
    });
  }, [playoffSeasons]);


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
        header: 'Talent Pct',
        size: 90,
        accessorFn: (r) => (r as any).hgb_rating_pct ?? -1,
        cell: (info) => {
          const v = (info.row.original as any).hgb_rating_pct;
          const color = rapmPctColor(v);
          return (
            <span style={{ ...MONO, fontWeight: v != null ? 700 : 400, color }}>
              {v == null ? '—' : `${Math.round(Number(v))}`}
            </span>
          );
        },
      },
      {
        id: 'war_pct',
        header: 'WAR Pct',
        size: 90,
        accessorFn: (r) => r.war_pct ?? -1,
        cell: (info) => {
          const v = info.row.original.war_pct;
          const color = rapmPctColor(v);
          return (
            <span style={{ ...MONO, fontWeight: v != null ? 700 : 400, color }}>
              {v == null ? '—' : `${Math.round(Number(v))}`}
            </span>
          );
        },
      },
      {
        id: 'impact_pct',
        header: 'Impact Pct',
        size: 90,
        accessorFn: (r) => (r as any).impact_pct ?? -1,
        cell: (info) => {
          const v = (info.row.original as any).impact_pct;
          const color = rapmPctColor(v);
          return (
            <span style={{ ...MONO, fontWeight: v != null ? 700 : 400, color }}>
              {v == null ? '—' : `${Math.round(Number(v))}`}
            </span>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Playoff columns differ from regular-season columns intentionally: regular-season
  // career rows come from the career_seasons feed (GF%/xGF%/Talent%/WAR%/Impact%),
  // while playoff rows come from player_season_stats playoffs[] (raw G/A/PTS/GAx).
  // Unifying them would require the pipeline to expose matching fields in both feeds.
  const playoffColumns = useMemo<ColumnDef<PlayoffRow>[]>(
    () => [
      {
        id: 'season',
        header: 'Season',
        size: 90,
        accessorFn: (r) => r.season ?? '',
        cell: (info) => {
          const row = info.row.original;
          return (
            <span style={{ ...MONO, fontWeight: row.is_current ? 700 : 500, color: row.is_current ? INK : 'rgba(13,13,20,0.72)' }}>
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
              <img src={teamLogoSrc(abbr)} width={TEAM_LOGO_SIZE} height={TEAM_LOGO_SIZE} style={TEAM_LOGO_STYLE} alt={abbr} />
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
        accessorFn: (r) => (r.toi_5v5_sec ?? 0) / Math.max(r.gp ?? 1, 1),
        cell: (info) => <span title="5v5 TOI only">{info.row.original.toi_gp}</span>,
      },
      {
        id: 'goals',
        header: 'G',
        size: 50,
        accessorFn: (r) => r.goals ?? 0,
        cell: (info) => <span style={{ fontWeight: 700 }}>{info.getValue<number>() ?? '—'}</span>,
      },
      {
        id: 'assists',
        header: 'A',
        size: 50,
        accessorFn: (r) => r.assists ?? 0,
        cell: (info) => <span>{info.getValue<number>() ?? '—'}</span>,
      },
      {
        id: 'points',
        header: 'PTS',
        size: 56,
        accessorFn: (r) => r.points ?? 0,
        cell: (info) => <span style={{ fontWeight: 700 }}>{info.getValue<number>() ?? '—'}</span>,
      },
      {
        id: 'xgf_pct',
        header: 'xGF%',
        size: 72,
        accessorFn: (r) => r.xgf_pct_5v5,
        cell: (info) => {
          const v = info.getValue<number | null>();
          const color = pctColor(v ?? null);
          return (
            <span style={{ fontWeight: 700, color: color ?? 'rgba(13,13,20,0.72)' }}>
              {v == null ? '—' : `${Number(v).toFixed(1)}%`}
            </span>
          );
        },
      },
      {
        id: 'gax',
        header: 'GAx',
        size: 64,
        accessorFn: (r) => r.gax ?? -999,
        cell: (info) => {
          const v = info.row.original.gax;
          const color = v == null ? 'rgba(13,13,20,0.72)' : v > 0 ? POS : v < 0 ? NEG : 'rgba(13,13,20,0.72)';
          return (
            <span style={{ fontWeight: 700, color }}>
              {v == null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(2)}`}
            </span>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [INK, MUTED],
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const playoffTable = useReactTable({
    data: playoffRows,
    columns: playoffColumns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const activeTable = mode === 'playoffs' ? playoffTable : table;
  const isPlayoffs = mode === 'playoffs';
  const noPlayoffData = isPlayoffs && playoffRows.length === 0;

  // Chip toggle — matches the shared ChipGroup style used in HGBTable/SkatersTable
  const chip = (active: boolean): React.CSSProperties => ({
    ...MONO,
    fontSize: 10,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    padding: '5px 10px',
    border: BORDER,
    background: active ? INK : 'transparent',
    color: active ? BG : MUTED,
    cursor: 'pointer',
  });

  // PNG export — uses the shared window.HGB_Export.downloadTablePng (table-export.js)
  function exportPng() {
    const exp = (window as any).HGB_Export;
    if (!exp?.downloadTablePng) return;
    const data = activeTable.getRowModel().rows.map(r => r.original as CareerRow & PlayoffRow);
    const pctFmt = (v: any) => v != null ? `${Math.round(Number(v))}%` : '—';
    const oneFmt = (v: any) => v != null ? `${Number(v).toFixed(1)}%` : '—';
    const pctColor = (v: any, _r: any, tok: any) => v == null ? null : v >= 55 ? tok.pos : v <= 45 ? tok.neg : null;
    const rankColor = (v: any, _r: any, tok: any) => v == null ? null : v >= 70 ? tok.pos : v <= 30 ? tok.neg : null;
    // Mark the active sort column so the export shows the arrow + bold header (matches HGBTable)
    const cur = sorting[0];
    const mark = (sortId: string) => ({
      sorted: cur?.id === sortId,
      sortDir: cur?.id === sortId ? (cur.desc ? 'desc' : 'asc') : null,
    });
    const columns = isPlayoffs ? [
      { label: 'Season', key: 'season_fmt', width: 92,  align: 'left',   fontFamily: 'mono', ...mark('season') },
      { label: 'Team',   key: 'team',       width: 68,  align: 'center', fontFamily: 'mono', ...mark('team') },
      { label: 'GP',     key: 'gp',         width: 58,  align: 'center', ...mark('gp') },
      { label: 'TOI/GP', key: 'toi_gp',     width: 78,  align: 'center', ...mark('toi_gp') },
      { label: 'G',      key: 'goals',      width: 54,  align: 'center', ...mark('goals') },
      { label: 'A',      key: 'assists',    width: 54,  align: 'center', ...mark('assists') },
      { label: 'P',      key: 'points',     width: 60,  align: 'center', bold: true, ...mark('points') },
      { label: 'xGF%',   key: 'xgf_pct_5v5',width: 76,  align: 'center', format: oneFmt, color: pctColor, ...mark('xgf_pct') },
      { label: 'GAx',    key: 'gax',        width: 70,  align: 'center', format: (v: any) => v == null ? '—' : `${v > 0 ? '+' : ''}${Number(v).toFixed(2)}`, color: pctColor, ...mark('gax') },
    ] : [
      { label: 'Season',  key: 'season_fmt',     width: 92,  align: 'left',   fontFamily: 'mono', ...mark('season') },
      { label: 'Team',    key: 'team',           width: 68,  align: 'center', fontFamily: 'mono', ...mark('team') },
      { label: 'GP',      key: 'gp',             width: 58,  align: 'center', ...mark('gp') },
      { label: 'TOI/GP',  key: 'toi_gp',         width: 78,  align: 'center', ...mark('toi_gp') },
      { label: 'GF%',     key: 'gf_pct',         width: 74,  align: 'center', format: oneFmt, color: pctColor, ...mark('gf_pct') },
      { label: 'xGF%',    key: 'xgf_pct',        width: 74,  align: 'center', format: oneFmt, color: pctColor, ...mark('xgf_pct') },
      { label: 'Talent%', key: 'hgb_rating_pct', width: 80,  align: 'center', format: pctFmt, color: rankColor, ...mark('hgb_rating_pct') },
      { label: 'WAR%',    key: 'war_pct',        width: 74,  align: 'center', format: pctFmt, color: rankColor, ...mark('war_pct') },
      { label: 'Impact%', key: 'impact_pct',     width: 80,  align: 'center', format: pctFmt, color: rankColor, ...mark('impact_pct') },
    ];
    exp.downloadTablePng({
      title: `${playerName} · Career`,
      filterChips: [isPlayoffs ? 'Playoffs' : 'Regular Season', 'Season by Season'],
      rows: data,
      columns,
      filename: `hgb_career_${playerSlug}_${isPlayoffs ? 'playoffs' : 'regular'}.png`,
    });
  }

  // Career row aggregates — GP and TOI/GP are exact sums. GF%/xGF% show "—" because
  // career seasons only expose the pre-computed percentage, not raw GF/GA or xGF/xGA
  // totals. Showing a TOI-weighted average would look like an exact career stat when
  // it is only an approximation.
  // TODO(pipeline): expose raw 5v5 GF, GA, xGF, xGA per career season so Career row
  //   can show exact GF% = sum(GF) / sum(GF+GA) and xGF% = sum(xGF) / sum(xGF+xGA).
  const careerGP = rows.reduce((s, r) => s + (r.gp ?? 0), 0);
  const careerToiSec = rows.reduce((s, r) => s + (r.toi_5v5_sec ?? 0), 0);
  const careerToiGP = careerGP > 0 ? fmtToi5v5(careerToiSec, careerGP) : '—';

  const playoffCareerGP = playoffRows.reduce((s, r) => s + (r.gp ?? 0), 0);
  const playoffCareerToiSec = playoffRows.reduce((s, r) => s + (r.toi_5v5_sec ?? 0), 0);
  const playoffCareerToiGP = playoffCareerGP > 0 ? fmtToi5v5(playoffCareerToiSec, playoffCareerGP) : '—';
  const playoffCareerG = playoffRows.reduce((s, r) => s + (r.goals ?? 0), 0);
  const playoffCareerA = playoffRows.reduce((s, r) => s + (r.assists ?? 0), 0);
  const playoffCareerPTS = playoffRows.reduce((s, r) => s + (r.points ?? 0), 0);
  const playoffCareerGax = playoffRows.some(r => (r as any).gax != null)
    ? playoffRows.reduce((s, r) => s + ((r as any).gax ?? 0), 0)
    : null;

  return (
    <div style={{ ...BODY, color: INK, overflowX: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '12px 18px' }}>
        <button style={chip(mode === 'regular')} onClick={() => setMode('regular')}>Regular Season</button>
        <button style={chip(mode === 'playoffs')} onClick={() => setMode('playoffs')}>Playoffs</button>
        <div style={{ flex: 1 }} />
        {leaderboardHref && (
          <a href={leaderboardHref} style={{ ...MONO, fontSize: 10, letterSpacing: '0.08em', color: MUTED, textDecoration: 'none', marginRight: 8 }}>
            Skater Stats ↗
          </a>
        )}
        <button style={chip(false)} onClick={exportPng} title="Download this table as a PNG">↓ PNG</button>
      </div>

      {noPlayoffData ? (
        <div style={{ ...MONO, fontSize: 12, color: MUTED, padding: '28px 18px', textAlign: 'center', background: SURFACE, border: BORDER }}>
          No playoff data available.
        </div>
      ) : (
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: CELL_FONT_SIZE,
          background: SURFACE,
          border: BORDER,
        }}
      >
        <thead>
          {activeTable.getHeaderGroups().map(hg => (
            <tr key={hg.id} style={{ borderBottom: BORDER, background: BG }}>
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
                      color: isSorted ? INK : MUTED,
                      fontWeight: 700,
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
          {activeTable.getRowModel().rows.map((row, i) => {
            const orig = row.original as CareerRow & PlayoffRow;
            // Row selection (drives EV bars) only applies in regular mode
            const isActive = !isPlayoffs && orig.season_normalized === activeSeason;
            const allRows = activeTable.getRowModel().rows;
            const nextRow = allRows[i + 1];
            const currYear = parseInt(orig.season_normalized?.slice(0, 4) || '0');
            const nextYear = nextRow ? parseInt((nextRow.original as any).season_normalized?.slice(0, 4) || '0') : null;
            // The "· · ·" gap marker only means anything when rows are in chronological
            // order — i.e. sorted by season. Suppress it for any other sort column.
            const sortedBySeason = sorting[0]?.id === 'season';
            const hasGap = sortedBySeason && nextYear !== null && currYear - nextYear > 1;
            return (
              <React.Fragment key={row.id}>
                <tr
                  data-career-season={orig.season_normalized}
                  onClick={isPlayoffs ? undefined : () => handleSeasonClick(orig.season_normalized)}
                  style={{
                    borderBottom: '1px solid rgba(13,13,20,0.05)',
                    background: isActive
                      ? (isDark ? 'rgba(239,238,232,0.07)' : 'rgba(13,13,20,0.05)')
                      : (i % 2 === 0 ? SURFACE : (isDark ? 'rgba(239,238,232,0.03)' : 'rgba(13,13,20,0.02)')),
                    borderLeft: isActive ? `3px solid rgba(13,13,20,0.45)` : '3px solid transparent',
                    cursor: isPlayoffs ? 'default' : 'pointer',
                  }}
                  title={isPlayoffs ? undefined : `Click to view ${orig.season_fmt} percentiles`}
                >
                  {row.getVisibleCells().map((cell, ci) => (
                    <td
                      key={cell.id}
                      style={{
                        ...MONO,
                        fontSize: CELL_FONT_SIZE,
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
        {/* Career totals row */}
        <tfoot>
          <tr style={{
            borderTop: `2px solid ${INK}`,
            background: isDark ? 'rgba(239,238,232,0.05)' : 'rgba(13,13,20,0.04)',
          }}>
            {isPlayoffs ? (
              <>
                <td style={{ ...MONO, fontSize: 11, fontWeight: 700, padding: '9px 10px', textAlign: 'left', color: INK, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Career</td>
                <td style={{ ...MONO, fontSize: 11, padding: '9px 10px', textAlign: 'center', color: MUTED }}>—</td>
                <td style={{ ...MONO, fontSize: CELL_FONT_SIZE, fontWeight: 700, padding: '9px 10px', textAlign: 'center', color: INK }}>{playoffCareerGP}</td>
                <td style={{ ...MONO, fontSize: CELL_FONT_SIZE, padding: '9px 10px', textAlign: 'center', color: MUTED }}>{playoffCareerToiGP}</td>
                <td style={{ ...MONO, fontSize: CELL_FONT_SIZE, fontWeight: 700, padding: '9px 10px', textAlign: 'center', color: INK }}>{playoffCareerG}</td>
                <td style={{ ...MONO, fontSize: CELL_FONT_SIZE, fontWeight: 700, padding: '9px 10px', textAlign: 'center', color: INK }}>{playoffCareerA}</td>
                <td style={{ ...MONO, fontSize: CELL_FONT_SIZE, fontWeight: 700, padding: '9px 10px', textAlign: 'center', color: INK }}>{playoffCareerPTS}</td>
                <td style={{ ...MONO, fontSize: 11, padding: '9px 10px', textAlign: 'center', color: MUTED }}>—</td>
                <td style={{ ...MONO, fontSize: CELL_FONT_SIZE, fontWeight: playoffCareerGax != null ? 700 : 400, padding: '9px 10px', textAlign: 'center', color: playoffCareerGax != null ? (playoffCareerGax >= 0 ? '#14803c' : '#E8002D') : MUTED }}>
                  {playoffCareerGax != null ? `${playoffCareerGax > 0 ? '+' : ''}${playoffCareerGax.toFixed(2)}` : '—'}
                </td>
              </>
            ) : (
              <>
                <td style={{ ...MONO, fontSize: 11, fontWeight: 700, padding: '9px 10px', textAlign: 'left', color: INK, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Career</td>
                <td style={{ ...MONO, fontSize: 11, padding: '9px 10px', textAlign: 'center', color: MUTED }}>—</td>
                <td style={{ ...MONO, fontSize: CELL_FONT_SIZE, fontWeight: 700, padding: '9px 10px', textAlign: 'center', color: INK }}>{careerGP}</td>
                <td style={{ ...MONO, fontSize: CELL_FONT_SIZE, padding: '9px 10px', textAlign: 'center', color: MUTED }}>{careerToiGP}</td>
                <td style={{ ...MONO, fontSize: 11, padding: '9px 10px', textAlign: 'center', color: MUTED }}>—</td>
                <td style={{ ...MONO, fontSize: 11, padding: '9px 10px', textAlign: 'center', color: MUTED }}>—</td>
                <td style={{ ...MONO, fontSize: 11, padding: '9px 10px', textAlign: 'center', color: MUTED }}>—</td>
                <td style={{ ...MONO, fontSize: 11, padding: '9px 10px', textAlign: 'center', color: MUTED }}>—</td>
                <td style={{ ...MONO, fontSize: 11, padding: '9px 10px', textAlign: 'center', color: MUTED }}>—</td>
              </>
            )}
          </tr>
        </tfoot>
      </table>
      )}

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
        {isPlayoffs
          ? <>hockeygamebot.com · HGB Stats · Playoff stats · 5v5 unless noted<br />GAx = Goals − Individual xG · TOI/GP is 5v5 only</>
          : <>hockeygamebot.com · HGB Stats · 5v5 percentiles vs position<br />TALENT % = Blended Multi-Year WAR · WAR % = Single-Season WAR · IMPACT % = HGB Impact avg</>}
      </p>
    </div>
  );
}
