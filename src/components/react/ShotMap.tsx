/**
 * ShotMap.tsx — Interactive full-rink split shot map (FOR → | ← AGAINST).
 *
 * Two display modes:
 *   Scatter  — one dot per shot, radius scales with xG / shot_type proxy
 *   Density  — Gaussian-spread heatmap per half-rink, goals overlaid
 *
 * Coordinate system matches rink-svg.ts:
 *   SVG viewBox: "0 0 390 170"
 *   Centre ice: x = 195
 *   fxFor(x)  = 195 + (x / 100) * 182   (shots attacking right)
 *   fxAga(x)  = 195 - (x / 100) * 182   (shots attacking left)
 *   fy(y)     = ((y + 42.5) / 85) * 164 + 3
 *
 * Shot tuple: [x, y, is_goal, shot_type, team_abbrev, game_number]
 */

import React, { useCallback, useRef, useState } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────────

export type Shot = [
  number,  // 0  x (NHL feet from centre ice, positive = offensive zone)
  number,  // 1  y (NHL feet, 0 = rink centre)
  number,  // 2  is_goal (1 = goal, 0 = shot)
  string,  // 3  shot_type
  string,  // 4  team_abbrev
  number,  // 5  game_number
];

export type ShotMapProps = {
  shots:   Shot[];
  teamA:   string;  // "FOR" team (right side, blue)
  teamB:   string;  // "AGAINST" team (left side, red)
  colorA?: string;  // default blue
  colorB?: string;  // default red
  title?:  string;
};

type Mode = 'scatter' | 'density';

// ── Rink geometry ──────────────────────────────────────────────────────────────

const CX  = 195;
const VB_W = 390;
const VB_H = 170;

function fxFor(x: number): number { return CX + (x / 100) * 182; }
function fxAga(x: number): number { return CX - (x / 100) * 182; }
function fy(y: number):    number { return ((y + 42.5) / 85) * 164 + 3; }

// ── Shot-type radius proxy (when xG not available) ────────────────────────────

function shotTypeRadius(type: string): number {
  const t = type.toLowerCase();
  if (t.includes('slap'))                          return 4.0;
  if (t.includes('tip') || t.includes('deflect'))  return 3.5;
  if (t.includes('wrist') || t.includes('snap'))   return 3.0;
  if (t.includes('back'))                          return 2.5;
  return 3.0;
}

// ── Rink JSX elements ─────────────────────────────────────────────────────────
// Ported from buildSeriesShotMapSVG() in rink-svg.ts.

function RinkElements() {
  const cY  = fy(0);
  const cYm = fy(0) - 20;
  const cYp = fy(0) + 20;
  const foY1 = fy(-22);
  const foY2 = fy(22);

  // FOR side
  const fBL = fxFor(0);   // centre ice (shows as left boundary of FOR half)
  const fGL = fxFor(100); // goal line
  const fFo = fxFor(69);  // face-off dot x

  // AGAINST side
  const aBL = fxAga(0);
  const aGL = fxAga(100);
  const aFo = fxAga(69);

  const fo  = { fill: 'none', stroke: 'rgba(232,0,45,0.18)', strokeWidth: 1 };
  const foD  = { fill: 'rgba(232,0,45,0.38)' };

  return (
    <>
      {/* Background */}
      <rect x={2} y={2} width={386} height={166} rx={6}
        fill="#E8F4F8" stroke="rgba(13,13,20,0.18)" strokeWidth={1} />

      {/* Centre ice line */}
      <line x1={CX} y1={2} x2={CX} y2={168}
        stroke="rgba(13,13,20,0.25)" strokeWidth={1.5} />
      {/* Centre dot */}
      <circle cx={CX} cy={cY} r={8}
        fill="none" stroke="rgba(13,13,20,0.18)" strokeWidth={1} />

      {/* ── FOR side (right) ── */}
      <line x1={fBL} y1={2} x2={fBL} y2={168}
        stroke="rgba(20,100,200,0.28)" strokeWidth={1.2} strokeDasharray="4 3" />
      <line x1={fGL} y1={2} x2={fGL} y2={168}
        stroke="rgba(232,0,45,0.40)" strokeWidth={1.2} />
      {/* FOR crease */}
      <path d={`M${fGL},${cYm} A20,20 0 0,0 ${fGL},${cYp}`}
        fill="rgba(20,100,200,0.07)" stroke="rgba(20,100,200,0.28)" strokeWidth={1} />
      {/* FOR goal mouth */}
      <rect x={fGL} y={cY - 3} width={4} height={6}
        fill="rgba(13,13,20,0.35)" rx={0.5} />
      {/* FOR face-off circles */}
      <circle cx={fFo} cy={foY1} r={18} {...fo} />
      <circle cx={fFo} cy={foY2} r={18} {...fo} />
      <circle cx={fFo} cy={foY1} r={2} {...foD} />
      <circle cx={fFo} cy={foY2} r={2} {...foD} />

      {/* ── AGAINST side (left) ── */}
      <line x1={aBL} y1={2} x2={aBL} y2={168}
        stroke="rgba(232,0,45,0.22)" strokeWidth={1.2} strokeDasharray="4 3" />
      <line x1={aGL} y1={2} x2={aGL} y2={168}
        stroke="rgba(232,0,45,0.40)" strokeWidth={1.2} />
      {/* AGAINST crease (opens toward centre, so arc curves right) */}
      <path d={`M${aGL},${cYm} A20,20 0 0,1 ${aGL},${cYp}`}
        fill="rgba(232,0,45,0.07)" stroke="rgba(232,0,45,0.28)" strokeWidth={1} />
      {/* AGAINST goal mouth */}
      <rect x={aGL - 4} y={cY - 3} width={4} height={6}
        fill="rgba(13,13,20,0.35)" rx={0.5} />
      {/* AGAINST face-off circles */}
      <circle cx={aFo} cy={foY1} r={18} {...fo} />
      <circle cx={aFo} cy={foY2} r={18} {...fo} />
      <circle cx={aFo} cy={foY1} r={2} {...foD} />
      <circle cx={aFo} cy={foY2} r={2} {...foD} />

      {/* Labels */}
      <text x={CX - 82} y={14}
        fontFamily="JetBrains Mono,monospace" fontSize={8} fontWeight={700}
        fill="rgba(232,0,45,0.55)" textAnchor="middle" letterSpacing="0.10em">
        ← AGAINST
      </text>
      <text x={CX + 82} y={14}
        fontFamily="JetBrains Mono,monospace" fontSize={8} fontWeight={700}
        fill="rgba(20,100,200,0.55)" textAnchor="middle" letterSpacing="0.10em">
        FOR →
      </text>
    </>
  );
}

// ── xGF% bar ──────────────────────────────────────────────────────────────────

function XGFBar({ xgfPct, teamA, teamB, colorA, colorB }: {
  xgfPct: number; teamA: string; teamB: string; colorA: string; colorB: string;
}) {
  const xgaPct = 100 - xgfPct;
  const barW   = (xgfPct / 100) * 386;

  return (
    <>
      {/* Background (red = against) */}
      <rect x={2} y={158} width={386} height={10}
        fill={colorB + '26'} />
      {/* FOR fill (blue) */}
      <rect x={2} y={158} width={barW} height={10}
        fill={colorA + '5A'} />
      {/* Labels */}
      <text x={6} y={166}
        fontFamily="JetBrains Mono,monospace" fontSize={7} fontWeight={700}
        fill={colorB} opacity={0.70} letterSpacing="0.06em">
        {teamB} {xgaPct.toFixed(1)}%
      </text>
      <text x={384} y={166}
        fontFamily="JetBrains Mono,monospace" fontSize={7} fontWeight={700}
        fill={colorA} opacity={0.80} textAnchor="end" letterSpacing="0.06em">
        {teamA} xGF {xgfPct.toFixed(1)}%
      </text>
    </>
  );
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

type TooltipData = {
  x: number; y: number;    // screen coords
  shot: Shot;
};

function ShotTooltip({ data }: { data: TooltipData }) {
  const [sx, sy, isGoal, shotType, teamAbbrev, gameNum] = data.shot;
  const mono: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 11 };

  return (
    <div style={{
      position: 'fixed',
      left:  data.x + 12,
      top:   data.y - 8,
      background: '#fff',
      border: '1px solid rgba(13,13,20,0.14)',
      padding: '8px 12px',
      lineHeight: 1.7,
      pointerEvents: 'none',
      zIndex: 999,
      minWidth: 140,
      boxShadow: '0 2px 8px rgba(13,13,20,0.08)',
    }}>
      <div style={{ ...mono, fontSize: 10, color: 'rgba(13,13,20,0.42)', marginBottom: 2 }}>
        {teamAbbrev} · Game {gameNum}
      </div>
      <div style={{ ...mono, fontWeight: 700, color: isGoal ? '#E8002D' : 'rgba(13,13,20,0.72)' }}>
        {isGoal ? 'GOAL' : 'Shot'} · {shotType || '—'}
      </div>
      <div style={{ ...mono, fontSize: 10, color: 'rgba(13,13,20,0.42)' }}>
        x={sx.toFixed(1)} y={sy.toFixed(1)}
      </div>
    </div>
  );
}

// ── Scatter layer ─────────────────────────────────────────────────────────────

function ScatterLayer({
  shots, colorA, colorB, teamA, teamB,
  onHover, onLeave,
}: {
  shots: Shot[]; colorA: string; colorB: string;
  teamA: string; teamB: string;
  onHover: (e: React.MouseEvent, s: Shot) => void;
  onLeave: () => void;
}) {
  // Split into FOR (teamA) and AGAINST (teamB).
  // API x values may be signed (neg = attacking left), so use Math.abs for
  // rink-svg coordinate mapping — same approach as the static series page.
  const forShots  = shots.filter(s => s[4] === teamA);
  const agaShots  = shots.filter(s => s[4] === teamB);

  function renderShot(s: Shot, isFor: boolean) {
    const [sx, sy, isGoal, shotType] = s;
    // Use Math.abs(x) — API may return signed x based on direction of attack
    const cx = isFor ? fxFor(Math.abs(sx)) : fxAga(Math.abs(sx));
    const cy = fy(sy);
    const r  = isGoal ? 4.5 : Math.max(2, Math.min(5, shotTypeRadius(shotType)));
    const color = isFor ? colorA : colorB;

    if (isGoal) {
      return (
        <circle
          key={`${cx}-${cy}-goal`}
          cx={cx} cy={cy} r={r}
          fill={color} stroke="white" strokeWidth={0.8} opacity={0.90}
          style={{ cursor: 'pointer' }}
          onMouseMove={e => onHover(e, s)}
          onMouseLeave={onLeave}
        />
      );
    }
    return (
      <circle
        key={`${cx}-${cy}-${shotType}`}
        cx={cx} cy={cy} r={r}
        fill={color + '20'} stroke={color} strokeWidth={0.7} opacity={0.78}
        style={{ cursor: 'pointer' }}
        onMouseMove={e => onHover(e, s)}
        onMouseLeave={onLeave}
      />
    );
  }

  return (
    <>
      {/* Non-goals first (goals render on top) */}
      {agaShots.filter(s => !s[2]).map(s => renderShot(s, false))}
      {forShots.filter(s => !s[2]).map(s => renderShot(s, true))}
      {agaShots.filter(s =>  s[2]).map(s => renderShot(s, false))}
      {forShots.filter(s =>  s[2]).map(s => renderShot(s, true))}
    </>
  );
}

// ── Density / Heatmap layer ───────────────────────────────────────────────────
// Grid: 15 cols × 12 rows per half. Each shot contributes to cells via Gaussian
// kernel (σ ≈ 1.5 cell widths). Opacity proportional to density.

const GRID_COLS = 15;
const GRID_ROWS = 12;
const SIGMA     = 1.5; // Gaussian σ in cell units

function computeHeatmap(shots: Shot[], isFor: boolean): number[][] {
  const grid: number[][] = Array.from({ length: GRID_ROWS }, () => new Array(GRID_COLS).fill(0));

  for (const shot of shots) {
    const [sx, sy] = shot;
    // Math.abs normalises signed API x values — same convention as static series page
    const svgX = isFor ? fxFor(Math.abs(sx)) : fxAga(Math.abs(sx));
    const svgY = fy(sy);

    // Map SVG coordinate to half-rink grid cell
    // FOR half:  x from CX (195) to EB (~377), y from 2 to 168
    // AGA half:  x from aGL (~13) to CX (195), y from 2 to 168
    const halfW = VB_W / 2 - 2; // ~193 px
    const halfH = VB_H - 4;     // 166 px
    const cellW = halfW / GRID_COLS;
    const cellH = halfH / GRID_ROWS;

    // Fractional cell indices
    let ci: number;
    if (isFor) {
      ci = (svgX - CX) / cellW;
    } else {
      ci = (CX - svgX) / cellW;
    }
    const ri = (svgY - 2) / cellH;

    // Gaussian spread to neighbors
    for (let row = 0; row < GRID_ROWS; row++) {
      for (let col = 0; col < GRID_COLS; col++) {
        const dc = col - ci;
        const dr = row - ri;
        const d2 = dc * dc + dr * dr;
        const w  = Math.exp(-d2 / (2 * SIGMA * SIGMA));
        grid[row][col] += w;
      }
    }
  }

  return grid;
}

function HeatmapHalf({
  shots, isFor, color,
}: {
  shots: Shot[]; isFor: boolean; color: string;
}) {
  const grid = computeHeatmap(shots, isFor);

  // Find max for normalisation
  let maxVal = 0;
  for (const row of grid) for (const v of row) if (v > maxVal) maxVal = v;

  const halfW = VB_W / 2 - 2;
  const halfH = VB_H - 4;
  const cellW = halfW / GRID_COLS;
  const cellH = halfH / GRID_ROWS;

  const cells: React.ReactNode[] = [];
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      const val     = grid[row][col];
      const opacity = maxVal > 0 ? (val / maxVal) * 0.70 : 0;
      if (opacity < 0.02) continue;

      // SVG x depends on which half
      let cellX: number;
      if (isFor) {
        cellX = CX + col * cellW;
      } else {
        cellX = CX - (col + 1) * cellW;
      }
      const cellY = 2 + row * cellH;

      cells.push(
        <rect
          key={`${row}-${col}`}
          x={cellX} y={cellY}
          width={cellW} height={cellH}
          fill={color}
          opacity={opacity}
          style={{ pointerEvents: 'none' }}
        />
      );
    }
  }

  return <>{cells}</>;
}

function DensityLayer({
  shots, colorA, colorB, teamA, teamB, onHover, onLeave,
}: {
  shots: Shot[]; colorA: string; colorB: string;
  teamA: string; teamB: string;
  onHover: (e: React.MouseEvent, s: Shot) => void;
  onLeave: () => void;
}) {
  const forShots = shots.filter(s => s[4] === teamA);
  const agaShots = shots.filter(s => s[4] === teamB);

  return (
    <>
      {/* Heatmap cells */}
      <HeatmapHalf shots={forShots} isFor={true}  color={colorA} />
      <HeatmapHalf shots={agaShots} isFor={false} color={colorB} />

      {/* Goals overlaid as solid dots */}
      {agaShots.filter(s => s[2]).map((s, i) => (
        <circle
          key={`aga-goal-${i}`}
          cx={fxAga(Math.abs(s[0]))} cy={fy(s[1])} r={4.5}
          fill={colorB} stroke="white" strokeWidth={0.8} opacity={0.90}
          style={{ cursor: 'pointer' }}
          onMouseMove={e => onHover(e, s)}
          onMouseLeave={onLeave}
        />
      ))}
      {forShots.filter(s => s[2]).map((s, i) => (
        <circle
          key={`for-goal-${i}`}
          cx={fxFor(Math.abs(s[0]))} cy={fy(s[1])} r={4.5}
          fill={colorA} stroke="white" strokeWidth={0.8} opacity={0.90}
          style={{ cursor: 'pointer' }}
          onMouseMove={e => onHover(e, s)}
          onMouseLeave={onLeave}
        />
      ))}
    </>
  );
}

// ── Export helpers ────────────────────────────────────────────────────────────

function svgToCanvas(svgEl: SVGSVGElement): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(svgEl);
    const blob   = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url    = URL.createObjectURL(blob);
    const img    = new Image();
    img.onload = () => {
      const scale  = 3;
      const canvas = document.createElement('canvas');
      canvas.width  = svgEl.viewBox.baseVal.width  * scale;
      canvas.height = svgEl.viewBox.baseVal.height * scale;
      const ctx = canvas.getContext('2d');
      if (!ctx) { URL.revokeObjectURL(url); reject(new Error('no ctx')); return; }
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      resolve(canvas);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('img load failed')); };
    img.src = url;
  });
}

// ── Chip button ───────────────────────────────────────────────────────────────

function Chip({
  label, active, onClick,
}: {
  label: string; active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        fontFamily: 'var(--mono)',
        fontSize: 10,
        letterSpacing: '0.12em',
        textTransform: 'uppercase' as const,
        padding: '5px 14px',
        border: '1px solid rgba(13,13,20,0.20)',
        cursor: 'pointer',
        background:  active ? '#0d0d14'               : 'transparent',
        color:       active ? '#EFEEE8'               : 'rgba(13,13,20,0.48)',
        transition:  'background 0.15s, color 0.15s',
        lineHeight:  1,
      }}
    >
      {label}
    </button>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

const DEFAULT_COLOR_A = 'rgba(20,100,200,0.90)';  // blue family
const DEFAULT_COLOR_B = '#E8002D';                  // red family

export default function ShotMap({
  shots,
  teamA,
  teamB,
  colorA = DEFAULT_COLOR_A,
  colorB = DEFAULT_COLOR_B,
  title,
}: ShotMapProps) {
  const [mode,      setMode]      = useState<Mode>('scatter');
  const [tooltip,   setTooltip]   = useState<TooltipData | null>(null);
  const [modalUrl,  setModalUrl]  = useState<string | null>(null);
  const [modalFile, setModalFile] = useState<string>('');
  const svgRef = useRef<SVGSVGElement>(null);

  // Compute xGF%: since we don't have raw xG per shot in this interface, use
  // simple shot-count ratio as a proxy (or sum over is_goal for GF%).
  // The proportion is shown in the bar — treat all shots equally.
  const forShots = shots.filter(s => s[4] === teamA);
  const agaShots = shots.filter(s => s[4] === teamB);
  const forCount = forShots.length;
  const agaCount = agaShots.length;
  const total    = forCount + agaCount;
  const xgfPct   = total > 0 ? (forCount / total) * 100 : 50;

  const handleHover = useCallback((e: React.MouseEvent, s: Shot) => {
    setTooltip({ x: e.clientX, y: e.clientY, shot: s });
  }, []);

  const handleLeave = useCallback(() => setTooltip(null), []);

  const handleExport = useCallback(async () => {
    if (!svgRef.current) return;
    const slug = `${teamA}-vs-${teamB}-shot-map`.toLowerCase().replace(/\s+/g, '-');
    const filename = `${slug}.png`;
    try {
      const canvas = await svgToCanvas(svgRef.current);
      setModalFile(filename);
      setModalUrl(canvas.toDataURL('image/png'));
    } catch { /* silent — export unavailable */ }
  }, [teamA, teamB]);

  const mono: React.CSSProperties = { fontFamily: 'var(--mono)' };

  return (
    <div style={{ width: '100%' }}>
      {/* Header row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 10,
        marginBottom: 10,
      }}>
        {/* Title + stats */}
        <div>
          {title && (
            <div style={{
              ...mono, fontSize: 11, letterSpacing: '0.10em',
              textTransform: 'uppercase', color: 'rgba(13,13,20,0.48)',
              marginBottom: 3,
            }}>
              {title}
            </div>
          )}
          <div style={{ ...mono, fontSize: 10, color: 'rgba(13,13,20,0.36)', letterSpacing: '0.06em' }}>
            <span style={{ color: colorA, fontWeight: 700 }}>{teamA}</span>
            {' '}{forCount} shots · {forShots.filter(s => s[2]).length} goals
            {' '}
            <span style={{ color: 'rgba(13,13,20,0.24)' }}>|</span>
            {' '}
            <span style={{ color: colorB, fontWeight: 700 }}>{teamB}</span>
            {' '}{agaCount} shots · {agaShots.filter(s => s[2]).length} goals
          </div>
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ display: 'flex', gap: 0, border: '1px solid rgba(13,13,20,0.18)' }}>
            <Chip label="Scatter" active={mode === 'scatter'} onClick={() => setMode('scatter')} />
            <Chip label="Density" active={mode === 'density'} onClick={() => setMode('density')} />
          </div>
          <button
            onClick={handleExport}
            title="Download PNG"
            style={{
              ...mono, fontSize: 10, letterSpacing: '0.08em',
              padding: '5px 12px',
              border: '1px solid rgba(13,13,20,0.18)',
              background: 'transparent',
              color: 'rgba(13,13,20,0.48)',
              cursor: 'pointer',
              lineHeight: 1,
            }}
          >
            PNG
          </button>
        </div>
      </div>

      {/* SVG rink */}
      <div style={{ width: '100%', position: 'relative' }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          xmlns="http://www.w3.org/2000/svg"
          width="100%"
          style={{ display: 'block', overflow: 'visible' }}
        >
          <RinkElements />

          {mode === 'scatter' ? (
            <ScatterLayer
              shots={shots}
              colorA={colorA} colorB={colorB}
              teamA={teamA}   teamB={teamB}
              onHover={handleHover}
              onLeave={handleLeave}
            />
          ) : (
            <DensityLayer
              shots={shots}
              colorA={colorA} colorB={colorB}
              teamA={teamA}   teamB={teamB}
              onHover={handleHover}
              onLeave={handleLeave}
            />
          )}

          <XGFBar
            xgfPct={xgfPct}
            teamA={teamA} teamB={teamB}
            colorA={colorA} colorB={colorB}
          />
        </svg>
      </div>

      {/* Shot tooltip — rendered outside SVG so it floats */}
      {tooltip && <ShotTooltip data={tooltip} />}

      {/* Legend */}
      <div style={{
        display: 'flex', gap: 16, marginTop: 8, flexWrap: 'wrap',
        ...mono, fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase',
        color: 'rgba(13,13,20,0.40)',
      }}>
        {mode === 'scatter' && (
          <>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <svg width={16} height={16}>
                <circle cx={8} cy={8} r={5} fill="currentColor" opacity={0.22}
                  stroke="currentColor" strokeWidth={1} />
              </svg>
              Shot
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <svg width={16} height={16}>
                <circle cx={8} cy={8} r={5.5} fill="currentColor" opacity={0.80}
                  stroke="white" strokeWidth={1} />
              </svg>
              Goal
            </span>
            <span>Radius ∝ shot type</span>
          </>
        )}
        {mode === 'density' && (
          <span>Cell opacity ∝ shot density · Gaussian spread σ=1.5</span>
        )}
      </div>

      {/* Export modal */}
      {modalUrl && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setModalUrl(null); }}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.92)',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', padding: 16,
          }}
        >
          <div style={{ position: 'relative', maxWidth: 'min(90vw,900px)', width: '100%' }}>
            <button
              onClick={() => setModalUrl(null)}
              style={{
                position: 'absolute', top: -40, right: 0,
                background: 'none', border: 'none', color: '#fff',
                fontSize: 28, cursor: 'pointer', lineHeight: 1, opacity: 0.7,
              }}
            >×</button>
            <img src={modalUrl} alt={modalFile}
              style={{ width: '100%', height: 'auto', display: 'block', border: '1px solid rgba(255,255,255,0.12)' }} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, gap: 12 }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.06em' }}>
                {modalFile}
              </span>
              <a href={modalUrl} download={modalFile}
                style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.10em', textTransform: 'uppercase', padding: '6px 14px', background: '#fff', color: '#0d0d14', textDecoration: 'none', whiteSpace: 'nowrap' }}>
                ↓ Download
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
