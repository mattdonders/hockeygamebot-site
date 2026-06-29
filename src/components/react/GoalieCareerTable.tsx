/**
 * GoalieCareerTable — Career season-by-season stats for a goalie.
 *
 * Primary toggle: Regular Season / Playoffs
 * Secondary toggle (RS only): All Sit / 5v5
 *
 * RS columns: Season, Team, GP, SA, SV%, ΔSV%, GSAx, GSAx PCT
 * PO columns: Season, Team, GP, SA, SV%, GSAx (no percentile)
 *
 * Dispatches hgb:season-select on row click so the Astro page can update
 * the goalie card and shot-zone map when season-specific data is available.
 *
 * Near-exact replica of PlayerCareerTable — justified exception per CLAUDE.md:
 * goalies need the same season-select event dispatch for goalie cards + shot-zone
 * maps (season-specific versions planned), and the two-toggle RS/PO + All/5v5
 * structure cannot be expressed through HGBTable's declarative API.
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

export type GoalieCareerSeason = {
  season?: string;
  game_type?: number;
  team_abbrev?: string;
  gp?: number;
  sa?: number;
  ga?: number;
  sv_pct?: number | null;
  xga?: number | null;
  gsax?: number | null;
  sa_5v5?: number;
  ga_5v5?: number;
  xga_5v5?: number | null;
  gsax_5v5?: number | null;
  gsax_pct?: number | null;
  gsax_5v5_pct?: number | null;
};

type Props = {
  careerSeasons: GoalieCareerSeason[];
  goalieTeam?: string;
  goalieName?: string;
  goalieSlug?: string;
  currentSeason?: string; // e.g. "20252026" — passed from Astro page
  leaderboardHref?: string;
};

// ── Constants ────────────────────────────────────────────────────────────────

const MONO: React.CSSProperties = { fontFamily: "'JetBrains Mono', monospace" };
const BODY: React.CSSProperties = { fontFamily: "'Barlow', sans-serif" };
const CELL_FONT_SIZE = 14;
const INK_LIGHT = '#0d0d14';
const INK_DARK  = '#EFEEE8';
const BG_LIGHT  = '#EFEEE8';
const BG_DARK   = '#1A1A26';
const BORDER_LIGHT = '1px solid rgba(13,13,20,0.14)';
const BORDER_DARK  = '1px solid rgba(239,238,232,0.12)';
const MUTED_LIGHT  = 'rgba(13,13,20,0.48)';
const MUTED_DARK   = 'rgba(239,238,232,0.48)';

const fmtSeason = fmtSeasonLong;

// ── Helpers ──────────────────────────────────────────────────────────────────

function normalizeSeasonKey(s: string | undefined): string {
  if (!s) return '';
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(6)}`;
  return s;
}

function fmtSvPct(v: number | null | undefined): string {
  if (v == null) return '—';
  return v.toFixed(4).slice(1); // ".9345"
}

function fmtDsv(v: number | null | undefined): string {
  if (v == null) return '—';
  const pct = v * 100;
  const s = pct >= 0 ? '+' : '';
  return `${s}${pct.toFixed(2)}%`;
}

function gsaxPctColor(v: number | null): string {
  if (v == null) return 'rgba(13,13,20,0.32)';
  if (v >= 70) return '#137333';
  if (v <= 30) return '#991b1b';
  return 'rgba(13,13,20,0.72)';
}

function gsaxColor(v: number | null): string | undefined {
  if (v == null) return undefined;
  if (v > 0) return '#137333';
  if (v < 0) return '#991b1b';
  return undefined;
}

// ── Row types ────────────────────────────────────────────────────────────────

type RsRow = GoalieCareerSeason & {
  season_fmt: string;
  dsv_pct: number | null;      // all-sit ΔSV%
  dsv_pct_5v5: number | null;  // 5v5 ΔSV% = gsax_5v5/sa_5v5
  sv_pct_5v5: number | null;   // 5v5 SV% = 1 - ga_5v5/sa_5v5
  is_current: boolean;
  season_normalized: string;
};

type PoRow = GoalieCareerSeason & {
  season_fmt: string;
  dsv_pct: number | null;
  dsv_pct_5v5: number | null;
  sv_pct_5v5: number | null;
  is_current: boolean;
  season_normalized: string;
};

const _FALLBACK_SEASON_NORM = '2025-26';

// ── Component ────────────────────────────────────────────────────────────────

export default function GoalieCareerTable({
  careerSeasons,
  goalieName = 'Goalie',
  goalieSlug = 'goalie',
  currentSeason,
  leaderboardHref,
}: Props) {
  const CURRENT_SEASON_NORM = currentSeason
    ? normalizeSeasonKey(currentSeason)
    : _FALLBACK_SEASON_NORM;

  const [isDark, setIsDark]       = useState(false);
  const [activeSeason, setActiveSeason] = useState<string>('');
  const [mode, setMode]           = useState<'regular' | 'playoffs'>('regular');
  const [sit, setSit]             = useState<'all' | '5v5'>('all');

  useEffect(() => {
    const check = () => setIsDark(document.documentElement.dataset.theme === 'dark');
    check();
    const obs = new MutationObserver(check);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);

  function handleSeasonClick(seasonNorm: string) {
    setActiveSeason(seasonNorm);
    document.dispatchEvent(new CustomEvent('hgb:season-select', { detail: { season: seasonNorm } }));
  }

  const INK    = isDark ? INK_DARK    : INK_LIGHT;
  const BG     = isDark ? BG_DARK     : BG_LIGHT;
  const BORDER = isDark ? BORDER_DARK : BORDER_LIGHT;
  const MUTED  = isDark ? MUTED_DARK  : MUTED_LIGHT;
  const SURFACE = isDark ? '#1A1A26'  : '#fff';

  const [sorting, setSorting] = useState<SortingState>([{ id: 'season', desc: true }]);

  // Split career_seasons by game_type
  function buildRow<T extends GoalieCareerSeason>(row: T) {
    const xsv = row.sa && row.sa > 0 && row.xga != null ? 1 - row.xga / row.sa : null;
    const dsv = row.sv_pct != null && xsv != null ? row.sv_pct - xsv : null;
    const sa5 = row.sa_5v5 ?? 0;
    const ga5 = row.ga_5v5 ?? 0;
    const sv5 = sa5 > 0 ? 1 - ga5 / sa5 : null;
    const dsv5 = row.gsax_5v5 != null && sa5 > 0 ? row.gsax_5v5 / sa5 : null;
    const norm = normalizeSeasonKey(row.season);
    return {
      ...row,
      season_fmt: fmtSeason(norm),
      dsv_pct: dsv,
      dsv_pct_5v5: dsv5,
      sv_pct_5v5: sv5,
      is_current: norm === CURRENT_SEASON_NORM,
      season_normalized: norm,
    };
  }

  const rsRows = useMemo<RsRow[]>(() =>
    careerSeasons.filter(r => (r.game_type ?? 2) === 2).map(buildRow),
  [careerSeasons]);

  const poRows = useMemo<PoRow[]>(() =>
    careerSeasons.filter(r => (r.game_type ?? 2) === 3).map(buildRow),
  [careerSeasons]);

  // Set active season to most recent on mount
  useEffect(() => {
    if (rsRows.length > 0 && !activeSeason) {
      const sorted = [...rsRows].sort((a, b) =>
        (b.season_normalized).localeCompare(a.season_normalized)
      );
      setActiveSeason(sorted[0].season_normalized);
    }
  }, [rsRows]);

  // ── Column definitions (RS) ──────────────────────────────────────────────

  const rsColumns = useMemo<ColumnDef<RsRow>[]>(() => [
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
      accessorFn: (r) => r.team_abbrev ?? '',
      cell: (info) => {
        const abbr = info.getValue<string>();
        return (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            {abbr ? <img src={teamLogoSrc(abbr)} width={TEAM_LOGO_SIZE} height={TEAM_LOGO_SIZE} style={TEAM_LOGO_STYLE} alt={abbr} /> : null}
            <span style={{ ...MONO, fontSize: 11, color: 'rgba(13,13,20,0.72)' }}>{abbr || '—'}</span>
          </div>
        );
      },
      enableSorting: false,
    },
    {
      id: 'gp',
      header: 'GP',
      size: 58,
      accessorFn: (r) => r.gp ?? 0,
      cell: (info) => <span>{info.getValue<number>()}</span>,
    },
    {
      id: 'sa',
      header: 'SA',
      size: 68,
      accessorFn: (r) => (sit === '5v5' ? r.sa_5v5 : r.sa) ?? 0,
      cell: (info) => <span>{sit === '5v5' ? (info.row.original.sa_5v5 ?? 0) : (info.row.original.sa ?? 0)}</span>,
    },
    {
      id: 'sv_pct',
      header: 'SV%',
      size: 72,
      accessorFn: (r) => (sit === '5v5' ? r.sv_pct_5v5 : r.sv_pct) ?? -1,
      cell: (info) => {
        const v = sit === '5v5' ? info.row.original.sv_pct_5v5 : info.row.original.sv_pct;
        return <span style={{ fontWeight: 700 }}>{fmtSvPct(v)}</span>;
      },
    },
    {
      id: 'dsv_pct',
      header: 'ΔSV%',
      size: 80,
      accessorFn: (r) => (sit === '5v5' ? r.dsv_pct_5v5 : r.dsv_pct) ?? -999,
      cell: (info) => {
        const v = sit === '5v5' ? info.row.original.dsv_pct_5v5 : info.row.original.dsv_pct;
        const color = v == null ? 'rgba(13,13,20,0.32)' : v > 0.0001 ? '#137333' : v < -0.0001 ? '#991b1b' : undefined;
        return <span style={{ fontWeight: v != null ? 700 : 400, color: color ?? 'rgba(13,13,20,0.72)' }}>{fmtDsv(v)}</span>;
      },
    },
    {
      id: 'gsax',
      header: sit === '5v5' ? 'GSAx 5v5' : 'GSAx',
      size: 80,
      accessorFn: (r) => (sit === '5v5' ? r.gsax_5v5 : r.gsax) ?? -999,
      cell: (info) => {
        const v = sit === '5v5' ? info.row.original.gsax_5v5 : info.row.original.gsax;
        const color = gsaxColor(v ?? null);
        return (
          <span style={{ fontWeight: v != null ? 700 : 400, color: color ?? 'rgba(13,13,20,0.72)' }}>
            {v == null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(2)}`}
          </span>
        );
      },
    },
    {
      id: 'gsax_pct',
      header: 'GSAx%',
      size: 78,
      accessorFn: (r) => (sit === '5v5' ? r.gsax_5v5_pct : r.gsax_pct) ?? -1,
      cell: (info) => {
        const v = sit === '5v5' ? info.row.original.gsax_5v5_pct : info.row.original.gsax_pct;
        const color = gsaxPctColor(v ?? null);
        return (
          <span style={{ ...MONO, fontWeight: v != null ? 700 : 400, color }}>
            {v == null ? '—' : `${Math.round(Number(v))}%`}
          </span>
        );
      },
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [sit, INK]);

  // ── Column definitions (PO) ──────────────────────────────────────────────

  const poColumns = useMemo<ColumnDef<PoRow>[]>(() => [
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
      accessorFn: (r) => r.team_abbrev ?? '',
      cell: (info) => {
        const abbr = info.getValue<string>();
        return (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            {abbr ? <img src={teamLogoSrc(abbr)} width={TEAM_LOGO_SIZE} height={TEAM_LOGO_SIZE} style={TEAM_LOGO_STYLE} alt={abbr} /> : null}
            <span style={{ ...MONO, fontSize: 11, color: 'rgba(13,13,20,0.72)' }}>{abbr || '—'}</span>
          </div>
        );
      },
      enableSorting: false,
    },
    {
      id: 'gp',
      header: 'GP',
      size: 58,
      accessorFn: (r) => r.gp ?? 0,
      cell: (info) => <span>{info.getValue<number>()}</span>,
    },
    {
      id: 'sa',
      header: 'SA',
      size: 68,
      accessorFn: (r) => r.sa ?? 0,
      cell: (info) => <span>{info.getValue<number>()}</span>,
    },
    {
      id: 'sv_pct',
      header: 'SV%',
      size: 72,
      accessorFn: (r) => r.sv_pct ?? -1,
      cell: (info) => (
        <span style={{ fontWeight: 700 }}>{fmtSvPct(info.row.original.sv_pct)}</span>
      ),
    },
    {
      id: 'dsv_pct',
      header: 'ΔSV%',
      size: 80,
      accessorFn: (r) => r.dsv_pct ?? -999,
      cell: (info) => {
        const v = info.row.original.dsv_pct;
        const color = v == null ? 'rgba(13,13,20,0.32)' : v > 0.0001 ? '#137333' : v < -0.0001 ? '#991b1b' : undefined;
        return <span style={{ fontWeight: v != null ? 700 : 400, color: color ?? 'rgba(13,13,20,0.72)' }}>{fmtDsv(v)}</span>;
      },
    },
    {
      id: 'gsax',
      header: 'GSAx',
      size: 80,
      accessorFn: (r) => r.gsax ?? -999,
      cell: (info) => {
        const v = info.row.original.gsax;
        const color = gsaxColor(v ?? null);
        return (
          <span style={{ fontWeight: v != null ? 700 : 400, color: color ?? 'rgba(13,13,20,0.72)' }}>
            {v == null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(2)}`}
          </span>
        );
      },
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [INK]);

  // ── Tables ───────────────────────────────────────────────────────────────

  const rsTable = useReactTable({
    data: rsRows,
    columns: rsColumns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const poTable = useReactTable({
    data: poRows,
    columns: poColumns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const isPlayoffs  = mode === 'playoffs';
  const activeTable = isPlayoffs ? poTable : rsTable;
  const noData      = isPlayoffs && poRows.length === 0;

  // ── Career aggregates ────────────────────────────────────────────────────

  const careerGP   = rsRows.reduce((s, r) => s + (r.gp ?? 0), 0);
  const careerSA   = rsRows.reduce((s, r) => s + (r.sa ?? 0), 0);
  const careerGSAx = rsRows.some(r => r.gsax != null)
    ? rsRows.reduce((s, r) => s + (r.gsax ?? 0), 0)
    : null;
  const careerGSAx5v5 = rsRows.some(r => r.gsax_5v5 != null)
    ? rsRows.reduce((s, r) => s + (r.gsax_5v5 ?? 0), 0)
    : null;
  const careerSA5v5 = rsRows.reduce((s, r) => s + (r.sa_5v5 ?? 0), 0);

  const poCareerGP   = poRows.reduce((s, r) => s + (r.gp ?? 0), 0);
  const poCareerSA   = poRows.reduce((s, r) => s + (r.sa ?? 0), 0);
  const poCareerGSAx = poRows.some(r => r.gsax != null)
    ? poRows.reduce((s, r) => s + (r.gsax ?? 0), 0)
    : null;

  // ── PNG export ───────────────────────────────────────────────────────────

  function exportPng() {
    const exp = (window as any).HGB_Export;
    if (!exp?.downloadTablePng) return;
    const bodyRows = activeTable.getRowModel().rows.map(r => r.original as RsRow & PoRow);
    const cur = sorting[0];
    const mark = (sortId: string) => ({
      sorted: cur?.id === sortId,
      sortDir: cur?.id === sortId ? (cur.desc ? 'desc' : 'asc') : null,
    });
    const pctFmt = (v: any) => v != null ? `${Math.round(Number(v))}%` : '—';
    const pctCol = (v: any, _r: any, tok: any) => v == null ? null : v >= 70 ? tok.pos : v <= 30 ? tok.neg : null;
    const gsaxFmt = (v: any) => v == null ? '—' : `${Number(v) > 0 ? '+' : ''}${Number(v).toFixed(2)}`;
    const gsaxCol = (v: any, _r: any, tok: any) => v == null ? null : Number(v) > 0 ? tok.pos : Number(v) < 0 ? tok.neg : null;
    const sitLabel = sit === '5v5' ? '5v5' : 'All Sit';
    const gsaxKey = sit === '5v5' ? 'gsax_5v5' : 'gsax';
    const gsaxPctKey = sit === '5v5' ? 'gsax_5v5_pct' : 'gsax_pct';
    const careerRow: any = isPlayoffs
      ? { season_fmt: 'CAREER', team_abbrev: '—', gp: poCareerGP, sa: poCareerSA, sv_pct: null, dsv_pct: null, gsax: poCareerGSAx }
      : { season_fmt: 'CAREER', team_abbrev: '—', gp: careerGP, sa: sit === '5v5' ? careerSA5v5 : careerSA, sv_pct: null, dsv_pct: null, [gsaxKey]: sit === '5v5' ? careerGSAx5v5 : careerGSAx, [gsaxPctKey]: null };
    const data = [...bodyRows, careerRow];
    const pngCols = isPlayoffs ? [
      { label: 'Season', key: 'season_fmt',  width: 92, align: 'left',   fontFamily: 'mono', ...mark('season') },
      { label: 'Team',   key: 'team_abbrev', width: 68, align: 'center', fontFamily: 'mono', ...mark('team') },
      { label: 'GP',     key: 'gp',          width: 54, align: 'center', ...mark('gp') },
      { label: 'SA',     key: 'sa',          width: 60, align: 'center', ...mark('sa') },
      { label: 'SV%',    key: 'sv_pct',      width: 74, align: 'center', format: (v: any) => fmtSvPct(v), ...mark('sv_pct') },
      { label: 'ΔSV%',   key: 'dsv_pct',     width: 80, align: 'center', format: (v: any) => fmtDsv(v), color: gsaxCol, ...mark('dsv_pct') },
      { label: 'GSAx',   key: 'gsax',        width: 78, align: 'center', format: gsaxFmt, color: gsaxCol, bold: true, ...mark('gsax') },
    ] : [
      { label: 'Season',    key: 'season_fmt',  width: 92, align: 'left',   fontFamily: 'mono', ...mark('season') },
      { label: 'Team',      key: 'team_abbrev', width: 68, align: 'center', fontFamily: 'mono', ...mark('team') },
      { label: 'GP',        key: 'gp',          width: 54, align: 'center', ...mark('gp') },
      { label: 'SA',        key: 'sa',          width: 60, align: 'center', ...mark('sa') },
      { label: 'SV%',       key: 'sv_pct',      width: 74, align: 'center', format: (v: any) => fmtSvPct(v), ...mark('sv_pct') },
      { label: 'ΔSV%',      key: 'dsv_pct',     width: 80, align: 'center', format: (v: any) => fmtDsv(v), color: gsaxCol, ...mark('dsv_pct') },
      { label: sit === '5v5' ? 'GSAx 5v5' : 'GSAx', key: gsaxKey, width: 78, align: 'center', format: gsaxFmt, color: gsaxCol, bold: true, ...mark('gsax') },
      { label: 'GSAx%',     key: gsaxPctKey,    width: 74, align: 'center', format: pctFmt, color: pctCol, ...mark('gsax_pct') },
    ];
    exp.downloadTablePng({
      title: `${goalieName} · Career`,
      filterChips: [isPlayoffs ? 'Playoffs' : 'Regular Season', isPlayoffs ? 'All Situations' : sitLabel],
      rows: data,
      columns: pngCols,
      filename: `hgb_career_${goalieSlug}_${isPlayoffs ? 'playoffs' : 'regular'}.png`,
    });
  }

  // ── Chip style ────────────────────────────────────────────────────────────

  const chip = (active: boolean): React.CSSProperties => ({
    ...MONO,
    fontSize: 11,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    padding: '5px 10px',
    border: BORDER,
    background: active ? INK : 'transparent',
    color: active ? BG : MUTED,
    cursor: 'pointer',
  });

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ ...BODY, color: INK, overflowX: 'auto' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '12px 18px' }}>
        <button style={chip(mode === 'regular')} onClick={() => setMode('regular')}>Regular Season</button>
        <button style={chip(mode === 'playoffs')} onClick={() => setMode('playoffs')}>Playoffs</button>
        {/* 5v5 sub-toggle — RS only */}
        {!isPlayoffs && (
          <>
            <div style={{ width: 1, height: 20, background: 'rgba(13,13,20,0.15)', margin: '0 4px' }} />
            <button style={chip(sit === 'all')} onClick={() => setSit('all')}>All Sit</button>
            <button style={chip(sit === '5v5')} onClick={() => setSit('5v5')}>5v5</button>
          </>
        )}
        <div style={{ flex: 1 }} />
        {leaderboardHref && (
          <a href={leaderboardHref} style={{ ...MONO, fontSize: 10, letterSpacing: '0.08em', color: MUTED, textDecoration: 'none', marginRight: 8 }}>
            Goalie Stats ↗
          </a>
        )}
        <button style={chip(false)} onClick={exportPng} title="Download this table as a PNG">↓ PNG</button>
      </div>

      {noData ? (
        <div style={{ ...MONO, fontSize: 12, color: MUTED, padding: '28px 18px', textAlign: 'center', background: SURFACE, border: BORDER }}>
          No playoff data available.
        </div>
      ) : (
        <table
          style={{
            width: '100%',
            tableLayout: 'fixed',
            borderCollapse: 'collapse',
            fontSize: CELL_FONT_SIZE,
            background: SURFACE,
            border: BORDER,
          }}
        >
          <colgroup>
            <col style={{ width: 90 }} />{/* SEASON */}
            <col style={{ width: 110 }} />{/* TEAM */}
            {activeTable.getHeaderGroups()[0]?.headers.slice(2).map(h => (
              <col key={h.id} />
            ))}
          </colgroup>
          <thead>
            {activeTable.getHeaderGroups().map(hg => (
              <tr key={hg.id} style={{ borderBottom: BORDER, background: BG }}>
                {hg.headers.map((h, hi) => {
                  const isSorted = h.column.getIsSorted();
                  const canSort  = h.column.getCanSort();
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
              const orig = row.original as RsRow & PoRow;
              const isActive = !isPlayoffs && orig.season_normalized === activeSeason;
              const allRows  = activeTable.getRowModel().rows;
              const nextRow  = allRows[i + 1];
              const currYear = parseInt(orig.season_normalized?.slice(0, 4) || '0');
              const nextYear = nextRow ? parseInt((nextRow.original as any).season_normalized?.slice(0, 4) || '0') : null;
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
                    title={isPlayoffs ? undefined : `Click to view ${orig.season_fmt} season card`}
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
            <tr style={{ borderTop: `2px solid ${INK}`, background: isDark ? 'rgba(239,238,232,0.05)' : 'rgba(13,13,20,0.04)' }}>
              {isPlayoffs ? (
                <>
                  <td style={{ ...MONO, fontSize: 11, fontWeight: 700, padding: '9px 10px', textAlign: 'left', color: INK, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Career</td>
                  <td style={{ ...MONO, fontSize: 11, padding: '9px 10px', textAlign: 'center', color: MUTED }}>—</td>
                  <td style={{ ...MONO, fontSize: CELL_FONT_SIZE, fontWeight: 700, padding: '9px 10px', textAlign: 'center', color: INK }}>{poCareerGP}</td>
                  <td style={{ ...MONO, fontSize: CELL_FONT_SIZE, fontWeight: 700, padding: '9px 10px', textAlign: 'center', color: INK }}>{poCareerSA}</td>
                  <td style={{ ...MONO, fontSize: 11, padding: '9px 10px', textAlign: 'center', color: MUTED }}>—</td>
                  <td style={{ ...MONO, fontSize: 11, padding: '9px 10px', textAlign: 'center', color: MUTED }}>—</td>
                  <td style={{
                    ...MONO, fontSize: CELL_FONT_SIZE,
                    fontWeight: poCareerGSAx != null ? 700 : 400,
                    padding: '9px 10px', textAlign: 'center',
                    color: poCareerGSAx != null ? (poCareerGSAx >= 0 ? '#137333' : '#991b1b') : MUTED,
                  }}>
                    {poCareerGSAx != null ? `${poCareerGSAx > 0 ? '+' : ''}${poCareerGSAx.toFixed(2)}` : '—'}
                  </td>
                </>
              ) : (
                <>
                  <td style={{ ...MONO, fontSize: 11, fontWeight: 700, padding: '9px 10px', textAlign: 'left', color: INK, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Career</td>
                  <td style={{ ...MONO, fontSize: 11, padding: '9px 10px', textAlign: 'center', color: MUTED }}>—</td>
                  <td style={{ ...MONO, fontSize: CELL_FONT_SIZE, fontWeight: 700, padding: '9px 10px', textAlign: 'center', color: INK }}>{careerGP}</td>
                  <td style={{ ...MONO, fontSize: CELL_FONT_SIZE, fontWeight: 700, padding: '9px 10px', textAlign: 'center', color: INK }}>{sit === '5v5' ? careerSA5v5 : careerSA}</td>
                  <td style={{ ...MONO, fontSize: 11, padding: '9px 10px', textAlign: 'center', color: MUTED }}>—</td>
                  <td style={{ ...MONO, fontSize: 11, padding: '9px 10px', textAlign: 'center', color: MUTED }}>—</td>
                  {(() => {
                    const v = sit === '5v5' ? careerGSAx5v5 : careerGSAx;
                    return (
                      <td style={{
                        ...MONO, fontSize: CELL_FONT_SIZE,
                        fontWeight: v != null ? 700 : 400,
                        padding: '9px 10px', textAlign: 'center',
                        color: v != null ? (v >= 0 ? '#137333' : '#991b1b') : MUTED,
                      }}>
                        {v != null ? `${v > 0 ? '+' : ''}${v.toFixed(2)}` : '—'}
                      </td>
                    );
                  })()}
                  <td style={{ ...MONO, fontSize: 11, padding: '9px 10px', textAlign: 'center', color: MUTED }}>—</td>
                </>
              )}
            </tr>
          </tfoot>
        </table>
      )}

      <p style={{
        ...MONO,
        fontSize: 10,
        color: 'rgba(13,13,20,0.40)',
        margin: '12px 18px 14px',
        letterSpacing: '0.04em',
        lineHeight: 1.5,
        textAlign: 'right',
      }}>
        {isPlayoffs
          ? <>hockeygamebot.com · HGB Stats · Playoff GSAx · All Situations</>
          : <>hockeygamebot.com · HGB Stats · GSAx% vs all RS goalies ≥500 SA · ΔSV% = SV% − xSV%</>}
      </p>
    </div>
  );
}
