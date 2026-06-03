import React, { useState, useMemo } from 'react';
import HGBTable, { type HGBColumnDef } from './HGBTable';
import { fmtSeasonShort } from '../../lib/format-season';

export type SeriesRecord = {
  rank: number;
  season: string;
  round: number;
  round_name: string;
  team: string;
  opponent: string;
  winner: string;
  games: number;
  xgf_5v5: number;
  xga_5v5: number;
  xgf_pct: number;
  gf: number;
  ga: number;
  series_slug: string;
  series_page_url: string;
};

type Props = {
  series: SeriesRecord[];
  scope: string;
  totalSeries: number;
};

const MONO: React.CSSProperties = { fontFamily: "'JetBrains Mono', monospace" };
const POS = '#166534', NEG = '#991b1b';

const ROUND_MAP: Record<number, string> = { 1: 'R1', 2: 'R2', 3: 'CF', 4: 'SCF' };
const ROUND_LABELS: Record<string, string> = { R1: 'First Round', R2: 'Second Round', CF: 'Conference Finals', SCF: 'Stanley Cup Final' };

export default function SeriesRecordsTable({ series, scope, totalSeries }: Props) {
  const [roundFilter, setRoundFilter] = useState<string>('all');
  const [teamSearch, setTeamSearch] = useState('');

  const filtered = useMemo(() => {
    let r = series;
    if (roundFilter !== 'all') {
      const roundNum = Object.entries(ROUND_MAP).find(([, v]) => v === roundFilter)?.[0];
      if (roundNum) r = r.filter(s => s.round === Number(roundNum));
    }
    if (teamSearch.trim().length >= 1) {
      const q = teamSearch.trim().toUpperCase();
      r = r.filter(s => s.team.includes(q) || s.opponent.includes(q));
    }
    return r;
  }, [series, roundFilter, teamSearch]);

  const COLUMNS: HGBColumnDef<SeriesRecord>[] = [
    {
      id: 'rank', header: '#', accessor: r => r.rank, width: 44,
      exportText: v => String(v),
    },
    {
      id: 'team', header: 'Team', accessor: r => r.team, align: 'left', width: 80,
      cell: (v, row) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <img src={`/logos/nhl/${row.team}_light.svg`} width={24} height={24}
            style={{ objectFit: 'contain', flexShrink: 0 }}
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          <span style={{ fontFamily: "'Barlow', sans-serif", fontWeight: 600 }}>{v as string}</span>
          {row.team === row.winner
            ? <span style={{ ...MONO, fontSize: 9, padding: '1px 5px', background: '#166534', color: '#fff', letterSpacing: '0.06em' }}>W</span>
            : <span style={{ ...MONO, fontSize: 9, padding: '1px 5px', background: '#991b1b', color: '#fff', letterSpacing: '0.06em' }}>L</span>
          }
        </div>
      ),
      sortType: 'string',
    },
    {
      id: 'opponent', header: 'Opp', accessor: r => r.opponent, width: 60,
      cell: (v, row) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <img src={`/logos/nhl/${row.opponent}_light.svg`} width={20} height={20}
            style={{ objectFit: 'contain', flexShrink: 0 }}
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          <span style={{ fontFamily: "'Barlow', sans-serif", fontWeight: 500 }}>{v as string}</span>
        </div>
      ),
      sortType: 'string',
    },
    { id: 'season', header: 'Season', accessor: r => r.season, width: 72, cell: v => fmtSeasonShort(v as string), exportText: v => fmtSeasonShort(String(v)) },
    { id: 'round', header: 'Round', accessor: r => r.round, width: 52, cell: (v, row) => <span style={MONO}>{ROUND_MAP[v as number] ?? row.round_name}</span> },
    { id: 'games', header: 'G', accessor: r => r.games, width: 44 },
    {
      id: 'xgf_pct', header: 'xGF%', accessor: r => r.xgf_pct, width: 72,
      cell: v => {
        const n = v as number;
        const color = n >= 55 ? POS : n <= 45 ? NEG : undefined;
        return <strong style={{ color, fontVariantNumeric: 'tabular-nums' }}>{n.toFixed(1)}%</strong>;
      },
      exportText: v => `${(v as number).toFixed(1)}%`,
    },
    { id: 'xgf_5v5', header: 'xGF', accessor: r => r.xgf_5v5, width: 60, cell: v => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{(v as number).toFixed(2)}</span>, exportText: v => (v as number).toFixed(2) },
    { id: 'xga_5v5', header: 'xGA', accessor: r => r.xga_5v5, width: 60, cell: v => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{(v as number).toFixed(2)}</span>, exportText: v => (v as number).toFixed(2) },
    { id: 'gf', header: 'GF', accessor: r => r.gf, width: 44 },
    { id: 'ga', header: 'GA', accessor: r => r.ga, width: 44 },
  ];

  const chip = (active: boolean, label: string, onClick: () => void) => (
    <button onClick={onClick} style={{ ...MONO, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '5px 10px', border: '1px solid rgba(13,13,20,0.2)', cursor: 'pointer', background: active ? '#0d0d14' : '#fff', color: active ? '#EFEEE8' : 'rgba(13,13,20,0.48)' }}>
      {label}
    </button>
  );

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <div style={{ display: 'inline-flex', border: '1px solid rgba(13,13,20,0.2)', borderLeft: 'none' }}>
          {['all','R1','R2','CF','SCF'].map(r => (
            <span key={r}>{chip(roundFilter === r, r === 'all' ? 'All Rounds' : r, () => setRoundFilter(r))}</span>
          ))}
        </div>
        <input
          type="text" placeholder="Filter by team…" value={teamSearch}
          onChange={e => setTeamSearch(e.target.value)}
          style={{ ...MONO, fontSize: 11, padding: '5px 10px', border: '1px solid rgba(13,13,20,0.2)', background: '#fff', color: '#0d0d14', outline: 'none', width: 160 }}
        />
        <span style={{ ...MONO, fontSize: 10, color: 'rgba(13,13,20,0.32)', marginLeft: 'auto' }}>
          {filtered.length} of {totalSeries} series · {scope}
        </span>
      </div>

      <HGBTable
        data={filtered}
        columns={COLUMNS}
        defaultSort={{ id: 'xgf_pct', desc: true }}
        rowHref={r => r.series_page_url}
        exportFilename="hgb-series-records"
        exportTitle="Playoff Series Records"
        exportChips={[scope, roundFilter !== 'all' ? ROUND_LABELS[roundFilter] ?? roundFilter : 'All Rounds']}
        emptyMessage="No series match the current filters."
      />

      <p style={{ ...MONO, fontSize: 9, color: 'rgba(13,13,20,0.32)', marginTop: 8, letterSpacing: '0.06em' }}>
        5v5 non-empty-net shots only · Score-adjustment not applied · Data covers 2022-23 playoffs onward
      </p>
    </div>
  );
}
