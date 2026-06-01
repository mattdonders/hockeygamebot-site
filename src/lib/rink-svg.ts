/**
 * Shared rink SVG builder — player offensive-zone shot map.
 *
 * Coordinate system (NHL feet from centre ice):
 *   Blue line  = 25 ft  → fxFor(25)
 *   Face-off   = 69 ft  → fxFor(69)
 *   Goal line  = 89 ft  → fxFor(89)   ← shots max here
 *   End boards = 100 ft → fxFor(100)
 *
 * ViewBox crops to the offensive zone: fxFor(25)−5 → fxFor(100)+5
 * Shot x_n values (25–89 ft from centre) map directly via fxFor(x_n).
 */

const CX = 195; // centre-ice SVG x in the full 0-390 coordinate space

function fxFor(x: number): number { return CX + (x / 100) * 182; }
function fy(y: number): number    { return ((y + 42.5) / 85) * 164 + 3; }

// Key x positions in SVG units
const BL  = fxFor(25);  // 240.5 — blue line
const GL  = fxFor(89);  // 357.0 — goal line
const EB  = fxFor(100); // 377.0 — end boards
const FO  = fxFor(69);  // 320.6 — face-off dot x

// ViewBox: centre ice to just past end boards — shots near blue line stay inside
const VB_X = 193;                           // centre ice
const VB_W = Math.ceil(EB) - VB_X + 6;     // ~190

function rinkElementsFor(): string[] {
  const p: string[] = [];
  const foY1 = fy(-22).toFixed(1);
  const foY2 = fy(22).toFixed(1);
  const gpTop = fy(-3).toFixed(1);   // top goal post
  const gpBot = fy(3).toFixed(1);    // bottom goal post
  const cY    = fy(0).toFixed(1);    // centre y
  const cYm   = (fy(0) - 20).toFixed(1);
  const cYp   = (fy(0) + 20).toFixed(1);

  // Full rink background (centre ice → end boards)
  p.push(`<rect x="193" y="2" width="${(EB - 193).toFixed(1)}" height="166" rx="5" fill="#E8F4F8" stroke="rgba(13,13,20,0.14)" stroke-width="1"/>`);
  // Offensive zone tint (blue line → end boards)
  p.push(`<rect x="${BL.toFixed(1)}" y="2" width="${(EB - BL).toFixed(1)}" height="166" fill="rgba(20,100,200,0.04)"/>`);
  // Behind-goal tint
  p.push(`<rect x="${GL.toFixed(1)}" y="2" width="${(EB - GL).toFixed(1)}" height="166" fill="rgba(13,13,20,0.03)"/>`);

  // Centre ice line
  p.push(`<line x1="195" y1="2" x2="195" y2="168" stroke="rgba(13,13,20,0.18)" stroke-width="1"/>`);
  // Centre circle (half — only right side visible)
  p.push(`<circle cx="195" cy="${cY}" r="21" fill="none" stroke="rgba(13,13,20,0.15)" stroke-width="1"/>`);
  // Centre dot
  p.push(`<circle cx="195" cy="${cY}" r="2" fill="rgba(13,13,20,0.20)"/>`);

  // Blue line
  p.push(`<line x1="${BL.toFixed(1)}" y1="2" x2="${BL.toFixed(1)}" y2="168" stroke="rgba(20,100,200,0.55)" stroke-width="2.5" stroke-dasharray="5 3"/>`);
  // Goal line
  p.push(`<line x1="${GL.toFixed(1)}" y1="2" x2="${GL.toFixed(1)}" y2="168" stroke="rgba(232,0,45,0.50)" stroke-width="1.5"/>`);
  // End boards
  p.push(`<line x1="${EB.toFixed(1)}" y1="2" x2="${EB.toFixed(1)}" y2="168" stroke="rgba(13,13,20,0.20)" stroke-width="1"/>`);

  // Crease — D-shape curving toward centre ice
  p.push(`<path d="M${GL.toFixed(1)},${cYm} A20,20 0 0,0 ${GL.toFixed(1)},${cYp}" fill="rgba(20,100,200,0.09)" stroke="rgba(20,100,200,0.32)" stroke-width="1"/>`);
  // Goal mouth
  p.push(`<rect x="${GL.toFixed(1)}" y="${gpTop}" width="5" height="${(parseFloat(gpBot) - parseFloat(gpTop)).toFixed(1)}" fill="rgba(13,13,20,0.40)" rx="0.5"/>`);

  // Face-off circles (r=18 matches line page; proportionally fine with wider viewBox)
  p.push(`<circle cx="${FO.toFixed(1)}" cy="${foY1}" r="18" fill="none" stroke="rgba(232,0,45,0.22)" stroke-width="1"/>`);
  p.push(`<circle cx="${FO.toFixed(1)}" cy="${foY2}" r="18" fill="none" stroke="rgba(232,0,45,0.22)" stroke-width="1"/>`);
  p.push(`<circle cx="${FO.toFixed(1)}" cy="${foY1}" r="2" fill="rgba(232,0,45,0.38)"/>`);
  p.push(`<circle cx="${FO.toFixed(1)}" cy="${foY2}" r="2" fill="rgba(232,0,45,0.38)"/>`);

  // Labels
  p.push(`<text x="${BL.toFixed(1)}" y="14" font-family="JetBrains Mono,monospace" font-size="7" font-weight="700" fill="rgba(20,100,200,0.55)" text-anchor="middle" letter-spacing="0.08em">BLUE LINE</text>`);
  p.push(`<text x="${(GL - 8).toFixed(1)}" y="14" font-family="JetBrains Mono,monospace" font-size="7" font-weight="700" fill="rgba(232,0,45,0.50)" text-anchor="end" letter-spacing="0.06em">GOAL</text>`);

  return p;
}

/**
 * Build an offensive-zone shot map SVG string for the player page.
 *
 * @param shots     [x_n, y, is_goal, shot_type] — x_n in NHL feet (25–89)
 * @param teamColor CSS colour for team's shots and goals
 */
export function buildPlayerShotMapSVG(
  shots: Array<[number, number, number, string]>,
  teamColor: string,
): string {
  const p = rinkElementsFor();

  // Shots (outlined) first so goals render on top
  for (const s of shots) {
    if (s[2]) continue;
    p.push(`<circle cx="${fxFor(s[0]).toFixed(1)}" cy="${fy(s[1]).toFixed(1)}" r="2.8" fill="${teamColor}18" stroke="${teamColor}" stroke-width="0.7" opacity="0.70"/>`);
  }
  // Goals (solid)
  for (const s of shots) {
    if (!s[2]) continue;
    p.push(`<circle cx="${fxFor(s[0]).toFixed(1)}" cy="${fy(s[1]).toFixed(1)}" r="4" fill="${teamColor}" stroke="white" stroke-width="0.8" opacity="0.92"/>`);
  }

  return `<svg id="player-shot-map-svg" viewBox="${VB_X} 0 ${VB_W} 170" xmlns="http://www.w3.org/2000/svg" class="shot-map-svg">${p.join('')}</svg>`;
}

// ── Full-rink split shot map (For → | ← Against) ──────────────────────────
// Matches the rendering used on /stats/lines/[slug].astro.
// sf = shots for (attacking right), sa = shots against (defending, shown left).
// Each shot: [x, y, xg, is_goal]  (x/y in NHL feet from centre ice)

// ── Full rink base (rink only, no shots) for React canvas overlay ────────────
export function buildFullRinkBaseSVG(): string {
  const W = 390, H = 170, CX2 = 195;
  const fFor  = (x: number) => CX2 + (x / 100) * 182;
  const fAga  = (x: number) => CX2 - (x / 100) * 182;
  const fy2   = (y: number) => ((y + 42.5) / 85) * 164 + 3;
  const cY = fy2(0).toFixed(1);
  const cYm = (fy2(0) - 20).toFixed(1), cYp = (fy2(0) + 20).toFixed(1);
  const foY1 = fy2(-22).toFixed(1), foY2 = fy2(22).toFixed(1);
  const fBL = fFor(25).toFixed(1), fGL = fFor(89).toFixed(1), fEB = fFor(100).toFixed(1), fFo = fFor(69).toFixed(1);
  const aBL = fAga(25).toFixed(1), aGL = fAga(89).toFixed(1), aEB = fAga(100).toFixed(1), aFo = fAga(69).toFixed(1);
  const p: string[] = [];
  p.push(`<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" width="100%" style="display:block">`);
  // Background
  p.push(`<rect x="0" y="0" width="${W}" height="${H}" rx="6" fill="#E8F4F8" stroke="rgba(13,13,20,0.18)" stroke-width="1.2"/>`);
  // Center line + circle
  p.push(`<line x1="${CX2}" y1="2" x2="${CX2}" y2="${H-2}" stroke="rgba(13,13,20,0.22)" stroke-width="1.5"/>`);
  p.push(`<circle cx="${CX2}" cy="${cY}" r="21" fill="none" stroke="rgba(13,13,20,0.15)" stroke-width="1"/>`);
  p.push(`<circle cx="${CX2}" cy="${cY}" r="2.5" fill="rgba(13,13,20,0.22)"/>`);
  // FOR side (right)
  p.push(`<line x1="${fBL}" y1="2" x2="${fBL}" y2="${H-2}" stroke="rgba(20,100,200,0.55)" stroke-width="2.5"/>`);
  p.push(`<line x1="${fGL}" y1="2" x2="${fGL}" y2="${H-2}" stroke="rgba(232,0,45,0.50)" stroke-width="1.5"/>`);
  p.push(`<path d="M${fGL},${cYm} A20,20 0 0,0 ${fGL},${cYp}" fill="rgba(20,100,200,0.09)" stroke="rgba(20,100,200,0.32)" stroke-width="1"/>`);
  p.push(`<circle cx="${fFo}" cy="${foY1}" r="18" fill="none" stroke="rgba(232,0,45,0.20)" stroke-width="1"/>`);
  p.push(`<circle cx="${fFo}" cy="${foY2}" r="18" fill="none" stroke="rgba(232,0,45,0.20)" stroke-width="1"/>`);
  p.push(`<circle cx="${fFo}" cy="${foY1}" r="2" fill="rgba(232,0,45,0.32)"/>`);
  p.push(`<circle cx="${fFo}" cy="${foY2}" r="2" fill="rgba(232,0,45,0.32)"/>`);
  // AGAINST side (left)
  p.push(`<line x1="${aBL}" y1="2" x2="${aBL}" y2="${H-2}" stroke="rgba(232,0,45,0.45)" stroke-width="2.5"/>`);
  p.push(`<line x1="${aGL}" y1="2" x2="${aGL}" y2="${H-2}" stroke="rgba(232,0,45,0.50)" stroke-width="1.5"/>`);
  p.push(`<path d="M${aGL},${cYm} A20,20 0 0,1 ${aGL},${cYp}" fill="rgba(232,0,45,0.07)" stroke="rgba(232,0,45,0.28)" stroke-width="1"/>`);
  p.push(`<circle cx="${aFo}" cy="${foY1}" r="18" fill="none" stroke="rgba(232,0,45,0.18)" stroke-width="1"/>`);
  p.push(`<circle cx="${aFo}" cy="${foY2}" r="18" fill="none" stroke="rgba(232,0,45,0.18)" stroke-width="1"/>`);
  p.push(`<circle cx="${aFo}" cy="${foY1}" r="2" fill="rgba(232,0,45,0.28)"/>`);
  p.push(`<circle cx="${aFo}" cy="${foY2}" r="2" fill="rgba(232,0,45,0.28)"/>`);
  // Labels
  p.push(`<text x="${(CX2-80)}" y="14" font-family="JetBrains Mono,monospace" font-size="8" font-weight="700" fill="rgba(232,0,45,0.55)" text-anchor="middle" letter-spacing="0.10em">← AGAINST</text>`);
  p.push(`<text x="${(CX2+80)}" y="14" font-family="JetBrains Mono,monospace" font-size="8" font-weight="700" fill="rgba(20,100,200,0.55)" text-anchor="middle" letter-spacing="0.10em">FOR →</text>`);
  p.push(`</svg>`);
  return p.join('');
}

export type FullRinkShot = [number, number, number, number]; // x, y, xg, is_goal

function fxAga(x: number): number { return CX - (x / 100) * 182; }

function dot(sx: string, sy: string, xg: number, isGoal: number, gFill: string, ngFill: string, ngStr: string): string {
  const r = isGoal ? 4 : Math.max(2, Math.min(5, 2 + xg * 6));
  return isGoal
    ? `<circle cx="${sx}" cy="${sy}" r="${r}" fill="${gFill}" stroke="white" stroke-width="0.7" opacity="0.88"/>`
    : `<circle cx="${sx}" cy="${sy}" r="${r}" fill="${ngFill}" stroke="${ngStr}" stroke-width="0.7" opacity="0.80"/>`;
}

export function buildSeriesShotMapSVG(
  sf: FullRinkShot[],
  sa: FullRinkShot[],
): { svg: string; xgfPct: number; xgaPct: number } {
  const xgf = sf.reduce((a, s) => a + (s[2] || 0), 0);
  const xga = sa.reduce((a, s) => a + (s[2] || 0), 0);
  const tot = xgf + xga;
  const fp  = tot > 0 ? (xgf / tot) * 100 : 50;
  const ap  = 100 - fp;
  const fo  = Math.max(0, (fp - 50) / 50 * 0.22).toFixed(3);
  const ao  = Math.max(0, (ap - 50) / 50 * 0.22).toFixed(3);
  const cY  = fy(0).toFixed(1);
  const cYm = (fy(0) - 20).toFixed(1);
  const cYp = (fy(0) + 20).toFixed(1);
  const foY1 = fy(-22).toFixed(1), foY2 = fy(22).toFixed(1);

  const p: string[] = [];
  p.push(`<svg class="full-rink-svg" viewBox="0 0 390 170" xmlns="http://www.w3.org/2000/svg" width="100%">`);
  p.push(`<rect x="2" y="2" width="386" height="166" rx="6" fill="#E8F4F8" stroke="rgba(13,13,20,0.18)" stroke-width="1"/>`);
  p.push(`<rect x="${CX}" y="2" width="${CX - 2}" height="166" fill="rgba(20,100,200,${fo})"/>`);
  p.push(`<rect x="2" y="2" width="${CX - 2}" height="166" fill="rgba(232,0,45,${ao})"/>`);
  p.push(`<line x1="${CX}" y1="2" x2="${CX}" y2="168" stroke="rgba(13,13,20,0.25)" stroke-width="1.5"/>`);
  p.push(`<circle cx="${CX}" cy="${cY}" r="8" fill="none" stroke="rgba(13,13,20,0.18)" stroke-width="1"/>`);
  // FOR side rink markings
  const fBL = fxFor(0).toFixed(1), fGL = fxFor(100).toFixed(1), fFo = fxFor(69).toFixed(1);
  p.push(`<line x1="${fBL}" y1="2" x2="${fBL}" y2="168" stroke="rgba(20,100,200,0.28)" stroke-width="1.2" stroke-dasharray="4 3"/>`);
  p.push(`<line x1="${fGL}" y1="2" x2="${fGL}" y2="168" stroke="rgba(232,0,45,0.40)" stroke-width="1.2"/>`);
  p.push(`<path d="M${fGL},${cYm} A20,20 0 0,0 ${fGL},${cYp}" fill="rgba(20,100,200,0.07)" stroke="rgba(20,100,200,0.28)" stroke-width="1"/>`);
  p.push(`<rect x="${fGL}" y="${(fy(0) - 3).toFixed(1)}" width="4" height="6" fill="rgba(13,13,20,0.35)" rx="0.5"/>`);
  p.push(`<circle cx="${fFo}" cy="${foY1}" r="18" fill="none" stroke="rgba(232,0,45,0.18)" stroke-width="1"/>`);
  p.push(`<circle cx="${fFo}" cy="${foY2}" r="18" fill="none" stroke="rgba(232,0,45,0.18)" stroke-width="1"/>`);
  // AGAINST side rink markings
  const aBL = fxAga(0).toFixed(1), aGL = fxAga(100).toFixed(1), aFo = fxAga(69).toFixed(1);
  p.push(`<line x1="${aBL}" y1="2" x2="${aBL}" y2="168" stroke="rgba(232,0,45,0.22)" stroke-width="1.2" stroke-dasharray="4 3"/>`);
  p.push(`<line x1="${aGL}" y1="2" x2="${aGL}" y2="168" stroke="rgba(232,0,45,0.40)" stroke-width="1.2"/>`);
  p.push(`<path d="M${aGL},${cYm} A20,20 0 0,1 ${aGL},${cYp}" fill="rgba(232,0,45,0.07)" stroke="rgba(232,0,45,0.28)" stroke-width="1"/>`);
  p.push(`<rect x="${(parseFloat(aGL) - 4).toFixed(1)}" y="${(fy(0) - 3).toFixed(1)}" width="4" height="6" fill="rgba(13,13,20,0.35)" rx="0.5"/>`);
  p.push(`<circle cx="${aFo}" cy="${foY1}" r="18" fill="none" stroke="rgba(232,0,45,0.18)" stroke-width="1"/>`);
  p.push(`<circle cx="${aFo}" cy="${foY2}" r="18" fill="none" stroke="rgba(232,0,45,0.18)" stroke-width="1"/>`);
  // Labels
  p.push(`<text x="${CX - 82}" y="14" font-family="JetBrains Mono,monospace" font-size="8" font-weight="700" fill="rgba(232,0,45,0.55)" text-anchor="middle" letter-spacing="0.10em">← AGAINST</text>`);
  p.push(`<text x="${CX + 82}" y="14" font-family="JetBrains Mono,monospace" font-size="8" font-weight="700" fill="rgba(20,100,200,0.55)" text-anchor="middle" letter-spacing="0.10em">FOR →</text>`);
  // Shots
  sa.forEach(s => p.push(dot(fxAga(s[0]).toFixed(1), fy(s[1]).toFixed(1), s[2], s[3], '#E8002D', 'rgba(232,0,45,0.13)', 'rgba(232,0,45,0.35)')));
  sf.forEach(s => p.push(dot(fxFor(s[0]).toFixed(1),  fy(s[1]).toFixed(1), s[2], s[3], 'rgba(20,100,200,0.90)', 'rgba(20,100,200,0.13)', 'rgba(20,100,200,0.35)')));
  // xGF/xGA bar
  p.push(`<rect x="2" y="158" width="386" height="10" fill="rgba(232,0,45,0.15)"/>`);
  p.push(`<rect x="2" y="158" width="${(fp / 100 * 386).toFixed(1)}" height="10" fill="rgba(20,100,200,0.35)"/>`);
  p.push(`<text x="6" y="166" font-family="JetBrains Mono,monospace" font-size="7" font-weight="700" fill="rgba(232,0,45,0.70)" letter-spacing="0.06em">xGA ${ap.toFixed(1)}%</text>`);
  p.push(`<text x="384" y="166" font-family="JetBrains Mono,monospace" font-size="7" font-weight="700" fill="rgba(20,100,200,0.80)" text-anchor="end" letter-spacing="0.06em">xGF ${fp.toFixed(1)}%</text>`);
  p.push(`</svg>`);

  return { svg: p.join(''), xgfPct: fp, xgaPct: ap };
}
