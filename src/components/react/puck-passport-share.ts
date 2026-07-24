/**
 * Puck Passport — client-side canvas "share card" (flex card of your attendance).
 *
 * A portrait PNG the user can download / paste on Twitter/Bluesky. It reuses the
 * SAME in-memory data AttendedTracker already computes (counters, arenas, earned
 * badges, single-game records) — NO new network fetch — and the SAME export
 * surface as the player/goalie cards (`window.HGB_Export.showCardModal`).
 *
 * Aesthetic mirrors the HGB stats cards: light/cream (BG #EFEEE8, surface #FFF,
 * ink #0d0d14) with the HGB brand-red accent bar (#E8002D). Every Passport card
 * uses that one brand red — NOT a team colour — for shareable-brand cohesion. Per
 * the site's canvas-card rule this file owns only the drawing; the React island
 * supplies the already-derived data.
 *
 * SCALE + DENSITY — sized to the real portrait skater card (Season / Rating
 * card: W=560, PAD≈24, FOOT_H=36, ROW_H≈36, section dividers not gaps), NOT
 * blown up. The cards are tight and dense; so is this.
 *
 * TYPOGRAPHY — matched to the canonical player/goalie share cards
 * (stats/player/[slug].astro, stats/goalies/[slug].astro):
 *   • Hero name        Barlow Condensed 900, auto-fit (their big-hero '900 nfs'
 *                      loop; here 40px→26 on a 560-wide card).
 *   • Big numbers      Barlow Condensed 800 (their stat values are '800 34/42px'
 *                      at hero scale; here 30px counters / 26px arena / 16px row).
 *                      The badge-NAME and record-VALUE are the same row-hero tier,
 *                      so they share ONE size (HERO_PX) — never one bigger.
 *   • Section titles   Barlow Condensed 800 15px (their portrait '800 24px'
 *                      compact header, scaled to this card).
 *   • Number captions  Barlow 600 9px (their '600 9px "Barlow"' stat label).
 *   • Eyebrows/meta     JetBrains Mono 700 8–9px (their '700 9/10px' eyebrows).
 *   • Readouts          JetBrains Mono, light-ink — the badge-rarity + record
 *                      context strings share ONE mono/light-gray idiom (mirrors
 *                      the on-page .att-badge-rarity / .att-record-sub CSS).
 *   • Footer            compact INK10 band, centred mono/condensed at FOOT_INK,
 *                      dot-joined brand + HOCKEYGAMEBOT.COM. NO handle (there are
 *                      no usernames yet) and NO season (Passport is not seasonal).
 *
 * House rule (FAIL LOUD): the caller passes `boxIncomplete` when some box scores
 * failed to load; the card prints an honest footnote rather than presenting a
 * possibly-short Shots / Players-Seen figure as complete truth.
 */

import { DOMAIN_UPPER, FOOTER_STYLE } from '../../lib/card-footer';
import { normalizePeriod } from './puck-passport-badges';

const BG = '#EFEEE8';
const SURFACE = '#FFFFFF';
const INK = '#0D0D14';
// HGB brand red (--hgb-red in stats-tokens.css / site-tokens.css). Per the
// shareable-brand cohesion decision EVERY Puck Passport card uses this one accent —
// team colours are deliberately NOT used here (see drawPassportCard).
const RED = '#E8002D';
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
  blurb?: string; // one-line criteria description (mono gray sub-line)
}

export interface ShareRecord {
  key?: string; // record key (e.g. 'longest') — drives the longest-game layout
  label: string; // e.g. "Highest Scoring"
  value: string; // e.g. "11 goals"
  sub?: string; // context line (matchup · date)
  /** Longest-game only: total elapsed clock (e.g. "92:56") when the backend
   *  supplies it. Absent today → the hero falls back to "N periods". */
  total_time?: string | null;
}

export interface PassportShareData {
  counters: ShareCounters;
  /** "Home rinks collected" model: homeRinks (distinct current teams seen at home,
   *  the /32 collection meter) + distinctBuildings (every building visited — can
   *  exceed 32, shown as the honest substat). The red pip bar tracks homeRinks/total.
   *  Per the brand-cohesion decision the card bar stays HGB red — NO team colours. */
  arenas: { homeRinks: number; total: number; distinctBuildings: number };
  /** Rarest earned badges, already sorted rarest-first (0–3 shown). */
  badges: ShareBadge[];
  /** Marquee single-game records (0–3 shown). */
  records: ShareRecord[];
  /** True when some box scores failed → Shots / Players Seen may be short. */
  boxIncomplete: boolean;
  /** Count of manually-logged ("unverified") games → an honest footer caveat
   *  (manual games count for Games/Arena/Team record only). 0/undefined ⇒ omit. */
  unverifiedCount?: number;
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
  // Always the HGB brand red — Passport cards never take a team colour (brand
  // cohesion across every shared card). `data.accent` is intentionally ignored.
  const accent = RED;
  const SCALE = 2;
  const W = 560; // matches the portrait skater card (Season / Rating card)
  const PAD = 24;
  const FOOT_INK = FOOTER_STYLE.inkOnLight; // rgba(13,13,20,0.55)
  const cond = (px: number, wt = 800) => `${wt} ${px}px "Barlow Condensed", sans-serif`;
  const body = (px: number, wt = 500) => `${wt} ${px}px "Barlow", sans-serif`;
  const mono = (px: number, wt = 500) => `${wt} ${px}px "JetBrains Mono", monospace`;
  // Shared "row hero" size — the bold Barlow value that headlines a row. The
  // Rarest-Badges NAME and the Standout-Moments VALUE are the SAME tier, so they
  // MUST render at the same size (was 14 vs 20 — the badge name looked demoted).
  const HERO_PX = 16;

  // ── section heights — tight, card-scale (no dead space between sections) ──
  const HEADER_H = 104; // eyebrow + hero name + tagline
  const COUNTERS_H = 74; // 5-up big-number band
  const SECTION_GAP = 14; // vertical rhythm between sections
  const LABEL_H = 24; // section title + underline
  const ARENA_H = 90; // frac row + 32-pip collection meter + "to go" caption + total-buildings substat
  const BADGE_ROW_H = 44; // name (hero) + blurb sub-line — matches the record row
  const RECORD_ROW_H = 44;
  const ROW_GAP = 3;
  // Honest footer caveats (0–2): incomplete box scores and/or manually-logged
  // games. Each adds one mono line below the brand line; canonical FOOT_H = 36.
  const footCaveats: string[] = [];
  if (data.boxIncomplete)
    footCaveats.push('Shots & Players Seen may be incomplete — some box scores unavailable.');
  if (data.unverifiedCount && data.unverifiedCount > 0)
    footCaveats.push(
      `${data.unverifiedCount} game${data.unverifiedCount === 1 ? '' : 's'} added manually — Games/Arenas/record only.`,
    );
  const FOOTER_H = footCaveats.length > 0 ? 30 + footCaveats.length * 12 : 36;

  const hasBadges = data.badges.length > 0;
  const hasRecords = data.records.length > 0;

  let bodyH = HEADER_H + COUNTERS_H + SECTION_GAP + LABEL_H + ARENA_H;
  if (hasBadges)
    bodyH += SECTION_GAP + LABEL_H + data.badges.length * BADGE_ROW_H + (data.badges.length - 1) * ROW_GAP;
  if (hasRecords)
    bodyH += SECTION_GAP + LABEL_H + data.records.length * RECORD_ROW_H + (data.records.length - 1) * ROW_GAP;
  bodyH += SECTION_GAP;
  const H = bodyH + FOOTER_H;

  const canvas = document.createElement('canvas');
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(SCALE, SCALE);

  // ── background: flat cream, exactly like the real skater/goalie cards
  // (BG #EFEEE8, no grid/checker) ──
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);

  // ── HEADER (white band + accent bar) ──
  ctx.fillStyle = SURFACE;
  ctx.fillRect(0, 0, W, HEADER_H);
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, 5, HEADER_H);
  ctx.fillStyle = INK;
  ctx.fillRect(0, HEADER_H - 1.5, W, 1.5);

  // eyebrow — mono 700, canonical eyebrow treatment
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.font = mono(9, 700);
  ctx.fillStyle = RED;
  ctx.fillText('PERSONAL TRACKER · HOCKEYGAMEBOT', PAD, 24);

  // hero name — Barlow Condensed 900, auto-fit (their '900 nfs' loop, card-scaled)
  const headline = 'MY PUCK PASSPORT';
  const hPx = fitFont(ctx, headline, (p) => cond(p, 900), 36, W - PAD * 2, 26);
  ctx.font = cond(hPx, 900);
  ctx.fillStyle = INK;
  ctx.textBaseline = 'top';
  ctx.fillText(headline, PAD, 32);

  // tagline — Barlow 600, the cards' plain-Barlow label weight (no handle: there
  // are no usernames yet)
  ctx.font = body(12, 600);
  ctx.fillStyle = ink(0.56);
  ctx.fillText(truncate(ctx, 'Every game I’ve been to, in person.', W - PAD * 2), PAD, 34 + hPx + 6);

  // ── COUNTERS (full-bleed 5-up on white) ──
  const cy = HEADER_H;
  ctx.fillStyle = SURFACE;
  ctx.fillRect(0, cy, W, COUNTERS_H);
  ctx.fillStyle = INK;
  ctx.fillRect(0, cy + COUNTERS_H - 1.5, W, 1.5);

  const cells: Array<[string, number]> = [
    ['GAMES', data.counters.games],
    ['PERIODS', data.counters.periods],
    ['GOALS', data.counters.goals],
    ['SHOTS', data.counters.shots],
    ['PLAYERS', data.counters.playersSeen],
  ];
  const colW = W / cells.length;
  cells.forEach(([label, val], i) => {
    const x0 = i * colW;
    if (i > 0) {
      ctx.strokeStyle = ink(0.1);
      ctx.beginPath();
      ctx.moveTo(x0 + 0.5, cy + 14);
      ctx.lineTo(x0 + 0.5, cy + COUNTERS_H - 14);
      ctx.stroke();
    }
    const numStr = String(val);
    // Big number = Barlow Condensed 800 30px (card-scale stat value, was 44px).
    const numPx = fitFont(ctx, numStr, (p) => cond(p, 800), 30, colW - 12, 18);
    ctx.font = cond(numPx, 800);
    ctx.fillStyle = INK;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(numStr, x0 + colW / 2, cy + 42);
    // caption = Barlow 600 9px stat label
    ctx.font = body(9, 600);
    ctx.fillStyle = ink(0.48);
    ctx.textBaseline = 'top';
    ctx.fillText(label, x0 + colW / 2, cy + 52);
  });
  ctx.textAlign = 'left';

  // ── section title helper — compact Barlow Condensed 800 15px + hairline ──
  let y = cy + COUNTERS_H + SECTION_GAP;
  const sectionLabel = (text: string, meta?: string) => {
    ctx.font = cond(15, 800);
    ctx.fillStyle = INK;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillText(text.toUpperCase(), PAD, y);
    if (meta) {
      ctx.font = mono(8, 700);
      ctx.fillStyle = ink(0.42);
      ctx.textAlign = 'right';
      ctx.fillText(meta.toUpperCase(), W - PAD, y + 4);
      ctx.textAlign = 'left';
    }
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.moveTo(PAD, y + LABEL_H - 6);
    ctx.lineTo(W - PAD, y + LABEL_H - 6);
    ctx.stroke();
    y += LABEL_H;
  };

  // ── HOME RINKS — collection meter: a big home_rinks/32 fraction, a row of 32
  // pips (first `homeRinks` filled with the brand red — NO team colours on the
  // card), a "N to go — collect all 32" caption, and an honest mono substat with
  // the total buildings visited (which can exceed 32). A segmented pip meter reads
  // as a *collection* far better than a single continuous progress bar. ──
  sectionLabel('Home Rinks');
  const aPad = 14;
  ctx.fillStyle = SURFACE;
  ctx.fillRect(PAD, y, W - PAD * 2, ARENA_H);
  ctx.strokeStyle = ink(0.14);
  ctx.lineWidth = 1;
  ctx.strokeRect(PAD + 0.5, y + 0.5, W - PAD * 2 - 1, ARENA_H - 1);

  const total = Math.max(1, data.arenas.total);
  const homeRinks = Math.max(0, Math.min(total, data.arenas.homeRinks));
  // top row: fraction (left) + eyebrow (right)
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.font = cond(26, 800);
  ctx.fillStyle = INK;
  ctx.fillText(`${homeRinks}`, PAD + aPad, y + 30);
  const visW = ctx.measureText(`${homeRinks}`).width;
  ctx.font = cond(15, 700);
  ctx.fillStyle = ink(0.32);
  ctx.fillText(`/ ${total}`, PAD + aPad + visW + 5, y + 30);
  ctx.font = mono(8, 700);
  ctx.fillStyle = ink(0.42);
  ctx.textAlign = 'right';
  ctx.fillText('HOME RINKS COLLECTED', W - PAD - aPad, y + 22);
  ctx.textAlign = 'left';

  // pip meter: `total` segments, first `homeRinks` filled with the accent (red)
  const pipGap = 3;
  const pipsX = PAD + aPad;
  const pipsW = W - PAD * 2 - aPad * 2;
  const pipH = 8;
  const pipY = y + 40;
  const pipW = (pipsW - pipGap * (total - 1)) / total;
  for (let p = 0; p < total; p++) {
    ctx.fillStyle = p < homeRinks ? accent : ink(0.1);
    rrect(ctx, pipsX + p * (pipW + pipGap), pipY, pipW, pipH, 2);
    ctx.fill();
  }
  // caption — chase copy
  ctx.font = mono(9, 500);
  ctx.fillStyle = ink(0.48);
  ctx.textBaseline = 'top';
  const toGo = total - homeRinks;
  const cap = toGo > 0 ? `${toGo} to go — collect all ${total}` : `all ${total} collected`;
  ctx.fillText(truncate(ctx, cap, pipsW), pipsX, pipY + pipH + 6);
  // honest substat — total distinct buildings visited (can exceed the /32 meter)
  ctx.font = mono(9, 500);
  ctx.fillStyle = ink(0.36);
  ctx.fillText(
    truncate(ctx, `${data.arenas.distinctBuildings} total arenas visited`, pipsW),
    pipsX,
    pipY + pipH + 6 + 13,
  );
  y += ARENA_H + SECTION_GAP;

  // ── RAREST BADGES ──
  if (hasBadges) {
    sectionLabel('Rarest Badges', `${data.badges.length} shown`);
    data.badges.forEach((b, i) => {
      const ry = y + i * (BADGE_ROW_H + ROW_GAP);
      ctx.fillStyle = SURFACE;
      ctx.fillRect(PAD, ry, W - PAD * 2, BADGE_ROW_H);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.25;
      ctx.strokeRect(PAD + 0.625, ry + 0.625, W - PAD * 2 - 1.25, BADGE_ROW_H - 1.25);
      // name (row hero) — Barlow Condensed 800 at the shared HERO_PX, level with
      // the Standout Moments value (same tier ⇒ same size). Top-aligned so the
      // mono blurb can sit beneath it.
      ctx.font = cond(HERO_PX, 800);
      ctx.fillStyle = INK;
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';
      ctx.fillText(truncate(ctx, b.label.toUpperCase(), W - PAD * 2 - 130), PAD + 12, ry + 8);
      // blurb — mono light-gray criteria sub-line (matches the record sub idiom)
      if (b.blurb) {
        ctx.font = mono(9, 500);
        ctx.fillStyle = ink(0.5);
        ctx.fillText(truncate(ctx, b.blurb, W - PAD * 2 - 130), PAD + 12, ry + 27);
      }
      // rarity — mono readout in light ink (matches .att-badge-rarity + the
      // record context line: ONE mono/light-gray idiom across both sections)
      ctx.font = mono(10, 700);
      ctx.fillStyle = ink(0.48);
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'right';
      ctx.fillText(b.rarity, W - PAD - 12, ry + BADGE_ROW_H / 2);
    });
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    y += data.badges.length * BADGE_ROW_H + (data.badges.length - 1) * ROW_GAP + SECTION_GAP;
  }

  // ── STANDOUT MOMENTS (records) ──
  if (hasRecords) {
    sectionLabel('Standout Moments');
    data.records.forEach((r, i) => {
      const ry = y + i * (RECORD_ROW_H + ROW_GAP);
      ctx.fillStyle = SURFACE;
      ctx.fillRect(PAD, ry, W - PAD * 2, RECORD_ROW_H);
      ctx.strokeStyle = ink(0.14);
      ctx.lineWidth = 1;
      ctx.strokeRect(PAD + 0.5, ry + 0.5, W - PAD * 2 - 1, RECORD_ROW_H - 1);
      // label — mono light-gray eyebrow (matches .att-record-label + the badge
      // rarity idiom so both sections read identically)
      ctx.font = mono(9, 700);
      ctx.fillStyle = ink(0.48);
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';
      ctx.fillText(r.label.toUpperCase(), PAD + 12, ry + 9);
      // sub — mono data string (matchup · date)
      if (r.sub) {
        ctx.font = mono(9, 500);
        ctx.fillStyle = ink(0.56);
        ctx.fillText(truncate(ctx, r.sub, W - PAD * 2 - 140), PAD + 12, ry + 25);
      }

      // Hero (value) — Barlow Condensed 800 at HERO_PX, right-aligned. Level with
      // the Rarest-Badges name (same tier). The LONGEST-GAME row is data-driven:
      // a bold condensed "2OT" reads as "20T" (O looks like 0), so the OT label
      // becomes a MONO readout and the bold hero is a clean value instead.
      let heroText = r.value;
      let heroReadout: string | undefined;
      if (r.key === 'longest') {
        // Derive periods + OT label from the record's own OT tag (computeRecords
        // formats value as "N periods (2OT)"); normalizePeriod owns the parsing —
        // periods = 3 + otCount — so multi-OT is never miscounted or duplicated.
        const paren = r.value.match(/\(([^)]+)\)/);
        const np = normalizePeriod(paren ? paren[1] : null);
        const periods = 3 + np.otCount;
        if (r.total_time) {
          // Backend supplied a clock (e.g. "92:56") → that is the bold hero, with
          // the periods + OT label as the mono readout beneath it.
          heroText = r.total_time;
          heroReadout = `${periods} periods · ${np.label}`;
        } else {
          // No clock today → lowercase "N periods" hero (matches the "11 goals"
          // idiom), with the OT label (if any) as the mono readout.
          heroText = `${periods} periods`;
          heroReadout = np.code === 'REG' ? undefined : np.label;
        }
      }
      if (heroReadout) {
        // Stack hero + readout on the right (hero up, readout below).
        ctx.font = cond(HERO_PX, 800);
        ctx.fillStyle = INK;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(heroText, W - PAD - 12, ry + RECORD_ROW_H / 2);
        ctx.font = mono(9, 500);
        ctx.fillStyle = ink(0.5);
        ctx.textBaseline = 'top';
        ctx.fillText(heroReadout, W - PAD - 12, ry + RECORD_ROW_H / 2 + 4);
        ctx.textAlign = 'left';
      } else {
        ctx.font = cond(HERO_PX, 800);
        ctx.fillStyle = INK;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(heroText, W - PAD - 12, ry + RECORD_ROW_H / 2);
      }
    });
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    y += data.records.length * RECORD_ROW_H + (data.records.length - 1) * ROW_GAP + SECTION_GAP;
  }

  // ── FOOTER — compact INK10 band, centred dot-joined segments: just the brand +
  // domain. No handle (no usernames yet) and no season (Passport is not seasonal
  // data). The box-incomplete caveat is the only conditional line. ──
  const fy = H - FOOTER_H;
  ctx.fillStyle = ink(0.08);
  ctx.fillRect(0, fy, W, FOOTER_H);
  const footLine = ['Puck Passport', DOMAIN_UPPER].join(' · ');
  const footMidY = footCaveats.length > 0 ? fy + 15 : fy + FOOTER_H / 2;
  ctx.font = mono(9, 700);
  ctx.fillStyle = FOOT_INK;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(truncate(ctx, footLine, W - PAD * 2), W / 2, footMidY);
  ctx.font = mono(8, 500);
  ctx.fillStyle = ink(0.4);
  footCaveats.forEach((line, i) => {
    ctx.fillText(truncate(ctx, line, W - PAD * 2), W / 2, fy + 30 + i * 12);
  });

  return canvas;
}
