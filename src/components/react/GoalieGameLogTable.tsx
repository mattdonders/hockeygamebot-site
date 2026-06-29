/**
 * GoalieGameLogTable — Per-game stats for a goalie's current season.
 *
 * HGBTable-based wrapper. Opponent filter, date-desc default sort, and
 * GSAx coloring are all expressed through HGBTable's standard API —
 * no custom toolbar or DOM wiring needed.
 */

import React, { useMemo } from 'react';
import HGBTable, { type HGBColumnDef, TEAM_LOGO_SIZE, TEAM_LOGO_STYLE, teamLogoSrc } from './HGBTable';
import type { GoalieGame } from '../../lib/stats-schemas';

// ── Style constants ──────────────────────────────────────────────────────────

const MONO: React.CSSProperties = { fontFamily: "'JetBrains Mono', monospace" };
const POS = '#137333';
const NEG = '#991b1b';
const MUTED = 'rgba(13,13,20,0.48)';
const PO_COLOR = '#2563eb';

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: string): string {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const [, mm, dd] = d.split('-');
  return `${months[parseInt(mm) - 1]} ${parseInt(dd)}`;
}

function fmtToi(sec: number | null | undefined): string {
  if (sec == null) return '—';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ── Computed row type ────────────────────────────────────────────────────────

type GoalieGameRow = GoalieGame & {
  date_fmt: string;
  type_lbl: string;
};

// ── Props ────────────────────────────────────────────────────────────────────

type Props = {
  games: GoalieGame[];
  label?: string;
};

// ── Component ────────────────────────────────────────────────────────────────

export default function GoalieGameLogTable({ games, label }: Props) {
  const rows = useMemo<GoalieGameRow[]>(() =>
    games.map(g => ({
      ...g,
      date_fmt: fmtDate(g.game_date),
      type_lbl: g.game_type === 3 ? 'PO' : 'RS',
    })), [games]);

  const columns = useMemo<HGBColumnDef<GoalieGameRow>[]>(() => [
    {
      id: 'game_date', header: 'Date', align: 'left', width: 72, sortType: 'string',
      accessor: r => r.game_date,
      cell: (_, row) => <span style={MONO}>{row.date_fmt}</span>,
      exportText: (_, row) => row.date_fmt,
    },
    {
      id: 'opp', header: 'Opp', align: 'center', width: 80, sortType: 'string',
      accessor: r => r.opp_abbrev ?? '—',
      cell: (_, row) => (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
          <img
            src={teamLogoSrc(row.opp_abbrev ?? '')}
            width={TEAM_LOGO_SIZE}
            height={TEAM_LOGO_SIZE}
            style={TEAM_LOGO_STYLE}
            alt={row.opp_abbrev ?? ''}
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
          <span style={{ ...MONO, fontSize: 11, color: MUTED }}>{row.opp_abbrev ?? '—'}</span>
        </div>
      ),
      exportText: v => String(v),
    },
    {
      id: 'decision', header: 'Dec', align: 'center', width: 48, sortType: 'string',
      accessor: r => r.decision ?? '—',
      cell: v => {
        const color = v === 'W' ? POS : v === 'L' ? NEG : MUTED;
        return <span style={{ ...MONO, fontWeight: 700, color }}>{String(v)}</span>;
      },
    },
    {
      id: 'game_type', header: 'Type', align: 'center', width: 48, sortType: 'string',
      accessor: r => r.type_lbl,
      cell: (_, row) => (
        <span style={{ ...MONO, fontSize: 11, color: row.game_type === 3 ? PO_COLOR : MUTED }}>
          {row.type_lbl}
        </span>
      ),
    },
    {
      id: 'toi', header: 'TOI', align: 'center', width: 60,
      accessor: r => r.toi_sec ?? null,
      cell: v => <span>{fmtToi(v as number | null)}</span>,
      exportText: v => fmtToi(v as number | null),
    },
    {
      id: 'sa', header: 'SA', align: 'center', width: 44,
      accessor: r => r.sa,
    },
    {
      id: 'ga', header: 'GA', align: 'center', width: 44,
      accessor: r => r.ga,
    },
    {
      id: 'sv_pct', header: 'SV%', align: 'center', width: 60,
      accessor: r => r.sv_pct ?? null,
      cell: v => <span>{v == null ? '—' : Number(v).toFixed(3)}</span>,
    },
    {
      id: 'xga', header: 'xGA', align: 'center', width: 56,
      accessor: r => r.xga,
      cell: v => <span>{Number(v).toFixed(2)}</span>,
    },
    {
      id: 'gsax', header: 'GSAx', align: 'center', width: 64, sortType: 'number',
      accessor: r => r.gsax,
      cell: v => {
        const n = v as number;
        const color = n >= 0 ? POS : NEG;
        return <span style={{ ...MONO, fontWeight: 700, color }}>{(n >= 0 ? '+' : '') + n.toFixed(2)}</span>;
      },
    },
  ], []);

  return (
    <HGBTable
      data={rows}
      columns={columns}
      defaultSort={{ id: 'game_date', desc: true }}
      filters={[{ type: 'search', placeholder: 'Filter opponent…', field: (r: GoalieGameRow) => r.opp_abbrev ?? '' }]}
      maxHeight={400}
      emptyMessage="No games found."
      toolbar={{ csv: true, png: false, columns: false }}
      label={label}
    />
  );
}
