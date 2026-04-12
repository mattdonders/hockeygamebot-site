// hgb-charts.js — HockeyGameBot chart utilities
// Extracted from index.astro for maintainability.
// Provides: TEAM_COLORS, teamColor, ensureReadable, hexToRgba, colorDistance,
//           interpWp, buildWpChart, buildXgFlowChart

// ─────────────────────────────────────────────────────────────────────────────
// TEAM PRIMARY COLORS (accent gradients)
// ─────────────────────────────────────────────────────────────────────────────
// Synced with utils/team_details.py in the Python bot — that is the canonical source.
const TEAM_COLORS = {
  ANA: ['#F47A38','#B09862'], BOS: ['#FFB81C','#000000'], BUF: ['#002654','#FDBB30'],
  CAR: ['#CC0000','#000000'], CBJ: ['#002654','#CE1126'], CGY: ['#C8102E','#F1BE48'],
  CHI: ['#CF0A2C','#000000'], COL: ['#6F263D','#236192'], DAL: ['#006847','#8F8F8C'],
  DET: ['#CE1126','#FFFFFF'], EDM: ['#FF4C00','#041E42'], FLA: ['#041E42','#C8102E'],
  LAK: ['#111111','#A2AAAD'], MIN: ['#154734','#A6192E'], MTL: ['#AF1E2D','#00205B'],
  NSH: ['#FFB81C','#041E42'], NJD: ['#CE1126','#000000'], NYI: ['#00539B','#F47D30'],
  NYR: ['#0038A8','#CE1126'], OTT: ['#DA1A32','#000000'], PHI: ['#FA4616','#000000'],
  PIT: ['#000000','#FCB514'], SEA: ['#001628','#99D9D9'], SJS: ['#006D75','#EA7200'],
  STL: ['#002F87','#FDB827'], TBL: ['#00205B','#FFFFFF'], TOR: ['#00205B','#FFFFFF'],
  UTA: ['#71AFE5','#090909'], VAN: ['#00205B','#00843D'], VGK: ['#B4975A','#333F48'],
  WSH: ['#041E42','#C8102E'], WPG: ['#041E42','#004C97'],
};

function teamColor(abbrev, idx = 0) {
  return (TEAM_COLORS[abbrev] || ['#555','#333'])[idx];
}

// Boost colors that are too dark to read on a dark background (L < 52% → clamp to 52%)
function ensureReadable(hex, minL = 52) {
  if (!hex || !hex.startsWith('#')) return hex;
  const r = parseInt(hex.slice(1,3),16)/255, g = parseInt(hex.slice(3,5),16)/255, b = parseInt(hex.slice(5,7),16)/255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b);
  let h = 0, s = 0, l = (max+min)/2;
  if (max !== min) {
    const d = max-min; s = l>0.5 ? d/(2-max-min) : d/(max+min);
    if (max===r) h=((g-b)/d+(g<b?6:0))/6;
    else if (max===g) h=((b-r)/d+2)/6;
    else h=((r-g)/d+4)/6;
  }
  if (l*100 >= minL) return hex;
  l = minL/100;
  function hue2rgb(p,q,t){if(t<0)t+=1;if(t>1)t-=1;if(t<1/6)return p+(q-p)*6*t;if(t<0.5)return q;if(t<2/3)return p+(q-p)*(2/3-t)*6;return p;}
  const q=l<0.5?l*(1+s):l+s-l*s, p=2*l-q;
  const nr=Math.round(hue2rgb(p,q,h+1/3)*255), ng=Math.round(hue2rgb(p,q,h)*255), nb=Math.round(hue2rgb(p,q,h-1/3)*255);
  return '#'+[nr,ng,nb].map(x=>x.toString(16).padStart(2,'0')).join('');
}

function hexToRgba(hex, alpha) {
  if (!hex || !hex.startsWith('#')) return `rgba(200,16,46,${alpha})`;
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// Euclidean RGB distance — used to detect same-color team clashes
function colorDistance(hex1, hex2) {
  if (!hex1 || !hex2) return 999;
  const r1=parseInt(hex1.slice(1,3),16), g1=parseInt(hex1.slice(3,5),16), b1=parseInt(hex1.slice(5,7),16);
  const r2=parseInt(hex2.slice(1,3),16), g2=parseInt(hex2.slice(3,5),16), b2=parseInt(hex2.slice(5,7),16);
  return Math.sqrt((r1-r2)**2 + (g1-g2)**2 + (b1-b2)**2);
}

// ─────────────────────────────────────────────────────────────────────────────
// WP CHART
// ─────────────────────────────────────────────────────────────────────────────

// Linear interpolation of WP at time t across sorted WP points
function interpWp(points, t) {
  if (!points.length) return 0.5;
  if (t <= points[0].t) return points[0].wp;
  if (t >= points[points.length - 1].t) return points[points.length - 1].wp;
  for (let i = 0; i < points.length - 1; i++) {
    if (points[i].t <= t && t <= points[i + 1].t) {
      const frac = (t - points[i].t) / (points[i + 1].t - points[i].t);
      return points[i].wp + (points[i + 1].wp - points[i].wp) * frac;
    }
  }
  return 0.5;
}

function buildWpChart(points, goals, homeAbbr, awayAbbr, homeColor, awayColor, tMax) {
  homeColor = ensureReadable(homeColor);
  awayColor = ensureReadable(awayColor);

  // If both teams share a nearly identical color, swap only the away team's color to its
  // secondary — preserving the home team's identity. Only swap home too if the away
  // secondary still clashes with the home primary.
  // Threshold of 60 catches NJD (#CE1126) vs DET (#CE1126) and similar clashes.
  const COLOR_CLASH_THRESHOLD = 60;
  if (colorDistance(homeColor, awayColor) < COLOR_CLASH_THRESHOLD) {
    const awaySec = ensureReadable(teamColor(awayAbbr, 1));
    if (colorDistance(homeColor, awaySec) >= COLOR_CLASH_THRESHOLD) {
      awayColor = awaySec; // away secondary is distinct enough
    } else {
      // Away secondary also clashes — swap both
      homeColor = ensureReadable(teamColor(homeAbbr, 1));
      awayColor = awaySec;
    }
  }

  const svgW = 800; const svgH = 220; const padH = 18;
  const midY = svgH / 2;
  const tMin = 0;
  const pts = points.filter(p => p.t >= tMin && p.t <= tMax && p.wp != null);
  if (!pts.length) return `<svg viewBox="0 0 ${svgW} ${svgH}" xmlns="http://www.w3.org/2000/svg"></svg>`;

  function px(t) { return ((t - tMin) / (tMax - tMin)) * svgW; }
  function py(wp) { return padH + (1 - wp) * (svgH - 2 * padH); }

  const coords = pts.map(p => ({ x: px(p.t), y: py(p.wp) }));
  const linePoints = coords.map(c => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const uid = Math.random().toString(36).slice(2, 8);

  const areaPoints = [
    `0,${py(pts[0].wp).toFixed(1)}`,
    ...coords.map(c => `${c.x.toFixed(1)},${c.y.toFixed(1)}`),
    `${px(tMax).toFixed(1)},${midY}`,
    `0,${midY}`,
  ].join(' ');

  const periodLines = [1200, 2400, 3600].filter(t => t > tMin && t < tMax);
  const periodZones = [];
  if (tMax > 1200) periodZones.push({ x: px(1200) + 4, label: 'P2' });
  if (tMax > 2400) periodZones.push({ x: px(2400) + 4, label: 'P3' });
  if (tMax > 3600) periodZones.push({ x: px(3600) + 4, label: 'OT' });

  const visibleGoals = (goals || []).filter(g => g.t >= tMin && g.t <= tMax);

  const goalMarkersHtml = visibleGoals.map((g, idx) => {
    // Always place the dot at the GOAL's actual time (g.t).
    // Y: interpolate on the WP line at g.t — since GOAL events store a WP point,
    // interpWp(pts, g.t) returns the post-goal WP exactly where the line steps.
    const gx = px(g.t).toFixed(1);
    const gy = py(interpWp(pts, g.t)).toFixed(1);
    const color = g.isHome ? homeColor : awayColor;

    // Stack labels that are horizontally close to avoid overlap
    const stackCount = visibleGoals.slice(0, idx).filter(
      (prev) => prev.isHome === g.isHome && Math.abs(px(prev.t) - px(g.t)) < 30
    ).length;
    const baseLabelOffset = g.isHome ? -13 : 17;
    const stackDir = g.isHome ? -1 : 1;
    const labelY = (parseFloat(gy) + baseLabelOffset + stackDir * stackCount * 13).toFixed(1);

    return `<circle cx="${gx}" cy="${gy}" r="3.5" fill="${color}" fill-opacity="0.95"/>
      <text x="${gx}" y="${labelY}" text-anchor="middle" font-family="Oswald,sans-serif" font-size="10" font-weight="700" fill="${color}" fill-opacity="0.9" letter-spacing="0.05em">${g.isHome ? homeAbbr : awayAbbr}</text>`;
  }).join('');

  return `<svg viewBox="0 0 ${svgW} ${svgH}" xmlns="http://www.w3.org/2000/svg" style="overflow:visible">
  <defs>
    <clipPath id="cu-${uid}"><rect x="0" y="0" width="${svgW}" height="${midY}"/></clipPath>
    <clipPath id="cl-${uid}"><rect x="0" y="${midY}" width="${svgW}" height="${svgH - midY}"/></clipPath>
  </defs>
  ${periodLines.map(t => `<line x1="${px(t).toFixed(1)}" y1="0" x2="${px(t).toFixed(1)}" y2="${svgH}" stroke="rgba(255,255,255,0.22)" stroke-width="1.5" stroke-dasharray="4,3"/>`).join('')}
  ${[{wp:0.75,label:'75%'},{wp:0.25,label:'75%'}].map(r => { const ry = py(r.wp).toFixed(1); return `<line x1="0" y1="${ry}" x2="${svgW}" y2="${ry}" stroke="rgba(255,255,255,0.07)" stroke-width="0.6"/><text x="${svgW - 3}" y="${(parseFloat(ry) + 7).toFixed(1)}" text-anchor="end" font-family="Oswald,sans-serif" font-size="7" fill="rgba(255,255,255,0.18)">${r.label}</text>`; }).join('')}
  <line x1="0" y1="${midY}" x2="${svgW}" y2="${midY}" stroke="rgba(255,255,255,0.15)" stroke-width="0.8" stroke-dasharray="4,4"/>
  <polygon points="${areaPoints}" fill="${hexToRgba(homeColor,0.15)}" clip-path="url(#cu-${uid})"/>
  <polygon points="${areaPoints}" fill="${hexToRgba(awayColor,0.15)}" clip-path="url(#cl-${uid})"/>
  <polyline points="${linePoints}" fill="none" stroke="${homeColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" clip-path="url(#cu-${uid})"/>
  <polyline points="${linePoints}" fill="none" stroke="${awayColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" clip-path="url(#cl-${uid})"/>
  ${goalMarkersHtml}
  ${periodZones.map(z => `<text x="${z.x.toFixed(1)}" y="${(padH+8).toFixed(1)}" text-anchor="start" font-family="Oswald,sans-serif" font-size="9" fill="rgba(255,255,255,0.40)" letter-spacing="0.08em">${z.label}</text>`).join('')}
  <text x="4" y="${(padH+6).toFixed(1)}" font-family="Oswald,sans-serif" font-size="9" font-weight="700" fill="${hexToRgba(homeColor,0.7)}">${homeAbbr}</text>
  <text x="4" y="${(svgH-padH+4).toFixed(1)}" font-family="Oswald,sans-serif" font-size="9" font-weight="700" fill="${hexToRgba(awayColor,0.7)}">${awayAbbr}</text>
</svg>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// xG FLOW CHART
// ─────────────────────────────────────────────────────────────────────────────

function buildXgFlowChart(xgEvents, goals, homeAbbr, awayAbbr, homeColor, awayColor, tMax) {
  homeColor = ensureReadable(homeColor); awayColor = ensureReadable(awayColor);
  const svgW = 800; const svgH = 220; const padH = 18;

  function toGameSecs(period, tip) {
    if (!tip || !period) return null;
    const ci = tip.indexOf(':');
    if (ci === -1) return null;
    const m = parseInt(tip.slice(0, ci), 10), s = parseInt(tip.slice(ci + 1), 10);
    if (isNaN(m) || isNaN(s)) return null;
    const e = m * 60 + s;
    return period <= 3 ? (period - 1) * 1200 + e : 3600 + (period - 4) * 300 + e;
  }

  const homeShots = [], awayShots = [];
  for (const ev of (xgEvents || [])) {
    if (ev.event_type !== 'SHOT_ON_GOAL' && ev.event_type !== 'MISSED_SHOT' && ev.event_type !== 'GOAL') continue;
    const xg = parseFloat(ev.payload?.xg);
    if (isNaN(xg) || xg <= 0) continue;
    const t = toGameSecs(ev.period, ev.payload?.timeInPeriod);
    if (t === null || t > tMax) continue;
    const isHome = ev.event_team_id != null && ev.event_team_id === ev.home_team_id;
    (isHome ? homeShots : awayShots).push({ t, xg });
  }
  homeShots.sort((a, b) => a.t - b.t);
  awayShots.sort((a, b) => a.t - b.t);

  if (!homeShots.length && !awayShots.length) {
    return `<svg viewBox="0 0 ${svgW} ${svgH}" xmlns="http://www.w3.org/2000/svg"><text x="${svgW/2}" y="${svgH/2}" text-anchor="middle" font-family="Oswald,sans-serif" font-size="12" fill="rgba(255,255,255,0.18)">No xG data available</text></svg>`;
  }

  function buildCum(shots) {
    let c = 0; const r = [{ t: 0, c: 0 }];
    for (const s of shots) { c += s.xg; r.push({ t: s.t, c }); }
    return r;
  }
  const homeCum = buildCum(homeShots);
  const awayCum = buildCum(awayShots);
  const homeTotal = homeCum[homeCum.length - 1]?.c || 0;
  const awayTotal = awayCum[awayCum.length - 1]?.c || 0;
  const rawMax = Math.max(homeTotal, awayTotal, 0.5);
  const yMax = Math.ceil(rawMax * 2) / 2 + 0.3;

  function px(t) { return (t / tMax) * svgW; }
  function py(xg) { return padH + (1 - xg / yMax) * (svgH - 2 * padH); }

  function stepLine(pts) {
    if (!pts.length) return '';
    const out = [`${px(0).toFixed(1)},${py(0).toFixed(1)}`];
    for (let i = 1; i < pts.length; i++) {
      out.push(`${px(pts[i].t).toFixed(1)},${py(pts[i-1].c).toFixed(1)}`);
      out.push(`${px(pts[i].t).toFixed(1)},${py(pts[i].c).toFixed(1)}`);
    }
    out.push(`${px(tMax).toFixed(1)},${py(pts[pts.length-1].c).toFixed(1)}`);
    return out.join(' ');
  }

  function cumAt(pts, t) { let v = 0; for (const p of pts) { if (p.t > t) break; v = p.c; } return v; }

  const homeLine = stepLine(homeCum);
  const awayLine = stepLine(awayCum);
  const periodLines = [1200, 2400, 3600].filter(t => t > 0 && t < tMax);
  const periodZones = [];
  if (tMax > 1200) periodZones.push({ x: px(1200) + 4, label: 'P2' });
  if (tMax > 2400) periodZones.push({ x: px(2400) + 4, label: 'P3' });
  if (tMax > 3600) periodZones.push({ x: px(3600) + 4, label: 'OT' });

  const goalDots = (goals || []).filter(g => g.t >= 0 && g.t <= tMax).map(g => {
    const gx = px(g.t).toFixed(1);
    const cum = cumAt(g.isHome ? homeCum : awayCum, g.t);
    const gy = py(cum).toFixed(1);
    const color = g.isHome ? homeColor : awayColor;
    return `<circle cx="${gx}" cy="${gy}" r="3.5" fill="${color}" stroke="#0a0a0a" stroke-width="1.2"/>`;
  }).join('');

  return `<svg viewBox="0 0 ${svgW} ${svgH}" xmlns="http://www.w3.org/2000/svg" style="overflow:visible">
  ${periodLines.map(t => `<line x1="${px(t).toFixed(1)}" y1="0" x2="${px(t).toFixed(1)}" y2="${svgH}" stroke="rgba(255,255,255,0.22)" stroke-width="1.5" stroke-dasharray="4,3"/>`).join('')}
  <line x1="0" y1="${py(0).toFixed(1)}" x2="${svgW}" y2="${py(0).toFixed(1)}" stroke="rgba(255,255,255,0.06)" stroke-width="0.8"/>
  ${homeLine ? `<polyline points="${homeLine}" fill="none" stroke="${homeColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.85"/>` : ''}
  ${awayLine ? `<polyline points="${awayLine}" fill="none" stroke="${awayColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.85"/>` : ''}
  ${goalDots}
  ${periodZones.map(z => `<text x="${z.x.toFixed(1)}" y="${(padH+8).toFixed(1)}" text-anchor="start" font-family="Oswald,sans-serif" font-size="9" fill="rgba(255,255,255,0.40)" letter-spacing="0.08em">${z.label}</text>`).join('')}
</svg>`;
}
