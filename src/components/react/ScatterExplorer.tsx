/**
 * ScatterExplorer.tsx — React scatter plot explorer for /stats/explore replacement POC.
 *
 * Pure SVG rendering with manual coordinate math — no D3.
 * Responsive via ResizeObserver. Hover tooltips + click-to-label (up to 5 pins).
 * Axis selectors, position filter chips, min GP filter.
 */

import React, {
  useState,
  useMemo,
  useRef,
  useEffect,
  useCallback,
} from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

export type Player = {
  display_name: string;
  team_abbrev: string;
  pos: string;
  pos_group: 'F' | 'D';
  gp: number;
  slug: string;
  rates_per_60: { ixg: number; shots: number; goals: number; assists: number };
  percentiles_vs_pos: { ev_offence: number; ev_defence: number };
  hgb_war: number | null;
  hgb_rating_percentile: number | null;
  goals: number;
  assists: number;
  points: number;
  toi_avg_sec: number;
};

export type ScatterExplorerProps = {
  players: Player[];
};

// ── Stat axis definitions ─────────────────────────────────────────────────────

type StatKey =
  | 'goals_60'
  | 'assists_60'
  | 'points_60'
  | 'ixg_60'
  | 'shots_60'
  | 'ev_offence_pct'
  | 'ev_defence_pct'
  | 'toi_per_game'
  | 'hgb_rating_pct'
  | 'hgb_war';

type StatDef = {
  key: StatKey;
  label: string;
  format: (v: number) => string;
  getValue: (p: Player) => number | null;
};

const STAT_DEFS: StatDef[] = [
  {
    key: 'ixg_60',
    label: 'iXG/60',
    format: v => v.toFixed(2),
    getValue: p => p.rates_per_60.ixg,
  },
  {
    key: 'goals_60',
    label: 'Goals/60',
    format: v => v.toFixed(2),
    getValue: p => p.rates_per_60.goals,
  },
  {
    key: 'assists_60',
    label: 'Assists/60',
    format: v => v.toFixed(2),
    getValue: p => p.rates_per_60.assists,
  },
  {
    key: 'points_60',
    label: 'Points/60',
    format: v => v.toFixed(2),
    getValue: p => p.rates_per_60.goals + p.rates_per_60.assists,
  },
  {
    key: 'shots_60',
    label: 'Shots/60',
    format: v => v.toFixed(1),
    getValue: p => p.rates_per_60.shots,
  },
  {
    key: 'ev_offence_pct',
    label: 'EV Offense %',
    format: v => v.toFixed(1),
    getValue: p => p.percentiles_vs_pos.ev_offence,
  },
  {
    key: 'ev_defence_pct',
    label: 'EV Defense %',
    format: v => v.toFixed(1),
    getValue: p => p.percentiles_vs_pos.ev_defence,
  },
  {
    key: 'toi_per_game',
    label: 'TOI/game',
    format: v => {
      const m = Math.floor(v / 60);
      const s = Math.round(v % 60);
      return `${m}:${String(s).padStart(2, '0')}`;
    },
    getValue: p => p.toi_avg_sec,
  },
  {
    key: 'hgb_rating_pct',
    label: 'HGB Rating %',
    format: v => v.toFixed(1),
    getValue: p => p.hgb_rating_percentile,
  },
  {
    key: 'hgb_war',
    label: 'HGB WAR',
    format: v => v.toFixed(3),
    getValue: p => p.hgb_war,
  },
];

const STAT_MAP = Object.fromEntries(STAT_DEFS.map(d => [d.key, d])) as Record<StatKey, StatDef>;

// ── Design tokens ─────────────────────────────────────────────────────────────

const BG = '#EFEEE8';
const INK = '#0d0d14';
const SURFACE = '#FFFFFF';
const BORDER = '1px solid rgba(13,13,20,0.14)';
const MUTED = 'rgba(13,13,20,0.48)';
const GRID = 'rgba(13,13,20,0.07)';

const MONO: React.CSSProperties = { fontFamily: 'var(--mono)' };
const BODY: React.CSSProperties = { fontFamily: 'var(--body)' };
const DISPLAY: React.CSSProperties = { fontFamily: "'Barlow Condensed', sans-serif" };

// Dot colors: forward=HGB blue, defense=warm gold
const DOT_F = '#2563EB';
const DOT_D = '#B89A5A';

// ── Geometry helpers ──────────────────────────────────────────────────────────

const TICK_COUNT = 5;
const PAD = { top: 24, right: 28, bottom: 48, left: 54 };

function niceRange(values: number[]): [number, number] {
  if (!values.length) return [0, 1];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = span * 0.08;
  return [min - pad, max + pad];
}

function ticks(min: number, max: number, n: number): number[] {
  const step = (max - min) / (n - 1);
  return Array.from({ length: n }, (_, i) => min + i * step);
}

function toSVG(
  value: number,
  min: number,
  max: number,
  svgMin: number,
  svgMax: number,
): number {
  const t = (value - min) / (max - min);
  return svgMin + t * (svgMax - svgMin);
}

function median(arr: number[]): number {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

type TooltipData = {
  x: number;
  y: number;
  svgX: number;
  svgY: number;
  player: Player;
  xVal: number;
  yVal: number;
  xDef: StatDef;
  yDef: StatDef;
};

function Tooltip({ data, svgWidth }: { data: TooltipData; svgWidth: number }) {
  const TW = 200;
  const TH = 86;
  const MARGIN = 12;

  // Flip horizontally if dot is in the right half
  const flipX = data.svgX + TW + MARGIN > svgWidth;
  const left = flipX ? data.svgX - TW - MARGIN : data.svgX + MARGIN;
  const top = Math.max(4, data.svgY - TH / 2);

  return (
    <div
      style={{
        position: 'absolute',
        left,
        top,
        width: TW,
        background: SURFACE,
        border: BORDER,
        padding: '10px 12px',
        pointerEvents: 'none',
        zIndex: 20,
        lineHeight: 1.5,
      }}
    >
      <div
        style={{
          ...DISPLAY,
          fontWeight: 700,
          fontSize: 14,
          textTransform: 'uppercase',
          letterSpacing: '-0.01em',
          color: INK,
          marginBottom: 2,
        }}
      >
        {data.player.display_name}
      </div>
      <div style={{ ...MONO, fontSize: 10, color: MUTED, marginBottom: 6 }}>
        {data.player.team_abbrev} · {data.player.pos} · {data.player.gp} GP
      </div>
      <div style={{ ...MONO, fontSize: 10, color: INK }}>
        <span style={{ color: MUTED }}>{data.xDef.label}: </span>
        {data.xDef.format(data.xVal)}
      </div>
      <div style={{ ...MONO, fontSize: 10, color: INK }}>
        <span style={{ color: MUTED }}>{data.yDef.label}: </span>
        {data.yDef.format(data.yVal)}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

const MAX_PINS = 5;
const DOT_BASE_R = 6;

export default function ScatterExplorer({ players: rawPlayers }: ScatterExplorerProps) {
  // ── Control state ────────────────────────────────────────────────────────────

  const [xKey, setXKey] = useState<StatKey>('ixg_60');
  const [yKey, setYKey] = useState<StatKey>('ev_offence_pct');
  const [posFilter, setPosFilter] = useState<'all' | 'F' | 'D'>('all');
  const [minGP, setMinGP] = useState(20);
  const [hoveredSlug, setHoveredSlug] = useState<string | null>(null);
  const [pinnedSlugs, setPinnedSlugs] = useState<string[]>([]);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);

  // ── Sizing ───────────────────────────────────────────────────────────────────

  const containerRef = useRef<HTMLDivElement>(null);
  const [svgWidth, setSvgWidth] = useState(600);
  const svgHeight = 400;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setSvgWidth(Math.floor(w));
    });
    ro.observe(el);
    setSvgWidth(Math.floor(el.getBoundingClientRect().width) || 600);
    return () => ro.disconnect();
  }, []);

  // ── Derived data ─────────────────────────────────────────────────────────────

  const xDef = STAT_MAP[xKey];
  const yDef = STAT_MAP[yKey];

  const filtered = useMemo(() => {
    return rawPlayers.filter(p => {
      if (p.gp < minGP) return false;
      if (posFilter !== 'all' && p.pos_group !== posFilter) return false;
      const xv = xDef.getValue(p);
      const yv = yDef.getValue(p);
      return xv != null && yv != null;
    });
  }, [rawPlayers, minGP, posFilter, xDef, yDef]);

  const xValues = useMemo(
    () => filtered.map(p => xDef.getValue(p) as number),
    [filtered, xDef],
  );
  const yValues = useMemo(
    () => filtered.map(p => yDef.getValue(p) as number),
    [filtered, yDef],
  );

  const [xMin, xMax] = useMemo(() => niceRange(xValues), [xValues]);
  const [yMin, yMax] = useMemo(() => niceRange(yValues), [yValues]);

  const xTicks = useMemo(() => ticks(xMin, xMax, TICK_COUNT), [xMin, xMax]);
  const yTicks = useMemo(() => ticks(yMin, yMax, TICK_COUNT), [yMin, yMax]);

  const medX = useMemo(() => median(xValues), [xValues]);
  const medY = useMemo(() => median(yValues), [yValues]);

  // Chart area bounds
  const plotLeft = PAD.left;
  const plotRight = svgWidth - PAD.right;
  const plotTop = PAD.top;
  const plotBottom = svgHeight - PAD.bottom;

  function toSVGX(v: number) {
    return toSVG(v, xMin, xMax, plotLeft, plotRight);
  }
  function toSVGY(v: number) {
    // SVG Y is inverted: larger value = smaller Y
    return toSVG(v, yMin, yMax, plotBottom, plotTop);
  }

  // Rating percentile for dot sizing
  const ratingValues = useMemo(
    () => filtered.map(p => p.hgb_rating_percentile ?? 50),
    [filtered],
  );
  const ratingMin = Math.min(...ratingValues);
  const ratingMax = Math.max(...ratingValues) || 1;

  function dotRadius(p: Player): number {
    const r = p.hgb_rating_percentile;
    if (r == null) return DOT_BASE_R;
    const norm = (r - ratingMin) / (ratingMax - ratingMin);
    return DOT_BASE_R + norm * 4; // range: 6–10px
  }

  // ── Interactivity ────────────────────────────────────────────────────────────

  const handleDotClick = useCallback((slug: string) => {
    setPinnedSlugs(prev => {
      if (prev.includes(slug)) return prev.filter(s => s !== slug);
      if (prev.length >= MAX_PINS) return [...prev.slice(1), slug];
      return [...prev, slug];
    });
  }, []);

  const handleDotEnter = useCallback(
    (
      e: React.MouseEvent<SVGCircleElement>,
      p: Player,
      svgX: number,
      svgY: number,
      xVal: number,
      yVal: number,
    ) => {
      setHoveredSlug(p.slug);
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setTooltip({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        svgX,
        svgY,
        player: p,
        xVal,
        yVal,
        xDef,
        yDef,
      });
    },
    [xDef, yDef],
  );

  const handleDotLeave = useCallback(() => {
    setHoveredSlug(null);
    setTooltip(null);
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div style={{ ...BODY, color: INK }}>
      {/* Controls */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          alignItems: 'center',
          marginBottom: 16,
          paddingBottom: 14,
          borderBottom: BORDER,
        }}
      >
        {/* X axis selector */}
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            ...MONO,
            fontSize: 10,
            color: MUTED,
          }}
        >
          X AXIS
          <select
            value={xKey}
            onChange={e => setXKey(e.target.value as StatKey)}
            style={selectStyle}
          >
            {STAT_DEFS.map(d => (
              <option key={d.key} value={d.key}>
                {d.label}
              </option>
            ))}
          </select>
        </label>

        {/* Y axis selector */}
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            ...MONO,
            fontSize: 10,
            color: MUTED,
          }}
        >
          Y AXIS
          <select
            value={yKey}
            onChange={e => setYKey(e.target.value as StatKey)}
            style={selectStyle}
          >
            {STAT_DEFS.map(d => (
              <option key={d.key} value={d.key}>
                {d.label}
              </option>
            ))}
          </select>
        </label>

        {/* Divider */}
        <span
          style={{
            width: 1,
            height: 20,
            background: 'rgba(13,13,20,0.12)',
            flexShrink: 0,
          }}
        />

        {/* Position filter chips */}
        <div style={{ display: 'flex', gap: 4 }}>
          {(['all', 'F', 'D'] as const).map(v => (
            <button
              key={v}
              onClick={() => setPosFilter(v)}
              style={{
                ...MONO,
                fontSize: 10,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                padding: '5px 10px',
                border: '1px solid rgba(13,13,20,0.2)',
                background: posFilter === v ? INK : 'transparent',
                color: posFilter === v ? BG : MUTED,
                cursor: 'pointer',
              }}
            >
              {v === 'all' ? 'All' : v === 'F' ? 'Fwd' : 'Def'}
            </button>
          ))}
        </div>

        {/* Min GP filter */}
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            ...MONO,
            fontSize: 10,
            color: MUTED,
          }}
        >
          MIN GP
          <input
            type="number"
            min={0}
            max={82}
            value={minGP}
            onChange={e => setMinGP(Math.max(0, Number(e.target.value)))}
            style={numberInputStyle}
          />
        </label>

        {/* Count */}
        <span
          style={{
            ...MONO,
            fontSize: 10,
            color: 'rgba(13,13,20,0.32)',
            marginLeft: 'auto',
          }}
        >
          {filtered.length} players
        </span>
      </div>

      {/* SVG plot */}
      <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
        <svg
          width={svgWidth}
          height={svgHeight}
          style={{ display: 'block', background: SURFACE, border: BORDER }}
        >
          {/* Grid lines at Y ticks */}
          {yTicks.map((v, i) => {
            const cy = toSVGY(v);
            return (
              <line
                key={`gy-${i}`}
                x1={plotLeft}
                x2={plotRight}
                y1={cy}
                y2={cy}
                stroke={GRID}
                strokeDasharray="3 4"
                strokeWidth={1}
              />
            );
          })}

          {/* Grid lines at X ticks */}
          {xTicks.map((v, i) => {
            const cx = toSVGX(v);
            return (
              <line
                key={`gx-${i}`}
                x1={cx}
                x2={cx}
                y1={plotTop}
                y2={plotBottom}
                stroke={GRID}
                strokeDasharray="3 4"
                strokeWidth={1}
              />
            );
          })}

          {/* Median reference lines */}
          {xValues.length > 0 && (
            <>
              <line
                x1={toSVGX(medX)}
                x2={toSVGX(medX)}
                y1={plotTop}
                y2={plotBottom}
                stroke="rgba(13,13,20,0.18)"
                strokeDasharray="5 3"
                strokeWidth={1}
              />
              <line
                x1={plotLeft}
                x2={plotRight}
                y1={toSVGY(medY)}
                y2={toSVGY(medY)}
                stroke="rgba(13,13,20,0.18)"
                strokeDasharray="5 3"
                strokeWidth={1}
              />
            </>
          )}

          {/* Quadrant labels */}
          {xValues.length > 0 && (() => {
            const cx = toSVGX(medX);
            const cy = toSVGY(medY);
            const labelStyle = {
              fontFamily: "'Barlow Condensed', sans-serif",
              fontSize: 10,
              fontWeight: 700 as const,
              fill: 'rgba(13,13,20,0.16)',
              letterSpacing: '0.10em',
              textTransform: 'uppercase' as const,
            };
            return (
              <>
                <text
                  x={cx + (plotRight - cx) / 2}
                  y={cy - (cy - plotTop) / 2}
                  textAnchor="middle"
                  style={labelStyle}
                >
                  ELITE
                </text>
                <text
                  x={plotLeft + (cx - plotLeft) / 2}
                  y={cy + (plotBottom - cy) / 2}
                  textAnchor="middle"
                  style={labelStyle}
                >
                  LIMITED
                </text>
              </>
            );
          })()}

          {/* Y axis ticks + labels */}
          {yTicks.map((v, i) => {
            const cy = toSVGY(v);
            return (
              <text
                key={`yt-${i}`}
                x={plotLeft - 6}
                y={cy + 4}
                textAnchor="end"
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 9,
                  fill: 'rgba(13,13,20,0.45)',
                }}
              >
                {yDef.format(v)}
              </text>
            );
          })}

          {/* Y axis label */}
          <text
            transform={`translate(${12},${(plotTop + plotBottom) / 2}) rotate(-90)`}
            textAnchor="middle"
            style={{
              fontFamily: "'Barlow Condensed', sans-serif",
              fontSize: 11,
              fontWeight: 700,
              fill: 'rgba(13,13,20,0.55)',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            {yDef.label}
          </text>

          {/* X axis ticks + labels */}
          {xTicks.map((v, i) => {
            const cx = toSVGX(v);
            return (
              <text
                key={`xt-${i}`}
                x={cx}
                y={plotBottom + 16}
                textAnchor="middle"
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 9,
                  fill: 'rgba(13,13,20,0.45)',
                }}
              >
                {xDef.format(v)}
              </text>
            );
          })}

          {/* X axis label */}
          <text
            x={(plotLeft + plotRight) / 2}
            y={svgHeight - 6}
            textAnchor="middle"
            style={{
              fontFamily: "'Barlow Condensed', sans-serif",
              fontSize: 11,
              fontWeight: 700,
              fill: 'rgba(13,13,20,0.55)',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            {xDef.label}
          </text>

          {/* Plot area clip rect (cosmetic — no SVG clipPath needed with padding) */}
          {/* Dots */}
          {filtered.map(p => {
            const xv = xDef.getValue(p) as number;
            const yv = yDef.getValue(p) as number;
            const cx = toSVGX(xv);
            const cy = toSVGY(yv);
            const r = dotRadius(p);
            const isHovered = hoveredSlug === p.slug;
            const isPinned = pinnedSlugs.includes(p.slug);
            const fill = p.pos_group === 'F' ? DOT_F : DOT_D;

            return (
              <circle
                key={p.slug}
                cx={cx}
                cy={cy}
                r={isHovered ? r + 2 : r}
                fill={fill}
                fillOpacity={isHovered || isPinned ? 0.95 : 0.65}
                stroke={isPinned ? INK : isHovered ? '#fff' : 'none'}
                strokeWidth={isPinned ? 1.5 : isHovered ? 1 : 0}
                style={{ cursor: 'pointer', transition: 'r 0.1s, fill-opacity 0.1s' }}
                onMouseEnter={e => handleDotEnter(e, p, cx, cy, xv, yv)}
                onMouseLeave={handleDotLeave}
                onClick={() => handleDotClick(p.slug)}
              />
            );
          })}

          {/* Pinned labels */}
          {pinnedSlugs.map(slug => {
            const p = filtered.find(pl => pl.slug === slug);
            if (!p) return null;
            const xv = xDef.getValue(p) as number;
            const yv = yDef.getValue(p) as number;
            const cx = toSVGX(xv);
            const cy = toSVGY(yv);
            const r = dotRadius(p);
            // Prefer label above the dot; flip if near top edge
            const labelY = cy - r - 4 < plotTop + 14 ? cy + r + 12 : cy - r - 4;
            const labelX = Math.min(
              Math.max(cx, plotLeft + 2),
              plotRight - 2,
            );

            return (
              <g key={`label-${slug}`} style={{ pointerEvents: 'none' }}>
                <text
                  x={labelX}
                  y={labelY}
                  textAnchor="middle"
                  style={{
                    fontFamily: "'Barlow Condensed', sans-serif",
                    fontSize: 11,
                    fontWeight: 800,
                    fill: INK,
                    paintOrder: 'stroke',
                    stroke: SURFACE,
                    strokeWidth: 3,
                    letterSpacing: '-0.01em',
                  }}
                >
                  {p.display_name}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Tooltip overlay */}
        {tooltip && <Tooltip data={tooltip} svgWidth={svgWidth} />}
      </div>

      {/* Legend + hints */}
      <div
        style={{
          display: 'flex',
          gap: 20,
          alignItems: 'center',
          marginTop: 12,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <LegendDot color={DOT_F} label="Forward" />
          <LegendDot color={DOT_D} label="Defense" />
        </div>
        <span
          style={{
            ...MONO,
            fontSize: 9,
            color: 'rgba(13,13,20,0.32)',
            letterSpacing: '0.06em',
          }}
        >
          DOT SIZE = HGB RATING · CLICK TO PIN LABEL (MAX {MAX_PINS}) · DASHED LINES = MEDIAN
        </span>
        {pinnedSlugs.length > 0 && (
          <button
            onClick={() => setPinnedSlugs([])}
            style={{
              ...MONO,
              fontSize: 9,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              padding: '4px 8px',
              border: '1px solid rgba(13,13,20,0.2)',
              background: 'transparent',
              color: MUTED,
              cursor: 'pointer',
              marginLeft: 'auto',
            }}
          >
            Clear labels ({pinnedSlugs.length})
          </button>
        )}
      </div>
    </div>
  );
}

// ── Small sub-components ───────────────────────────────────────────────────────

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <svg width={10} height={10}>
        <circle cx={5} cy={5} r={5} fill={color} fillOpacity={0.75} />
      </svg>
      <span
        style={{
          fontFamily: 'var(--mono)',
          fontSize: 9,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: 'rgba(13,13,20,0.48)',
        }}
      >
        {label}
      </span>
    </div>
  );
}

// ── Shared input styles ────────────────────────────────────────────────────────

const selectStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 11,
  padding: '5px 8px',
  border: '1px solid rgba(13,13,20,0.2)',
  background: '#fff',
  color: '#0d0d14',
  outline: 'none',
  cursor: 'pointer',
};

const numberInputStyle: React.CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 11,
  width: 50,
  padding: '4px 6px',
  border: '1px solid rgba(13,13,20,0.2)',
  background: '#fff',
  color: '#0d0d14',
  outline: 'none',
};
