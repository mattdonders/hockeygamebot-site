/**
 * TeamSkatersTable — Skater leaderboard for a single team page.
 * Consumed by /teams/[abbr].astro.
 *
 * Season view: pre-computed PlayerRecord stats.
 * Opponent-filtered view: aggregated from playerGameMap.
 *
 * Columns: #, Player, Pos, GP, WAR, G/60 (or G), A1/60 (or A), xG/60, Fin, Impact
 */

import React, { useMemo, useState, useEffect } from 'react';
import HGBTable, {
  type HGBColumnDef,
  TEAM_LOGO_SIZE,
  TEAM_LOGO_STYLE,
  teamLogoSrc,
  NAME_FONT_SIZE,
} from './HGBTable';
import type { PlayerSummary, GameLogEntry } from '../../lib/stats-loader';

type Props = {
  players: PlayerSummary[];
  /** Map of player_id -> game log entries for this team */
  playerGameMap: Record<number, GameLogEntry[]>;
  /** Initial opponent filter from URL param — '' means season view */
  initialOpp?: string;
};

const POS = '#166534';
const NEG = '#991b1b';
const MUTED = 'rgba(13,13,20,0.48)';
const MONO: React.CSSProperties = { fontFamily: "'JetBrains Mono', monospace" };

const sgn = (v: number) => v >= 0 ? '+' : '';

function pctCls(p: number | null) {
  if (p == null) return MUTED;
  return p >= 90 ? '#00c078' : p >= 70 ? '#60a5fa' : p >= 40 ? 'rgba(13,13,20,0.32)' : 'rgba(232,0,45,0.65)';
}

function ordinal(p: number | null) {
  if (p == null) return '';
  const s = (p % 100 >= 11 && p % 100 <= 13) ? 'th'
    : p % 10 === 1 ? 'st' : p % 10 === 2 ? 'nd' : p % 10 === 3 ? 'rd' : 'th';
  return `${p}${s}`;
}

// Unified row type for the table
type SkaterDisplayRow = {
  slug:    string;
  name:    string;
  team:    string;
  pos:     string;
  gp:      number;
  war:     number | null;
  g60:     number | null;  // G/60 in season mode, raw G in opp mode
  a60:     number | null;  // A1/60 in season mode, raw A in opp mode
  x60:     number | null;
  fin:     number | null;
  fin_p:   number | null;
  imp:     number | null;
  imp_p:   number | null;
  isOpp:   boolean;
};

export default function TeamSkatersTable({ players, playerGameMap, initialOpp = '' }: Props) {
  const [isDark, setIsDark] = useState(false);
  const [activeOpp, setActiveOpp] = useState(initialOpp);

  useEffect(() => {
    const check = () => setIsDark(document.documentElement.dataset.theme === 'dark');
    check();
    const obs = new MutationObserver(check);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);

  // Listen for opponent filter changes from the vanilla dropdown
  useEffect(() => {
    const handler = (e: Event) => {
      setActiveOpp((e as CustomEvent<string>).detail);
    };
    document.addEventListener('hgb:team-opp-filter', handler);
    return () => document.removeEventListener('hgb:team-opp-filter', handler);
  }, []);

  const isOpp = activeOpp !== '';

  const rows = useMemo<SkaterDisplayRow[]>(() => {
    if (!isOpp) {
      // Season view: use pre-computed PlayerRecord values
      return players.map(p => ({
        slug:   p.slug,
        name:   p.display_name,
        team:   p.team_abbrev,
        pos:    p.pos,
        gp:     p.gp,
        war:    p.rapm != null ? +(p.rapm * 60).toFixed(2) : null,
        g60:    +p.rates_per_60.goals.toFixed(2),
        a60:    +p.rates_per_60.a1.toFixed(2),
        x60:    +p.rates_per_60.ixg.toFixed(2),
        fin:    +p.rates_per_60.finishing.toFixed(2),
        fin_p:  Math.round(p.percentiles_vs_pos.finishing),
        imp:    +p.avg_gs_display.toFixed(2),
        imp_p:  Math.round(p.gs_pct),
        isOpp:  false,
      }));
    }

    // Opponent-filtered view: aggregate from game logs
    return players.flatMap(p => {
      const games = (playerGameMap[p.player_id] ?? []).filter(g => g.opp_abbrev === activeOpp);
      if (!games.length) return [];
      const g   = games.reduce((s, x) => s + x.goals, 0);
      const a   = games.reduce((s, x) => s + x.assists, 0);
      const toi = games.reduce((s, x) => s + (x.toi_sec ?? 0), 0);
      const ixg = games.reduce((s, x) => s + (x.ixg ?? 0), 0);
      const imp = games.reduce((s, x) => s + x.gs_display, 0) / games.length;
      const toi60 = toi / 3600 || null;
      return [{
        slug:  p.slug,
        name:  p.display_name,
        team:  p.team_abbrev,
        pos:   p.pos,
        gp:    games.length,
        war:   p.rapm != null ? +(p.rapm * 60).toFixed(2) : null,
        // In opp mode: raw G / A counts instead of rates
        g60:   g,
        a60:   a,
        x60:   toi60 ? +(ixg / toi60).toFixed(2) : null,
        fin:   null,
        fin_p: null,
        imp:   +imp.toFixed(2),
        imp_p: null,
        isOpp: true,
      }];
    });
  }, [players, playerGameMap, activeOpp, isOpp]);

  const COLUMNS = useMemo<HGBColumnDef<SkaterDisplayRow>[]>(() => [
    {
      id: 'name',
      header: 'Player',
      accessor: r => r.name,
      align: 'left',
      width: 180,
      cell: (_v, row) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <img
            src={teamLogoSrc(row.team, isDark)}
            width={TEAM_LOGO_SIZE - 8}
            height={TEAM_LOGO_SIZE - 8}
            style={TEAM_LOGO_STYLE}
            alt={row.team}
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
          <div>
            <div style={{ fontFamily: "'Barlow', sans-serif", fontWeight: 600, fontSize: NAME_FONT_SIZE }}>
              {row.name}
            </div>
            <div style={{ ...MONO, fontSize: 9, color: MUTED }}>
              {row.pos} · {row.gp} GP{row.isOpp ? ` vs ${activeOpp}` : ''}
            </div>
          </div>
        </div>
      ),
      sortType: 'string',
    },
    {
      id: 'pos',
      header: 'Pos',
      accessor: r => r.pos,
      align: 'center',
      width: 44,
      mobileHidden: true,
    },
    {
      id: 'gp',
      header: 'GP',
      accessor: r => r.gp,
      align: 'center',
      width: 44,
    },
    {
      id: 'war',
      header: 'WAR',
      accessor: r => r.war,
      align: 'center',
      width: 80,
      cell: (v, row) => {
        if (v == null) return <span style={{ color: MUTED }}>—</span>;
        const n = v as number;
        return (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.2 }}>
            <span style={{ fontWeight: 700, color: n >= 0 ? POS : NEG, fontVariantNumeric: 'tabular-nums' }}>
              {sgn(n)}{n.toFixed(2)}
            </span>
            {row.isOpp && (
              <span style={{ ...MONO, fontSize: 9, color: MUTED }}>season</span>
            )}
          </div>
        );
      },
    },
    {
      id: 'g60',
      header: isOpp ? 'G' : 'G/60',
      accessor: r => r.g60,
      align: 'center',
      width: 60,
      cell: v => v != null ? <span style={{ fontVariantNumeric: 'tabular-nums' }}>{isOpp ? String(v) : (v as number).toFixed(2)}</span> : <span style={{ color: MUTED }}>—</span>,
    },
    {
      id: 'a60',
      header: isOpp ? 'A' : 'A1/60',
      accessor: r => r.a60,
      align: 'center',
      width: 60,
      cell: v => v != null ? <span style={{ fontVariantNumeric: 'tabular-nums' }}>{isOpp ? String(v) : (v as number).toFixed(2)}</span> : <span style={{ color: MUTED }}>—</span>,
    },
    {
      id: 'x60',
      header: 'xG/60',
      accessor: r => r.x60,
      align: 'center',
      width: 60,
      cell: v => v != null ? <span style={{ fontVariantNumeric: 'tabular-nums' }}>{(v as number).toFixed(2)}</span> : <span style={{ color: MUTED }}>—</span>,
    },
    {
      id: 'fin',
      header: 'Fin',
      accessor: r => r.fin,
      align: 'center',
      width: 64,
      cell: v => {
        if (v == null) return <span style={{ color: MUTED }}>—</span>;
        const n = v as number;
        return <span style={{ color: n >= 0 ? POS : NEG, fontVariantNumeric: 'tabular-nums' }}>{sgn(n)}{n.toFixed(2)}</span>;
      },
    },
    {
      id: 'imp',
      header: 'Impact',
      accessor: r => r.imp,
      align: 'center',
      width: 80,
      cell: (v, row) => {
        if (v == null) return <span style={{ color: MUTED }}>—</span>;
        const n = v as number;
        return (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.2, gap: 1 }}>
            <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{n.toFixed(2)}</strong>
            {row.imp_p != null && (
              <span style={{ ...MONO, fontSize: 9, color: pctCls(row.imp_p) }}>{ordinal(row.imp_p)}</span>
            )}
          </div>
        );
      },
    },
  ], [isDark, isOpp, activeOpp]);

  const defaultSort = isOpp
    ? { id: 'imp', desc: true }
    : { id: 'name', desc: false };

  return (
    <div>
      <HGBTable
        data={rows}
        columns={COLUMNS}
        defaultSort={defaultSort}
        rowHref={r => `/stats/player/${r.slug}`}
        emptyMessage={isOpp ? `No qualifying players vs ${activeOpp}.` : 'No skater data available.'}
      />
    </div>
  );
}
