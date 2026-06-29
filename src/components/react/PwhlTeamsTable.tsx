import React from 'react';
import HGBTable, { type HGBColumnDef } from './HGBTable';
import type { PwhlTeam } from '../../lib/stats-loader';

const fmt1 = (v: number) => v.toFixed(1);

type Props = { data: PwhlTeam[] };

export default function PwhlTeamsTable({ data }: Props) {
  const columns: HGBColumnDef<PwhlTeam>[] = [
    {
      id: 'team_abbrev',
      header: 'Team',
      accessor: r => `${r.city} (${r.team_abbrev})`,
      align: 'left',
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
      id: 'wins',
      header: 'W',
      accessor: r => r.wins,
      align: 'right',
      sortType: 'number',
    },
    {
      id: 'losses',
      header: 'L',
      accessor: r => r.losses,
      align: 'right',
      sortType: 'number',
    },
    {
      id: 'otl',
      header: 'OTL',
      accessor: r => r.otl,
      align: 'right',
      sortType: 'number',
    },
    {
      id: 'pts',
      header: 'PTS',
      accessor: r => r.pts,
      align: 'right',
      sortType: 'number',
    },
    {
      id: 'gf',
      header: 'GF',
      accessor: r => r.gf,
      align: 'right',
      sortType: 'number',
    },
    {
      id: 'ga',
      header: 'GA',
      accessor: r => r.ga,
      align: 'right',
      sortType: 'number',
    },
    {
      id: 'xg_pct',
      header: 'xGF% (est.)',
      accessor: r => r.xg_pct,
      cell: v => `${(v as number).toFixed(1)}%`,
      exportText: v => `${(v as number).toFixed(1)}%`,
      align: 'right',
      sortType: 'number',
    },
    {
      id: 'pp_pct',
      header: 'PP%',
      accessor: r => r.pp_pct,
      cell: v => `${(v as number).toFixed(1)}%`,
      exportText: v => `${(v as number).toFixed(1)}%`,
      align: 'right',
      sortType: 'number',
    },
    {
      id: 'pk_pct',
      header: 'PK%',
      accessor: r => r.pk_pct,
      cell: v => `${(v as number).toFixed(1)}%`,
      exportText: v => `${(v as number).toFixed(1)}%`,
      align: 'right',
      sortType: 'number',
    },
    {
      id: 'xgf',
      header: 'xGF (est.)',
      accessor: r => r.xgf,
      cell: v => fmt1(v as number),
      exportText: v => fmt1(v as number),
      align: 'right',
      sortType: 'number',
      defaultHidden: true,
    },
    {
      id: 'xga',
      header: 'xGA (est.)',
      accessor: r => r.xga,
      cell: v => fmt1(v as number),
      exportText: v => fmt1(v as number),
      align: 'right',
      sortType: 'number',
      defaultHidden: true,
    },
  ];

  return (
    <div>
      <HGBTable
        data={data}
        columns={columns}
        defaultSort={{ id: 'pts', desc: true }}
        exportFilename="pwhl-team-stats"
        exportTitle="PWHL Team Stats"
        emptyMessage="No team data available."
      />
      <p style={{ fontSize: 11, color: '#888', marginTop: 8, fontFamily: "'Barlow', sans-serif" }}>
        xGF% (est.) = expected goals percentage, estimated from shot location using uncalibrated coefficients.
      </p>
    </div>
  );
}
