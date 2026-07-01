/**
 * ShotMapKDE.tsx — Interactive shot map: scatter (SVG dots + tooltips)
 * and KDE density (canvas, turbo colormap, exact Python parameters).
 *
 * KDE params from hgb-bot/_legacy/core/shot_heatmap.py:
 *   SIGMA=6, FLOOR=0.20, VMAX_Q=0.985, GAMMA=0.75, ALPHA=0.75, CMAP_CUT=0.18
 */

import React, { useRef, useEffect, useState } from 'react';
import { buildFullRinkBaseSVG } from '../../lib/rink-svg';

export type RawShot = [number, number, number, string, string, number];
// [x, y, is_goal, shot_type, team_abbrev, game_number]

export interface ShotMapKDEProps {
  shots: RawShot[];
  teamFor: string;
  teamAgainst: string;
  title?: string;
}

// ── Coordinate system ────────────────────────────────────────────────────────
const W = 390, H = 170, CX = 195;
const toX_for = (x: number) => CX + (x / 100) * 182;
const toX_aga = (x: number) => CX - (x / 100) * 182;
const toY     = (y: number) => ((y + 42.5) / 85) * 164 + 3;

// Flip (x,y) → (-x,-y) when x<0 so all shots appear attacking from right
function norm(x: number, y: number): [number, number] {
  return x < 0 ? [-x, -y] : [x, y];
}

// ── Turbo colormap ───────────────────────────────────────────────────────────
function turbo(t: number): [number, number, number] {
  // Clamp
  const s = Math.max(0, Math.min(1, t));
  // Polynomial coefficients from Mikhailov 2019 — outputs 0-255 directly
  const r = Math.max(0, Math.min(255,
    34.61 + s*(1172.33 - s*(10793.56 - s*(33300.12 - s*(38394.49 - s*14825.05))))));
  const g = Math.max(0, Math.min(255,
    23.31 + s*(557.33 + s*(1225.33 - s*(3574.96 - s*(1073.77 + s*707.56))))));
  const b = Math.max(0, Math.min(255,
    27.2 + s*(3211.1 - s*(15327.97 - s*(27814 - s*(22569.18 - s*6838.66))))));
  return [Math.round(r), Math.round(g), Math.round(b)];
}

// ── KDE density grid ─────────────────────────────────────────────────────────
const GW = 220, GH = 110;
const SIGMA = 6.0, FLOOR = 0.20, VMAX_Q = 0.985, GAMMA = 0.75;
const ALPHA = 0.75, CMAP_CUT = 0.18; // higher cut = more transparent dark areas

function buildGrid(pts: [number, number][], xMin: number, xMax: number): Float32Array {
  const grid = new Float32Array(GH * GW);
  if (!pts.length) return grid;
  const xs = (GW - 1) / (xMax - xMin);
  const ys = (GH - 1) / 85;
  const r  = Math.ceil(SIGMA * 3);
  const ks = 2 * r + 1;
  // Pre-compute kernel
  const kern = new Float32Array(ks * ks);
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++)
      kern[(dy+r)*ks + (dx+r)] = Math.exp(-(dx*dx + dy*dy) / (2*SIGMA*SIGMA));

  for (const [x, y] of pts) {
    const ix = Math.round((x - xMin) * xs);
    const iy = Math.round((y + 42.5) * ys);
    if (ix < 0 || ix >= GW || iy < 0 || iy >= GH) continue;
    const x0 = Math.max(ix-r, 0), x1 = Math.min(ix+r+1, GW);
    const y0 = Math.max(iy-r, 0), y1 = Math.min(iy+r+1, GH);
    for (let gy = y0; gy < y1; gy++)
      for (let gx = x0; gx < x1; gx++)
        grid[gy*GW + gx] += kern[(gy-y0+(y0-(iy-r)))*ks + (gx-x0+(x0-(ix-r)))];
  }
  return grid;
}

function normalizeGrid(g: Float32Array): Float32Array {
  const log = new Float32Array(g.length);
  const nz: number[] = [];
  for (let i = 0; i < g.length; i++) {
    log[i] = Math.log1p(g[i]);
    if (log[i] < FLOOR) log[i] = 0;
    else nz.push(log[i]);
  }
  if (!nz.length) return log;
  nz.sort((a, b) => a - b);
  const vmax = nz[Math.floor(nz.length * VMAX_Q)] || 1;
  const out = new Float32Array(log.length);
  for (let i = 0; i < log.length; i++)
    out[i] = Math.pow(Math.min(log[i] / vmax, 1), GAMMA);
  return out;
}

function paintKDE(
  canvas: HTMLCanvasElement,
  forPts: [number, number][],
  agaPts: [number, number][],
) {
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, W, H);

  const forGrid = normalizeGrid(buildGrid(forPts, 0, 100));
  const agaGrid = normalizeGrid(buildGrid(agaPts, 0, 100));

  const cw = (W - CX) / GW;  // cell width ~0.886px
  const ch = H / GH;          // cell height ~1.545px

  // FOR side — right half (gx=0 at CX, increases right)
  for (let gy = 0; gy < GH; gy++) {
    for (let gx = 0; gx < GW; gx++) {
      const t = forGrid[gy * GW + gx];
      if (t < CMAP_CUT) continue;
      const a = Math.min(1, (t - CMAP_CUT) / ((1 - CMAP_CUT) * 0.5)) * ALPHA;
      const [r, g, b] = turbo(t);
      ctx.fillStyle = `rgba(${r},${g},${b},${a.toFixed(3)})`;
      ctx.fillRect(CX + gx * cw, gy * ch, cw + 0.5, ch + 0.5);
    }
  }

  // AGAINST side — left half (gx=0 at far left, increases toward CX)
  for (let gy = 0; gy < GH; gy++) {
    for (let gx = 0; gx < GW; gx++) {
      const t = agaGrid[gy * GW + gx];
      if (t < CMAP_CUT) continue;
      const a = Math.min(1, (t - CMAP_CUT) / ((1 - CMAP_CUT) * 0.5)) * ALPHA;
      const [r, g, b] = turbo(t);
      ctx.fillStyle = `rgba(${r},${g},${b},${a.toFixed(3)})`;
      ctx.fillRect(CX - (gx + 1) * cw, gy * ch, cw + 0.5, ch + 0.5);
    }
  }
}

// ── Component ────────────────────────────────────────────────────────────────
export default function ShotMapKDE({ shots, teamFor, teamAgainst }: ShotMapKDEProps) {
  const [mode, setMode]       = useState<'scatter' | 'density'>('scatter');
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);
  const canvasRef             = useRef<HTMLCanvasElement>(null);
  const containerRef          = useRef<HTMLDivElement>(null);
  const rinkSvg               = buildFullRinkBaseSVG();

  const forShots = shots.filter(s => s[4] === teamFor);
  const agaShots = shots.filter(s => s[4] !== teamFor);
  const forNorm  = forShots.map(s => norm(s[0], s[1]) as [number, number]);
  const agaNorm  = agaShots.map(s => norm(s[0], s[1]) as [number, number]);
  const xgfPct   = shots.length ? Math.round(forShots.length / shots.length * 100) : 50;

  useEffect(() => {
    if (!canvasRef.current) return;
    if (mode === 'density') {
      paintKDE(canvasRef.current, forNorm, agaNorm);
    } else {
      const ctx = canvasRef.current.getContext('2d')!;
      ctx.clearRect(0, 0, W, H);
    }
  }, [mode, shots]);

  // Scatter dot hit-test for tooltip
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (mode !== 'scatter' || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const scaleX = W / rect.width;
    const scaleY = H / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top)  * scaleY;

    for (const s of shots) {
      const [nx, ny] = norm(s[0], s[1]);
      const isFor = s[4] === teamFor;
      const cx = isFor ? toX_for(nx) : toX_aga(nx);
      const cy = toY(ny);
      const r  = s[2] ? 5 : 3.5;
      if ((mx - cx) ** 2 + (my - cy) ** 2 <= (r + 3) ** 2) {
        const label = `${s[4]} · ${s[3]} · G${s[5]}${s[2] ? ' · GOAL' : ''}`;
        setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top - 32, text: label });
        return;
      }
    }
    setTooltip(null);
  };

  const mono = { fontFamily: 'var(--mono)' } as const;

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        {(['scatter', 'density'] as const).map(m => (
          <button key={m} onClick={() => setMode(m)}
            style={{ ...mono, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', padding: '5px 12px', border: '1px solid rgba(13,13,20,0.2)', cursor: 'pointer', background: mode === m ? '#0d0d14' : 'transparent', color: mode === m ? '#EFEEE8' : 'rgba(13,13,20,0.48)' }}>
            {m === 'scatter' ? '● Scatter' : '◼ Density'}
          </button>
        ))}
        <span style={{ ...mono, fontSize: 10, color: 'rgba(13,13,20,0.32)', marginLeft: 'auto' }}>
          {forShots.length} for · {agaShots.length} against · {shots.filter(s => s[2]).length} goals
        </span>
      </div>

      {/* Rink + overlay stack */}
      <div ref={containerRef} style={{ position: 'relative', width: '100%', lineHeight: 0, cursor: mode === 'scatter' ? 'crosshair' : 'default' }}
        onMouseMove={handleMouseMove} onMouseLeave={() => setTooltip(null)}>

        {/* SVG rink base */}
        <div dangerouslySetInnerHTML={{ __html: rinkSvg }} style={{ display: 'block', width: '100%' }} />

        {/* Canvas — KDE in density mode, cleared in scatter mode */}
        <canvas ref={canvasRef} width={W} height={H}
          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />

        {/* SVG scatter dots — visible only in scatter mode */}
        {mode === 'scatter' && (
          <svg viewBox={`0 0 ${W} ${H}`} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
            {shots.map((s, i) => {
              const [nx, ny] = norm(s[0], s[1]);
              const isFor = s[4] === teamFor;
              const cx = isFor ? toX_for(nx) : toX_aga(nx);
              const cy = toY(ny);
              const r  = s[2] ? 5 : 3.5;
              return s[2]
                ? <circle key={i} cx={cx} cy={cy} r={r} fill={isFor ? 'rgba(20,100,200,0.90)' : 'rgba(232,0,45,0.90)'} stroke="white" strokeWidth={0.8} />
                : <circle key={i} cx={cx} cy={cy} r={r} fill={isFor ? 'rgba(20,100,200,0.13)' : 'rgba(232,0,45,0.13)'} stroke={isFor ? 'rgba(20,100,200,0.45)' : 'rgba(232,0,45,0.45)'} strokeWidth={0.7} />;
            })}
          </svg>
        )}

        {/* Tooltip */}
        {tooltip && (
          <div style={{ ...mono, position: 'absolute', left: tooltip.x + 8, top: tooltip.y, background: '#0d0d14', color: '#EFEEE8', fontSize: 10, padding: '4px 8px', pointerEvents: 'none', whiteSpace: 'nowrap', letterSpacing: '0.06em', zIndex: 10 }}>
            {tooltip.text}
          </div>
        )}
      </div>

      {/* xGF% bar */}
      <div style={{ height: 14, background: 'rgba(232,0,45,0.15)', position: 'relative', overflow: 'hidden', marginTop: 4 }}>
        <div style={{ width: `${xgfPct}%`, height: '100%', background: 'rgba(20,100,200,0.40)' }} />
        <span style={{ ...mono, position: 'absolute', left: 4, top: 2, fontSize: 9, fontWeight: 700, color: 'rgba(232,0,45,0.75)', letterSpacing: '0.06em' }}>
          xGA {100 - xgfPct}%
        </span>
        <span style={{ ...mono, position: 'absolute', right: 4, top: 2, fontSize: 9, fontWeight: 700, color: 'rgba(20,100,200,0.85)', letterSpacing: '0.06em' }}>
          xGF {xgfPct}%
        </span>
      </div>
    </div>
  );
}
