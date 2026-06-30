/**
 * XGChart.tsx — Recharts-based cumulative xG step chart.
 *
 * Replaces the custom SVG renderXgChart() in src/pages/games/index.astro.
 * Two step-after lines (home + away), goal dot markers at actual goal
 * timestamps, and period dividers matching the WP chart style.
 *
 * The points array from /flow provides cumulative xg_home / xg_away values.
 * No summing is needed — these are already running totals.
 */

import React, { useMemo } from 'react';
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import type { DotItemDotProps } from 'recharts/types/util/types';
import type { TooltipContentProps } from 'recharts/types/component/Tooltip';
import type { ValueType, NameType } from 'recharts/types/component/DefaultTooltipContent';

// ── Types ─────────────────────────────────────────────────────────────────────

export type XGGoal = {
  t:       number;
  is_home: boolean;
  scorer:  string | null;
};

type ChartRow = {
  t:         number;
  xg_home:   number;
  xg_away:   number;
  _goalMeta?: XGGoal;
};

export type XGChartProps = {
  points:    Array<{ t: number; xg_home: number | null; xg_away: number | null }>;
  goals:     XGGoal[];
  homeColor: string;
  awayColor: string;
  homeAbbr:  string;
  awayAbbr:  string;
  height?:   number;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function tLabel(t: number): string {
  if (t < 1200) {
    const m = Math.floor(t / 60), s = t % 60;
    return `P1 ${m}:${String(s).padStart(2, '0')}`;
  }
  if (t < 2400) {
    const e = t - 1200, m = Math.floor(e / 60), s = e % 60;
    return `P2 ${m}:${String(s).padStart(2, '0')}`;
  }
  if (t < 3600) {
    const e = t - 2400, m = Math.floor(e / 60), s = e % 60;
    return `P3 ${m}:${String(s).padStart(2, '0')}`;
  }
  const e = t - 3600, m = Math.floor(e / 60), s = e % 60;
  return `OT ${m}:${String(s).padStart(2, '0')}`;
}

function periodLabel(t: number): string {
  if (t === 0)    return 'P1';
  if (t === 1200) return 'P2';
  if (t === 2400) return 'P3';
  if (t === 3600) return 'OT';
  return '';
}

// ── Custom tooltip ─────────────────────────────────────────────────────────────

function XGTooltip({
  active,
  payload,
  homeAbbr,
  awayAbbr,
  homeColor,
  awayColor,
}: TooltipContentProps<ValueType, NameType> & {
  homeAbbr:  string;
  awayAbbr:  string;
  homeColor: string;
  awayColor: string;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as ChartRow | undefined;
  if (!row) return null;

  const mono: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 11 };

  return (
    <div style={{
      background: '#fff',
      border: '1px solid rgba(13,13,20,0.14)',
      padding: '8px 12px',
      lineHeight: 1.6,
      minWidth: 160,
    }}>
      <div style={{ ...mono, fontSize: 10, color: 'rgba(13,13,20,0.42)', marginBottom: 4 }}>
        {tLabel(row.t)}
      </div>
      {row._goalMeta && (
        <div style={{ ...mono, fontSize: 10, color: 'rgba(13,13,20,0.64)', marginBottom: 4 }}>
          {row._goalMeta.scorer ?? 'Goal'}
        </div>
      )}
      <div style={{ ...mono }}>
        <span style={{ color: homeColor, fontWeight: 700 }}>{homeAbbr}</span>
        <span style={{ color: 'rgba(13,13,20,0.56)', margin: '0 6px' }}>{row.xg_home.toFixed(2)}</span>
        <span style={{ color: awayColor, fontWeight: 700 }}>{awayAbbr}</span>
        <span style={{ color: 'rgba(13,13,20,0.56)', marginLeft: 6 }}>{row.xg_away.toFixed(2)}</span>
      </div>
    </div>
  );
}

// ── Custom goal dot (for a specific team's line) ───────────────────────────────

function makeGoalDot(isHome: boolean, homeColor: string, awayColor: string) {
  return function GoalDot(props: DotItemDotProps) {
    const { cx = 0, cy = 0, payload } = props;
    const row = payload as ChartRow;
    if (!row?._goalMeta) return null;
    // Only show dot on the line matching the scoring team
    if (row._goalMeta.is_home !== isHome) return null;
    const color = isHome ? homeColor : awayColor;
    return (
      <g>
        <circle cx={cx} cy={cy} r={7} fill="none" stroke="#0d0d14" strokeWidth={0.8} strokeOpacity={0.22} />
        <circle cx={cx} cy={cy} r={5.5} fill={color} stroke="#fff" strokeWidth={1.2} fillOpacity={0.95} />
      </g>
    );
  };
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function XGChart({
  points,
  goals,
  homeColor,
  awayColor,
  homeAbbr,
  awayAbbr,
  height = 160,
}: XGChartProps) {

  const data = useMemo<ChartRow[]>(() => {
    const valid: ChartRow[] = points
      .filter(p => p.t != null && (p.xg_home != null || p.xg_away != null))
      .sort((a, b) => a.t - b.t)
      .map(p => ({
        t:       p.t,
        xg_home: p.xg_home ?? 0,
        xg_away: p.xg_away ?? 0,
      }));

    // Seed t=0 origin
    if (!valid.length || valid[0].t !== 0) {
      valid.unshift({ t: 0, xg_home: 0, xg_away: 0 });
    }

    // Build goal-time lookup for cumulative xG at any time t
    function cumAt(arr: ChartRow[], t: number, key: 'xg_home' | 'xg_away'): number {
      let v = 0;
      for (const p of arr) {
        if (p.t > t) break;
        v = p[key];
      }
      return v;
    }

    // Annotate / insert goal rows
    for (const g of goals) {
      const idx = valid.findIndex(p => p.t >= g.t);
      if (idx !== -1 && valid[idx].t === g.t) {
        valid[idx]._goalMeta = g;
      } else {
        const h = cumAt(valid, g.t, 'xg_home');
        const a = cumAt(valid, g.t, 'xg_away');
        valid.splice(idx === -1 ? valid.length : idx, 0, {
          t: g.t, xg_home: h, xg_away: a, _goalMeta: g,
        });
      }
    }
    return valid;
  }, [points, goals]);

  const maxT = data.length ? Math.max(...data.map(d => d.t)) : 3600;
  const maxXG = data.length
    ? Math.max(...data.map(d => Math.max(d.xg_home, d.xg_away)), 0.5)
    : 3;
  const yMax = Math.ceil(maxXG * 2) / 2 + 0.3;
  const xTicks = [0, 1200, 2400, 3600].filter(t => t <= maxT + 1);
  const yTicks: number[] = [];
  for (let v = 0; v <= Math.ceil(maxXG); v++) yTicks.push(v);

  // Stable dot renderers (created once per render cycle, not per dot)
  const HomeDot = useMemo(() => makeGoalDot(true, homeColor, awayColor),  [homeColor, awayColor]);
  const AwayDot = useMemo(() => makeGoalDot(false, homeColor, awayColor), [homeColor, awayColor]);

  if (!data.length) {
    return (
      <div style={{
        padding: '24px 0', textAlign: 'center',
        fontFamily: 'var(--mono)', fontSize: 12,
        color: 'rgba(13,13,20,0.32)', letterSpacing: '0.06em',
      }}>
        xG data not available.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 48, bottom: 4, left: 28 }}>
        <CartesianGrid strokeDasharray="3 4" stroke="rgba(13,13,20,0.07)" vertical={false} />

        {/* Period dividers */}
        {[1200, 2400, 3600].filter(t => t < maxT).map(t => (
          <ReferenceLine key={t} x={t}
            stroke="rgba(13,13,20,0.10)" strokeDasharray="4 3" strokeWidth={1} />
        ))}

        <XAxis
          dataKey="t" type="number" domain={[0, maxT]}
          ticks={xTicks} tickFormatter={periodLabel}
          tick={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 10, fontWeight: 700, fill: 'rgba(13,13,20,0.42)' }}
          axisLine={false} tickLine={false} tickMargin={4}
        />
        <YAxis
          domain={[0, yMax]} ticks={yTicks}
          tick={{ fontFamily: 'var(--mono)', fontSize: 9, fill: 'rgba(13,13,20,0.35)' }}
          axisLine={false} tickLine={false} width={28}
        />

        <Tooltip
          content={(p: TooltipContentProps<ValueType, NameType>) => (
            <XGTooltip {...p} homeAbbr={homeAbbr} awayAbbr={awayAbbr}
              homeColor={homeColor} awayColor={awayColor} />
          )}
          cursor={{ stroke: 'rgba(13,13,20,0.12)', strokeWidth: 1 }}
        />

        {/* Away step line — drawn first (behind home) */}
        <Line
          type="stepAfter" dataKey="xg_away"
          stroke={awayColor} strokeWidth={2.5}
          dot={AwayDot}
          activeDot={false} isAnimationActive={false}
        />

        {/* Home step line */}
        <Line
          type="stepAfter" dataKey="xg_home"
          stroke={homeColor} strokeWidth={2.5}
          dot={HomeDot}
          activeDot={false} isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
