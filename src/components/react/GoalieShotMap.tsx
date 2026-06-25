/**
 * GoalieShotMap — Half-rink shot map for goalie pages.
 * Uses pre-aggregated shot_bins data (x/y bins with sv_pct vs league_sv_pct).
 * Circles: size = shot volume, color = ΔSV% vs league average.
 */

import React, { useState } from 'react';

export interface ShotBin {
  x?: number;
  y?: number;
  shots?: number;
  goals?: number;
  sv_pct?: number | null;
  league_sv_pct?: number | null;
}

interface Props {
  shot_bins: ShotBin[];
}

// Same coordinate system as rink-svg.ts
const CX = 195;
const fxFor = (x: number) => CX + (x / 100) * 182;
const fy    = (y: number) => ((y + 42.5) / 85) * 164 + 3;

// Key positions
const BL  = fxFor(25);   // 240.5 blue line
const GL  = fxFor(89);   // 357.0 goal line
const EB  = fxFor(100);  // 377.0 end boards
const FO  = fxFor(69);   // 320.6 face-off dot x
const FO1 = fy(-22);     //  42.6 face-off dot top
const FO2 = fy(22);      // 127.4 face-off dot bottom
const GP_TOP = fy(-3);   //  79.2 goal post top
const GP_BOT = fy(3);    //  90.8 goal post bottom
const CREASE = fxFor(83); // crease front (~6ft in front of goal line)

// ViewBox: from just before blue line to end boards, full height
const VB_X = 219;
const VB_Y = 3;
const VB_W = 161;
const VB_H = 164;

function binColor(sv_pct: number | null, lg: number | null, shots: number) {
  if (sv_pct === null || lg === null || shots < 5) {
    return { fill: 'rgba(13,13,20,0.08)', stroke: 'rgba(13,13,20,0.15)' };
  }
  const delta = sv_pct - lg;
  const mag   = Math.min(Math.abs(delta) / 0.10, 1);
  const conf  = Math.min(shots / 60, 1);
  const alpha = (0.18 + conf * 0.67).toFixed(2);
  const strokeAlpha = Math.min(parseFloat(alpha) + 0.15, 0.95).toFixed(2);

  if (delta > 0.005) {
    const g = Math.round(128 + mag * 72);
    const r = Math.round(20 - mag * 20);
    const b = Math.round(60 - mag * 60);
    return {
      fill:   `rgba(${r},${g},${b},${alpha})`,
      stroke: `rgba(${r},${g},${b},${strokeAlpha})`,
    };
  } else if (delta < -0.005) {
    const r = Math.round(200 + mag * 32);
    const g = Math.round(40 - mag * 40);
    const b = Math.round(45 - mag * 45);
    return {
      fill:   `rgba(${r},${g},${b},${alpha})`,
      stroke: `rgba(${r},${g},${b},${strokeAlpha})`,
    };
  }
  return { fill: `rgba(120,120,120,${alpha})`, stroke: `rgba(120,120,120,${strokeAlpha})` };
}

function binRadius(shots: number, maxShots: number): number {
  return 4 + Math.sqrt(Math.min(shots, maxShots) / maxShots) * 13;
}

interface TooltipState {
  bin: ShotBin;
  svgX: number;
  svgY: number;
  clientX: number;
  clientY: number;
}

const MONO = { fontFamily: "'JetBrains Mono', monospace" } as const;
const FMT_PCT = (v: number | null) => v != null ? (v * 100).toFixed(1) + '%' : '—';
const FMT_DELTA = (v: number | null, lg: number | null) => {
  if (v == null || lg == null) return '—';
  const d = (v - lg) * 100;
  return (d >= 0 ? '+' : '') + d.toFixed(1) + '%';
};

export default function GoalieShotMap({ shot_bins }: Props) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const svgRef = React.useRef<SVGSVGElement>(null);

  const bins = shot_bins.filter(b => b.shots != null && b.shots > 0 && b.x != null && b.y != null);
  const maxShots = Math.max(...bins.map(b => b.shots ?? 0), 1);

  function handleMouseEnter(e: React.MouseEvent<SVGCircleElement>, bin: ShotBin) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const svgX = fxFor(bin.x);
    const svgY = fy(bin.y);
    setTooltip({ bin, svgX, svgY, clientX: e.clientX, clientY: e.clientY });
  }

  return (
    <div style={{ position: 'relative' }}>
      {/* Toolbar label */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ ...MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(13,13,20,0.40)' }}>
          Shot Map — Δ SV% vs League
        </span>
        <span style={{ ...MONO, fontSize: 10, color: 'rgba(13,13,20,0.35)' }}>
          {bins.reduce((a, b) => a + (b.shots ?? 0), 0)} shots · {bins.reduce((a, b) => a + (b.goals ?? 0), 0)} goals
        </span>
      </div>

      {/* Rink SVG */}
      <svg
        ref={svgRef}
        viewBox={`${VB_X} ${VB_Y} ${VB_W} ${VB_H}`}
        style={{ width: '100%', display: 'block', overflow: 'visible' }}
        onMouseLeave={() => setTooltip(null)}
      >
        {/* Zone background */}
        <rect x={BL} y={VB_Y} width={EB - BL} height={VB_H} fill="#E8F4F8" rx="2" />

        {/* Behind-goal tint */}
        <rect x={GL} y={VB_Y} width={EB - GL} height={VB_H} fill="rgba(13,13,20,0.04)" />

        {/* Blue line */}
        <line x1={BL} y1={VB_Y} x2={BL} y2={VB_Y + VB_H}
          stroke="rgba(20,100,200,0.55)" strokeWidth="2.5" strokeDasharray="5 3" />

        {/* Goal line */}
        <line x1={GL} y1={VB_Y} x2={GL} y2={VB_Y + VB_H}
          stroke="rgba(232,0,45,0.50)" strokeWidth="1.5" />

        {/* End boards */}
        <line x1={EB} y1={VB_Y} x2={EB} y2={VB_Y + VB_H}
          stroke="rgba(13,13,20,0.20)" strokeWidth="1" />

        {/* Crease — simplified D shape */}
        <path
          d={`M${GL},${GP_TOP} L${CREASE},${GP_TOP} A${CREASE - GL},${GP_BOT - GP_TOP} 0 0,1 ${CREASE},${GP_BOT} L${GL},${GP_BOT}`}
          fill="rgba(20,100,200,0.12)" stroke="rgba(20,100,200,0.35)" strokeWidth="1" />

        {/* Goal posts */}
        <rect x={GL} y={GP_TOP} width="5" height={GP_BOT - GP_TOP}
          fill="rgba(13,13,20,0.45)" rx="0.5" />

        {/* Face-off circles */}
        <circle cx={FO} cy={FO1} r="18" fill="none"
          stroke="rgba(232,0,45,0.28)" strokeWidth="1.2" />
        <circle cx={FO} cy={FO2} r="18" fill="none"
          stroke="rgba(232,0,45,0.28)" strokeWidth="1.2" />
        <circle cx={FO} cy={FO1} r="2" fill="rgba(232,0,45,0.45)" />
        <circle cx={FO} cy={FO2} r="2" fill="rgba(232,0,45,0.45)" />

        {/* Top/bottom boards */}
        <line x1={BL} y1={VB_Y} x2={EB} y2={VB_Y}
          stroke="rgba(13,13,20,0.18)" strokeWidth="1" />
        <line x1={BL} y1={VB_Y + VB_H} x2={EB} y2={VB_Y + VB_H}
          stroke="rgba(13,13,20,0.18)" strokeWidth="1" />

        {/* Labels */}
        <text x={BL} y={VB_Y + VB_H + 10}
          fontFamily="JetBrains Mono,monospace" fontSize="6" fontWeight="700"
          fill="rgba(20,100,200,0.65)" textAnchor="middle" letterSpacing="0.08em">
          BLUE LINE
        </text>
        <text x={GL - 6} y={VB_Y + 10}
          fontFamily="JetBrains Mono,monospace" fontSize="6" fontWeight="700"
          fill="rgba(232,0,45,0.65)" textAnchor="end" letterSpacing="0.06em">
          GOAL
        </text>

        {/* Shot bin circles — rendered last so they appear above rink */}
        {bins.map((bin, i) => {
          const cx = fxFor(bin.x!);
          const cy = fy(bin.y!);
          const r  = binRadius(bin.shots!, maxShots);
          const { fill, stroke } = binColor(bin.sv_pct ?? null, bin.league_sv_pct ?? null, bin.shots!);
          return (
            <circle
              key={i}
              cx={cx} cy={cy} r={r}
              fill={fill}
              stroke={stroke}
              strokeWidth="1"
              style={{ cursor: 'crosshair' }}
              onMouseEnter={e => handleMouseEnter(e, bin)}
              onMouseLeave={() => setTooltip(null)}
            />
          );
        })}
      </svg>

      {/* Tooltip */}
      {tooltip && (() => {
        const { bin, clientX, clientY } = tooltip;
        const sv   = bin.sv_pct ?? null;
        const lg   = bin.league_sv_pct ?? null;
        const delta = sv != null && lg != null ? (sv - lg) * 100 : null;
        const isGood = delta != null && delta > 0.5;
        const isBad  = delta != null && delta < -0.5;
        const color  = isGood ? '#15803d' : isBad ? '#E8002D' : 'rgba(13,13,20,0.55)';
        return (
          <div style={{
            ...MONO,
            position: 'fixed',
            left: clientX + 12,
            top:  clientY - 60,
            background: '#0d0d14',
            color: '#EFEEE8',
            fontSize: 10,
            padding: '8px 12px',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            letterSpacing: '0.06em',
            zIndex: 100,
            lineHeight: 1.7,
            borderRadius: 2,
          }}>
            <div style={{ fontWeight: 700, marginBottom: 2, color: '#EFEEE8' }}>
              x={bin.x} · y={(bin.y ?? 0) >= 0 ? '+' : ''}{bin.y}
            </div>
            <div>{bin.shots} shots · {bin.goals} goals</div>
            <div>Goalie: {FMT_PCT(bin.sv_pct ?? null)}</div>
            <div>League: {FMT_PCT(bin.league_sv_pct ?? null)}</div>
            <div style={{ color }}>
              Δ {FMT_DELTA(bin.sv_pct ?? null, bin.league_sv_pct ?? null)}
            </div>
          </div>
        );
      })()}

      {/* Legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#15803d', opacity: 0.8 }} />
          <span style={{ ...MONO, fontSize: 9, letterSpacing: '0.08em', color: 'rgba(13,13,20,0.45)' }}>BETTER THAN LEAGUE</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#E8002D', opacity: 0.8 }} />
          <span style={{ ...MONO, fontSize: 9, letterSpacing: '0.08em', color: 'rgba(13,13,20,0.45)' }}>WORSE THAN LEAGUE</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginLeft: 'auto' }}>
          <span style={{ ...MONO, fontSize: 9, letterSpacing: '0.06em', color: 'rgba(13,13,20,0.35)' }}>circle size = shot volume</span>
        </div>
      </div>
    </div>
  );
}
