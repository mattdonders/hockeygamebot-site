import React, { useState, useEffect, useMemo } from 'react';
import HGBTable, { type HGBColumnDef, TEAM_LOGO_SIZE, TEAM_LOGO_STYLE, teamLogoSrc, NAME_FONT_SIZE } from './HGBTable';
import { fmtSeasonShort } from '../../lib/format-season';
import { aggregateSeasons, availableSeasons, type SlimData, type AggRow } from '../../lib/aggregate-seasons';
import { getSessionToken, getPrefs, putPrefs, mergeLocalPresets } from '../../lib/auth-client';
import { MONO, SEMI, useIsDark, FilterChip, FilterChipGroup, FilterLabel } from './FilterPrimitives';

// "20252026" → "2025-26"; passes through if already dashed
function normSeason(s: string): string {
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(6)}`;
  return s;
}

function ordinal(n: number): string {
  const s = ['th','st','nd','rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

// ── Row type (mirrors skaters.astro tableRows) ────────────────────────────────
export type SkaterRow = {
  slug: string; name: string; first_name: string; last_name: string; searchText: string; team: string; season?: string;
  pos: string; group: 'F' | 'D'; gp: number;
  // Counting
  goals: number; assists: number; points: number; sog: number; ixg: number; toi_pg: number;
  // Rates
  g60: number; a60: number; p60: number; x60: number; sog60: number;
  // Advanced
  war: number | null; war_p: number; fin: number; fin_p: number; imp: number; imp_p: number; rapm: number | null;
  rating: number | null; rating_p: number | null;
  // On-ice 5v5
  xgf_pct: number; xgf60: number; xga60: number; sc60: number; hdc60: number;
  gf_diff: number; gf_diff_60: number;
  // Strength splits
  goals_ev: number; goals_pp: number; goals_sh: number;
  a_ev: number; a_pp: number; a_pk: number;
  shots_ev: number; shots_pp: number; shots_pk: number;
  ixg_ev: number; ixg_pp: number; ixg_pk: number;
  toi_ev_sec: number; toi_pp_sec: number; toi_pk_sec: number;
  // EDGE skating (null when not available — agg/playoff path)
  edge_speed_mph: number | null; edge_speed_pct: number | null;
  edge_dist_mi: number | null;   edge_dist_pct: number | null;
  edge_bursts: number | null;    edge_bursts_pct: number | null;
  edge_shot_mph: number | null;  edge_shot_pct: number | null;
  // Physical / faceoff
  hits: number; hits_taken: number; blocks: number;
  fo_wins: number; fo_losses: number;
  // Playoff
  po_gp: number | null; po_goals: number | null; po_assists: number | null;
  po_points: number | null; po_sog: number | null; po_ixg: number | null; po_toi_pg: number | null;
};

type Tab      = 'counting' | 'rates' | 'advanced' | 'onice';
type GameType = 'regular'  | 'playoffs';
type Pos      = 'all' | 'F' | 'D';
type Strength = 'all' | '5v5' | 'pp' | 'pk';
type Display  = 'totals'   | 'per60';

type Props = { rows: SkaterRow[]; statsDate: string | null; currentSeason: string; isPlayoffSeason?: boolean };

// Physical / faceoff + EDGE columns — managed by SkatersTable (not HGBTable defaultHidden)
// because both HGBTable instances use hideToolbar, so HGBTable's own toggle UI never renders.
const PHYSICAL_COL_DEFS = [
  { id: 'hits',      label: 'Hits' },
  { id: 'blocks',    label: 'BLK'  },
  { id: 'fo_wins',   label: 'FOW'  },
  { id: 'fo_losses', label: 'FOL'  },
  { id: 'fo_pct',    label: 'FO%'  },
] as const;
type PhysicalColId = typeof PHYSICAL_COL_DEFS[number]['id'];

// EDGE columns — current-season regular path only (null in agg/playoff)
const EDGE_COL_DEFS = [
  { id: 'edge_speed_mph', label: 'Spd'  },
  { id: 'edge_dist_mi',   label: 'Dist' },
  { id: 'edge_bursts',    label: 'Bsts' },
  { id: 'edge_shot_mph',  label: 'Shot' },
] as const;
type EdgeColId = typeof EDGE_COL_DEFS[number]['id'];

// localStorage key for logged-out preset persistence (logged-in users use cloud
// prefs via auth-client). auth-client owns the same key for migration.
const LOCAL_PRESETS_KEY = 'hgb_filter_presets';

type FilterSnapshot = {
  tab: Tab; fromSeason: string; toSeason: string; gameType: GameType;
  pos: Pos; display: Display; strength: Strength; minGP: number; minToi: number;
};
type FilterPreset = { name: string; filters: FilterSnapshot };

const POS  = '#166534'; const NEG = '#991b1b';
const sgn = (v: number) => v >= 0 ? '+' : '';
const f2  = (v: number | null) => v != null ? Number(v).toFixed(2) : '—';
const f3  = (v: number | null) => v != null ? Number(v).toFixed(3) : '—';

function getStrengthStats(r: SkaterRow, mode: Strength) {
  if (mode === 'all') return { g: r.goals, a: r.assists, sog: r.sog, ixg: r.ixg, toi_pg: r.toi_pg, toi_sec: 0 };
  const gp = r.gp || 1;
  if (mode === '5v5') return { g: r.goals_ev, a: r.a_ev,  sog: r.shots_ev, ixg: r.ixg_ev, toi_pg: r.toi_ev_sec / gp / 60, toi_sec: r.toi_ev_sec };
  if (mode === 'pp')  return { g: r.goals_pp, a: r.a_pp,  sog: r.shots_pp, ixg: r.ixg_pp, toi_pg: r.toi_pp_sec / gp / 60, toi_sec: r.toi_pp_sec };
  return                     { g: r.goals_sh, a: r.a_pk,  sog: r.shots_pk, ixg: r.ixg_pk, toi_pg: r.toi_pk_sec / gp / 60, toi_sec: r.toi_pk_sec };
}

function getStrengthValue(r: SkaterRow, key: string, st: ReturnType<typeof getStrengthStats>, hr: number) {
  switch (key) {
    case 'goals':  return st.g;
    case 'assists': return st.a;
    case 'points':  return st.g + st.a;
    case 'sog':     return st.sog;
    case 'ixg':     return st.ixg;
    case 'toi_pg':  return st.toi_pg;
    case 'g60':     return hr > 0 ? st.g   / hr : 0;
    case 'a60':     return hr > 0 ? st.a   / hr : 0;
    case 'p60':     return hr > 0 ? (st.g + st.a) / hr : 0;
    case 'sog60':   return hr > 0 ? st.sog / hr : 0;
    case 'x60':     return hr > 0 ? st.ixg / hr : 0;
    default:        return (r as any)[key];
  }
}

function buildColumns(
  tab: Tab, gameType: GameType, strength: Strength, display: Display, isDark: boolean, currentSeason: string
): HGBColumnDef<SkaterRow>[] {
  const isPlayoff = gameType === 'playoffs';
  const isPer60   = display === 'per60';
  const prefix    = strength === '5v5' ? 'EV ' : strength === 'pp' ? 'PP ' : strength === 'pk' ? 'SH ' : '';

  // Fixed columns
  const fixed: HGBColumnDef<SkaterRow>[] = [
    {
      id: 'name', header: 'Player', accessor: r => r.name, align: 'left', width: 190,
      cell: (_v, row) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <img src={teamLogoSrc(row.team, isDark)} width={TEAM_LOGO_SIZE} height={TEAM_LOGO_SIZE}
            style={TEAM_LOGO_STYLE} alt={row.team}
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          <div style={{ fontFamily: 'var(--body)', fontWeight: 600, fontSize: NAME_FONT_SIZE }}>
            {row.first_name && row.last_name ? `${row.first_name} ${row.last_name}` : row.name}
          </div>
        </div>
      ),
      exportText: (_v, row) => row.first_name && row.last_name ? `${row.first_name} ${row.last_name}` : row.name,
      sortType: 'string',
    },
    { id: 'season', header: 'Season', accessor: r => r.season ?? currentSeason, width: 68, mobileHidden: true,
      cell: v => fmtSeasonShort(v as string), exportText: v => fmtSeasonShort(String(v ?? '')) },
    { id: 'team', header: 'Team', accessor: r => r.team, width: 52 },
    { id: 'pos',  header: 'Pos',  accessor: r => r.pos,  width: 44 },
    { id: 'gp', header: 'GP', accessor: r => isPlayoff ? r.po_gp : r.gp, width: 48, cell: v => v != null ? String(v) : '—' },
  ];

  // Tab-specific columns
  let tabCols: HGBColumnDef<SkaterRow>[] = [];

  if (tab === 'counting') {
    const countingKeys = isPer60 && !isPlayoff
      ? [
          { key: 'g60',   label: prefix + 'G/60',   fmt: f2 },
          { key: 'a60',   label: prefix + 'A/60',   fmt: f2 },
          { key: 'p60',   label: prefix + 'P/60',   fmt: f2, bold: true },
          { key: 'sog60', label: prefix + 'SOG/60', fmt: f2 },
          { key: 'x60',   label: prefix + 'ixG/60', fmt: f2 },
          { key: 'toi_pg',label: 'TOI/G',            fmt: f2 },
        ]
      : [
          { key: 'goals',   label: prefix + 'G',   fmt: (v: any) => String(v ?? '—') },
          { key: 'assists', label: prefix + 'A',   fmt: (v: any) => String(v ?? '—') },
          { key: 'points',  label: prefix + 'P',   fmt: (v: any) => String(v ?? '—'), bold: true },
          { key: 'sog',     label: prefix + 'SOG', fmt: (v: any) => String(v ?? '—') },
          { key: 'ixg',     label: prefix + 'ixG', fmt: f2 },
          { key: 'toi_pg',  label: 'TOI/G',                                  fmt: (v: any) => v != null ? Number(v).toFixed(1) : '—' },
        ];

    tabCols = countingKeys.map(({ key, label, fmt, bold }) => ({
      id: key,
      header: label,
      width: 60,
      exportText: (v: any) => v != null ? fmt(v) : '—',
      accessor: (r: SkaterRow) => {
        const poMap: Record<string, keyof SkaterRow> = { goals: 'po_goals', assists: 'po_assists', points: 'po_points', sog: 'po_sog', ixg: 'po_ixg', toi_pg: 'po_toi_pg' };
        if (isPlayoff && poMap[key]) return (r as any)[poMap[key]] ?? null;
        if (strength !== 'all' && !isPer60) {
          const st = getStrengthStats(r, strength);
          return getStrengthValue(r, key, st, st.toi_sec / 3600);
        }
        if (strength !== 'all' && isPer60) {
          const st = getStrengthStats(r, strength);
          const hr = st.toi_sec / 3600;
          return getStrengthValue(r, key, st, hr);
        }
        return (r as any)[key];
      },
      cell: (v: any) => bold
        ? <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{v != null ? fmt(v) : '—'}</strong>
        : <span style={{ fontVariantNumeric: 'tabular-nums' }}>{v != null ? fmt(v) : '—'}</span>,
    }));
  }

  else if (tab === 'rates') {
    tabCols = [
      { id: 'g60',  header: 'G/60',   accessor: r => r.g60,  width: 64, cell: v => f2(v as any), exportText: v => f2(v as any) },
      { id: 'a60',  header: 'A/60',   accessor: r => r.a60,  width: 64, cell: v => f2(v as any), exportText: v => f2(v as any) },
      { id: 'p60',  header: 'P/60',   accessor: r => r.p60,  width: 64, cell: v => <strong>{f2(v as any)}</strong>, exportText: v => f2(v as any) },
      { id: 'x60',  header: 'ixG/60', accessor: r => r.x60,  width: 64, cell: v => f2(v as any), exportText: v => f2(v as any) },
      { id: 'toi_pg', header: 'TOI/G', accessor: r => r.toi_pg, width: 60, cell: v => v != null ? Number(v).toFixed(1) : '—', exportText: v => v != null ? Number(v).toFixed(1) : '—' },
    ];
  }

  else if (tab === 'advanced') {
    tabCols = [
      {
        id: 'imp', header: 'Impact', accessor: r => r.imp, width: 80,
        cell: (v, r) => (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.2 }}>
            <strong style={{ color: (v as number) >= 0 ? POS : NEG }}>{sgn(v as number)}{f2(v as any)}</strong>
            <span style={{ ...MONO, fontSize: 9, color: 'rgba(13,13,20,0.4)' }}>{ordinal(r.imp_p)}</span>
          </div>
        ),
        exportText: v => v != null ? `${sgn(v as number)}${f2(v as any)}` : '—',
      },
      {
        id: 'war', header: 'WAR', accessor: r => r.war, width: 80,
        cell: (v, r) => v != null
          ? <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.2 }}>
              <strong style={{ color: (v as number) >= 0 ? POS : NEG }}>{sgn(v as number)}{f2(v as any)}</strong>
              <span style={{ ...MONO, fontSize: 9, color: 'rgba(13,13,20,0.4)' }}>{ordinal(r.war_p)}</span>
            </div>
          : <span style={{ color: 'rgba(13,13,20,0.3)' }}>—</span>,
        exportText: v => v != null ? `${sgn(v as number)}${f2(v as any)}` : '—',
      },
      {
        id: 'rating', header: 'Rating', accessor: r => r.rating, width: 80,
        cell: (v, r) => v != null
          ? <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.2 }}>
              <strong style={{ color: (v as number) >= 0 ? POS : NEG, fontVariantNumeric: 'tabular-nums' }}>{sgn(v as number)}{f2(v as any)}</strong>
              {r.rating_p != null && <span style={{ ...MONO, fontSize: 9, color: 'rgba(13,13,20,0.4)' }}>{ordinal(r.rating_p!)}</span>}
            </div>
          : <span style={{ color: 'rgba(13,13,20,0.3)' }}>—</span>,
        exportText: v => v != null ? `${sgn(v as number)}${f2(v as any)}` : '—',
        mobileHidden: true,
      },
    ];
  }

  else if (tab === 'onice') {
    tabCols = [
      {
        id: 'xgf_pct', header: 'xGF%', accessor: r => r.xgf_pct, width: 72,
        cell: v => {
          const n = v as number;
          const col = n >= 55 ? POS : n <= 45 ? NEG : undefined;
          return <strong style={{ color: col }}>{n.toFixed(1)}%</strong>;
        },
        exportText: v => v != null ? `${(v as number).toFixed(1)}%` : '—',
      },
      { id: 'xgf60', header: 'xGF/60', accessor: r => r.xgf60, width: 72, cell: v => f2(v as any), exportText: v => f2(v as any) },
      { id: 'xga60', header: 'xGA/60', accessor: r => r.xga60, width: 72, cell: v => f2(v as any), exportText: v => f2(v as any) },
      ...(display === 'totals' ? [{
        id: 'gf_diff', header: 'G±', accessor: (r: SkaterRow) => r.gf_diff, width: 60,
        cell: (v: string | number | null) => {
          const n = v as number;
          return <span style={{ color: n > 0 ? POS : n < 0 ? NEG : undefined }}>{sgn(n)}{n}</span>;
        },
        exportText: (v: string | number | null) => { const n = v as number; return `${sgn(n)}${n}`; },
      }] : []),
      {
        id: 'gf_diff_60', header: 'G±/60', accessor: r => r.gf_diff_60, width: 68,
        cell: v => {
          const n = v as number;
          return <span style={{ color: n > 0 ? POS : n < 0 ? NEG : undefined }}>{n >= 0 ? '+' : ''}{n.toFixed(2)}</span>;
        },
        exportText: v => { const n = v as number; return `${n >= 0 ? '+' : ''}${n.toFixed(2)}`; },
      },
      { id: 'sc60',  header: 'SC/60',  accessor: r => r.sc60,  width: 68, cell: v => f2(v as any), exportText: v => f2(v as any), mobileHidden: true },
      { id: 'hdc60', header: 'HDC/60', accessor: r => r.hdc60, width: 68, cell: v => f2(v as any), exportText: v => f2(v as any), mobileHidden: true },
    ];
  }

  // Physical / faceoff cols — regular season only; SkatersTable filters by visiblePhysical
  const physicalCols: HGBColumnDef<SkaterRow>[] = !isPlayoff ? [
    { id: 'hits',      header: 'Hits',   accessor: r => r.hits,      width: 56, cell: v => String(v ?? '—'), exportText: v => String(v ?? '—') },
    { id: 'blocks',    header: 'BLK',    accessor: r => r.blocks,    width: 52, cell: v => String(v ?? '—'), exportText: v => String(v ?? '—') },
    { id: 'fo_wins',   header: 'FOW',    accessor: r => r.fo_wins,   width: 52, cell: v => String(v ?? '—'), exportText: v => String(v ?? '—') },
    { id: 'fo_losses', header: 'FOL',    accessor: r => r.fo_losses, width: 52, cell: v => String(v ?? '—'), exportText: v => String(v ?? '—') },
    { id: 'fo_pct',    header: 'FO%',    accessor: r => (r.fo_wins + r.fo_losses) > 0 ? +(r.fo_wins / (r.fo_wins + r.fo_losses) * 100).toFixed(1) : null,
      width: 56,
      cell: v => v != null ? `${(v as number).toFixed(1)}%` : <span style={{ color: 'rgba(13,13,20,0.3)' }}>—</span>,
      exportText: v => v != null ? `${(v as number).toFixed(1)}%` : '—' },
  ] : [];

  // EDGE cols — current-season regular season only
  const edgeCols: HGBColumnDef<SkaterRow>[] = !isPlayoff ? [
    {
      id: 'edge_speed_mph', header: 'Top Spd', width: 76,
      accessor: r => r.edge_speed_mph,
      cell: (v, r) => v != null
        ? <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.2 }}>
            <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{(v as number).toFixed(1)}</strong>
            {r.edge_speed_pct != null && <span style={{ ...MONO, fontSize: 9, color: 'rgba(13,13,20,0.4)' }}>{ordinal(r.edge_speed_pct)}</span>}
          </div>
        : <span style={{ color: 'rgba(13,13,20,0.3)' }}>—</span>,
      exportText: (v, r) => v != null ? `${(v as number).toFixed(1)} mph (${r.edge_speed_pct ?? '?'}th)` : '—',
    },
    {
      id: 'edge_dist_mi', header: 'Dist (mi)', width: 80,
      accessor: r => r.edge_dist_mi,
      cell: (v, r) => v != null
        ? <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.2 }}>
            <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{(v as number).toFixed(0)}</strong>
            {r.edge_dist_pct != null && <span style={{ ...MONO, fontSize: 9, color: 'rgba(13,13,20,0.4)' }}>{ordinal(r.edge_dist_pct)}</span>}
          </div>
        : <span style={{ color: 'rgba(13,13,20,0.3)' }}>—</span>,
      exportText: (v, r) => v != null ? `${(v as number).toFixed(0)} mi (${r.edge_dist_pct ?? '?'}th)` : '—',
    },
    {
      id: 'edge_bursts', header: 'Bursts', width: 68,
      accessor: r => r.edge_bursts,
      cell: (v, r) => v != null
        ? <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.2 }}>
            <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{v as number}</strong>
            {r.edge_bursts_pct != null && <span style={{ ...MONO, fontSize: 9, color: 'rgba(13,13,20,0.4)' }}>{ordinal(r.edge_bursts_pct)}</span>}
          </div>
        : <span style={{ color: 'rgba(13,13,20,0.3)' }}>—</span>,
      exportText: (v, r) => v != null ? `${v} (${r.edge_bursts_pct ?? '?'}th)` : '—',
    },
    {
      id: 'edge_shot_mph', header: 'Shot Spd', width: 76,
      accessor: r => r.edge_shot_mph,
      cell: (v, r) => v != null
        ? <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.2 }}>
            <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{(v as number).toFixed(1)}</strong>
            {r.edge_shot_pct != null && <span style={{ ...MONO, fontSize: 9, color: 'rgba(13,13,20,0.4)' }}>{ordinal(r.edge_shot_pct)}</span>}
          </div>
        : <span style={{ color: 'rgba(13,13,20,0.3)' }}>—</span>,
      exportText: (v, r) => v != null ? `${(v as number).toFixed(1)} mph (${r.edge_shot_pct ?? '?'}th)` : '—',
    },
  ] : [];

  return [...fixed, ...tabCols, ...physicalCols, ...edgeCols];
}

// ── Aggregated (multi-season / playoff) columns ───────────────────────────────
// Counting, Rates, and On-Ice 5v5 are supported. Advanced (RAPM/WAR) is disabled
// because per-season percentiles are not meaningful when summed across seasons.
function getAggStrengthStats(r: AggRow, mode: Strength) {
  if (mode === 'all') return { g: r.goals, a: r.assists, sog: r.sog, ixg: r.ixg, toi_sec: r.toi_ev_sec };
  if (mode === '5v5') return { g: r.goals_ev, a: r.a_ev, sog: r.sog_ev, ixg: r.ixg_ev, toi_sec: r.toi_ev_sec };
  if (mode === 'pp')  return { g: r.goals_pp, a: r.a_pp, sog: r.sog_pp, ixg: r.ixg_pp, toi_sec: r.toi_pp_sec };
  return                     { g: r.goals_sh, a: r.a_pk, sog: r.sog_pk, ixg: r.ixg_pk, toi_sec: r.toi_pk_sec };
}

function buildAggColumns(
  tab: Tab, display: Display, strength: Strength, isDark: boolean, rangeLabel: string, multi: boolean,
): HGBColumnDef<AggRow>[] {
  const fixed: HGBColumnDef<AggRow>[] = [
    {
      id: 'name', header: 'Player', accessor: r => r.name, align: 'left', width: 200,
      cell: (_v, row) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <img src={teamLogoSrc(row.team, isDark)} width={TEAM_LOGO_SIZE} height={TEAM_LOGO_SIZE}
            style={TEAM_LOGO_STYLE} alt={row.team}
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          <div style={{ fontFamily: 'var(--body)', fontWeight: 600, fontSize: NAME_FONT_SIZE }}>
            {row.name}
            {row.multiTeam && <span style={{ ...MONO, fontSize: 9, color: 'rgba(13,13,20,0.4)', marginLeft: 6 }}>multi</span>}
          </div>
        </div>
      ),
      exportText: (_v, row) => row.name,
      sortType: 'string',
    },
    { id: 'season', header: 'Seasons', accessor: () => rangeLabel, width: 116, mobileHidden: true,
      cell: () => <span style={{ ...MONO, fontSize: 13, whiteSpace: 'nowrap' }}>{rangeLabel}</span>, exportText: () => rangeLabel },
    { id: 'team', header: 'Team', accessor: r => r.team, width: 52 },
    { id: 'pos',  header: 'Pos',  accessor: r => r.pos,  width: 44 },
    { id: 'gp', header: 'GP', accessor: r => r.gp, width: 52 },
  ];

  const isPer60 = display === 'per60';
  const prefix = strength === '5v5' ? 'EV ' : strength === 'pp' ? 'PP ' : strength === 'pk' ? 'SH ' : '';
  let tabCols: HGBColumnDef<AggRow>[] = [];

  if (tab === 'rates' || (tab === 'counting' && isPer60)) {
    tabCols = [
      { id: 'g60',   header: prefix + 'G/60',   accessor: r => r.g60,   width: 64, cell: v => f2(v as any), exportText: v => f2(v as any) },
      { id: 'a60',   header: prefix + 'A/60',   accessor: r => r.a60,   width: 64, cell: v => f2(v as any), exportText: v => f2(v as any) },
      { id: 'p60',   header: prefix + 'P/60',   accessor: r => r.p60,   width: 64, cell: v => <strong>{f2(v as any)}</strong>, exportText: v => f2(v as any) },
      { id: 'x60',   header: prefix + 'ixG/60', accessor: r => r.x60,   width: 64, cell: v => f2(v as any), exportText: v => f2(v as any) },
      { id: 'sog60', header: prefix + 'SOG/60', accessor: r => r.sog60, width: 68, cell: v => f2(v as any), exportText: v => f2(v as any), mobileHidden: true },
      { id: 'toi_pg', header: 'TOI/G', accessor: r => r.toi_pg, width: 64, cell: v => v != null ? Number(v).toFixed(1) : '—', exportText: v => v != null ? Number(v).toFixed(1) : '—' },
    ];
  } else {
    tabCols = [
      { id: 'goals',   header: prefix + 'G',   accessor: r => r.goals,   width: 56, cell: v => String(v ?? '—'), exportText: v => String(v ?? '—') },
      { id: 'assists', header: prefix + 'A',   accessor: r => r.assists, width: 56, cell: v => String(v ?? '—'), exportText: v => String(v ?? '—') },
      { id: 'points',  header: prefix + 'P',   accessor: r => r.points,  width: 56, cell: v => <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{String(v ?? '—')}</strong>, exportText: v => String(v ?? '—') },
      { id: 'sog',     header: prefix + 'SOG', accessor: r => r.sog,     width: 60, cell: v => String(v ?? '—'), exportText: v => String(v ?? '—') },
      { id: 'ixg',     header: prefix + 'ixG', accessor: r => r.ixg,     width: 60, cell: v => f2(v as any), exportText: v => f2(v as any) },
      { id: 'toi_pg',  header: 'TOI/G',        accessor: r => r.toi_pg,  width: 64, cell: v => v != null ? Number(v).toFixed(1) : '—', exportText: v => v != null ? Number(v).toFixed(1) : '—' },
    ];
  }

  if (tab !== 'onice') {
    // xGF% appended to Counting/Rates views
    tabCols.push({
      id: 'xgf_pct', header: 'xGF%', accessor: r => r.xgf_pct ?? -1, width: 72, mobileHidden: true,
      cell: (v) => {
        const n = v as number;
        if (n < 0) return <span style={{ color: 'rgba(13,13,20,0.3)' }}>—</span>;
        const col = n >= 55 ? POS : n <= 45 ? NEG : undefined;
        return <strong style={{ color: col }}>{n.toFixed(1)}%</strong>;
      },
      exportText: v => (v as number) >= 0 ? `${(v as number).toFixed(1)}%` : '—',
    });
  } else {
    tabCols = [
      {
        id: 'xgf_pct', header: 'xGF%', accessor: r => r.xgf_pct ?? -1, width: 72,
        cell: (v) => {
          const n = v as number;
          if (n < 0) return <span style={{ color: 'rgba(13,13,20,0.3)' }}>—</span>;
          const col = n >= 55 ? POS : n <= 45 ? NEG : undefined;
          return <strong style={{ color: col }}>{n.toFixed(1)}%</strong>;
        },
        exportText: v => (v as number) >= 0 ? `${(v as number).toFixed(1)}%` : '—',
      },
      { id: 'xgf60', header: 'xGF/60', accessor: r => r.xgf60 ?? null, width: 72,
        cell: v => v != null ? f2(v as number) : <span style={{ color: 'rgba(13,13,20,0.3)' }}>—</span>,
        exportText: v => v != null ? f2(v as number) : '—' },
      { id: 'xga60', header: 'xGA/60', accessor: r => r.xga60 ?? null, width: 72,
        cell: v => v != null ? f2(v as number) : <span style={{ color: 'rgba(13,13,20,0.3)' }}>—</span>,
        exportText: v => v != null ? f2(v as number) : '—' },
      ...(display === 'totals' ? [{
        id: 'gf_diff', header: 'G±', accessor: (r: AggRow) => r.gf_diff ?? null, width: 60,
        cell: (v: string | number | null) => {
          if (v == null) return <span style={{ color: 'rgba(13,13,20,0.3)' }}>—</span>;
          const n = v as number;
          return <span style={{ color: n > 0 ? POS : n < 0 ? NEG : undefined }}>{sgn(n)}{n}</span>;
        },
        exportText: (v: string | number | null) => v != null ? `${sgn(v as number)}${v}` : '—',
      }] : []),
      {
        id: 'gf_diff_60', header: 'G±/60', accessor: r => r.gf_diff_60 ?? null, width: 72,
        cell: v => {
          if (v == null) return <span style={{ color: 'rgba(13,13,20,0.3)' }}>—</span>;
          const n = v as number;
          return <span style={{ color: n > 0 ? POS : n < 0 ? NEG : undefined }}>{n >= 0 ? '+' : ''}{n.toFixed(2)}</span>;
        },
        exportText: v => v != null ? `${(v as number) >= 0 ? '+' : ''}${(v as number).toFixed(2)}` : '—',
      },
    ];
  }

  // Physical / faceoff cols appended always; SkatersTable filters by visiblePhysical
  const physicalCols: HGBColumnDef<AggRow>[] = [
    { id: 'hits',      header: 'Hits',   accessor: r => r.hits,      width: 56, cell: v => String(v ?? '—'), exportText: v => String(v ?? '—') },
    { id: 'blocks',    header: 'BLK',    accessor: r => r.blocks,    width: 52, cell: v => String(v ?? '—'), exportText: v => String(v ?? '—') },
    { id: 'fo_wins',   header: 'FOW',    accessor: r => r.fo_wins,   width: 52, cell: v => String(v ?? '—'), exportText: v => String(v ?? '—') },
    { id: 'fo_losses', header: 'FOL',    accessor: r => r.fo_losses, width: 52, cell: v => String(v ?? '—'), exportText: v => String(v ?? '—') },
    { id: 'fo_pct',    header: 'FO%',    accessor: r => r.fo_pct,    width: 56,
      cell: v => v != null ? `${(v as number).toFixed(1)}%` : <span style={{ color: 'rgba(13,13,20,0.3)' }}>—</span>,
      exportText: v => v != null ? `${(v as number).toFixed(1)}%` : '—' },
  ];

  return [...fixed, ...tabCols, ...physicalCols];
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function SkatersTable({ rows, statsDate, currentSeason, isPlayoffSeason = false }: Props) {
  const [tab,      setTab]      = useState<Tab>('counting');
  const [gameType, setGameType] = useState<GameType>(isPlayoffSeason ? 'playoffs' : 'regular');
  const [pos,      setPos]      = useState<Pos>('all');
  const [strength, setStrength] = useState<Strength>('all');
  const [display,  setDisplay]  = useState<Display>('totals');
  const [topN,         setTopN]         = useState<number | null>(null);
  const [minGP,        setMinGP]        = useState(isPlayoffSeason ? 1 : 20);
  const [minToi,       setMinToi]       = useState(0); // total TOI in minutes
  const [playerFilter, setPlayerFilter] = useState<string[]>([]); // slugs of selected players
  const [teamFilter,   setTeamFilter]   = useState<string[]>([]);
  const [playerSearch, setPlayerSearch] = useState('');
  const [playerDropOpen, setPlayerDropOpen] = useState(false);

  // Multi-season state
  const currentNorm = useMemo(() => normSeason(currentSeason), [currentSeason]);
  const [fromSeason, setFromSeason] = useState<string>(currentNorm);
  const [toSeason,   setToSeason]   = useState<string>(currentNorm);
  const [slimData,   setSlimData]   = useState<SlimData | null>(null);
  const [slimLoading, setSlimLoading] = useState(false);

  // Use the aggregated (slim) dataset for: any playoff view, or any non-current /
  // multi-season regular range. Regular + current single season keeps the fast
  // build-time path untouched.
  const useAgg = gameType === 'playoffs' || fromSeason !== currentNorm || toSeason !== currentNorm;

  // Lazily fetch the slim multi-season payload the first time it's needed.
  useEffect(() => {
    if (!useAgg || slimData || slimLoading) return;
    setSlimLoading(true);
    fetch('/data/skater-season-stats.json')
      .then(r => r.json())
      .then((d: SlimData) => setSlimData(d))
      .catch(() => setSlimData({}))
      .finally(() => setSlimLoading(false));
  }, [useAgg, slimData, slimLoading]);

  // Seed player filter + force regular season from ?player= query param
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const slug = params.get('player');
    if (slug && rows.some(r => r.slug === slug)) {
      setPlayerFilter([slug]);
      setGameType('regular');
      setMinGP(0);
    }
  }, []);

  // Reset minGP when switching game types
  useEffect(() => {
    setMinGP(gameType === 'playoffs' ? 1 : 20);
  }, [gameType]);

  // Aggregated mode does not support Advanced — bounce back if on that tab
  useEffect(() => {
    if (useAgg && tab === 'advanced') setTab('counting');
  }, [useAgg, tab]);
  const isDark = useIsDark();

  // Derived data
  const defaultSort = useMemo(() => {
    const sortMap: Record<Tab, string> = { counting: display === 'per60' ? 'p60' : 'points', rates: 'p60', advanced: 'imp', onice: 'xgf_pct' };
    return { id: sortMap[tab], desc: true };
  }, [tab, gameType, display]);

  // Rows that pass all filters except playerFilter — used as search candidates
  const filteredForSearch = useMemo(() => {
    const gpField = gameType === 'playoffs' ? 'po_gp' : 'gp';
    let r = rows.filter(x => (x[gpField] ?? 0) >= minGP);
    if (minToi > 0) r = r.filter(x => ((x.toi_ev_sec + x.toi_pp_sec + x.toi_pk_sec) / 60) >= minToi);
    if (teamFilter.length > 0) r = r.filter(x => teamFilter.includes(x.team));
    if (pos !== 'all') r = r.filter(x => x.group === pos);
    if (gameType === 'playoffs') r = r.filter(x => x.po_gp != null && x.po_gp > 0);
    return r;
  }, [rows, minGP, minToi, teamFilter, pos, gameType]);

  const filtered = useMemo(() => {
    const gpField = gameType === 'playoffs' ? 'po_gp' : 'gp';
    let r = rows.filter(x => (x[gpField] ?? 0) >= minGP);
    if (minToi > 0) r = r.filter(x => ((x.toi_ev_sec + x.toi_pp_sec + x.toi_pk_sec) / 60) >= minToi);
    if (playerFilter.length > 0) r = r.filter(x => playerFilter.includes(x.slug));
    if (teamFilter.length > 0) r = r.filter(x => teamFilter.includes(x.team));
    if (pos !== 'all') r = r.filter(x => x.group === pos);
    if (gameType === 'playoffs') r = r.filter(x => x.po_gp != null && x.po_gp > 0);
    // topN applied after HGBTable sorting via a post-sort slice — but since we
    // can't hook into HGBTable's sort, sort here by the defaultSort column first
    if (topN) {
      // In playoff mode, column IDs map to po_* fields (same mapping as buildColumns poMap)
      const poMap: Record<string, string> = { goals: 'po_goals', assists: 'po_assists', points: 'po_points', sog: 'po_sog', ixg: 'po_ixg', toi_pg: 'po_toi_pg' };
      const sortField = gameType === 'playoffs' && poMap[defaultSort.id] ? poMap[defaultSort.id] : defaultSort.id;
      r = [...r].sort((a, b) => {
        const av = (a as any)[sortField] ?? -Infinity;
        const bv = (b as any)[sortField] ?? -Infinity;
        return bv - av;
      }).slice(0, topN);
    }
    return r;
  }, [rows, minGP, minToi, playerFilter, teamFilter, pos, gameType, topN, defaultSort.id]);

  // Physical / faceoff + EDGE column visibility — all hidden by default
  const [visiblePhysical, setVisiblePhysical] = useState<Set<PhysicalColId>>(new Set());
  const togglePhysical = (id: PhysicalColId) =>
    setVisiblePhysical(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  const [visibleEdge, setVisibleEdge] = useState<Set<EdgeColId>>(new Set());
  const toggleEdge = (id: EdgeColId) =>
    setVisibleEdge(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  const isAllColHidden = (id: string) =>
    PHYSICAL_COL_DEFS.some(p => p.id === id) ? !visiblePhysical.has(id as PhysicalColId) :
    EDGE_COL_DEFS.some(e => e.id === id)     ? !visibleEdge.has(id as EdgeColId) :
    false;

  const columns = useMemo(
    () => buildColumns(tab, gameType, strength, display, isDark, currentSeason)
      .filter(c => !isAllColHidden(c.id)),
    [tab, gameType, strength, display, isDark, currentSeason, visiblePhysical, visibleEdge],
  );

  // ── Aggregated (multi-season / playoff) path ──────────────────────────────
  const multi = fromSeason !== toSeason;
  const rangeLabel = multi
    ? `${fmtSeasonShort(fromSeason <= toSeason ? fromSeason : toSeason)} → ${fmtSeasonShort(fromSeason <= toSeason ? toSeason : fromSeason)}`
    : fmtSeasonShort(fromSeason);

  const seasonOptions = useMemo(
    () => (slimData ? availableSeasons(slimData, gameType) : [currentNorm]),
    [slimData, gameType, currentNorm],
  );

  // Advanced is not available in aggregated mode; fall back to counting
  const aggTab: Tab = tab === 'advanced' ? 'counting' : tab;

  const aggFiltered = useMemo<AggRow[]>(() => {
    if (!useAgg || !slimData) return [];
    let r = aggregateSeasons(slimData, fromSeason, toSeason, gameType);
    r = r.filter(x => x.gp >= minGP);
    if (minToi > 0) r = r.filter(x => x.toi_pg * x.gp >= minToi);
    if (playerFilter.length > 0) r = r.filter(x => x.slug != null && playerFilter.includes(x.slug));
    if (teamFilter.length > 0) r = r.filter(x => teamFilter.includes(x.team));
    if (pos !== 'all') r = r.filter(x => x.group === pos);
    // Bake strength-specific display values into each row so TanStack sees new
    // data when strength changes (column accessor caching won't stale the values).
    r = r.map(row => {
      const st = getAggStrengthStats(row, strength);
      const gp = row.gp || 1;
      const hr = st.toi_sec / 3600 || 1;
      return {
        ...row,
        goals:  st.g,   assists: st.a,   points: st.g + st.a,
        sog:    st.sog, ixg:     +st.ixg.toFixed(2),
        toi_pg: +(st.toi_sec / gp / 60).toFixed(1),
        g60:    +(st.g / hr).toFixed(2),
        a60:    +(st.a / hr).toFixed(2),
        p60:    +((st.g + st.a) / hr).toFixed(2),
        x60:    +(st.ixg / hr).toFixed(2),
        sog60:  +(st.sog / hr).toFixed(2),
      };
    });
    if (topN) {
      const sortField = aggTab === 'onice' ? 'gf_diff_60' : aggTab === 'rates' || display === 'per60' ? 'p60' : 'points';
      r = [...r].sort((a, b) => ((b as any)[sortField] ?? -Infinity) - ((a as any)[sortField] ?? -Infinity)).slice(0, topN);
    }
    return r;
  }, [useAgg, slimData, fromSeason, toSeason, gameType, minGP, minToi, playerFilter, teamFilter, pos, topN, aggTab, display, strength]);

  const aggColumns = useMemo(
    () => buildAggColumns(aggTab, display, strength, isDark, rangeLabel, multi)
      .filter(c => !isAllColHidden(c.id)),
    [aggTab, display, strength, isDark, rangeLabel, multi, visiblePhysical, visibleEdge],
  );

  const aggDefaultSort = useMemo(() => {
    if (aggTab === 'onice') return { id: 'gf_diff_60', desc: true };
    return { id: aggTab === 'rates' || display === 'per60' ? 'p60' : 'points', desc: true };
  }, [aggTab, display]);

  const tabDisabled = (t: Tab) => useAgg && t === 'advanced';
  const strDisabled = (_s: Strength) => tab === 'advanced' || tab === 'onice';

  const [filtersOpen,  setFiltersOpen]  = useState(true);
  const [findInput, setFindInput] = useState('');
  const [findKey,   setFindKey]   = useState(0);

  // ── Saved filter presets ──────────────────────────────────────────────────
  const [presets,     setPresets]     = useState<FilterPreset[]>([]);
  const [isLoggedIn,  setIsLoggedIn]  = useState(false);
  const [saveMode,    setSaveMode]    = useState(false);
  const [saveName,    setSaveName]    = useState('');

  // Load presets on mount: cloud prefs if logged in, localStorage otherwise.
  // mergeLocalPresets() migrates any local presets up to the cloud (and clears
  // local) before we read the authoritative cloud copy.
  useEffect(() => {
    const token = getSessionToken();
    if (!token) { loadLocalPresets(); return; }
    mergeLocalPresets()
      .then(() => getPrefs())
      .then(prefs => {
        if (!prefs) { loadLocalPresets(); return; }
        setIsLoggedIn(true);
        setPresets((prefs.filter_presets as FilterPreset[]) ?? []);
      })
      .catch(() => loadLocalPresets());
  }, []);

  function loadLocalPresets() {
    try {
      const raw = localStorage.getItem(LOCAL_PRESETS_KEY);
      if (raw) setPresets(JSON.parse(raw));
    } catch {}
  }

  function persistPresets(next: FilterPreset[]) {
    setPresets(next);
    if (isLoggedIn) {
      putPrefs({ filter_presets: next as any });
    } else {
      try { localStorage.setItem(LOCAL_PRESETS_KEY, JSON.stringify(next)); } catch {}
    }
  }

  function currentSnapshot(): FilterSnapshot {
    return { tab, fromSeason, toSeason, gameType, pos, display, strength, minGP, minToi };
  }

  function applyPreset(p: FilterPreset) {
    const f = p.filters;
    setTab(f.tab);
    setFromSeason(f.fromSeason);
    setToSeason(f.toSeason);
    setGameType(f.gameType);
    setPos(f.pos);
    setDisplay(f.display);
    setStrength(f.strength);
    setMinGP(f.minGP);
    setMinToi(f.minToi);
  }

  function savePreset() {
    const name = saveName.trim();
    if (!name) return;
    const next = [...presets.filter(p => p.name !== name), { name, filters: currentSnapshot() }];
    persistPresets(next);
    setSaveName('');
    setSaveMode(false);
  }

  function deletePreset(name: string) {
    persistPresets(presets.filter(p => p.name !== name));
  }

  const jumpToRow = findInput.trim()
    ? { predicate: (r: SkaterRow | AggRow) => r.name.toLowerCase().includes(findInput.trim().toLowerCase()), key: findKey }
    : undefined;


  return (
    <div>
      {/* Zone 1 — always visible: stat tabs + meta + filter toggle */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, paddingBottom: 10, borderBottom: '1px solid rgba(13,13,20,0.1)', marginBottom: 10 }}>
        <FilterChipGroup>
          {(['counting','rates','advanced','onice'] as Tab[]).map(t =>
            <FilterChip key={t} active={tab === t} label={{ counting: 'Counting', rates: 'Rates', advanced: 'Advanced', onice: 'On-Ice 5v5' }[t]} onClick={() => { setTab(t); if (t === 'rates') setDisplay('totals'); }} disabled={tabDisabled(t)} />
          )}
        </FilterChipGroup>
        <div style={{ flex: 1 }} />
        <span style={{ ...MONO, fontSize: 10, color: 'rgba(13,13,20,0.32)', whiteSpace: 'nowrap' }}>
          {useAgg ? (slimLoading ? 'loading…' : `${aggFiltered.length} skaters`) : `${filtered.length} skaters`}
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={() => (document.getElementById('__hgb-csv-hgb-skaters') as HTMLElement)?.click()}
            style={{ ...SEMI, fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '5px 10px', border: '1px solid rgba(13,13,20,0.2)', background: '#fff', color: 'rgba(13,13,20,0.48)', cursor: 'pointer' }}>↓ CSV</button>
          <button onClick={() => (document.getElementById('__hgb-png-hgb-skaters') as HTMLElement)?.click()}
            style={{ ...SEMI, fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '5px 10px', border: '1px solid rgba(13,13,20,0.2)', background: '#fff', color: 'rgba(13,13,20,0.48)', cursor: 'pointer' }}>↓ PNG</button>
        </div>
        <button onClick={() => setFiltersOpen(o => !o)} style={{ ...SEMI, fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '5px 10px', border: '1px solid rgba(13,13,20,0.2)', cursor: 'pointer', background: filtersOpen ? '#0d0d14' : '#fff', color: filtersOpen ? '#EFEEE8' : 'rgba(13,13,20,0.48)', display: 'flex', alignItems: 'center', gap: 5 }}>
          Filters <span style={{ fontSize: 8 }}>{filtersOpen ? '▲' : '▼'}</span>
        </button>
      </div>

      {/* Column toggles — physical/faceoff + EDGE columns, hidden by default */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
        <span style={{ ...SEMI, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(13,13,20,0.35)', marginRight: 2 }}>Cols</span>
        {PHYSICAL_COL_DEFS.map(col => {
          const active = visiblePhysical.has(col.id);
          return (
            <button key={col.id} onClick={() => togglePhysical(col.id)}
              style={{ ...SEMI, fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '4px 8px',
                border: '1px solid rgba(13,13,20,0.2)', cursor: 'pointer',
                background: active ? 'rgba(13,13,20,0.08)' : 'transparent',
                color: active ? '#0d0d14' : 'rgba(13,13,20,0.35)' }}>
              {col.label}
            </button>
          );
        })}
        {!useAgg && (
          <>
            <span style={{ fontSize: 9, color: 'rgba(13,13,20,0.2)', margin: '0 2px' }}>·</span>
            <span style={{ ...SEMI, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(13,13,20,0.35)', marginRight: 2 }}>Edge</span>
            {EDGE_COL_DEFS.map(col => {
              const active = visibleEdge.has(col.id);
              return (
                <button key={col.id} onClick={() => toggleEdge(col.id)}
                  style={{ ...SEMI, fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '4px 8px',
                    border: '1px solid rgba(13,13,20,0.2)', cursor: 'pointer',
                    background: active ? 'rgba(13,13,20,0.08)' : 'transparent',
                    color: active ? '#0d0d14' : 'rgba(13,13,20,0.35)' }}>
                  {col.label}
                </button>
              );
            })}
          </>
        )}
      </div>

      {/* Zone 2 — collapsible filter panel */}
      {filtersOpen && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px 24px', alignItems: 'flex-start', marginBottom: 12 }}>
          <div>
            <FilterLabel text="Game Type" />
            <FilterChipGroup>
              <FilterChip active={gameType === 'regular'}  label="Reg Season" onClick={() => setGameType('regular')} />
              <FilterChip active={gameType === 'playoffs'} label="Playoffs"   onClick={() => { setGameType('playoffs'); setDisplay('totals'); if (tab !== 'counting') setTab('counting'); }} />
            </FilterChipGroup>
          </div>
          <div>
            <FilterLabel text="Season Range" />
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <select value={fromSeason} onChange={e => setFromSeason(e.target.value)}
                style={{ ...SEMI, fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', padding: '5px 8px', border: '1px solid rgba(13,13,20,0.2)', background: '#fff', color: 'rgba(13,13,20,0.72)', cursor: 'pointer' }}>
                {seasonOptions.map(s => <option key={s} value={s}>{fmtSeasonShort(s)}</option>)}
              </select>
              <span style={{ ...SEMI, fontSize: 11, color: 'rgba(13,13,20,0.32)' }}>to</span>
              <select value={toSeason} onChange={e => setToSeason(e.target.value)}
                style={{ ...SEMI, fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', padding: '5px 8px', border: '1px solid rgba(13,13,20,0.2)', background: '#fff', color: 'rgba(13,13,20,0.72)', cursor: 'pointer' }}>
                {seasonOptions.map(s => <option key={s} value={s}>{fmtSeasonShort(s)}</option>)}
              </select>
              {seasonOptions.length > 1 && (
                <button onClick={() => { setFromSeason(seasonOptions[seasonOptions.length - 1]); setToSeason(seasonOptions[0]); }}
                  style={{ ...SEMI, fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '5px 8px', border: '1px solid rgba(13,13,20,0.2)', background: '#fff', color: 'rgba(13,13,20,0.48)', cursor: 'pointer' }}>
                  All time
                </button>
              )}
            </div>
          </div>
          <div>
            <FilterLabel text="Position" />
            <FilterChipGroup>
              <FilterChip active={pos === 'all'} label="All"  onClick={() => setPos('all')} />
              <FilterChip active={pos === 'F'}   label="Fwds" onClick={() => setPos('F')} />
              <FilterChip active={pos === 'D'}   label="Def"  onClick={() => setPos('D')} />
            </FilterChipGroup>
          </div>
          <div>
            <FilterLabel text="Strength" />
            <FilterChipGroup>
              {(['all','5v5','pp','pk'] as Strength[]).map(s =>
                <FilterChip key={s} active={strength === s} label={{ all: 'All', '5v5': '5v5', pp: 'PP', pk: 'PK' }[s]} onClick={() => setStrength(s)} disabled={strDisabled(s)} />
              )}
            </FilterChipGroup>
          </div>
          {tab !== 'rates' && (
          <div>
            <FilterLabel text="Display" />
            <FilterChipGroup>
              <FilterChip active={display === 'totals'} label="Totals" onClick={() => setDisplay('totals')} />
              <FilterChip active={display === 'per60'}  label="Per 60" onClick={() => setDisplay('per60')} disabled={gameType === 'playoffs'} />
            </FilterChipGroup>
          </div>
          )}
          <div>
            <FilterLabel text="Scope" />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <label style={{ ...SEMI, fontSize: 11, fontWeight: 600, color: 'rgba(13,13,20,0.48)', display: 'flex', alignItems: 'center', gap: 5 }}>
                Min GP
                <input type="number" value={minGP} min={0} max={82} onChange={e => setMinGP(Number(e.target.value))}
                  style={{ ...MONO, fontSize: 11, width: 52, padding: '4px 6px', border: '1px solid rgba(13,13,20,0.14)', background: '#fff' }} />
              </label>
              <label style={{ ...SEMI, fontSize: 11, fontWeight: 600, color: 'rgba(13,13,20,0.48)', display: 'flex', alignItems: 'center', gap: 5 }}>
                Min TOI
                <input type="number" value={minToi} min={0} max={9999} step={100} onChange={e => setMinToi(Number(e.target.value))}
                  style={{ ...MONO, fontSize: 11, width: 72, padding: '4px 6px', border: '1px solid rgba(13,13,20,0.14)', background: '#fff' }} />
                <span style={{ color: 'rgba(13,13,20,0.32)' }}>min</span>
              </label>
              <FilterChipGroup>
                {([null,10,20,50] as (number|null)[]).map(n =>
                  <FilterChip key={String(n)} active={topN === n} label={n ? `Top ${n}` : 'All'} onClick={() => setTopN(n)} />
                )}
              </FilterChipGroup>
            </div>
          </div>

          {/* PLAYERS — search-to-add multi-select */}
          <div style={{ position: 'relative' }}>
            <FilterLabel text="Players" />
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
              {playerFilter.map(slug => {
                const p = rows.find(r => r.slug === slug);
                return (
                  <button key={slug} onClick={() => setPlayerFilter(f => f.filter(s => s !== slug))}
                    style={{ ...SEMI, fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '4px 8px', border: '1px solid rgba(13,13,20,0.3)', background: '#0d0d14', color: '#EFEEE8', cursor: 'pointer' }}>
                    {p?.name ?? slug} ×
                  </button>
                );
              })}
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  placeholder="Search players…"
                  value={playerSearch}
                  onChange={e => { setPlayerSearch(e.target.value); setPlayerDropOpen(true); }}
                  onFocus={() => setPlayerDropOpen(true)}
                  onBlur={() => setTimeout(() => setPlayerDropOpen(false), 150)}
                  style={{ ...MONO, fontSize: 11, padding: '5px 10px', border: '1px solid rgba(13,13,20,0.2)', background: '#fff', color: '#0d0d14', outline: 'none', width: 220 }}
                />
                {playerDropOpen && playerSearch.trim().length >= 2 && (() => {
                  const q = playerSearch.toLowerCase();
                  const matches = filteredForSearch.filter(r => !playerFilter.includes(r.slug) && r.searchText.includes(q)).slice(0, 8);
                  if (!matches.length) return null;
                  return (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, background: '#fff', border: '2px solid #0d0d14', boxShadow: '0 4px 12px rgba(13,13,20,0.12)', minWidth: 220 }}>
                      {matches.map(r => (
                        <button key={r.slug} type="button"
                          onMouseDown={e => { e.preventDefault(); setPlayerFilter(f => [...f, r.slug]); setPlayerSearch(''); setPlayerDropOpen(false); }}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 12px', border: 'none', borderBottom: '1px solid rgba(13,13,20,0.06)', background: 'transparent', textAlign: 'left', cursor: 'pointer', fontFamily: 'var(--body)' }}
                          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(13,13,20,0.04)'; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                        >
                          <span style={{ fontFamily: 'var(--body)', fontWeight: 600, fontSize: 13 }}>{r.first_name && r.last_name ? `${r.first_name} ${r.last_name}` : r.name}</span>
                          <span style={{ ...MONO, fontSize: 10, color: 'rgba(13,13,20,0.48)', marginLeft: 'auto', whiteSpace: 'nowrap' }}>{r.team} · {r.pos}</span>
                        </button>
                      ))}
                    </div>
                  );
                })()}
              </div>
              {playerFilter.length > 0 && (
                <button onClick={() => setPlayerFilter([])} style={{ ...SEMI, fontSize: 11, fontWeight: 600, padding: '4px 8px', border: '1px solid rgba(13,13,20,0.14)', background: 'transparent', color: 'rgba(13,13,20,0.48)', cursor: 'pointer' }}>
                  Clear all
                </button>
              )}
            </div>
          </div>

          {/* FIND PLAYER — jump-to-row */}
          <div>
            <FilterLabel text="Find Player" />
            <input
              type="search"
              placeholder="Name → Enter"
              value={findInput}
              onChange={e => setFindInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') setFindKey(k => k + 1); }}
              style={{ ...MONO, fontSize: 11, padding: '5px 10px', border: '1px solid rgba(13,13,20,0.2)', background: '#fff', outline: 'none', width: 140, color: '#0d0d14' }}
            />
          </div>

          {/* TEAM — multi-chip */}
          <div>
            <FilterLabel text="Team" />
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
              {teamFilter.map(t => (
                <button key={t} onClick={() => setTeamFilter(f => f.filter(x => x !== t))}
                  style={{ ...SEMI, fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '4px 8px', border: '1px solid rgba(13,13,20,0.3)', background: '#0d0d14', color: '#EFEEE8', cursor: 'pointer' }}>
                  {t} ×
                </button>
              ))}
              <select value="" onChange={e => { const v = e.target.value; if (v && !teamFilter.includes(v)) setTeamFilter(f => [...f, v]); e.target.value = ''; }}
                style={{ ...SEMI, fontSize: 11, fontWeight: 600, padding: '4px 8px', border: '1px solid rgba(13,13,20,0.2)', background: '#fff', color: 'rgba(13,13,20,0.48)', cursor: 'pointer' }}>
                <option value="">Add team…</option>
                {[...new Set(rows.map(r => r.team))].sort().filter(t => !teamFilter.includes(t)).map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              {teamFilter.length > 0 && (
                <button onClick={() => setTeamFilter([])} style={{ ...SEMI, fontSize: 11, fontWeight: 600, padding: '4px 8px', border: '1px solid rgba(13,13,20,0.14)', background: 'transparent', color: 'rgba(13,13,20,0.48)', cursor: 'pointer' }}>Clear</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Saved filter presets bar ─────────────────────────────────────── */}
      {(presets.length > 0 || filtersOpen) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 10 }}>
          {presets.map(p => (
            <div key={p.name} style={{ display: 'inline-flex', alignItems: 'center', border: '1px solid rgba(13,13,20,0.2)', background: '#fff' }}>
              <button
                onClick={() => applyPreset(p)}
                style={{ ...MONO, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '4px 10px', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(13,13,20,0.72)' }}
              >
                {p.name}
              </button>
              <button
                onClick={() => deletePreset(p.name)}
                style={{ ...MONO, fontSize: 10, padding: '4px 6px 4px 2px', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(13,13,20,0.3)', lineHeight: 1 }}
                title="Delete preset"
              >×</button>
            </div>
          ))}
          {filtersOpen && !saveMode && (
            <button
              onClick={() => { setSaveMode(true); setSaveName(''); }}
              style={{ ...MONO, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '4px 10px', border: '1px dashed rgba(13,13,20,0.2)', background: 'none', cursor: 'pointer', color: 'rgba(13,13,20,0.4)' }}
            >
              + Save filters
            </button>
          )}
          {filtersOpen && saveMode && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <input
                autoFocus
                type="text"
                placeholder="Preset name…"
                value={saveName}
                onChange={e => setSaveName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') savePreset(); if (e.key === 'Escape') setSaveMode(false); }}
                maxLength={40}
                style={{ ...MONO, fontSize: 11, padding: '4px 8px', border: '1px solid rgba(13,13,20,0.3)', background: '#fff', outline: 'none', width: 160, color: '#0d0d14' }}
              />
              <button onClick={savePreset} style={{ ...MONO, fontSize: 10, padding: '4px 10px', border: '1px solid rgba(13,13,20,0.2)', background: '#0d0d14', color: '#EFEEE8', cursor: 'pointer' }}>Save</button>
              <button onClick={() => setSaveMode(false)} style={{ ...MONO, fontSize: 10, padding: '4px 8px', border: '1px solid rgba(13,13,20,0.2)', background: 'none', color: 'rgba(13,13,20,0.48)', cursor: 'pointer' }}>Cancel</button>
            </div>
          )}
        </div>
      )}

      {useAgg && slimLoading ? (
        <div style={{ ...MONO, fontSize: 12, color: 'rgba(13,13,20,0.4)', padding: '48px 0', textAlign: 'center' }}>
          Loading multi-season data…
        </div>
      ) : useAgg ? (
        <HGBTable
          data={aggFiltered}
          columns={aggColumns}
          defaultSort={aggDefaultSort}
          rowHref={r => r.slug ? `/stats/player/${r.slug}` : undefined}
          emptyMessage="No skaters match the current filters."
          exportFilename="hgb-skaters"
          exportTitle="Skaters"
          exportChips={[
            gameType === 'regular' ? 'Reg Season' : 'Playoffs',
            rangeLabel,
            aggTab.charAt(0).toUpperCase() + aggTab.slice(1),
            pos !== 'all' ? (pos === 'F' ? 'Forwards' : 'Defense') : 'All Positions',
            `Min ${minGP} GP`,
            ...(topN ? [`Top ${topN}`] : []),
          ]}
          hideToolbar
          showRank
          virtualize={true}
          jumpToRow={jumpToRow}
        />
      ) : (
        <HGBTable
          data={filtered}
          columns={columns}
          defaultSort={defaultSort}
          rowHref={r => `/stats/player/${r.slug}`}
          emptyMessage="No skaters match the current filters."
          exportFilename="hgb-skaters"
          exportTitle="Skaters"
          exportChips={[
            gameType === 'regular' ? 'Reg Season' : 'Playoffs',
            tab.charAt(0).toUpperCase() + tab.slice(1),
            pos !== 'all' ? (pos === 'F' ? 'Forwards' : 'Defense') : 'All Positions',
            strength !== 'all' ? strength.toUpperCase() : 'All Strengths',
            `Min ${minGP} GP`,
            ...(topN ? [`Top ${topN}`] : []),
          ]}
          hideToolbar
          showRank
          virtualize={true}
          jumpToRow={jumpToRow}
        />
      )}
      {useAgg ? (
        <p style={{ ...MONO, fontSize: 9, color: 'rgba(13,13,20,0.32)', marginTop: 6, letterSpacing: '0.06em' }}>
          {gameType === 'playoffs' ? 'Playoff' : 'Multi-season'} totals · TOI is 5v5 only · per-season ranks hidden when aggregating
        </p>
      ) : statsDate && (
        <p style={{ ...MONO, fontSize: 9, color: 'rgba(13,13,20,0.32)', marginTop: 6, letterSpacing: '0.06em' }}>
          Updated {statsDate} · 5v5 data via HGB Analytics
        </p>
      )}
    </div>
  );
}
