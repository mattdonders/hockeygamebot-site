/**
 * WPChart.tsx — Recharts-based Win Probability area chart.
 *
 * Replaces the custom SVG renderChart() in src/pages/games/index.astro.
 * The dual-color area fill (home above midline, away below) is achieved
 * with two overlapping gradient definitions that fade to transparent at the
 * 50% boundary. Recharts does not natively support a "line changes color at
 * a value boundary" pattern, so the WP line is drawn in a neutral ink color.
 * The fills are team-colored semi-transparent gradients (home above, away below).
 */

import React, { useMemo, useId } from 'react';
import {
  ComposedChart,
  Area,
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

export type WPGoal = {
  t:         number;
  is_home:   boolean;
  scorer:    string | null;
  score:     string;
  strength?: string;
};

type ChartRow = {
  t:         number;
  wp:        number;
  _goalMeta?: WPGoal;
};

export type WPChartProps = {
  points:    Array<{ t: number; wp: number | null }>;
  goals:     WPGoal[];
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

function WPTooltip({
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

  const wp   = row.wp ?? 0.5;
  const hPct = (wp * 100).toFixed(1);
  const aPct = ((1 - wp) * 100).toFixed(1);

  const mono: React.CSSProperties = { fontFamily: "'JetBrains Mono', monospace", fontSize: 11 };

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
          {row._goalMeta.scorer ?? 'Goal'} · {row._goalMeta.score}
        </div>
      )}
      <div style={{ ...mono }}>
        <span style={{ color: homeColor, fontWeight: 700 }}>{homeAbbr}</span>
        <span style={{ color: 'rgba(13,13,20,0.56)', margin: '0 6px' }}>{hPct}%</span>
        <span style={{ color: awayColor, fontWeight: 700 }}>{awayAbbr}</span>
        <span style={{ color: 'rgba(13,13,20,0.56)', marginLeft: 6 }}>{aPct}%</span>
      </div>
    </div>
  );
}

// ── Custom goal dot ────────────────────────────────────────────────────────────

function GoalDot(props: DotItemDotProps & { homeColor: string; awayColor: string }) {
  const { cx = 0, cy = 0, payload, homeColor, awayColor } = props;
  const row = payload as ChartRow;
  if (!row?._goalMeta) return null;
  const color = row._goalMeta.is_home ? homeColor : awayColor;
  return (
    <g>
      <circle cx={cx} cy={cy} r={8} fill="none" stroke="#0d0d14" strokeWidth={0.8} strokeOpacity={0.22} />
      <circle cx={cx} cy={cy} r={6.5} fill={color} stroke="#fff" strokeWidth={1.5} fillOpacity={0.95} />
    </g>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function WPChart({
  points,
  goals,
  homeColor,
  awayColor,
  homeAbbr,
  awayAbbr,
  height = 200,
}: WPChartProps) {
  const uid = useId().replace(/:/g, '');

  const data = useMemo<ChartRow[]>(() => {
    const valid: ChartRow[] = points
      .filter(p => p.wp != null && p.t != null)
      .sort((a, b) => a.t - b.t)
      .map(p => ({ t: p.t, wp: p.wp as number }));

    // Annotate or insert goal rows
    for (const g of goals) {
      const idx = valid.findIndex(p => p.t >= g.t);
      if (idx !== -1 && valid[idx].t === g.t) {
        valid[idx]._goalMeta = g;
      } else {
        const before = idx > 0 ? valid[idx - 1] : valid[0];
        const after  = idx !== -1 ? valid[idx] : valid[valid.length - 1];
        const frac   = before && after && before.t !== after.t
          ? (g.t - before.t) / (after.t - before.t)
          : 0;
        const wp = before && after ? before.wp + frac * (after.wp - before.wp) : 0.5;
        valid.splice(idx === -1 ? valid.length : idx, 0, { t: g.t, wp, _goalMeta: g });
      }
    }
    return valid;
  }, [points, goals]);

  const maxT = data.length ? data[data.length - 1].t : 3600;
  const xTicks = [0, 1200, 2400, 3600].filter(t => t <= maxT + 1);

  if (!data.length) {
    return (
      <div style={{
        padding: '24px 0', textAlign: 'center',
        fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
        color: 'rgba(13,13,20,0.32)', letterSpacing: '0.06em',
      }}>
        Win probability not available.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 48, bottom: 4, left: 28 }}>
        <defs>
          {/* Home fill: stronger at top (wp=1), fades at bottom (wp=0) */}
          <linearGradient id={`home-fill-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={homeColor} stopOpacity={0.15} />
            <stop offset="50%"  stopColor={homeColor} stopOpacity={0.06} />
            <stop offset="100%" stopColor={homeColor} stopOpacity={0.00} />
          </linearGradient>
          {/* Away fill: stronger at bottom (wp=0), fades at top (wp=1) */}
          <linearGradient id={`away-fill-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={awayColor} stopOpacity={0.00} />
            <stop offset="50%"  stopColor={awayColor} stopOpacity={0.06} />
            <stop offset="100%" stopColor={awayColor} stopOpacity={0.15} />
          </linearGradient>
        </defs>

        <CartesianGrid strokeDasharray="3 4" stroke="rgba(13,13,20,0.07)" vertical={false} />

        {/* Period dividers */}
        {[1200, 2400, 3600].filter(t => t < maxT).map(t => (
          <ReferenceLine key={t} x={t}
            stroke="rgba(13,13,20,0.10)" strokeDasharray="4 3" strokeWidth={1} />
        ))}

        {/* 50% midline */}
        <ReferenceLine y={0.5}
          stroke="rgba(13,13,20,0.22)" strokeDasharray="4 4" strokeWidth={1.2}
          label={{
            value: '50%', position: 'left', fontSize: 9,
            fontFamily: "'Barlow Condensed', sans-serif",
            fontWeight: 700, fill: 'rgba(13,13,20,0.45)', offset: 4,
          }}
        />

        <XAxis
          dataKey="t" type="number" domain={[0, maxT]}
          ticks={xTicks} tickFormatter={periodLabel}
          tick={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 10, fontWeight: 700, fill: 'rgba(13,13,20,0.42)' }}
          axisLine={false} tickLine={false} tickMargin={4}
        />
        <YAxis
          domain={[0, 1]} ticks={[0, 0.25, 0.5, 0.75, 1.0]}
          tickFormatter={v => `${Math.round((v as number) * 100)}%`}
          tick={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fill: 'rgba(13,13,20,0.35)' }}
          axisLine={false} tickLine={false} width={28}
        />

        <Tooltip
          content={(p: TooltipContentProps<ValueType, NameType>) => (
            <WPTooltip {...p} homeAbbr={homeAbbr} awayAbbr={awayAbbr}
              homeColor={homeColor} awayColor={awayColor} />
          )}
          cursor={{ stroke: 'rgba(13,13,20,0.12)', strokeWidth: 1 }}
        />

        {/*
         * Two Area layers share the same wp data key.
         * Layer 1: home-colored gradient fill, no stroke.
         * Layer 2: away-colored gradient fill + the WP line in neutral ink.
         *
         * Recharts limitation: the WP line cannot change color at the 50%
         * boundary the way the original SVG clipPath trick achieves. We draw
         * it as a single neutral line (rgba ink). The fills visually indicate
         * which team is winning via the team colors above/below the midline.
         */}
        <Area
          type="monotone" dataKey="wp"
          fill={`url(#home-fill-${uid})`} stroke="none"
          dot={false} activeDot={false} isAnimationActive={false}
        />
        <Area
          type="monotone" dataKey="wp"
          fill={`url(#away-fill-${uid})`}
          stroke="rgba(13,13,20,0.55)" strokeWidth={2}
          dot={(p: DotItemDotProps) => (
            <GoalDot key={`dot-${p.cx}-${p.cy}`} {...p}
              homeColor={homeColor} awayColor={awayColor} />
          )}
          activeDot={false} isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
