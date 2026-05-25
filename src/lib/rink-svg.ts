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

// ViewBox: just before blue line to just past end boards
const VB_X = Math.floor(BL) - 8;           // ~232
const VB_W = Math.ceil(EB) - VB_X + 8;     // ~153

function rinkElementsFor(): string[] {
  const p: string[] = [];
  const foY1 = fy(-22).toFixed(1);
  const foY2 = fy(22).toFixed(1);
  const gpTop = fy(-3).toFixed(1);   // top goal post
  const gpBot = fy(3).toFixed(1);    // bottom goal post
  const cY    = fy(0).toFixed(1);    // centre y
  const cYm   = (fy(0) - 20).toFixed(1);
  const cYp   = (fy(0) + 20).toFixed(1);

  // Rink background (full zone: blue line → end boards)
  p.push(`<rect x="${BL.toFixed(1)}" y="2" width="${(EB - BL).toFixed(1)}" height="166" rx="0" fill="#E8F4F8" stroke="rgba(13,13,20,0.10)" stroke-width="0"/>`);
  // Outer border
  p.push(`<rect x="${(BL - 1).toFixed(1)}" y="2" width="${(EB - BL + 2).toFixed(1)}" height="166" rx="5" fill="none" stroke="rgba(13,13,20,0.14)" stroke-width="1"/>`);
  // Light blue tint for offensive zone
  p.push(`<rect x="${BL.toFixed(1)}" y="2" width="${(EB - BL).toFixed(1)}" height="166" fill="rgba(20,100,200,0.04)"/>`);
  // End boards zone (behind goal) — subtle darker shade
  p.push(`<rect x="${GL.toFixed(1)}" y="2" width="${(EB - GL).toFixed(1)}" height="166" fill="rgba(13,13,20,0.03)"/>`);

  // Blue line
  p.push(`<line x1="${BL.toFixed(1)}" y1="2" x2="${BL.toFixed(1)}" y2="168" stroke="rgba(20,100,200,0.55)" stroke-width="2.5" stroke-dasharray="5 3"/>`);
  // Goal line
  p.push(`<line x1="${GL.toFixed(1)}" y1="2" x2="${GL.toFixed(1)}" y2="168" stroke="rgba(232,0,45,0.50)" stroke-width="1.5"/>`);
  // End boards line
  p.push(`<line x1="${EB.toFixed(1)}" y1="2" x2="${EB.toFixed(1)}" y2="168" stroke="rgba(13,13,20,0.20)" stroke-width="1"/>`);

  // Crease — D-shape curving toward centre ice from goal line
  p.push(`<path d="M${GL.toFixed(1)},${cYm} A20,20 0 0,0 ${GL.toFixed(1)},${cYp}" fill="rgba(20,100,200,0.09)" stroke="rgba(20,100,200,0.32)" stroke-width="1"/>`);
  // Goal mouth (rect sticking into end boards zone)
  p.push(`<rect x="${GL.toFixed(1)}" y="${gpTop}" width="5" height="${(parseFloat(gpBot) - parseFloat(gpTop)).toFixed(1)}" fill="rgba(13,13,20,0.40)" rx="0.5"/>`);

  // Face-off circles — correct r in NHL-foot scale: 15 ft radius
  // 15 / 100 * 182 = 27.3 SVG units — too large visually; use r=18 to match line page
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

  return `<svg viewBox="${VB_X} 0 ${VB_W} 170" xmlns="http://www.w3.org/2000/svg" class="shot-map-svg">${p.join('')}</svg>`;
}
