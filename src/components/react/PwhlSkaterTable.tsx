import React, { useState } from 'react';
import HGBTable, { type HGBColumnDef, pwhlLogoSrc, TEAM_LOGO_STYLE } from './HGBTable';
import { FilterLabel, SEMI } from './FilterPrimitives';
import PositionFilter, { type PosFilter } from './PositionFilter';
import type { PwhlPlayer } from '../../lib/stats-loader';

const fmt1 = (v: number) => v.toFixed(1);
const fmtPct = (v: number) => `${(v * 100).toFixed(1)}%`;

type Props = { data: PwhlPlayer[] };

export default function PwhlSkaterTable({ data }: Props) {
  const [posFilter, setPosFilter] = useState<PosFilter>('all');
  const [minGP, setMinGP] = useState(1);

  const filtered = data.filter(r => {
    if (posFilter !== 'all' && r.pos !== posFilter) return false;
    if (r.gp < minGP) return false;
    return true;
  });

  const columns: HGBColumnDef<PwhlPlayer>[] = [
    {
      id: 'name',
      header: 'Player',
      accessor: r => r.name,
      align: 'left',
      sortType: 'string',
    },
    {
      id: 'team_abbrev',
      header: 'Team',
      accessor: r => r.team_abbrev,
      cell: (_v, row) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, justifyContent: 'center' }}>
          <img src={pwhlLogoSrc(row.team_abbrev)} width={28} height={28} style={TEAM_LOGO_STYLE} alt="" />
          <span>{row.team_abbrev}</span>
        </div>
      ),
      exportText: (_v, row) => row.team_abbrev,
      align: 'center',
      sortType: 'string',
      width: 70,
    },
    {
      id: 'pos',
      header: 'Pos',
      accessor: r => r.pos,
      align: 'center',
      sortType: 'string',
    },
    {
      id: 'gp',
      header: 'GP',
      accessor: r => r.gp,
      align: 'right',
      sortType: 'number',
    },
    {
      id: 'goals',
      header: 'G',
      accessor: r => r.goals,
      align: 'right',
      sortType: 'number',
    },
    {
      id: 'assists',
      header: 'A',
      accessor: r => r.assists,
      align: 'right',
      sortType: 'number',
    },
    {
      id: 'points',
      header: 'PTS',
      accessor: r => r.points,
      align: 'right',
      sortType: 'number',
    },
    {
      id: 'pp_goals',
      header: 'PPG',
      accessor: r => r.pp_goals,
      align: 'right',
      sortType: 'number',
    },
    {
      id: 'pp_assists',
      header: 'PPA',
      accessor: r => r.pp_assists,
      align: 'right',
      sortType: 'number',
    },
    {
      id: 'sog',
      header: 'SOG',
      accessor: r => r.sog,
      align: 'right',
      sortType: 'number',
    },
    {
      id: 'ixg',
      header: 'iXG (est.)',
      accessor: r => r.ixg,
      cell: v => fmt1(v as number),
      exportText: v => fmt1(v as number),
      align: 'right',
      sortType: 'number',
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', marginBottom: 12, flexWrap: 'wrap' }}>
        <div>
          <PositionFilter value={posFilter} onChange={setPosFilter} />
        </div>
        <div>
          <FilterLabel text="Min GP" />
          <input
            type="number"
            min={1}
            value={minGP}
            onChange={e => setMinGP(Math.max(1, parseInt(e.target.value) || 1))}
            style={{ ...SEMI, width: 52, padding: '5px 8px', border: '1px solid rgba(13,13,20,0.2)', fontSize: 11, background: 'transparent', color: '#0d0d14' }}
          />
        </div>
      </div>
      <HGBTable
        data={filtered}
        columns={columns}
        defaultSort={{ id: 'points', desc: true }}
        globalSearchField={r => r.name}
        searchPlaceholder="Search player…"
        exportFilename="pwhl-skater-stats"
        exportTitle="PWHL Skater Stats"
        showRank
        virtualize
        emptyMessage="No players match the selected filters."
      />
      <p style={{ fontSize: 11, color: '#888', marginTop: 8, fontFamily: "'Barlow', sans-serif" }}>
        iXG (est.) = individual expected goals, estimated from shot location using uncalibrated coefficients. GP approximated from on-ice goal events.
      </p>
    </div>
  );
}
