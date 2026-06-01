import React, { useState, useEffect, useMemo } from 'react';
import HGBTable, { type HGBColumnDef, TEAM_LOGO_SIZE, TEAM_LOGO_STYLE, teamLogoSrc, NAME_FONT_SIZE } from './HGBTable';

export interface TeamRow {
  team_abbrev: string;
  team_name_full: string;
  team_name_city: string;
  team_name_nickname: string;
  division: string;
  conference: string;
  season: string;
  gp: number;
  wins: number;
  losses: number;
  ot_losses: number;
  points: number;
  gf: number;
  ga: number;
  xgf_all: number;
  xga_all: number;
  xgf_pct_all: number;
  toi_all_sec: number;
  toi_5v5_sec: number;
  gf_5v5: number;
  ga_5v5: number;
  gf_pct_5v5: number;
  xgf_5v5: number;
  xga_5v5: number;
  xgf_pct_5v5: number;
  sf_5v5: number;
  sa_5v5: number;
  sf_pct_5v5: number;
  pp_pct: number;
  pk_pct: number;
  pp_xgf_60: number;
  pk_xga_60: number;
}

type GameType = 'regular' | 'playoffs';
type Strength = 'all' | '5v5';
type Display  = 'totals' | 'per60';

type Props = {
  regularRows:  TeamRow[];
  playoffRows:  TeamRow[];
  statsDate:    string | null;
  availableSeasons: string[];
};

const MONO: React.CSSProperties = { fontFamily: "'JetBrains Mono', monospace" };

function fmtSeason(s: string) {
  // Input format: "2025-26" → display as "25-26"
  return s ? s.slice(2) : '—';
}
function fmtPct(v: number | null) {
  // Values stored as decimals (0.5679 = 56.79%)
  return v != null ? `${(Number(v) * 100).toFixed(1)}%` : '—';
}
function fmtFloat1(v: number | null) {
  return v != null ? Number(v).toFixed(1) : '—';
}
function fmtFloat2(v: number | null) {
  return v != null ? Number(v).toFixed(2) : '—';
}
function pctColor(v: number | null): string | undefined {
  if (v == null) return undefined;
  // v is decimal (0.5679 etc.)
  return v > 0.5 ? '#166534' : v < 0.5 ? '#991b1b' : undefined;
}

// Compute derived display values based on current strength + display toggles
function computeRow(t: TeamRow, strength: Strength, display: Display) {
  const is5v5    = strength === '5v5';
  const isPer60  = display  === 'per60';
  const toi_sec  = is5v5 ? t.toi_5v5_sec : t.toi_all_sec;
  const hours    = toi_sec / 3600;
  const gfRaw    = is5v5 ? t.gf_5v5 : t.gf;
  const gaRaw    = is5v5 ? t.ga_5v5 : t.ga;
  const xgfRaw   = is5v5 ? t.xgf_5v5 : t.xgf_all;
  const xgaRaw   = is5v5 ? t.xga_5v5 : t.xga_all;
  const gf_pct   = is5v5 ? t.gf_pct_5v5  : (gfRaw + gaRaw > 0 ? gfRaw / (gfRaw + gaRaw) * 100 : null);
  const xgf_pct  = is5v5 ? t.xgf_pct_5v5 : (xgfRaw + xgaRaw > 0 ? xgfRaw / (xgfRaw + xgaRaw) * 100 : null);
  const cf_pct   = is5v5 ? t.sf_pct_5v5  : null;

  return {
    ...t,
    gf_pct, xgf_pct, cf_pct,
    record: `${t.wins}-${t.losses}-${t.ot_losses}`,
    gf_display:  isPer60 && hours > 0 ? +(gfRaw  / hours).toFixed(2) : gfRaw,
    ga_display:  isPer60 && hours > 0 ? +(gaRaw  / hours).toFixed(2) : gaRaw,
    xgf_display: isPer60 && hours > 0 ? +(xgfRaw / hours).toFixed(2) : +xgfRaw.toFixed(1),
    xga_display: isPer60 && hours > 0 ? +(xgaRaw / hours).toFixed(2) : +xgaRaw.toFixed(1),
    gf_label:  isPer60 ? 'GF/60'  : 'GF',
    ga_label:  isPer60 ? 'GA/60'  : 'GA',
    xgf_label: isPer60 ? 'xGF/60' : 'xGF',
    xga_label: isPer60 ? 'xGA/60' : 'xGA',
  };
}

export default function TeamsTable({ regularRows, playoffRows, statsDate, availableSeasons }: Props) {
  const sortedSeasons = [...availableSeasons].sort().reverse(); // latest first
  const latestSeason = sortedSeasons[0] ?? '';
  const [gameType, setGameType] = useState<GameType>('regular');
  const [strength, setStrength] = useState<Strength>('5v5');
  const [display,  setDisplay]  = useState<Display>('totals');
  const [season,   setSeason]   = useState<string>(latestSeason);
  const [isDark,   setIsDark]   = useState(false);

  useEffect(() => {
    const check = () => setIsDark(document.documentElement.dataset.theme === 'dark');
    check();
    const obs = new MutationObserver(check);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);

  const baseRows = (gameType === 'regular' ? regularRows : playoffRows)
    .filter(t => !season || t.season === season);

  const rows = useMemo(
    () => baseRows.map(t => computeRow(t, strength, display)),
    [baseRows, strength, display],
  );

  // Dynamic columns based on display label and strength
  const sampleRow = rows[0];
  const gfLabel   = sampleRow?.gf_label  ?? 'GF';
  const gaLabel   = sampleRow?.ga_label  ?? 'GA';
  const xgfLabel  = sampleRow?.xgf_label ?? 'xGF';
  const xgaLabel  = sampleRow?.xga_label ?? 'xGA';

  const COLUMNS = useMemo<HGBColumnDef<ReturnType<typeof computeRow>>[]>(() => [
    {
      id: 'team', header: 'Team', accessor: r => r.team_name_full, align: 'left', width: 200,
      cell: (_v, row) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <img src={teamLogoSrc(row.team_abbrev, isDark)} width={TEAM_LOGO_SIZE} height={TEAM_LOGO_SIZE}
            style={TEAM_LOGO_STYLE} alt={row.team_abbrev}
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          <div style={{ fontFamily: "'Barlow', sans-serif", fontWeight: 600, fontSize: NAME_FONT_SIZE }}>
            {row.team_name_city} {row.team_name_nickname}
          </div>
        </div>
      ),
      sortType: 'string',
    },
    { id: 'season', header: 'Season', accessor: r => r.season, width: 70, cell: v => fmtSeason(v as string) },
    { id: 'gp',     header: 'GP',     accessor: r => r.gp,     width: 48 },
    { id: 'record', header: 'Record', accessor: r => r.record, width: 80, sortType: 'string' },
    {
      id: 'gf_pct',  header: 'GF%',  accessor: r => r.gf_pct,  width: 64,
      cell: v => <span style={{ color: pctColor(v as number | null), fontWeight: 700 }}>{fmtPct(v as number | null)}</span>,
    },
    {
      id: 'xgf_pct', header: 'xGF%', accessor: r => r.xgf_pct, width: 64,
      cell: v => <strong style={{ color: pctColor(v as number | null) }}>{fmtPct(v as number | null)}</strong>,
    },
    ...(strength === '5v5' ? [{
      id: 'cf_pct' as const, header: 'CF%', accessor: (r: any) => r.cf_pct, width: 64,
      cell: (v: any) => <span style={{ color: pctColor(v) }}>{fmtPct(v)}</span>,
    }] : []),
    { id: 'gf_display',  header: gfLabel,  accessor: r => r.gf_display,  width: 64, cell: v => display === 'per60' ? fmtFloat2(v as number | null) : String(v ?? '—') },
    { id: 'ga_display',  header: gaLabel,  accessor: r => r.ga_display,  width: 64, cell: v => display === 'per60' ? fmtFloat2(v as number | null) : String(v ?? '—') },
    { id: 'xgf_display', header: xgfLabel, accessor: r => r.xgf_display, width: 68, cell: v => fmtFloat1(v as number | null) },
    { id: 'xga_display', header: xgaLabel, accessor: r => r.xga_display, width: 68, cell: v => fmtFloat1(v as number | null) },
    // PP/PK only shown in all-situations mode
    ...(strength === 'all' ? [
      { id: 'pp_pct' as const, header: 'PP%', accessor: (r: any) => r.pp_pct, width: 60, mobileHidden: true, cell: (v: any) => fmtPct(v) },
      { id: 'pk_pct' as const, header: 'PK%', accessor: (r: any) => r.pk_pct, width: 60, mobileHidden: true, cell: (v: any) => fmtPct(v) },
    ] : []),
  ], [isDark, strength, display, gfLabel, gaLabel, xgfLabel, xgaLabel]);

  const toggleBtn = (active: boolean, label: string, onClick: () => void) => (
    <button onClick={onClick} style={{ ...MONO, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', padding: '5px 12px', border: '1px solid rgba(13,13,20,0.2)', borderRight: 'none', cursor: 'pointer', background: active ? '#0d0d14' : 'transparent', color: active ? '#EFEEE8' : 'rgba(13,13,20,0.48)' }}>
      {label}
    </button>
  );
  const toggleGroup = (children: React.ReactNode) => (
    <div style={{ display: 'inline-flex', border: '1px solid rgba(13,13,20,0.2)', borderLeft: 'none' }}>{children}</div>
  );

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
        {/* Game type */}
        {toggleGroup(<>
          {toggleBtn(gameType === 'regular',  'Regular Season', () => setGameType('regular'))}
          {toggleBtn(gameType === 'playoffs', 'Playoffs',       () => setGameType('playoffs'))}
        </>)}
        {/* Strength */}
        {toggleGroup(<>
          {toggleBtn(strength === '5v5', '5v5',    () => setStrength('5v5'))}
          {toggleBtn(strength === 'all', 'All Sit', () => setStrength('all'))}
        </>)}
        {/* Display */}
        {toggleGroup(<>
          {toggleBtn(display === 'totals', 'Totals', () => setDisplay('totals'))}
          {toggleBtn(display === 'per60',  'Per 60', () => setDisplay('per60'))}
        </>)}
        {/* Season selector */}
        <select value={season} onChange={e => setSeason(e.target.value)}
          style={{ ...MONO, fontSize: 11, padding: '5px 8px', border: '1px solid rgba(13,13,20,0.2)', background: 'transparent', color: '#0d0d14', cursor: 'pointer' }}>
          {sortedSeasons.map(s => (
            <option key={s} value={s}>{fmtSeason(s)}</option>
          ))}
        </select>
        <span style={{ ...MONO, fontSize: 10, color: 'rgba(13,13,20,0.32)', marginLeft: 'auto' }}>
          {rows.length} teams{statsDate ? ` · updated ${statsDate}` : ''}
        </span>
      </div>

      <HGBTable
        data={rows}
        columns={COLUMNS}
        defaultSort={{ id: 'xgf_pct', desc: true }}
        globalSearchField={r => `${r.team_abbrev} ${r.team_name_full} ${r.team_name_city} ${r.team_name_nickname}`.toLowerCase()}
        searchPlaceholder="Search teams…"
        exportFilename="hgb-teams.png"
        emptyMessage="No team data for this selection."
      />
    </div>
  );
}
