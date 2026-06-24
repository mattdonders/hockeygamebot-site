import React, { useState, useEffect, useMemo } from 'react';
import HGBTable, { type HGBColumnDef, TEAM_LOGO_SIZE, TEAM_LOGO_STYLE, NAME_FONT_SIZE, teamLogoSrc } from './HGBTable';
import { fmtSeasonShort } from '../../lib/format-season';
import { MONO, useIsDark, FilterChip, FilterChipGroup, FilterLabel } from './FilterPrimitives';

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
  sc_against:  number | null;
  hdc_against: number | null;
  hdg_allowed: number | null;
  hd_sv_pct:   number | null;
  vs_exp:      number | null;
  games:       number | null;
};

type Props = {
  regularRows: GoalieRow[];
  playoffRows: GoalieRow[];
  statsDate: string | null;
  teams: string[];
  compact?: boolean;
  defaultGameType?: 'regular' | 'playoffs';
};

type Display = 'totals' | 'per60';

const signed = (v: number | null) =>
  v != null ? (v >= 0 ? `+${v.toFixed(2)}` : v.toFixed(2)) : '—';

const gsaxColor = (v: number | null) =>
  v == null ? undefined : v >= 0 ? '#166534' : '#991b1b';

export default function GoaliesTable({ regularRows, playoffRows, statsDate, teams, compact = false, defaultGameType = 'regular' }: Props) {
  const [gameType, setGameType] = useState<'regular' | 'playoffs'>(defaultGameType);
  const [display,  setDisplay]  = useState<Display>('totals');
  const [minGP,    setMinGP]    = useState(defaultGameType === 'playoffs' ? 1 : 10);
  const [topN,     setTopN]     = useState<number | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const isDark = useIsDark();

  // Reset minGP when switching game types
  useEffect(() => {
    setMinGP(gameType === 'playoffs' ? 1 : 10);
    if (gameType === 'playoffs') setDisplay('totals');
  }, [gameType]);

  const switchGameType = (t: 'regular' | 'playoffs') => {
    setGameType(t);
    document.dispatchEvent(new CustomEvent('hgb:goalie-game-type', { detail: t }));
  };

  const isPer60 = display === 'per60' && gameType === 'regular';
  const baseRows = gameType === 'regular' ? regularRows : playoffRows;

  const filteredRows = useMemo(() => {
    let r = baseRows.filter(g => (g.gp ?? 0) >= minGP);
    if (topN) r = r.slice(0, topN);
    return r;
  }, [baseRows, minGP, topN]);

  const COLUMNS = useMemo<HGBColumnDef<GoalieRow>[]>(() => {
    const saLabel   = isPer60 ? 'SA/60'    : 'SA';
    const gaLabel   = isPer60 ? 'GA/60'    : 'GA';
    const gsaxLabel = isPer60 ? 'GSAx/60'  : 'GSAx';

    const saVal   = (r: GoalieRow) => {
      if (!isPer60) return r.sa;
      const hr = r.toi_sec != null ? r.toi_sec / 3600 : null;
      return hr && hr > 0 ? +(r.sa / hr).toFixed(2) : null;
    };
    const gaVal   = (r: GoalieRow) => {
      if (!isPer60) return r.ga;
      const hr = r.toi_sec != null ? r.toi_sec / 3600 : null;
      return hr && hr > 0 ? +(r.ga / hr).toFixed(2) : null;
    };
    const gsaxVal = (r: GoalieRow) => isPer60 ? r.gsax_per60 : r.gsax;

    return [
      {
        id: 'name', header: 'Goalie', accessor: r => r.name, align: 'left', width: 180,
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
      {
        id: 'season', header: 'Season', accessor: r => r.season, align: 'center', width: 72, mobileHidden: true,
        cell: v => fmtSeasonShort(v as string), exportText: v => fmtSeasonShort(String(v ?? '')),
      },
      { id: 'team', header: 'Team', accessor: r => r.team, align: 'center', width: 52 },
      { id: 'gp',  header: 'GP',   accessor: r => r.gp,  align: 'center', width: 48, cell: v => v != null ? String(v) : '—' },
      {
        id: 'toi', header: 'TOI', accessor: r => r.toi_sec, align: 'center', width: 72, mobileHidden: true,
        cell: v => { if (v == null) return '—'; const t = Math.round(Number(v)); return `${Math.floor(t/60)}:${String(t%60).padStart(2,'0')}`; },
        exportText: v => { if (v == null) return '—'; const t = Math.round(Number(v)); return `${Math.floor(t/60)}:${String(t%60).padStart(2,'0')}`; },
      },
      { id: 'sa',  header: saLabel, accessor: saVal,  align: 'center', width: 64,  cell: v => v != null ? (isPer60 ? Number(v).toFixed(1) : Number(v).toLocaleString()) : '—' },
      { id: 'ga',  header: gaLabel, accessor: gaVal,  align: 'center', width: 52,  cell: v => v != null ? (isPer60 ? Number(v).toFixed(2) : String(v)) : '—' },
      { id: 'gaa', header: 'GAA',   accessor: r => r.gaa, align: 'center', width: 60, cell: v => v != null ? Number(v).toFixed(2) : '—', mobileHidden: true },
      { id: 'xga', header: 'xGA',   accessor: r => r.xga, align: 'center', width: 64, cell: v => v != null ? Number(v).toFixed(2) : '—', mobileHidden: true },
      {
        id: 'gsax', header: gsaxLabel, accessor: gsaxVal, align: 'center', width: isPer60 ? 88 : 72,
        cell: v => <strong style={{ color: gsaxColor(v as number | null), fontVariantNumeric: 'tabular-nums' }}>{signed(v as number | null)}</strong>,
      },
      { id: 'sv_pct',  header: 'SV%',  accessor: r => r.sv_pct,  align: 'center', width: 64, cell: v => v != null ? Number(v).toFixed(3) : '—' },
      { id: 'xsv_pct', header: 'xSV%', accessor: r => r.xsv_pct, align: 'center', width: 64, cell: v => v != null ? Number(v).toFixed(3) : '—', mobileHidden: true },
      {
        id: 'dsv_pct', header: 'dSV%', accessor: r => r.dsv_pct, align: 'center', width: 68, mobileHidden: true,
        cell: v => { const n = v as number | null; return n != null ? <span style={{ color: gsaxColor(n), fontVariantNumeric: 'tabular-nums' }}>{n >= 0 ? '+' : ''}{Number(n).toFixed(3)}</span> : '—'; },
      },
      // Hidden-by-default columns — exposed via "Columns" toggle
      { id: 'sa_5v5', header: '5v5 SA', accessor: r => r.sa_5v5, align: 'center', width: 64, defaultHidden: true,
        cell: v => v != null ? Number(v).toLocaleString() : '—', mobileHidden: true },
      { id: 'ga_5v5', header: '5v5 GA', accessor: r => r.ga_5v5, align: 'center', width: 64, defaultHidden: true,
        cell: v => v != null ? String(v) : '—', mobileHidden: true },
      { id: 'hd_sv_pct', header: 'HD SV%', accessor: r => r.hd_sv_pct, align: 'center', width: 72, defaultHidden: true,
        cell: v => v != null ? Number(v).toFixed(3) : '—', mobileHidden: true },
      { id: 'hdc_against', header: 'HDC-A', accessor: r => r.hdc_against, align: 'center', width: 64, defaultHidden: true,
        cell: v => v != null ? Number(v).toLocaleString() : '—', mobileHidden: true },
      { id: 'sc_against', header: 'SC-A', accessor: r => r.sc_against, align: 'center', width: 60, defaultHidden: true,
        cell: v => v != null ? Number(v).toLocaleString() : '—', mobileHidden: true },
    ];
  }, [isDark, isPer60]);

  const defaultSort = useMemo(() => ({ id: isPer60 ? 'gsax' : 'gsax', desc: true }), [isPer60]);

  return (
    <div>
      {/* Zone 1 — game type + count + filter toggle */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, paddingBottom: 10, borderBottom: '1px solid rgba(13,13,20,0.1)', marginBottom: 10 }}>
        <FilterChipGroup>
          <FilterChip active={gameType === 'regular'}  label="Reg Season" onClick={() => switchGameType('regular')} />
          <FilterChip active={gameType === 'playoffs'} label="Playoffs"   onClick={() => switchGameType('playoffs')} />
        </FilterChipGroup>
        <div style={{ flex: 1 }} />
        <span style={{ ...MONO, fontSize: 10, color: 'rgba(13,13,20,0.32)', whiteSpace: 'nowrap' }}>
          {filteredRows.length} goalies{statsDate ? ` · updated ${statsDate}` : ''}
        </span>
        <button onClick={() => setFiltersOpen(o => !o)} style={{ ...MONO, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '5px 10px', border: '1px solid rgba(13,13,20,0.2)', cursor: 'pointer', background: filtersOpen ? '#0d0d14' : '#fff', color: filtersOpen ? '#EFEEE8' : 'rgba(13,13,20,0.48)', display: 'flex', alignItems: 'center', gap: 5 }}>
          Filters <span style={{ fontSize: 8 }}>{filtersOpen ? '▲' : '▼'}</span>
        </button>
      </div>

      {/* Zone 2 — collapsible filter panel */}
      {filtersOpen && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px 24px', alignItems: 'flex-start', marginBottom: 12 }}>
          {gameType === 'regular' && (
          <div>
            <FilterLabel text="Display" />
            <FilterChipGroup>
              <FilterChip active={display === 'totals'} label="Totals" onClick={() => setDisplay('totals')} />
              <FilterChip active={display === 'per60'}  label="Per 60" onClick={() => setDisplay('per60')} />
            </FilterChipGroup>
          </div>
          )}
          <div>
            <FilterLabel text="Scope" />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <label style={{ ...MONO, fontSize: 10, color: 'rgba(13,13,20,0.48)', display: 'flex', alignItems: 'center', gap: 5 }}>
                Min GP
                <input type="number" value={minGP} min={0} max={82} onChange={e => setMinGP(Number(e.target.value))}
                  style={{ ...MONO, fontSize: 11, width: 52, padding: '4px 6px', border: '1px solid rgba(13,13,20,0.14)', background: '#fff' }} />
              </label>
              <FilterChipGroup>
                {([null, 10, 20] as (number | null)[]).map(n =>
                  <FilterChip key={String(n)} active={topN === n} label={n ? `Top ${n}` : 'All'} onClick={() => setTopN(n)} />
                )}
              </FilterChipGroup>
            </div>
          </div>
        </div>
      )}

      <HGBTable
        data={filteredRows}
        columns={COLUMNS}
        defaultSort={defaultSort}
        globalSearchField={r => `${r.name} ${r.team}`.toLowerCase()}
        searchPlaceholder="Search by name or team…"
        filters={[
          {
            type: 'select',
            label: 'Team',
            field: r => r.team,
            options: teams.map(t => ({ label: t, value: t })),
          },
        ]}
        rowHref={r => `/stats/goalies/${r.slug || `goalie-${r.goalie_id}`}`}
        exportFilename="hgb-goalies"
        exportTitle="Goalies"
        exportChips={[gameType === 'regular' ? 'Reg Season' : 'Playoffs', isPer60 ? 'Per 60' : 'Totals']}
        emptyMessage="No goalie data for this selection."
        {...(!compact && { virtualize: true })}
      />
    </div>
  );
}
