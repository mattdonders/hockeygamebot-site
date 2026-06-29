import React, { useState, useMemo } from 'react';
import HGBTable, { type HGBColumnDef, TEAM_LOGO_SIZE, TEAM_LOGO_STYLE, teamLogoSrc } from './HGBTable';
import { FilterChip, FilterChipGroup } from './FilterPrimitives';
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
const BODY: React.CSSProperties = { fontFamily: "'Barlow', sans-serif" };
const POS = '#166534', NEG = '#991b1b';

const ROUND_MAP: Record<number, string> = { 1: 'R1', 2: 'R2', 3: 'R3', 4: 'SCF' };
const ROUND_OPTIONS = ['R1', 'R2', 'R3', 'SCF'];

const TEAM_NAMES: Record<string, string> = {
  ANA:'Anaheim Ducks', BOS:'Boston Bruins', BUF:'Buffalo Sabres', CGY:'Calgary Flames',
  CAR:'Carolina Hurricanes', CHI:'Chicago Blackhawks', COL:'Colorado Avalanche',
  CBJ:'Columbus Blue Jackets', DAL:'Dallas Stars', DET:'Detroit Red Wings',
  EDM:'Edmonton Oilers', FLA:'Florida Panthers', LAK:'Los Angeles Kings',
  MIN:'Minnesota Wild', MTL:'Montréal Canadiens', NSH:'Nashville Predators',
  NJD:'New Jersey Devils', NYI:'New York Islanders', NYR:'New York Rangers',
  OTT:'Ottawa Senators', PHI:'Philadelphia Flyers', PIT:'Pittsburgh Penguins',
  SJS:'San Jose Sharks', SEA:'Seattle Kraken', STL:'St. Louis Blues',
  TBL:'Tampa Bay Lightning', TOR:'Toronto Maple Leafs', UTA:'Utah Hockey Club',
  VAN:'Vancouver Canucks', VGK:'Vegas Golden Knights', WSH:'Washington Capitals',
  WPG:'Winnipeg Jets',
};

export default function SeriesRecordsTable({ series, scope, totalSeries }: Props) {
  const [roundFilter, setRoundFilter] = useState<string>('all');
  const [teamSearch,  setTeamSearch]  = useState('');
  const [topN,        setTopN]        = useState<number | null>(null);

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
    if (topN) r = r.slice(0, topN);
    return r;
  }, [series, roundFilter, teamSearch, topN]);

  const COLUMNS: HGBColumnDef<SeriesRecord>[] = [
    { id: 'rank', header: '#', accessor: r => r.rank, width: 44 },
    {
      id: 'team', header: 'Team', accessor: r => TEAM_NAMES[r.team] ?? r.team, align: 'left', width: 220,
      cell: (_v, row) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <img src={teamLogoSrc(row.team)} width={TEAM_LOGO_SIZE} height={TEAM_LOGO_SIZE}
            style={TEAM_LOGO_STYLE} alt={row.team}
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          <span style={{ ...BODY, fontWeight: 600, fontSize: 14 }}>{TEAM_NAMES[row.team] ?? row.team}</span>
          {row.team === row.winner
            ? <span style={{ ...MONO, fontSize: 9, padding: '1px 5px', background: '#166534', color: '#fff', letterSpacing: '0.06em', flexShrink: 0 }}>W</span>
            : <span style={{ ...MONO, fontSize: 9, padding: '1px 5px', background: '#991b1b', color: '#fff', letterSpacing: '0.06em', flexShrink: 0 }}>L</span>
          }
        </div>
      ),
      exportText: (_v, row) => TEAM_NAMES[row.team] ?? row.team,
      sortType: 'string',
    },
    {
      id: 'opponent', header: 'Opponent', accessor: r => TEAM_NAMES[r.opponent] ?? r.opponent, align: 'left', width: 200,
      cell: (_v, row) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <img src={teamLogoSrc(row.opponent)} width={TEAM_LOGO_SIZE - 8} height={TEAM_LOGO_SIZE - 8}
            style={TEAM_LOGO_STYLE} alt={row.opponent}
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          <span style={{ ...BODY, fontWeight: 500, fontSize: 13 }}>{TEAM_NAMES[row.opponent] ?? row.opponent}</span>
        </div>
      ),
      exportText: (_v, row) => TEAM_NAMES[row.opponent] ?? row.opponent,
      sortType: 'string',
    },
    { id: 'season', header: 'Season', accessor: r => r.season, width: 72, cell: v => fmtSeasonShort(v as string), exportText: v => fmtSeasonShort(String(v)) },
    { id: 'round', header: 'Round', accessor: r => r.round, width: 60, cell: (v, row) => <span style={MONO}>{ROUND_MAP[v as number] ?? row.round_name}</span>, exportText: (v) => ROUND_MAP[v as number] ?? String(v) },
    { id: 'games', header: 'G', accessor: r => r.games, width: 44 },
    {
      id: 'xgf_pct', header: 'xGF%', accessor: r => r.xgf_pct, width: 76,
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

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        {/* Round filter */}
        <FilterChipGroup>
          {['all', ...ROUND_OPTIONS].map(r => (
            <FilterChip key={r} active={roundFilter === r} label={r === 'all' ? 'All Rounds' : r} onClick={() => setRoundFilter(r)} />
          ))}
        </FilterChipGroup>
        {/* Top N */}
        <FilterChipGroup>
          {([null, 5, 20] as (number|null)[]).map(n => (
            <FilterChip key={String(n)} active={topN === n} label={n ? `Top ${n}` : 'All'} onClick={() => setTopN(n)} />
          ))}
        </FilterChipGroup>
        {/* Team search */}
        <input
          type="text" placeholder="Filter by team…" value={teamSearch}
          onChange={e => setTeamSearch(e.target.value)}
          style={{ ...MONO, fontSize: 11, padding: '5px 10px', border: '1px solid rgba(13,13,20,0.2)', background: '#fff', color: '#0d0d14', outline: 'none', width: 160 }}
        />
        <span style={{ ...MONO, fontSize: 10, color: 'rgba(13,13,20,0.32)', marginLeft: 'auto' }}>
          {filtered.length} of {totalSeries} series · rank is global
        </span>
      </div>

      <HGBTable
        data={filtered}
        columns={COLUMNS}
        defaultSort={{ id: 'xgf_pct', desc: true }}
        rowHref={r => r.series_page_url}
        emptyMessage="No series match the current filters."
        toolbar={{ show: false }}
      />

      <p style={{ ...MONO, fontSize: 9, color: 'rgba(13,13,20,0.32)', marginTop: 8, letterSpacing: '0.06em' }}>
        W = series winner · R3 = Conference Finals · 5v5 non-empty-net shots only · Score-adjustment not applied
      </p>
    </div>
  );
}
