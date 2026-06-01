/**
 * SkaterTableV2Island.tsx — React island that wires HGBTable for skater data.
 *
 * This is the client-side component rendered by SkaterTableV2.astro.
 * It defines column configs and filter specs, then delegates all rendering
 * to the generic HGBTable component.
 */

import React from 'react';
import HGBTable, { type HGBColumnDef, type HGBFilter } from '../react/HGBTable';

export type SkaterRow = {
  display_name: string;
  team_abbrev:  string;
  pos:          string;
  pos_group:    'F' | 'D';
  gp:           number;
  goals:        number;
  assists:      number;
  points:       number;
  toi_avg_sec:  number;
  ixg60:        number;
  shots60:      number;
  hgb_war:      number | null;
  hgb_rating_percentile: number | null;
  slug:         string;
};

const COLUMNS: HGBColumnDef<SkaterRow>[] = [
  {
    id: 'display_name',
    header: 'Player',
    accessor: r => r.display_name,
    cell: (_v, r) => (
      <a
        href={`/stats/player/${r.slug}`}
        style={{
          color: 'inherit',
          textDecoration: 'none',
          fontWeight: 600,
          fontFamily: "'Barlow', sans-serif",
        }}
        onClick={e => e.stopPropagation()}
      >
        {r.display_name}
      </a>
    ),
    align: 'left',
    width: 160,
    sortType: 'string',
  },
  {
    id: 'team_abbrev',
    header: 'Team',
    accessor: r => r.team_abbrev,
    align: 'right',
    width: 56,
    sortType: 'string',
  },
  {
    id: 'pos',
    header: 'Pos',
    accessor: r => r.pos,
    align: 'right',
    width: 46,
    sortType: 'string',
  },
  {
    id: 'gp',
    header: 'GP',
    accessor: r => r.gp,
    align: 'right',
    width: 46,
  },
  {
    id: 'goals',
    header: 'G',
    accessor: r => r.goals,
    align: 'right',
    width: 46,
    mobileHidden: true,
  },
  {
    id: 'assists',
    header: 'A',
    accessor: r => r.assists,
    align: 'right',
    width: 46,
    mobileHidden: true,
  },
  {
    id: 'points',
    header: 'P',
    accessor: r => r.points,
    align: 'right',
    width: 52,
  },
  {
    id: 'toi',
    header: 'TOI/G',
    accessor: r => Math.round((r.toi_avg_sec / 60) * 10) / 10,
    cell: v => (
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>
        {Number(v).toFixed(1)}
      </span>
    ),
    align: 'right',
    width: 64,
    mobileHidden: true,
  },
  {
    id: 'ixg60',
    header: 'iXG/60',
    accessor: r => Math.round(r.ixg60 * 100) / 100,
    cell: v => (
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>
        {Number(v).toFixed(2)}
      </span>
    ),
    align: 'right',
    width: 72,
  },
  {
    id: 'shots60',
    header: 'S/60',
    accessor: r => Math.round(r.shots60 * 10) / 10,
    cell: v => (
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>
        {Number(v).toFixed(1)}
      </span>
    ),
    align: 'right',
    width: 64,
    mobileHidden: true,
  },
  {
    id: 'hgb_war',
    header: 'WAR',
    accessor: r => r.hgb_war !== null ? Math.round(r.hgb_war * 100) / 100 : null,
    cell: v =>
      v !== null ? (
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>
          {(Number(v) >= 0 ? '+' : '') + Number(v).toFixed(2)}
        </span>
      ) : (
        <span style={{ color: 'rgba(13,13,20,0.3)' }}>—</span>
      ),
    align: 'right',
    width: 64,
    mobileHidden: true,
    defaultHidden: true,
  },
  {
    id: 'hgb_rating_percentile',
    header: 'Rating',
    accessor: r => r.hgb_rating_percentile,
    cell: v =>
      v !== null ? (
        <span>{v}%</span>
      ) : (
        <span style={{ color: 'rgba(13,13,20,0.3)' }}>—</span>
      ),
    align: 'right',
    width: 64,
    defaultHidden: true,
  },
];

const FILTERS: HGBFilter[] = [
  {
    type: 'chips',
    label: 'Position',
    options: [
      { label: 'Fwds', value: 'F' },
      { label: 'Def',  value: 'D' },
    ],
    field: (r: SkaterRow) => r.pos_group,
  },
  {
    type: 'number-min',
    label: 'Min GP',
    field: (r: SkaterRow) => r.gp,
    defaultValue: 20,
    max: 82,
  },
];

export default function SkaterTableV2Island({ data }: { data: SkaterRow[] }) {
  return (
    <HGBTable<SkaterRow>
      data={data}
      columns={COLUMNS}
      defaultSort={{ id: 'points', desc: true }}
      globalSearchField={r => `${r.display_name} ${r.team_abbrev}`}
      filters={FILTERS}
      rowHref={r => `/stats/player/${r.slug}`}
      exportFilename="hgb-skaters"
      emptyMessage="No skaters match the current filters."
    />
  );
}
