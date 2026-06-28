/**
 * PlayerGameLogTable — Per-game stats for a player's current season.
 *
 * HGBTable-based wrapper. Opponent filter, date-desc default sort, mobile
 * column hiding, and row-click to game page are all expressed through
 * HGBTable's standard API — no custom toolbar or DOM wiring needed.
 */

import React, { useMemo } from 'react';
import HGBTable, { type HGBColumnDef, TEAM_LOGO_SIZE, TEAM_LOGO_STYLE, teamLogoSrc } from './HGBTable';
import type { GameLogEntry } from '../../lib/stats-loader';

// ── Style constants ──────────────────────────────────────────────────────────

const MONO: React.CSSProperties = { fontFamily: "'JetBrains Mono', monospace" };
const POS = '#137333';
const NEG = '#991b1b';
const INK = '#0d0d14';
const MUTED = 'rgba(13,13,20,0.48)';

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

type GameRow = GameLogEntry & {
  date_fmt: string;
  result_str: string;
  result_w: boolean;
  result_ot: boolean;
  points: number;
};

// ── Props ────────────────────────────────────────────────────────────────────

type Props = {
  games: GameLogEntry[];
  playerTeam?: string;
};

// ── Component ────────────────────────────────────────────────────────────────

export default function PlayerGameLogTable({ games }: Props) {
  const rows = useMemo<GameRow[]>(() =>
    games.map(g => {
      const win    = g.team_score > g.opp_score;
      const result = win ? 'W' : g.team_score < g.opp_score ? 'L' : 'OT';
      return {
        ...g,
        date_fmt:   fmtDate(g.game_date),
        result_str: `${result} ${g.team_score}–${g.opp_score}`,
        result_w:   win,
        result_ot:  result === 'OT',
        points:     g.goals + g.assists,
      };
    }), [games]);

  const hasToi = useMemo(() => rows.some(r => r.toi_sec != null), [rows]);
  const hasIxg = useMemo(() => rows.some(r => r.ixg != null),    [rows]);

  const columns = useMemo<HGBColumnDef<GameRow>[]>(() => {
    const cols: HGBColumnDef<GameRow>[] = [
      {
        id: 'game_date', header: 'Date', align: 'left', width: 72, sortType: 'string',
        accessor: r => r.game_date,
        cell: (_, row) => <span style={MONO}>{row.date_fmt}</span>,
        exportText: (_, row) => row.date_fmt,
      },
      {
        id: 'opp', header: 'Opp', align: 'center', width: 80, sortType: 'string',
        accessor: r => r.opp_abbrev,
        cell: (_, row) => (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
            <img src={teamLogoSrc(row.opp_abbrev)} width={TEAM_LOGO_SIZE} height={TEAM_LOGO_SIZE}
              style={TEAM_LOGO_STYLE} alt={row.opp_abbrev}
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            <span style={{ ...MONO, fontSize: 11, color: MUTED }}>{row.opp_abbrev}</span>
          </div>
        ),
        exportText: v => String(v),
      },
      {
        id: 'ha', header: 'H/A', align: 'center', width: 48, sortType: 'string',
        accessor: r => r.is_home ? 'H' : 'A',
        cell: v => (
          <span style={{ ...MONO, fontSize: 10, letterSpacing: '0.08em', padding: '2px 6px',
            border: '1px solid rgba(13,13,20,0.14)',
            background: v === 'H' ? 'rgba(13,13,20,0.06)' : 'transparent',
            color: v === 'H' ? INK : MUTED }}>
            {v}
          </span>
        ),
      },
      {
        id: 'result', header: 'Result', align: 'center', width: 84, sortType: 'string',
        accessor: r => r.result_str,
        cell: (_, row) => {
          const color = row.result_w ? POS : row.result_ot ? MUTED : NEG;
          return <span style={{ ...MONO, fontWeight: 700, color, whiteSpace: 'nowrap' }}>{row.result_str}</span>;
        },
      },
      { id: 'goals',   header: 'G',   align: 'center', width: 44, accessor: r => r.goals },
      { id: 'assists', header: 'A',   align: 'center', width: 44, accessor: r => r.assists },
      { id: 'points',  header: 'PTS', align: 'center', width: 48, accessor: r => r.points },
      {
        id: 'gs', header: 'Impact', align: 'center', width: 72, sortType: 'number',
        accessor: r => r.gs_display,
        cell: v => {
          const n = v as number;
          const color = n >= 0 ? POS : NEG;
          return <span style={{ ...MONO, fontWeight: 700, color }}>{(n >= 0 ? '+' : '') + n.toFixed(2)}</span>;
        },
      },
    ];

    if (hasIxg) {
      cols.push({
        id: 'ixg', header: 'xG', align: 'center', width: 52, mobileHidden: true,
        accessor: r => r.ixg ?? null,
        cell: v => <span>{v == null ? '—' : Number(v).toFixed(2)}</span>,
      });
    }
    if (hasToi) {
      cols.push({
        id: 'toi', header: 'TOI', align: 'center', width: 60, mobileHidden: true,
        accessor: r => r.toi_sec ?? null,
        cell: v => <span>{fmtToi(v as number | null)}</span>,
        exportText: v => fmtToi(v as number | null),
      });
    }

    return cols;
  }, [hasToi, hasIxg]);

  return (
    <HGBTable
      data={rows}
      columns={columns}
      defaultSort={{ id: 'game_date', desc: true }}
      filters={[{ type: 'search', placeholder: 'Filter opponent…', field: (r: GameRow) => r.opp_abbrev }]}
      rowHref={r => r.game_id ? `/games/${r.game_id}` : undefined}
      maxHeight={400}
      emptyMessage="No games found."
      toolbar={{ csv: false, png: false, columns: false }}
    />
  );
}
