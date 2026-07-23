/**
 * Puck Passport — client-side canvas "share card" (flex card of your attendance).
 *
 * A portrait PNG the user can download / paste on Twitter/Bluesky. It reuses the
 * SAME in-memory data AttendedTracker already computes (counters, arenas, earned
 * badges, single-game records) — NO new network fetch — and the SAME export
 * surface as the player/goalie cards (`window.HGB_Export.showCardModal`).
 *
 * Aesthetic mirrors the HGB stats cards: light/cream (BG #EFEEE8, surface #FFF,
 * ink #0d0d14), Barlow Condensed display + JetBrains-Mono labels, a team-colour
 * accent bar (falls back to HGB red). Per the site's canvas-card rule this file
 * owns only the drawing; the React island supplies the already-derived data.
 *
 * House rule (FAIL LOUD): the caller passes `boxIncomplete` when some box scores
 * failed to load; the card prints an honest footnote rather than presenting a
 * possibly-short Shots / Players-Seen figure as complete truth.
 */

const BG = '#EFEEE8';
const SURFACE = '#FFFFFF';
const INK = '#0D0D14';
const RED = '#CC0000';
const ink = (a: number) => `rgba(13,13,20,${a})`;

export interface ShareCounters {
  games: number;
  periods: number;
  goals: number;
  shots: number;
  playersSeen: number;
}

export interface ShareBadge {
  label: string;
  rarity: string; // e.g. "1 in 8 games"
}

export interface ShareRecord {
  label: string; // e.g. "Highest Scoring"
  value: string; // e.g. "11 goals"
  sub?: string; // context line (matchup · date)
}

export interface PassportShareData {
  /** "@handle" style identity, or null when logged-out / unknown. */
  handle: string | null;
  counters: ShareCounters;
  arenas: { visited: number; total: number };
  /** Rarest earned badges, already sorted rarest-first (0–3 shown). */
  badges: ShareBadge[];
  /** Marquee single-game records (0–3 shown). */
  records: ShareRecord[];
  /** Team-colour accent (hex) — falls back to HGB red. */
  accent?: string | null;
  /** True when some box scores failed → Shots / Players Seen may be short. */
  boxIncomplete: boolean;
}

// ── tiny draw helpers ───────────────────────────────────────────────────────

function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Largest px size (≤ start) at which `text` in `font(px)` fits `maxW`. */
function fitFont(
  ctx: CanvasRenderingContext2D,
  text: string,
  font: (px: number) => string,
  start: number,
  maxW: number,
  min = 12,
): number {
  let px = start;
  while (px > min) {
    ctx.font = font(px);
    if (ctx.measureText(text).width <= maxW) break;
    px -= 1;
  }
  return px;
}

function truncate(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t + '…';
}

// ── the card ────────────────────────────────────────────────────────────────

export function drawPassportCard(data: PassportShareData): HTMLCanvasElement {
  const accent = data.accent || RED;
  const SCALE = 2;
  const W = 600;
  const PAD = 36;
  const cond = (px: number, wt = 800) => `${wt} ${px}px "Barlow Condensed", sans-serif`;
  const body = (px: number, wt = 500) => `${wt} ${px}px "Barlow", sans-serif`;
  const mono = (px: number, wt = 500) => `${wt} ${px}px "JetBrains Mono", monospace`;

  // ── section heights (computed so total H is exact) ──
  const HEADER_H = 150;
  const COUNTERS_H = 116;
  const SECTION_GAP = 26;
  const LABEL_H = 30; // section header ("RAREST BADGES" etc.)
  const ARENA_H = 74;
  const BADGE_ROW_H = 46;
  const RECORD_ROW_H = 60;
  const FOOTER_H = 64;

  const hasBadges = data.badges.length > 0;
  const hasRecords = data.records.length > 0;

  let bodyH = HEADER_H + COUNTERS_H + SECTION_GAP + LABEL_H + ARENA_H;
  if (hasBadges) bodyH += SECTION_GAP + LABEL_H + data.badges.length * BADGE_ROW_H + (data.badges.length - 1) * 4;
  if (hasRecords) bodyH += SECTION_GAP + LABEL_H + data.records.length * RECORD_ROW_H + (data.records.length - 1) * 4;
  bodyH += SECTION_GAP;
  const H = bodyH + FOOTER_H;

  const canvas = document.createElement('canvas');
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(SCALE, SCALE);

  // ── background: cream + faint grid (matches the page masthead) ──
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = ink(0.04);
  ctx.lineWidth = 1;
  for (let gx = 48; gx < W; gx += 48) {
    ctx.beginPath();
    ctx.moveTo(gx + 0.5, HEADER_H);
    ctx.lineTo(gx + 0.5, H);
    ctx.stroke();
  }
  for (let gy = HEADER_H + 48; gy < H; gy += 48) {
    ctx.beginPath();
    ctx.moveTo(0, gy + 0.5);
    ctx.lineTo(W, gy + 0.5);
    ctx.stroke();
  }

  // ── HEADER (white band + accent bar) ──
  ctx.fillStyle = SURFACE;
  ctx.fillRect(0, 0, W, HEADER_H);
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, 6, HEADER_H);
  ctx.fillStyle = INK;
  ctx.fillRect(0, HEADER_H - 2, W, 2);

  // eyebrow
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.font = mono(11, 600);
  ctx.fillStyle = RED;
  ctx.fillText('PERSONAL TRACKER · HOCKEYGAMEBOT', PAD, PAD + 6);

  // headline
  const headline = 'MY PUCK PASSPORT';
  const hPx = fitFont(ctx, headline, (p) => cond(p, 800), 46, W - PAD * 2, 30);
  ctx.font = cond(hPx, 800);
  ctx.fillStyle = INK;
  ctx.textBaseline = 'top';
  ctx.fillText(headline, PAD, PAD + 20);

  // handle / tagline
  ctx.font = body(15, 500);
  ctx.fillStyle = ink(0.56);
  const tagline = data.handle ? data.handle : 'Every game I’ve been to, in person.';
  ctx.fillText(truncate(ctx, tagline, W - PAD * 2), PAD, PAD + 20 + hPx + 12);

  // ── COUNTERS (full-bleed 5-up on white) ──
  const cy = HEADER_H;
  ctx.fillStyle = SURFACE;
  ctx.fillRect(0, cy, W, COUNTERS_H);
  ctx.fillStyle = INK;
  ctx.fillRect(0, cy + COUNTERS_H - 2, W, 2);

  const cells: Array<[string, number]> = [
    ['GAMES', data.counters.games],
    ['PERIODS', data.counters.periods],
    ['GOALS', data.counters.goals],
    ['SHOTS', data.counters.shots],
    ['SEEN', data.counters.playersSeen],
  ];
  const colW = W / cells.length;
  cells.forEach(([label, val], i) => {
    const x0 = i * colW;
    if (i > 0) {
      ctx.strokeStyle = ink(0.1);
      ctx.beginPath();
      ctx.moveTo(x0 + 0.5, cy + 22);
      ctx.lineTo(x0 + 0.5, cy + COUNTERS_H - 22);
      ctx.stroke();
    }
    const numStr = String(val);
    const numPx = fitFont(ctx, numStr, (p) => cond(p, 800), 44, colW - 14, 22);
    ctx.font = cond(numPx, 800);
    ctx.fillStyle = INK;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(numStr, x0 + colW / 2, cy + 62);
    ctx.font = mono(9, 600);
    ctx.fillStyle = ink(0.48);
    ctx.fillText(label, x0 + colW / 2, cy + 90);
  });
  ctx.textAlign = 'left';

  // ── section label helper ──
  let y = cy + COUNTERS_H + SECTION_GAP;
  const sectionLabel = (text: string, meta?: string) => {
    ctx.font = cond(18, 800);
    ctx.fillStyle = INK;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    const t = text.toUpperCase();
    ctx.fillText(t, PAD, y);
    if (meta) {
      ctx.font = mono(10, 500);
      ctx.fillStyle = ink(0.42);
      ctx.textAlign = 'right';
      ctx.fillText(meta, W - PAD, y + 6);
      ctx.textAlign = 'left';
    }
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(PAD, y + LABEL_H - 8);
    ctx.lineTo(W - PAD, y + LABEL_H - 8);
    ctx.stroke();
    y += LABEL_H;
  };

  // ── ARENAS VISITED (red-accent collection box) ──
  sectionLabel('Arenas Visited');
  ctx.fillStyle = SURFACE;
  ctx.fillRect(PAD, y, W - PAD * 2, ARENA_H);
  ctx.fillStyle = RED;
  ctx.fillRect(PAD, y, 4, ARENA_H);
  ctx.strokeStyle = ink(0.14);
  ctx.lineWidth = 1;
  ctx.strokeRect(PAD + 0.5, y + 0.5, W - PAD * 2 - 1, ARENA_H - 1);

  ctx.font = mono(10, 600);
  ctx.fillStyle = ink(0.48);
  ctx.textBaseline = 'top';
  ctx.fillText('DISTINCT ARENAS · COLLECTION', PAD + 22, y + 16);
  ctx.font = cond(30, 800);
  ctx.fillStyle = INK;
  ctx.fillText(`${data.arenas.visited}`, PAD + 22, y + 34);
  const visW = ctx.measureText(`${data.arenas.visited}`).width;
  ctx.font = cond(20, 700);
  ctx.fillStyle = ink(0.4);
  ctx.fillText(`/ ${data.arenas.total}`, PAD + 22 + visW + 8, y + 42);
  // progress bar (right side)
  const barW = 180;
  const barX = W - PAD - 22 - barW;
  const barY = y + ARENA_H / 2 - 5;
  ctx.fillStyle = ink(0.1);
  ctx.fillRect(barX, barY, barW, 10);
  ctx.fillStyle = RED;
  ctx.fillRect(barX, barY, barW * Math.min(1, data.arenas.visited / data.arenas.total), 10);
  y += ARENA_H + SECTION_GAP;

  // ── RAREST BADGES ──
  if (hasBadges) {
    sectionLabel('Rarest Badges', `${data.badges.length} shown`);
    data.badges.forEach((b, i) => {
      const ry = y + i * (BADGE_ROW_H + 4);
      ctx.fillStyle = SURFACE;
      ctx.fillRect(PAD, ry, W - PAD * 2, BADGE_ROW_H);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(PAD + 0.75, ry + 0.75, W - PAD * 2 - 1.5, BADGE_ROW_H - 1.5);
      // label
      ctx.font = cond(17, 800);
      ctx.fillStyle = INK;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillText(truncate(ctx, b.label.toUpperCase(), W - PAD * 2 - 150), PAD + 16, ry + BADGE_ROW_H / 2);
      // rarity
      ctx.font = mono(12, 500);
      ctx.fillStyle = RED;
      ctx.textAlign = 'right';
      ctx.fillText(b.rarity, W - PAD - 16, ry + BADGE_ROW_H / 2);
    });
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    y += data.badges.length * BADGE_ROW_H + (data.badges.length - 1) * 4 + SECTION_GAP;
  }

  // ── STANDOUT MOMENTS (records) ──
  if (hasRecords) {
    sectionLabel('Standout Moments');
    data.records.forEach((r, i) => {
      const ry = y + i * (RECORD_ROW_H + 4);
      ctx.fillStyle = SURFACE;
      ctx.fillRect(PAD, ry, W - PAD * 2, RECORD_ROW_H);
      ctx.strokeStyle = ink(0.14);
      ctx.lineWidth = 1;
      ctx.strokeRect(PAD + 0.5, ry + 0.5, W - PAD * 2 - 1, RECORD_ROW_H - 1);
      // label (small, top-left)
      ctx.font = mono(10, 600);
      ctx.fillStyle = ink(0.48);
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';
      ctx.fillText(r.label.toUpperCase(), PAD + 16, ry + 12);
      // sub (muted, bottom-left)
      if (r.sub) {
        ctx.font = mono(11, 500);
        ctx.fillStyle = ink(0.56);
        ctx.fillText(truncate(ctx, r.sub, W - PAD * 2 - 180), PAD + 16, ry + 34);
      }
      // value (big, right)
      ctx.font = cond(24, 800);
      ctx.fillStyle = INK;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(r.value, W - PAD - 16, ry + RECORD_ROW_H / 2);
    });
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    y += data.records.length * RECORD_ROW_H + (data.records.length - 1) * 4 + SECTION_GAP;
  }

  // ── FOOTER ──
  const fy = H - FOOTER_H;
  ctx.fillStyle = INK;
  ctx.fillRect(0, fy, W, 2);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.font = cond(17, 800);
  ctx.fillStyle = INK;
  ctx.fillText('HOCKEYGAMEBOT.COM', PAD, fy + FOOTER_H / 2 - (data.boxIncomplete ? 6 : 0));
  const brandW = ctx.measureText('HOCKEYGAMEBOT.COM').width;
  ctx.fillStyle = RED;
  ctx.fillText(' / PUCK PASSPORT', PAD + brandW, fy + FOOTER_H / 2 - (data.boxIncomplete ? 6 : 0));
  ctx.font = mono(10, 500);
  ctx.fillStyle = ink(0.42);
  ctx.textAlign = 'right';
  ctx.fillText('/puck-passport', W - PAD, fy + FOOTER_H / 2 - (data.boxIncomplete ? 6 : 0));
  if (data.boxIncomplete) {
    ctx.textAlign = 'left';
    ctx.font = mono(9, 500);
    ctx.fillStyle = ink(0.4);
    ctx.fillText('* some box scores unavailable — Shots & Players Seen may be incomplete.', PAD, fy + FOOTER_H / 2 + 12);
  }

  return canvas;
}
