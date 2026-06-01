import React, { useState } from 'react';
import HGBTable, { type HGBColumnDef, TEAM_LOGO_SIZE, TEAM_LOGO_STYLE, NAME_FONT_SIZE, SUBLINE_FONT_SIZE } from './HGBTable';

export type GoalieRow = {
  goalie_id: number;
  name: string;
  team: string;
  sa: number;
  ga: number;
  xga: number;
  gsax: number;
  sv_pct: number | null;
  vs_exp: number | null;
  games: number | null;
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

const COLUMNS: HGBColumnDef<GoalieRow>[] = [
  {
    id: 'name',
    header: 'Goalie',
    accessor: r => r.name,
    align: 'left',
    width: 180,
    cell: (_v, row) => (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <img
          src={`https://assets.nhle.com/logos/nhl/svg/${row.team}_light.svg`}
          width={TEAM_LOGO_SIZE} height={TEAM_LOGO_SIZE}
          style={TEAM_LOGO_STYLE}
          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
          alt={row.team}
        />
        <div>
          <div style={{ fontFamily: "'Barlow', sans-serif", fontWeight: 600, fontSize: NAME_FONT_SIZE }}>{row.name}</div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: SUBLINE_FONT_SIZE, color: 'rgba(13,13,20,0.48)', letterSpacing: '0.06em' }}>{row.team}</div>
        </div>
      </div>
    ),
    sortType: 'string',
  },
  {
    id: 'games',
    header: 'GP',
    accessor: r => r.games,
    align: 'right',
    width: 52,
    cell: v => v != null ? String(v) : '—',
  },
  {
    id: 'sa',
    header: 'SA',
    accessor: r => r.sa,
    align: 'right',
    width: 60,
    cell: v => v != null ? Number(v).toLocaleString() : '—',
  },
  {
    id: 'ga',
    header: 'GA',
    accessor: r => r.ga,
    align: 'right',
    width: 52,
  },
  {
    id: 'xga',
    header: 'xGA',
    accessor: r => r.xga,
    align: 'right',
    width: 64,
    cell: v => v != null ? Number(v).toFixed(2) : '—',
  },
  {
    id: 'gsax',
    header: 'GSAx',
    accessor: r => r.gsax,
    align: 'right',
    width: 72,
    cell: v => (
      <strong style={{ color: gsaxColor(v as number | null), fontVariantNumeric: 'tabular-nums' }}>
        {signed(v as number | null)}
      </strong>
    ),
  },
  {
    id: 'sv_pct',
    header: 'SV%',
    accessor: r => r.sv_pct,
    align: 'right',
    width: 64,
    cell: v => v != null ? Number(v).toFixed(3) : '—',
    mobileHidden: true,
  },
  {
    id: 'vs_exp',
    header: 'vs Exp',
    accessor: r => r.vs_exp,
    align: 'right',
    width: 72,
    cell: v => {
      const n = v as number | null;
      return n != null
        ? <span style={{ color: gsaxColor(n), fontVariantNumeric: 'tabular-nums' }}>{signed(n)}%</span>
        : '—';
    },
    mobileHidden: true,
  },
];

const MONO: React.CSSProperties = { fontFamily: "'JetBrains Mono', monospace" };

export default function GoaliesTable({ regularRows, playoffRows, statsDate, teams }: Props) {
  const [gameType, setGameType] = useState<'regular' | 'playoffs'>('regular');
  const activeRows = gameType === 'regular' ? regularRows : playoffRows;

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
