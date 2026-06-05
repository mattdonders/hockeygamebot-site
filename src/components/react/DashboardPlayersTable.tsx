/**
 * DashboardPlayersTable — Two exports:
 *   DashboardFollowedPlayers: logged-in "Your Players" section
 *   DashboardTopImpact:       logged-out "Top Players — HGB Impact" section
 *
 * Both use HGBTable so styling is consistent with the rest of the site.
 * hideToolbar + no virtualization (small row counts, no need).
 */

import React from 'react';
import HGBTable, { type HGBColumnDef, NAME_FONT_SIZE, CELL_FONT_SIZE } from './HGBTable';

// ── Followed players (logged-in) ──────────────────────────────────────────────

export type DashboardPlayerRow = {
  name: string;
  slug: string;
  team: string;
  pos: string;
  gp: number;
  g: number;
  a: number;
  p: number;
  war_p:  number | null;  // WAR percentile vs position (0-100)
  rtng_p: number | null;  // HGB Rating percentile (0-100)
  imp_p:  number | null;  // Impact (Game Score) percentile vs position (0-100)
};

const GREEN = '#166534';
const RED   = '#991b1b';


function pctColor(v: number | null): string {
  if (v == null) return 'rgba(13,13,20,0.32)';
  if (v >= 75) return GREEN;
  if (v <= 35) return RED;
  return 'rgba(13,13,20,0.72)';
}

const followedCols: HGBColumnDef<DashboardPlayerRow>[] = [
  {
    id: 'name',
    header: 'Player',
    accessor: r => r.name,
    align: 'left',
    cell: (_, r) => (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <img
          src={`https://assets.nhle.com/logos/nhl/svg/${r.team}_light.svg`}
          alt={r.team}
          width={32}
          height={32}
          style={{ flexShrink: 0, objectFit: 'contain' }}
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
        />
        <span style={{ fontFamily: "'Barlow', sans-serif", fontWeight: 600, fontSize: NAME_FONT_SIZE }}>
          {r.name}
        </span>
      </div>
    ),
  },
  {
    id: 'team',
    header: 'Tm',
    accessor: r => r.team,
    align: 'center',
    cell: (v) => (
      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: CELL_FONT_SIZE, fontWeight: 700, color: 'rgba(13,13,20,0.48)', letterSpacing: '0.06em' }}>
        {v}
      </span>
    ),
    mobileHidden: true,
  },
  {
    id: 'pos',
    header: 'Pos',
    accessor: r => r.pos,
    align: 'center',
    cell: (v) => (
      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: CELL_FONT_SIZE, color: 'rgba(13,13,20,0.32)' }}>
        {v}
      </span>
    ),
    mobileHidden: true,
  },
  { id: 'gp', header: 'GP', accessor: r => r.gp, sortType: 'number', align: 'right', mobileHidden: true },
  { id: 'g',  header: 'G',  accessor: r => r.g,  sortType: 'number', align: 'right', mobileHidden: true },
  { id: 'a',  header: 'A',  accessor: r => r.a,  sortType: 'number', align: 'right', mobileHidden: true },
  {
    id: 'p', header: 'P', accessor: r => r.p, sortType: 'number', align: 'right',
    cell: (v) => <span style={{ fontWeight: 700, color: '#0d0d14' }}>{v}</span>,
  },
  {
    id: 'war_p', header: 'WAR%', accessor: r => r.war_p ?? -1,
    sortType: 'number', align: 'center', mobileHidden: true,
    cell: (_, r) => r.war_p == null ? '—' : (
      <span style={{ fontWeight: 700, color: pctColor(r.war_p) }}>{r.war_p}</span>
    ),
  },
  {
    id: 'rtng_p', header: 'RTNG%', accessor: r => r.rtng_p ?? -1,
    sortType: 'number', align: 'center', mobileHidden: true,
    cell: (_, r) => r.rtng_p == null ? '—' : (
      <span style={{ fontWeight: 700, color: pctColor(r.rtng_p) }}>{r.rtng_p}</span>
    ),
  },
  {
    id: 'imp_p', header: 'IMP%', accessor: r => r.imp_p ?? -1,
    sortType: 'number', align: 'center',
    cell: (_, r) => r.imp_p == null ? '—' : (
      <span style={{ fontWeight: 700, color: pctColor(r.imp_p) }}>{r.imp_p}</span>
    ),
  },
];

export function DashboardFollowedPlayers({ players }: { players: DashboardPlayerRow[] }) {
  return (
    <HGBTable
      data={players}
      columns={followedCols}
      defaultSort={{ id: 'imp_p', desc: true }}
      rowHref={r => `/stats/player/${r.slug}`}
      hideToolbar
      emptyMessage="No players followed yet"
    />
  );
}

// ── Top Impact (logged-out) ───────────────────────────────────────────────────

export type TopImpactRow = {
  display_name: string;
  slug: string;
  team_abbrev: string;
  pos: string;
  gp: number;
  value: number;
};

const topImpactCols: HGBColumnDef<TopImpactRow>[] = [
  {
    id: 'name',
    header: 'Player',
    accessor: r => r.display_name,
    align: 'left',
    cell: (_, r) => (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <img
          src={`https://assets.nhle.com/logos/nhl/svg/${r.team_abbrev}_light.svg`}
          alt={r.team_abbrev}
          width={32}
          height={32}
          style={{ flexShrink: 0, objectFit: 'contain' }}
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
        />
        <span style={{ fontFamily: "'Barlow', sans-serif", fontWeight: 600, fontSize: NAME_FONT_SIZE }}>
          {r.display_name}
        </span>
      </div>
    ),
  },
  {
    id: 'team',
    header: 'Tm',
    accessor: r => r.team_abbrev,
    align: 'center',
    cell: (v) => (
      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: CELL_FONT_SIZE, fontWeight: 700, color: 'rgba(13,13,20,0.48)', letterSpacing: '0.06em' }}>
        {v}
      </span>
    ),
    mobileHidden: true,
  },
  {
    id: 'pos',
    header: 'Pos',
    accessor: r => r.pos,
    align: 'center',
    cell: (v) => (
      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: CELL_FONT_SIZE, color: 'rgba(13,13,20,0.32)' }}>
        {v}
      </span>
    ),
    mobileHidden: true,
  },
  { id: 'gp', header: 'GP', accessor: r => r.gp, sortType: 'number', align: 'right', mobileHidden: true },
  {
    id: 'value',
    header: 'Impact',
    accessor: r => r.value,
    sortType: 'number',
    align: 'right',
    cell: (v) => (
      <span style={{ fontWeight: 700, fontSize: 12 }}>
        {typeof v === 'number' ? (v >= 0 ? '+' : '') + v.toFixed(2) : '—'}
      </span>
    ),
  },
];

export function DashboardTopImpact({ players }: { players: TopImpactRow[] }) {
  return (
    <HGBTable
      data={players}
      columns={topImpactCols}
      defaultSort={{ id: 'value', desc: true }}
      rowHref={r => `/stats/player/${r.slug}`}
      hideToolbar
    />
  );
}
