/**
 * Shared rink SVG builder.
 *
 * Same coordinate system as the line detail page:
 *   viewBox "0 0 390 170"  |  centre ice x=195
 *   FOR  (right): nhlX 0-100 → SVG x 195-377
 *   AGAINST (left, mirrored): nhlX 0-100 → SVG x 195-13
 *
 * Player shot map uses the offensive-zone crop:
 *   viewBox="193 0 197 170"  (right half only)
 *   shot x_n (abs NHL coord, 25-89) maps directly via fxFor(x_n)
 */

const CX = 195;

function fxFor(x: number): number { return CX + (x / 100) * 182; }
function fy(y: number): number    { return ((y + 42.5) / 85) * 164 + 3; }

/** Offensive-zone rink elements (right half only — no mirror). */
function rinkElementsFor(): string[] {
  const p: string[] = [];
  const cY   = fy(0).toFixed(1);
  const cYm  = (fy(0) - 20).toFixed(1);
  const cYp  = (fy(0) + 20).toFixed(1);
  const foY1 = fy(-22).toFixed(1);
  const foY2 = fy(22).toFixed(1);
  const fBL  = fxFor(0).toFixed(1);   // blue line (25 ft from centre)
  const fGL  = fxFor(100).toFixed(1); // goal line
  const fFo  = fxFor(69).toFixed(1);  // face-off dot x

  // Background
  p.push(`<rect x="2" y="2" width="386" height="166" rx="6" fill="#E8F4F8" stroke="rgba(13,13,20,0.14)" stroke-width="1"/>`);
  // Light FOR zone tint
  p.push(`<rect x="${CX}" y="2" width="${386 - CX}" height="166" fill="rgba(20,100,200,0.045)"/>`);
  // Blue line (dashed)
  p.push(`<line x1="${fBL}" y1="2" x2="${fBL}" y2="168" stroke="rgba(20,100,200,0.45)" stroke-width="2" stroke-dasharray="5 3"/>`);
  // Goal line
  p.push(`<line x1="${fGL}" y1="2" x2="${fGL}" y2="168" stroke="rgba(232,0,45,0.45)" stroke-width="1.5"/>`);
  // Crease (D toward centre)
  p.push(`<path d="M${fGL},${cYm} A20,20 0 0,0 ${fGL},${cYp}" fill="rgba(20,100,200,0.08)" stroke="rgba(20,100,200,0.30)" stroke-width="1"/>`);
  // Goal mouth
  p.push(`<rect x="${fGL}" y="${(fy(0) - 3).toFixed(1)}" width="5" height="6" fill="rgba(13,13,20,0.35)" rx="0.5"/>`);
  // Face-off circles
  p.push(`<circle cx="${fFo}" cy="${foY1}" r="18" fill="none" stroke="rgba(232,0,45,0.20)" stroke-width="1"/>`);
  p.push(`<circle cx="${fFo}" cy="${foY2}" r="18" fill="none" stroke="rgba(232,0,45,0.20)" stroke-width="1"/>`);
  p.push(`<circle cx="${fFo}" cy="${foY1}" r="2" fill="rgba(232,0,45,0.35)"/>`);
  p.push(`<circle cx="${fFo}" cy="${foY2}" r="2" fill="rgba(232,0,45,0.35)"/>`);
  // Direction labels
  p.push(`<text x="${fBL}" y="14" font-family="JetBrains Mono,monospace" font-size="7" font-weight="700" fill="rgba(20,100,200,0.50)" text-anchor="middle" letter-spacing="0.08em">BLUE LINE</text>`);
  p.push(`<text x="${(parseFloat(fGL) - 12).toFixed(1)}" y="14" font-family="JetBrains Mono,monospace" font-size="7" font-weight="700" fill="rgba(232,0,45,0.45)" text-anchor="end" letter-spacing="0.06em">GOAL</text>`);

  return p;
}

export interface ShotDot {
  x: number;   // NHL x from centre (0-100), or x_n (25-89) for player shots
  y: number;   // NHL y (-42.5 to 42.5)
  xg?: number;
  is_goal: boolean;
}

/**
 * Build an offensive-zone shot map SVG string.
 *
 * @param shots  Array of shot objects with x_n (25–89), y (-42.5–42.5), is_goal
 * @param teamColor  CSS color for team shots/goals
 * @returns  Full SVG string, cropped to offensive zone
 */
export function buildPlayerShotMapSVG(
  shots: Array<[number, number, number, string]>,
  teamColor: string,
): string {
  const p = rinkElementsFor();

  // Shots (outline) — rendered first
  for (const s of shots) {
    if (s[2]) continue; // skip goals for now
    const sx = fxFor(s[0]).toFixed(1);
    const sy = fy(s[1]).toFixed(1);
    p.push(`<circle cx="${sx}" cy="${sy}" r="2.8" fill="${teamColor}18" stroke="${teamColor}" stroke-width="0.7" opacity="0.70"/>`);
  }
  // Goals (solid) — rendered on top
  for (const s of shots) {
    if (!s[2]) continue;
    const sx = fxFor(s[0]).toFixed(1);
    const sy = fy(s[1]).toFixed(1);
    p.push(`<circle cx="${sx}" cy="${sy}" r="4" fill="${teamColor}" stroke="white" stroke-width="0.8" opacity="0.92"/>`);
  }

  // Wrap in cropped viewBox (offensive zone only)
  return `<svg viewBox="193 0 197 170" xmlns="http://www.w3.org/2000/svg" class="shot-map-svg">${p.join('')}</svg>`;
}
