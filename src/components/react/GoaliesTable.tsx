import React, { useState, useEffect, useMemo } from 'react';
import HGBTable, { type HGBColumnDef, TEAM_LOGO_SIZE, TEAM_LOGO_STYLE, NAME_FONT_SIZE, SUBLINE_FONT_SIZE, teamLogoSrc } from './HGBTable';

export type GoalieRow = {
  goalie_id:   number;
  name:        string;
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
  vs_exp:      number | null;
  games:       number | null;
};

type Props = {
  regularRows: GoalieRow[];
  playoffRows: GoalieRow[];
  statsDate: string | null;
  teams: string[]; // sorted distinct team abbreviations
};

const signed = (v: number | null) =>
  v != null ? (v >= 0 ? `+${v.toFixed(2)}` : v.toFixed(2)) : '—';

const gsaxColor = (v: number | null) =>
  v == null ? undefined : v >= 0 ? '#166534' : '#991b1b';


const MONO: React.CSSProperties = { fontFamily: "'JetBrains Mono', monospace" };

export default function GoaliesTable({ regularRows, playoffRows, statsDate, teams }: Props) {
  const [gameType, setGameType] = useState<'regular' | 'playoffs'>('regular');
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    const check = () => setIsDark(document.documentElement.dataset.theme === 'dark');
    check();
    const obs = new MutationObserver(check);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);
  const activeRows = gameType === 'regular' ? regularRows : playoffRows;

  const COLUMNS = useMemo<HGBColumnDef<GoalieRow>[]>(() => [
    {
      id: 'name', header: 'Goalie', accessor: r => r.name, align: 'left', width: 180,
      cell: (_v, row) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <img src={teamLogoSrc(row.team, isDark)} width={TEAM_LOGO_SIZE} height={TEAM_LOGO_SIZE}
            style={TEAM_LOGO_STYLE} alt={row.team}
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          <div style={{ fontFamily: "'Barlow', sans-serif", fontWeight: 600, fontSize: NAME_FONT_SIZE }}>{row.name}</div>
        </div>
      ),
      sortType: 'string',
    },
    {
      id: 'season', header: 'Season', accessor: r => r.season, align: 'center', width: 72, mobileHidden: true,
      cell: v => { const s = v as string | null; return s ? `${s.slice(2,4)}-${s.slice(6,8)}` : '—'; },
    },
    { id: 'team', header: 'Team', accessor: r => r.team, align: 'center', width: 52 },
    { id: 'gp',  header: 'GP',  accessor: r => r.gp,  align: 'right', width: 48, cell: v => v != null ? String(v) : '—' },
    {
      id: 'toi', header: 'TOI', accessor: r => r.toi_sec, align: 'right', width: 72, mobileHidden: true,
      cell: v => { if (v == null) return '—'; const m = Math.floor(Number(v)/60); const s = Math.round(Number(v)%60); return `${m}:${String(s).padStart(2,'0')}`; },
    },
    { id: 'sa', header: 'SA', accessor: r => r.sa, align: 'right', width: 60, cell: v => v != null ? Number(v).toLocaleString() : '—' },
    { id: 'ga', header: 'GA', accessor: r => r.ga, align: 'right', width: 52 },
    { id: 'gaa', header: 'GAA', accessor: r => r.gaa, align: 'right', width: 60, cell: v => v != null ? Number(v).toFixed(2) : '—', mobileHidden: true },
    { id: 'xga', header: 'xGA', accessor: r => r.xga, align: 'right', width: 64, cell: v => v != null ? Number(v).toFixed(2) : '—', mobileHidden: true },
    {
      id: 'gsax', header: 'GSAx', accessor: r => r.gsax, align: 'right', width: 72,
      cell: v => <strong style={{ color: gsaxColor(v as number | null), fontVariantNumeric: 'tabular-nums' }}>{signed(v as number | null)}</strong>,
    },
    { id: 'gsax_per60', header: 'GSAx/60', accessor: r => r.gsax_per60, align: 'right', width: 80, mobileHidden: true,
      cell: v => { const n = v as number | null; return n != null ? <span style={{ color: gsaxColor(n), fontVariantNumeric: 'tabular-nums' }}>{signed(n)}</span> : '—'; },
    },
    { id: 'sv_pct', header: 'SV%', accessor: r => r.sv_pct, align: 'right', width: 64, cell: v => v != null ? Number(v).toFixed(3) : '—' },
    { id: 'xsv_pct', header: 'xSV%', accessor: r => r.xsv_pct, align: 'right', width: 64, cell: v => v != null ? Number(v).toFixed(3) : '—', mobileHidden: true },
    {
      id: 'dsv_pct', header: 'dSV%', accessor: r => r.dsv_pct, align: 'right', width: 68, mobileHidden: true,
      cell: v => { const n = v as number | null; return n != null ? <span style={{ color: gsaxColor(n), fontVariantNumeric: 'tabular-nums' }}>{n >= 0 ? '+' : ''}{Number(n).toFixed(3)}</span> : '—'; },
    },
  ], [isDark]);

  // Notify vanilla chart section when game type changes
  const switchGameType = (t: 'regular' | 'playoffs') => {
    setGameType(t);
    document.dispatchEvent(new CustomEvent('hgb:goalie-game-type', { detail: t }));
  };

  return (
    <div>
      {/* Toolbar: season type toggle + count */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 0 }}>
          {(['regular', 'playoffs'] as const).map(t => (
            <button key={t} onClick={() => switchGameType(t)}
              style={{ ...MONO, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', padding: '6px 14px', border: '1px solid rgba(13,13,20,0.2)', borderRight: t === 'regular' ? 'none' : undefined, background: gameType === t ? '#0d0d14' : 'transparent', color: gameType === t ? '#EFEEE8' : 'rgba(13,13,20,0.48)', cursor: 'pointer' }}>
              {t === 'regular' ? 'Regular Season' : 'Playoffs'}
            </button>
          ))}
        </div>
        <span style={{ ...MONO, fontSize: 10, color: 'rgba(13,13,20,0.32)', letterSpacing: '0.10em', textTransform: 'uppercase' }}>
          {activeRows.length} goalies{statsDate ? ` · updated ${statsDate}` : ''}
        </span>
      </div>

      <HGBTable
        data={activeRows}
        columns={COLUMNS}
        defaultSort={{ id: 'gsax', desc: true }}
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
        rowHref={r => `/stats/goalies/${r.goalie_id}`}
        exportFilename="hgb-goalies.png"
        maxHeight={760}
        emptyMessage="No goalie data for this selection."
      />
    </div>
  );
}
