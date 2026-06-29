import React, { useState, useMemo, useRef, useCallback } from 'react';
import HGBTable, { type HGBColumnDef, TEAM_LOGO_SIZE, TEAM_LOGO_STYLE, NAME_FONT_SIZE, teamLogoSrc } from './HGBTable';
import { fmtSeasonShort } from '../../lib/format-season';
import { MONO, SEMI, useIsDark, FilterChip, FilterChipGroup, FilterLabel } from './FilterPrimitives';
import GameTypeFilter from './GameTypeFilter';
import TopNFilter from './TopNFilter';

export type GoalieRow = {
  goalie_id:   number;
  slug:        string | null;
  name:        string;
  first_name:  string | null;
  last_name:   string | null;
  team:        string;
  season:      string | null;
  gp:          number | null;
  toi_sec:     number | null;
  sa:          number;
  saves:       number | null;
  ga:          number;
  xga:         number;
  gsax:        number;
  gsax_per60:  number | null;
  sv_pct:      number | null;
  xsv_pct:     number | null;
  dsv_pct:     number | null;
  gaa:         number | null;
  sa_5v5:      number | null;
  ga_5v5:      number | null;
  sog_5v5:     number | null;
  xga_5v5:     number | null;
  gsax_5v5:    number | null;
  sv_pct_5v5:  number | null;
  toi_5v5_sec: number | null;
  sc_against:  number | null;
  hdc_against: number | null;
  hdg_allowed: number | null;
  hd_sv_pct:   number | null;
  vs_exp:      number | null;
  games:       number | null;
};

type Props = {
  regularRows:      GoalieRow[];
  playoffRows:      GoalieRow[];
  statsDate:        string | null;
  teams:            string[];
  seasons?:         string[];
  compact?:         boolean;
  defaultGameType?: 'regular' | 'playoffs';
};

type Display  = 'totals' | 'per60';
type Strength = 'all' | '5v5';

const OPTIONAL_COL_DEFS = [
  { id: 'xga',          label: 'xGA'   },
  { id: 'xsv_pct',      label: 'xSV%'  },
  { id: 'dsv_pct',      label: 'dSV%'  },
  { id: 'hd_sv_pct',    label: 'HD SV%' },
  { id: 'hdc_against',  label: 'HDC-A' },
  { id: 'sc_against',   label: 'SC-A'  },
] as const;
type OptionalColId = typeof OPTIONAL_COL_DEFS[number]['id'];

const signed = (v: number | null) =>
  v != null ? (v >= 0 ? `+${v.toFixed(2)}` : v.toFixed(2)) : '—';

const gsaxColor = (v: number | null) =>
  v == null ? undefined : v >= 0 ? '#166534' : '#991b1b';

export default function GoaliesTable({ regularRows, playoffRows, statsDate, teams, seasons = ['2025-26'], compact = false, defaultGameType = 'regular' }: Props) {
  const [gameType,        setGameType]        = useState<'regular' | 'playoffs'>(defaultGameType);
  const [display,         setDisplay]         = useState<Display>('totals');
  const [strength,        setStrength]        = useState<Strength>('all');
  const [fromSeason,      setFromSeason]      = useState(seasons[seasons.length - 1]);
  const [toSeason,        setToSeason]        = useState(seasons[0]);
  const [minGP,           setMinGP]           = useState(defaultGameType === 'playoffs' ? 1 : 10);
  const [topN,            setTopN]            = useState<number | null>(null);
  const [teamFilter,      setTeamFilter]      = useState<string[]>([]);
  const [findInput,       setFindInput]       = useState('');
  const [findKey,         setFindKey]         = useState(0);
  const [filtersOpen,     setFiltersOpen]     = useState(true);
  const [visibleOptional, setVisibleOptional] = useState<Set<OptionalColId>>(new Set());
  const isDark = useIsDark();
  const exportFnsRef = useRef<{ exportCsv: () => void; exportPng: () => void } | null>(null);
  const handleExportReady = useCallback((fns: { exportCsv: () => void; exportPng: () => void }) => {
    exportFnsRef.current = fns;
  }, []);

  const switchGameType = (t: 'regular' | 'playoffs') => {
    setGameType(t);
    if (t === 'playoffs') setDisplay('totals');
    setMinGP(t === 'playoffs' ? 1 : 10);
    document.dispatchEvent(new CustomEvent('hgb:goalie-game-type', { detail: t }));
  };

  const toggleOptional = (id: OptionalColId) =>
    setVisibleOptional(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  const isOptionalHidden = (id: string) =>
    OPTIONAL_COL_DEFS.some(c => c.id === id) ? !visibleOptional.has(id as OptionalColId) : false;

  // Per60 only valid for regular season all-situations
  const isPer60 = display === 'per60' && gameType === 'regular' && strength === 'all';
  const per60Disabled = gameType === 'playoffs' || strength === '5v5';

  const baseRows = gameType === 'regular' ? regularRows : playoffRows;

  const filteredRows = useMemo(() => {
    let r = baseRows.filter(g => (g.gp ?? 0) >= minGP);
    if (teamFilter.length > 0) r = r.filter(g => teamFilter.includes(g.team));
    if (topN) r = r.slice(0, topN);
    return r;
  }, [baseRows, minGP, teamFilter, topN]);

  const jumpToRow = findInput.trim()
    ? { predicate: (r: GoalieRow) => r.name.toLowerCase().includes(findInput.trim().toLowerCase()), key: findKey }
    : undefined;

  const COLUMNS = useMemo<HGBColumnDef<GoalieRow>[]>(() => {
    const is5v5 = strength === '5v5';

    const saLabel   = is5v5 ? '5v5 SA' : (isPer60 ? 'SA/60'   : 'SA');
    const gaLabel   = is5v5 ? '5v5 GA' : (isPer60 ? 'GA/60'   : 'GA');
    const gsaxLabel = is5v5 ? '5v5 GSAx' : (isPer60 ? 'GSAx/60' : 'GSAx');

    const saVal = (r: GoalieRow) => {
      if (is5v5) return r.sa_5v5;
      if (!isPer60) return r.sa;
      const hr = r.toi_sec != null ? r.toi_sec / 3600 : null;
      return hr && hr > 0 ? +(r.sa / hr).toFixed(2) : null;
    };
    const gaVal = (r: GoalieRow) => {
      if (is5v5) return r.ga_5v5;
      if (!isPer60) return r.ga;
      const hr = r.toi_sec != null ? r.toi_sec / 3600 : null;
      return hr && hr > 0 ? +(r.ga / hr).toFixed(2) : null;
    };
    const svPctVal = (r: GoalieRow) => {
      if (is5v5) {
        // Use pre-computed sv_pct_5v5 (SOG-denominator) when available;
        // fall back to computing from sog_5v5/ga_5v5 for legacy records.
        if (r.sv_pct_5v5 != null) return r.sv_pct_5v5;
        const sog = r.sog_5v5, ga = r.ga_5v5;
        return sog != null && ga != null && sog > 0 ? +((sog - ga) / sog).toFixed(4) : null;
      }
      return r.sv_pct;
    };
    const gsaxVal = (r: GoalieRow) => {
      if (is5v5) return r.gsax_5v5;
      return isPer60 ? r.gsax_per60 : r.gsax;
    };

    const all: HGBColumnDef<GoalieRow>[] = [
      {
        id: 'name', header: 'Goalie', accessor: r => r.name, align: 'left', width: 180,
        cell: (_v, row) => (
          <div style={{ fontFamily: 'var(--body)', fontWeight: 600, fontSize: NAME_FONT_SIZE }}>
            {row.first_name && row.last_name ? `${row.first_name} ${row.last_name}` : row.name}
          </div>
        ),
        exportText: (_v, row) => row.first_name && row.last_name ? `${row.first_name} ${row.last_name}` : row.name,
        sortType: 'string',
      },
      {
        id: 'season', header: 'Season', accessor: r => r.season, align: 'center', width: 72, mobileHidden: true,
        cell: v => fmtSeasonShort(v as string), exportText: v => fmtSeasonShort(String(v ?? '')),
      },
      { id: 'team', header: 'Team', accessor: r => r.team, align: 'center', width: 70,
        cell: (_v, row) => (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, justifyContent: 'center' }}>
            <img src={teamLogoSrc(row.team, isDark)} width={28} height={28} style={TEAM_LOGO_STYLE} alt="" />
            <span>{row.team}</span>
          </div>
        ),
        exportText: (_v, row) => row.team,
      },
      { id: 'gp',   header: 'GP',   accessor: r => r.gp,  align: 'center', width: 48, cell: v => v != null ? String(v) : '—' },
      {
        id: 'toi', header: 'TOI', accessor: r => is5v5 ? r.toi_5v5_sec : r.toi_sec, align: 'center', width: 72, mobileHidden: true,
        cell: v => { if (v == null) return '—'; const t = Math.round(Number(v)); return `${Math.floor(t/60)}:${String(t%60).padStart(2,'0')}`; },
        exportText: v => { if (v == null) return '—'; const t = Math.round(Number(v)); return `${Math.floor(t/60)}:${String(t%60).padStart(2,'0')}`; },
      },
      {
        id: 'sa', header: saLabel, accessor: saVal, align: 'center', width: 64,
        cell: v => v != null ? (isPer60 ? Number(v).toFixed(1) : Number(v).toLocaleString()) : '—',
      },
      {
        id: 'ga', header: gaLabel, accessor: gaVal, align: 'center', width: 52,
        cell: v => v != null ? (isPer60 ? Number(v).toFixed(2) : String(v)) : '—',
      },
      ...(!is5v5 ? [{ id: 'gaa', header: 'GAA', accessor: (r: GoalieRow) => r.gaa, align: 'center' as const, width: 60, mobileHidden: true,
        cell: (v: string | number | null) => v != null ? Number(v).toFixed(2) : '—' }] : []),
      // Optional columns — toggled via Cols row
      { id: 'xga', header: is5v5 ? '5v5 xGA' : 'xGA', accessor: r => is5v5 ? r.xga_5v5 : r.xga, align: 'center', width: 64, mobileHidden: true,
        cell: v => v != null ? Number(v).toFixed(2) : '—' },
      {
        id: 'gsax', header: gsaxLabel, accessor: gsaxVal, align: 'center', width: isPer60 ? 88 : 72,
        cell: v => <strong style={{ color: gsaxColor(v as number | null), fontVariantNumeric: 'tabular-nums' }}>{signed(v as number | null)}</strong>,
      },
      {
        id: 'sv_pct', header: is5v5 ? '5v5 SV%' : 'SV%', accessor: svPctVal, align: 'center', width: 64,
        cell: v => v != null ? Number(v).toFixed(3) : '—',
      },
      { id: 'xsv_pct', header: 'xSV%', accessor: r => r.xsv_pct, align: 'center', width: 64, mobileHidden: true,
        cell: v => v != null ? Number(v).toFixed(3) : '—' },
      {
        id: 'dsv_pct', header: 'dSV%', accessor: r => r.dsv_pct, align: 'center', width: 68, mobileHidden: true,
        cell: v => { const n = v as number | null; return n != null ? <span style={{ color: gsaxColor(n), fontVariantNumeric: 'tabular-nums' }}>{n >= 0 ? '+' : ''}{Number(n).toFixed(3)}</span> : '—'; },
      },
      { id: 'hd_sv_pct',   header: 'HD SV%', accessor: r => r.hd_sv_pct,   align: 'center', width: 72, mobileHidden: true,
        cell: v => v != null ? Number(v).toFixed(3) : '—' },
      { id: 'hdc_against', header: 'HDC-A',  accessor: r => r.hdc_against, align: 'center', width: 64, mobileHidden: true,
        cell: v => v != null ? Number(v).toLocaleString() : '—' },
      { id: 'sc_against',  header: 'SC-A',   accessor: r => r.sc_against,  align: 'center', width: 60, mobileHidden: true,
        cell: v => v != null ? Number(v).toLocaleString() : '—' },
    ];

    return all.filter(c => !isOptionalHidden(c.id));
  }, [isDark, isPer60, strength, visibleOptional]);

  const defaultSort = useMemo(() => ({ id: 'gsax', desc: true }), []);
  const availableTeams = [...new Set(baseRows.map(r => r.team))].sort();

  return (
    <div>
      {/* Zone 1 — game type + count + exports + filter toggle */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, paddingBottom: 10, borderBottom: '1px solid rgba(13,13,20,0.1)', marginBottom: 10 }}>
        <GameTypeFilter value={gameType} onChange={switchGameType} />
        <div style={{ flex: 1 }} />
        <span style={{ ...MONO, fontSize: 10, color: 'rgba(13,13,20,0.32)', whiteSpace: 'nowrap' }}>
          {filteredRows.length} goalies
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={() => exportFnsRef.current?.exportCsv()}
            style={{ ...SEMI, fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '5px 10px', border: '1px solid rgba(13,13,20,0.2)', background: '#fff', color: 'rgba(13,13,20,0.48)', cursor: 'pointer' }}>↓ CSV</button>
          <button onClick={() => exportFnsRef.current?.exportPng()}
            style={{ ...SEMI, fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '5px 10px', border: '1px solid rgba(13,13,20,0.2)', background: '#fff', color: 'rgba(13,13,20,0.48)', cursor: 'pointer' }}>↓ PNG</button>
        </div>
        <button onClick={() => setFiltersOpen(o => !o)} style={{ ...SEMI, fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '5px 10px', border: '1px solid rgba(13,13,20,0.2)', cursor: 'pointer', background: filtersOpen ? '#0d0d14' : '#fff', color: filtersOpen ? '#EFEEE8' : 'rgba(13,13,20,0.48)', display: 'flex', alignItems: 'center', gap: 5 }}>
          Filters <span style={{ fontSize: 8 }}>{filtersOpen ? '▲' : '▼'}</span>
        </button>
      </div>

      {/* Cols toggle row — always visible */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
        <span style={{ ...SEMI, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(13,13,20,0.35)', marginRight: 2 }}>Cols</span>
        {OPTIONAL_COL_DEFS.map(col => {
          const active = visibleOptional.has(col.id);
          return (
            <button key={col.id} onClick={() => toggleOptional(col.id)}
              style={{ ...SEMI, fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '4px 8px',
                border: '1px solid rgba(13,13,20,0.2)', cursor: 'pointer',
                background: active ? 'rgba(13,13,20,0.08)' : 'transparent',
                color: active ? '#0d0d14' : 'rgba(13,13,20,0.35)' }}>
              {col.label}
            </button>
          );
        })}
      </div>

      {/* Zone 2 — collapsible filter panel, two explicit rows */}
      {filtersOpen && (
        <div style={{ marginBottom: 12 }}>

          {/* Row 1 — Season Range | Strength | Display */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px 24px', alignItems: 'flex-start', marginBottom: 14 }}>
            <div>
              <FilterLabel text="Season Range" />
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <select value={fromSeason} onChange={e => setFromSeason(e.target.value)}
                  style={{ ...SEMI, fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', padding: '5px 8px', border: '1px solid rgba(13,13,20,0.2)', background: '#fff', color: 'rgba(13,13,20,0.72)', cursor: 'pointer' }}>
                  {seasons.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <span style={{ ...SEMI, fontSize: 11, color: 'rgba(13,13,20,0.32)' }}>to</span>
                <select value={toSeason} onChange={e => setToSeason(e.target.value)}
                  style={{ ...SEMI, fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', padding: '5px 8px', border: '1px solid rgba(13,13,20,0.2)', background: '#fff', color: 'rgba(13,13,20,0.72)', cursor: 'pointer' }}>
                  {seasons.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            <div>
              <FilterLabel text="Strength" />
              <FilterChipGroup>
                <FilterChip active={strength === 'all'} label="All" onClick={() => setStrength('all')} />
                <FilterChip active={strength === '5v5'} label="5v5" onClick={() => { setStrength('5v5'); setDisplay('totals'); }} />
              </FilterChipGroup>
            </div>

            <div>
              <FilterLabel text="Display" />
              <FilterChipGroup>
                <FilterChip active={display === 'totals'} label="Totals" onClick={() => setDisplay('totals')} />
                <FilterChip active={display === 'per60'}  label="Per 60" onClick={() => setDisplay('per60')} disabled={per60Disabled} />
              </FilterChipGroup>
            </div>
          </div>

          {/* Row 2 — Scope | Find Goalie | Team */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px 24px', alignItems: 'flex-start' }}>
            <div>
              <FilterLabel text="Scope" />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <label style={{ ...SEMI, fontSize: 11, fontWeight: 600, color: 'rgba(13,13,20,0.48)', display: 'flex', alignItems: 'center', gap: 5 }}>
                  Min GP
                  <input type="number" value={minGP} min={0} max={82} onChange={e => setMinGP(Number(e.target.value))}
                    style={{ ...MONO, fontSize: 11, width: 52, padding: '4px 6px', border: '1px solid rgba(13,13,20,0.14)', background: '#fff' }} />
                </label>
                <TopNFilter value={topN} onChange={setTopN} />
              </div>
            </div>

            <div>
              <FilterLabel text="Find Goalie" />
              <input
                type="search"
                placeholder="Name → Enter"
                value={findInput}
                onChange={e => setFindInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') setFindKey(k => k + 1); }}
                style={{ ...MONO, fontSize: 11, padding: '5px 10px', border: '1px solid rgba(13,13,20,0.2)', background: '#fff', outline: 'none', width: 140, color: '#0d0d14' }}
              />
            </div>

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
                  {availableTeams.filter(t => !teamFilter.includes(t)).map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                {teamFilter.length > 0 && (
                  <button onClick={() => setTeamFilter([])} style={{ ...SEMI, fontSize: 11, fontWeight: 600, padding: '4px 8px', border: '1px solid rgba(13,13,20,0.14)', background: 'transparent', color: 'rgba(13,13,20,0.48)', cursor: 'pointer' }}>Clear</button>
                )}
              </div>
            </div>
          </div>

        </div>
      )}

      <HGBTable
        key={strength}
        data={filteredRows}
        columns={COLUMNS}
        defaultSort={defaultSort}
        showRank
        toolbar={{ show: false }}
        onExportReady={handleExportReady}
        jumpToRow={jumpToRow}
        rowHref={r => `/stats/goalies/${r.slug || `goalie-${r.goalie_id}`}`}
        exportFilename="hgb-goalies"
        exportTitle="Goalies"
        exportChips={[
          gameType === 'regular' ? 'Reg Season' : 'Playoffs',
          strength === '5v5' ? '5v5' : undefined,
          isPer60 ? 'Per 60' : 'Totals',
        ].filter(Boolean) as string[]}
        emptyMessage="No goalie data for this selection."
        {...(!compact && { virtualize: true })}
      />
    </div>
  );
}
