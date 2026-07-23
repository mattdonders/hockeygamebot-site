/**
 * TeamGameLogTable — Per-game results for a single team.
 * Consumed by /teams/[abbr].astro.
 *
 * Columns: Date, Opp (logo + abbrev + H/A badge), Result, GF, GA, xGF%, xGF, xGA
 * Default sort: date descending (most recent first)
 * Optionally filtered to a single opponent (activeOpp prop).
 */

import React, { useMemo, useState, useEffect } from 'react';
import HGBTable, {
  type HGBColumnDef,
  TEAM_LOGO_SIZE,
  TEAM_LOGO_STYLE,
  teamLogoSrc,
} from './HGBTable';
import type { TeamGameEntry } from '../../lib/stats-loader';
import { useIsDark } from './FilterPrimitives';

type Props = {
  rows: TeamGameEntry[];
  /** Full-name lookup used for display */
  teamNames: Record<string, string>;
  /** Initial opponent filter (from URL param). Empty string = all games. */
  initialOpp?: string;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmtDate(d: string): string {
  const [, mm, dd] = d.split('-');
  return `${MONTHS[parseInt(mm) - 1]} ${parseInt(dd)}`;
}

const POS = '#166534';
const NEG = '#991b1b';
const MUTED = 'rgba(13,13,20,0.48)';
const MONO: React.CSSProperties = { fontFamily: 'var(--mono)' };

export default function TeamGameLogTable({ rows, teamNames, initialOpp = '' }: Props) {
  const isDark = useIsDark();
  const [activeOpp, setActiveOpp] = useState(initialOpp);

  // Listen for opponent filter changes from the vanilla dropdown
  useEffect(() => {
    const handler = (e: Event) => {
      setActiveOpp((e as CustomEvent<string>).detail);
    };
    document.addEventListener('hgb:team-opp-filter', handler);
    return () => document.removeEventListener('hgb:team-opp-filter', handler);
  }, []);

  // Filter and sort: active opp filters, otherwise last 10 most recent
  const displayRows = useMemo(() => {
    if (activeOpp) {
      return rows.filter(g => g.opp_abbrev === activeOpp);
    }
    // chronological order assumed from loader; reverse for most-recent-first, take 10
    return [...rows].reverse().slice(0, 10);
  }, [rows, activeOpp]);

  const COLUMNS = useMemo<HGBColumnDef<TeamGameEntry>[]>(() => [
    {
      id: 'game_date',
      header: 'Date',
      accessor: r => r.game_date,
      align: 'left',
      width: 72,
      cell: v => <span style={MONO}>{fmtDate(v as string)}</span>,
      sortType: 'string',
    },
    {
      id: 'opp',
      header: 'Opp',
      accessor: r => r.opp_abbrev,
      align: 'left',
      width: 120,
      cell: (_v, row) => {
        const ha = row.is_home ? 'vs' : '@';
        const haColor = row.is_home ? 'rgba(13,13,20,0.32)' : 'rgba(13,13,20,0.72)';
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ ...MONO, fontSize: 10, color: haColor, width: 16, flexShrink: 0 }}>{ha}</span>
            <img
              src={teamLogoSrc(row.opp_abbrev, isDark)}
              width={TEAM_LOGO_SIZE - 8}
              height={TEAM_LOGO_SIZE - 8}
              style={TEAM_LOGO_STYLE}
              alt={row.opp_abbrev}
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
            <span style={{ fontWeight: 600 }}>{row.opp_abbrev}</span>
          </div>
        );
      },
      sortType: 'string',
    },
    {
      id: 'result',
      header: 'Result',
      accessor: r => r.result,
      align: 'center',
      width: 90,
      cell: (_v, row) => {
        const color = row.result === 'W' ? POS : row.result === 'OT' ? MUTED : NEG;
        return (
          <span style={{ fontWeight: 700, color }}>
            {row.result} {row.gf}–{row.ga}
          </span>
        );
      },
      sortType: 'string',
    },
    {
      id: 'gf',
      header: 'GF',
      accessor: r => r.gf,
      align: 'center',
      width: 48,
    },
    {
      id: 'ga',
      header: 'GA',
      accessor: r => r.ga,
      align: 'center',
      width: 48,
    },
    {
      id: 'xgf_pct',
      header: 'xGF%',
      accessor: r => r.xgf_5v5 + r.xga_5v5 > 0
        ? +((r.xgf_5v5 / (r.xgf_5v5 + r.xga_5v5)) * 100).toFixed(1)
        : null,
      align: 'center',
      width: 72,
      cell: v => {
        if (v == null) return <span style={{ color: MUTED }}>—</span>;
        const n = v as number;
        const color = n >= 55 ? POS : n <= 45 ? NEG : undefined;
        return <strong style={{ color, fontVariantNumeric: 'tabular-nums' }}>{n.toFixed(1)}%</strong>;
      },
    },
    {
      id: 'xgf',
      header: 'xGF',
      accessor: r => +r.xgf_5v5.toFixed(2),
      align: 'center',
      width: 64,
      cell: v => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{(v as number).toFixed(2)}</span>,
    },
    {
      id: 'xga',
      header: 'xGA',
      accessor: r => +r.xga_5v5.toFixed(2),
      align: 'center',
      width: 64,
      cell: v => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{(v as number).toFixed(2)}</span>,
    },
  ], [isDark]);

  const title = activeOpp
    ? `vs ${teamNames[activeOpp] ?? activeOpp}`
    : `Last ${displayRows.length} Games`;

  return (
    <div>
      {/* Section label row (mirrors .gl-head eyebrow text) */}
      <div style={{ ...MONO, fontSize: 10, color: 'rgba(13,13,20,0.32)', marginBottom: 4, letterSpacing: '0.06em' }}>
        {title} · {displayRows.length} game{displayRows.length !== 1 ? 's' : ''}
      </div>
      <HGBTable
        data={displayRows}
        columns={COLUMNS}
        defaultSort={{ id: 'game_date', desc: true }}
        rowHref={r => r.game_id ? `/games/${r.game_id}` : ''}
        emptyMessage="No games found."
      />
    </div>
  );
}
