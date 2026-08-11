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
 * TYPOGRAPHY — the Passport SEMANTIC ROLE system (Beta 2B), now applied to the
 * canvas artifacts too. Mirrors the --pp-* role tokens in puck-passport.css:
 *   • Newsreader        RARE / keepsake identity ONLY. Exactly ONE use per
 *                       artifact: the "MY PUCK PASSPORT" headline here, the
 *                       "PUCK PASSPORT" wordmark on the ticket stub. Never on
 *                       team names, scores, section titles or badges.
 *   • Instrument Sans   the readability workhorse: section titles, counters and
 *                       every bare number/record value, badge + tier names and
 *                       their descriptive copy, holder handle, arena copy.
 *   • JetBrains Mono    RESTRAINED stamp/metadata semantics only: the eyebrow,
 *                       the "ARENAS COLLECTED" stamp, the record context line
 *                       (matchup · date), and the footer signature. Mono must
 *                       NOT creep onto section titles or descriptive copy.
 * NUMERALS — NOT tabular, deliberately and honestly. Canvas 2D exposes no
 * `font-variant-numeric`/`tnum` hook (only fontKerning / fontVariantCaps /
 * fontStretch), so a feature flag cannot be requested through ctx.font at all,
 * and @fontsource's Instrument Sans ships PROPORTIONAL figures by default
 * (measured: at 700 28px the per-digit advance ranges 10.8px–19.4px, so the
 * digits are not fixed-advance). Every number on these two artifacts is a short
 * standalone value — a score, a counter, an "N / M" progress string — never a
 * stacked column that would need optical alignment, so proportional figures are
 * correct here. Do NOT claim tabular alignment for this file; making it true
 * would need a pre-subsetted tnum font variant (real work, not a flag).
 * Sizes are unchanged in intent but re-tuned where Instrument Sans's wider
 * advance would have overflowed the Barlow-Condensed-era box.
 *
 * House rule (FAIL LOUD): the caller passes `boxIncomplete` when some box scores
 * failed to load; the card prints an honest footnote rather than presenting a
 * possibly-short Shots / Players-Seen figure as complete truth.
 */

import { DOMAIN_UPPER, FOOTER_STYLE } from '../../lib/card-footer';
import { normalizePeriod } from './puck-passport-badges';
import { pickTeamColor } from '../../lib/team-colors';
import { nhlGameType } from '../../lib/nhl-game-type';
import qrcode from 'qrcode-generator';

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

/** One tiered milestone badge row (Games/Goals/Shots/Players/Arenas). Mirrors the
 *  dashboard's .att-tier chip: label + current rung (or "Locked"), and a progress
 *  line. Always 5 rows — pure client-side bucketing of the same counters the
 *  counters band above already draws (see puck-passport-badges.ts ownership note). */
export interface ShareTierBadge {
  label: string; // e.g. 'Goals'
  rungName: string; // current rung name, or the Rung-I chase name when locked
  earned: boolean;
  progress: string; // e.g. "312 / 600 to Legend" or "1,500 goals" (maxed)
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
  /** The 5 tiered milestone badges (Games/Goals/Shots/Players/Arenas), always
   *  present — the card shows the wall as a chase even before any rung is earned. */
  tiers: ShareTierBadge[];
  /** Rarest earned badges, already sorted rarest-first (0–3 shown). */
  badges: ShareBadge[];
  /** Marquee single-game records (0–3 shown). */
  records: ShareRecord[];
  /** True when some box scores failed → Shots / Players Seen may be short. */
  boxIncomplete: boolean;
  /** Count of manually-logged ("unverified") games → an honest footer caveat
   *  (manual games count for Games/Arena/Team record only). 0/undefined ⇒ omit. */
  unverifiedCount?: number;
  /** Public @handle, shown top-right so a shared card is attributable. ONLY pass it
   *  when the passport is public (a private handle's URL wouldn't resolve). Omit ⇒ no handle. */
  handle?: string | null;
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
  // Role fonts (see the file header). `hist` is the keepsake face and is used
  // EXACTLY ONCE (the headline); `ui` is the workhorse; `mono` is stamp-only.
  const hist = (px: number, wt = 700) => `${wt} ${px}px "Newsreader", Georgia, serif`;
  const ui = (px: number, wt = 600) => `${wt} ${px}px "Instrument Sans", sans-serif`;
  const mono = (px: number, wt = 500) => `${wt} ${px}px "JetBrains Mono", monospace`;
  // Shared "row hero" size — the bold Instrument Sans value that headlines a row. The
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
  const TIER_ROW_H = 40; // label + rung/progress — taller so the bottom text has the same breathing room as the badge rows (was 34, cramped)
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
  const hasTiers = data.tiers.length > 0;

  let bodyH = HEADER_H + COUNTERS_H + SECTION_GAP + LABEL_H + ARENA_H;
  if (hasTiers)
    bodyH += SECTION_GAP + LABEL_H + data.tiers.length * TIER_ROW_H + (data.tiers.length - 1) * ROW_GAP;
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

  // Public @handle — right-aligned on the eyebrow row so a shared card is
  // attributable + points to the owner's public passport. Only present when public.
  if (data.handle) {
    // handle = identity copy → Instrument Sans (NOT the mono eyebrow face).
    ctx.font = ui(9, 700);
    ctx.textAlign = 'right';
    ctx.fillStyle = ink(0.56);
    ctx.fillText('@' + data.handle.toUpperCase(), W - PAD, 24);
    ctx.textAlign = 'left';
  }

  // hero name — Newsreader 700, auto-fit. THE keepsake moment on this artifact:
  // the ONLY Newsreader use on the card (see the role note in the file header).
  const headline = 'MY PUCK PASSPORT';
  const hPx = fitFont(ctx, headline, (p) => hist(p, 700), 36, W - PAD * 2, 24);
  ctx.font = hist(hPx, 700);
  ctx.fillStyle = INK;
  ctx.textBaseline = 'top';
  ctx.fillText(headline, PAD, 32);

  // tagline — Instrument Sans, descriptive copy
  ctx.font = ui(12, 500);
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
    // Big number = Instrument Sans 700 (structured numeric read). Wider advance
    // than the old condensed face, so the fit floor drops 18→14 to keep a
    // comma'd 5-figure count ("1,234") whole inside its column.
    const numPx = fitFont(ctx, numStr, (p) => ui(p, 700), 28, colW - 12, 14);
    ctx.font = ui(numPx, 700);
    ctx.fillStyle = INK;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(numStr, x0 + colW / 2, cy + 42);
    // caption = Instrument Sans 600 9px stat label
    ctx.font = ui(9, 600);
    ctx.fillStyle = ink(0.48);
    ctx.textBaseline = 'top';
    ctx.fillText(label, x0 + colW / 2, cy + 52);
  });
  ctx.textAlign = 'left';

  // ── section title helper — Instrument Sans 700 14px + hairline. Section
  //    titles are NEVER mono and never the keepsake face. ──
  let y = cy + COUNTERS_H + SECTION_GAP;
  const sectionLabel = (text: string, meta?: string) => {
    ctx.font = ui(14, 700);
    ctx.fillStyle = INK;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillText(text.toUpperCase(), PAD, y);
    if (meta) {
      // meta carries a progress count ("3/5 EARNED") → numeric workhorse.
      ctx.font = ui(8.5, 600);
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
  sectionLabel('NHL Home Arenas');
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
  ctx.font = ui(26, 700);
  ctx.fillStyle = INK;
  ctx.fillText(`${homeRinks}`, PAD + aPad, y + 30);
  const visW = ctx.measureText(`${homeRinks}`).width;
  ctx.font = ui(15, 600);
  ctx.fillStyle = ink(0.32);
  ctx.fillText(`/ ${total}`, PAD + aPad + visW + 5, y + 30);
  ctx.font = mono(8, 700);
  ctx.fillStyle = ink(0.42);
  ctx.textAlign = 'right';
  ctx.fillText('ARENAS COLLECTED', W - PAD - aPad, y + 22);
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
  // caption — chase copy (descriptive + numeric ⇒ Instrument Sans, not mono)
  ctx.font = ui(9.5, 500);
  ctx.fillStyle = ink(0.48);
  ctx.textBaseline = 'top';
  const cap = `${homeRinks} of ${total} collected`;
  ctx.fillText(truncate(ctx, cap, pipsW), pipsX, pipY + pipH + 6);
  // honest substat — total distinct buildings visited (can exceed the /32 meter)
  ctx.font = ui(9.5, 500);
  ctx.fillStyle = ink(0.36);
  ctx.fillText(
    truncate(ctx, `${data.arenas.distinctBuildings} total arenas visited`, pipsW),
    pipsX,
    pipY + pipH + 6 + 13,
  );
  y += ARENA_H + SECTION_GAP;

  // ── MILESTONE TIERS — one row per stat, highest earned rung + progress ──
  if (hasTiers) {
    sectionLabel('Milestone Tiers', `${data.tiers.filter((t) => t.earned).length}/${data.tiers.length} earned`);
    data.tiers.forEach((t, i) => {
      const ry = y + i * (TIER_ROW_H + ROW_GAP);
      ctx.fillStyle = SURFACE;
      ctx.fillRect(PAD, ry, W - PAD * 2, TIER_ROW_H);
      ctx.strokeStyle = t.earned ? INK : ink(0.14);
      ctx.lineWidth = t.earned ? 1.25 : 1;
      if (!t.earned) ctx.setLineDash([3, 2]);
      ctx.strokeRect(PAD + 0.625, ry + 0.625, W - PAD * 2 - 1.25, TIER_ROW_H - 1.25);
      ctx.setLineDash([]);
      // label (hero) — Instrument Sans 700, matches the badge/record hero tier.
      ctx.font = ui(HERO_PX, 700);
      ctx.fillStyle = t.earned ? INK : ink(0.56);
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';
      ctx.fillText(truncate(ctx, t.label.toUpperCase(), W - PAD * 2 - 190), PAD + 12, ry + 8);
      // rung name — descriptive tier name ⇒ Instrument Sans (was mono)
      ctx.font = ui(9.5, 600);
      ctx.fillStyle = t.earned ? ink(0.56) : ink(0.36);
      ctx.fillText(truncate(ctx, t.rungName.toUpperCase(), W - PAD * 2 - 190), PAD + 12, ry + 24);
      // progress readout — right-aligned; "312 / 600 to Legend" is a NUMBER read
      ctx.font = ui(10, 500);
      ctx.fillStyle = ink(0.5);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(truncate(ctx, t.progress, 170), W - PAD - 12, ry + TIER_ROW_H / 2);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
    });
    y += data.tiers.length * TIER_ROW_H + (data.tiers.length - 1) * ROW_GAP + SECTION_GAP;
  }

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
      // name (row hero) — Instrument Sans 700 at the shared HERO_PX, level with
      // the Standout Moments value (same tier ⇒ same size). Top-aligned so the
      // criteria blurb can sit beneath it.
      ctx.font = ui(HERO_PX, 700);
      ctx.fillStyle = INK;
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';
      ctx.fillText(truncate(ctx, b.label.toUpperCase(), W - PAD * 2 - 130), PAD + 12, ry + 8);
      // blurb — light-gray criteria sub-line. Descriptive copy ⇒ Instrument Sans.
      if (b.blurb) {
        ctx.font = ui(9.5, 500);
        ctx.fillStyle = ink(0.5);
        ctx.fillText(truncate(ctx, b.blurb, W - PAD * 2 - 130), PAD + 12, ry + 27);
      }
      // rarity — a numeric readout ("1 in 8 games") ⇒ Instrument Sans, not mono
      ctx.font = ui(10, 600);
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
      // label — descriptive record name ("HIGHEST SCORING") ⇒ Instrument Sans
      ctx.font = ui(9.5, 600);
      ctx.fillStyle = ink(0.48);
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';
      ctx.fillText(r.label.toUpperCase(), PAD + 12, ry + 9);
      // sub — matchup · DATE. Date-like metadata is the one mono slot in this row.
      if (r.sub) {
        ctx.font = mono(9, 500);
        ctx.fillStyle = ink(0.56);
        ctx.fillText(truncate(ctx, r.sub, W - PAD * 2 - 140), PAD + 12, ry + 25);
      }

      // Hero (value) — Instrument Sans 700 at HERO_PX, right-aligned. Level with
      // the Rarest-Badges name (same tier). The LONGEST-GAME row is data-driven:
      // a bold "2OT" jammed into the hero reads badly, so the OT label becomes a
      // lighter readout beneath and the bold hero is a clean value instead.
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
        ctx.font = ui(HERO_PX, 700);
        ctx.fillStyle = INK;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(heroText, W - PAD - 12, ry + RECORD_ROW_H / 2);
        ctx.font = ui(9, 500);
        ctx.fillStyle = ink(0.5);
        ctx.textBaseline = 'top';
        ctx.fillText(heroReadout, W - PAD - 12, ry + RECORD_ROW_H / 2 + 4);
        ctx.textAlign = 'left';
      } else {
        ctx.font = ui(HERO_PX, 700);
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
  // caveats are prose, not a signature ⇒ Instrument Sans (the brand line above
  // stays mono: it IS the footer signature).
  ctx.font = ui(8.5, 500);
  ctx.fillStyle = ink(0.4);
  footCaveats.forEach((line, i) => {
    ctx.fillText(truncate(ctx, line, W - PAD * 2), W / 2, fy + 30 + i * 12);
  });

  return canvas;
}

// ═══════════════════════════════════════════════════════════════════════════
//  TICKET STUB  —  drawTicketStub()
//  A shareable, downloadable ticket-stub graphic for a SINGLE attended game.
//  Nostalgic boarding-pass / ticket-stub FORM (perforation, "ADMIT ONE",
//  serial, scannable code) in HGB's clean cream+ink system, on a team-colour
//  9:16 story background. Design LOCKED — this is a faithful canvas port of the
//  v8 mockup (360×640 → exported at 1080×1920, 3× scale).
//
//  Spec + mockup:
//    hgb-docs/docs/plans/puck-passport-ticket-stub-2026-07.md
//    (mockup: ticket-stub-mockup.html "pass v8, game-first, 9:16")
//
//  DIFFERENCES FROM THE MOCKUP (data-driven, flagged honestly):
//   • The mockup's "Puck Drop · 7:30 PM ET" cell has NO backing data (AttendedGame
//     carries only a date, no faceoff time). Rather than fabricate a time, that
//     cell is dropped: the details grid holds Date + Game-Type + Arena, and the
//     season shows once in the header ("NHL · <season>"). Fail-loud, not fake.
//   • Per-team CONTRAST treatments (spec §5.4): white text on a team-colour fill
//     is illegible for pale/yellow teams (NSH, VGK, BOS, NSH gold…). Fills pick a
//     readable ink (dark vs white) by luminance; team accents on cream are darkened
//     when too light; the story gradient's top stop is darkened for pale teams so
//     the white masthead stays legible. See readableInk / accentOnCream / storyTop.
// ═══════════════════════════════════════════════════════════════════════════

/** Minimal per-game shape the stub needs (subset of AttendedGame). */
export interface TicketStubTeam {
  abbrev: string;
  name: string;
  short_name?: string | null;
  score: number;
}
export interface TicketStubGame {
  game_id: string;
  date: string; // YYYY-MM-DD (hockey date)
  home: TicketStubTeam;
  away: TicketStubTeam;
  venue: string | null;
  last_period_type: string | null; // REG | OT | SO | 2OT …
  status: string;
  is_manual?: boolean;
  home_score?: number | null;
  away_score?: number | null;
}
/** Resolved rooting anchor (from the passport summary), used for the team colour. */
export interface TicketStubAnchor {
  team_id: number;
  abbrev: string;
  source: 'explicit' | 'inferred' | 'none';
}
export interface TicketStubOpts {
  game: TicketStubGame;
  /** Rooting anchor → team colour when it's one of the two teams; else home. */
  anchor?: TicketStubAnchor | null;
  /** Public @handle (no leading @). Drives the code URL + the holder line. */
  handle?: string | null;
  /** Badge display labels earned that game (owner-only; empty for public/others). */
  badges?: string[];
  /** This game's chronological ordinal in the collection ("37TH GAME"). */
  gameOrdinal?: number | null;
  /** This venue's ordinal among distinct arenas ("6TH ARENA ATTENDED"). */
  arenaOrdinal?: number | null;
  /** Code style — QR (default, phone-scannable) or the PDF417 decorative stub. */
  codeStyle?: 'qr' | 'qr-plain' | 'qr-boxnoise' | 'pdf417';
  /** Crest image URL (default the committed gold crest). Overridable for tests. */
  crestUrl?: string;
  /** Team-logo URL resolver (default `/logos/<ABBREV>_light.svg`). Overridable for
   *  tests / non-browser harnesses that must feed data URIs. */
  logoUrlFor?: (abbrev: string) => string;
}

// ── colour helpers (per-team contrast) ───────────────────────────────────────
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}
/** Perceptual relative luminance (sRGB, 0–1). */
function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
/** Mix two hex colours (t=0 → a, t=1 → b). */
function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return rgbToHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t);
}
const darken = (hex: string, t: number) => mix(hex, '#000000', t);
/** WCAG contrast ratio between two colours (1–21). */
function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}
/** Readable text colour to sit ON a team-colour fill: whichever of white / dark
 *  ink has the higher contrast against the fill. A fixed luminance threshold
 *  mis-picks white on mid-tones (silver #A2AAAD), so choose by actual contrast. */
function readableInk(bg: string): string {
  return contrastRatio('#ffffff', bg) >= contrastRatio('#14140f', bg) ? '#ffffff' : '#14140f';
}
/** A team accent usable as TEXT on the cream cardstock — darkened when too light
 *  (yellow/gold teams) so it stays legible against #fbf9f3. */
function accentOnCream(hex: string): string {
  let c = hex;
  // Keep darkening toward black until it's dark enough to read on cream.
  while (luminance(c) > 0.3) c = darken(c, 0.25);
  return c;
}

// ── string / format helpers ──────────────────────────────────────────────────
function ordinal(n: number): string {
  const s = ['TH', 'ST', 'ND', 'RD'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}
/** Season token "2022-23" from an NHL game_id's leading year. Null when non-numeric. */
function seasonFromGameId(gameId: string): string | null {
  const y = parseInt(gameId.slice(0, 4), 10);
  if (!Number.isFinite(y) || y < 1917 || y > 2100) return null;
  return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
}
/** Deterministic serial "PP-<base36(game_id)>". Falls back for manual ids. */
function stubSerial(gameId: string): string {
  const n = Number(gameId);
  if (Number.isFinite(n) && n > 0) return `PP-${n.toString(36).toUpperCase()}`;
  return `PP-${gameId.replace(/[^a-z0-9]/gi, '').slice(-6).toUpperCase() || 'MANUAL'}`;
}
/** Split a full team name into { city, nick } using short_name when present. */
function splitTeamName(name: string, shortName?: string | null): { city: string; nick: string } {
  const nick = shortName && shortName.trim() ? shortName.trim() : name.slice(name.lastIndexOf(' ') + 1);
  let city = name;
  if (name.toLowerCase().endsWith(nick.toLowerCase())) city = name.slice(0, name.length - nick.length).trim();
  else if (name.includes(' ')) city = name.slice(0, name.lastIndexOf(' ')).trim();
  return { city: city || name, nick };
}
/** "Wed · May 3, 2023" from a YYYY-MM-DD hockey date (parsed as local, no TZ shift). */
function formatStubDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
  const mo = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()];
  return `${wd} · ${mo} ${d.getDate()}, ${d.getFullYear()}`;
}
/** Adaptive 4th detail cell (spec §3): playoff round · game, else the game type.
 *  The type taxonomy lives in ONE place (nhl-game-type.ts) so a future code is a
 *  single-line change and never silently renders as "Regular Season". */
function adaptiveDetail(gameId: string): { label: string; value: string } {
  const t = nhlGameType(gameId);
  // Playoffs get the richer round·game treatment when the id encodes it.
  if (t.kind === 'playoff') {
    const last4 = gameId.slice(6);
    const round = last4[1];
    const game = last4[3];
    if (round && game) return { label: 'Round', value: `Playoffs R${round} · G${game}` };
    return { label: 'Round', value: 'Playoffs' };
  }
  return { label: 'Game Type', value: t.label };
}

/** Load an image and resolve once decoded. Rejects loud on error (no silent blank). */
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // crossOrigin lets a same-origin canvas stay untainted; harmless for local assets.
    try {
      (img as any).crossOrigin = 'anonymous';
    } catch {
      /* some Image implementations lack a settable crossOrigin — ignore */
    }
    // Bounded wait: a stalled crest request would otherwise hang drawTicketStub
    // forever (it awaits this before drawing). On timeout, clear handlers + reject
    // so the caller's catch draws the disc sans emblem.
    const timer = setTimeout(() => {
      img.onload = img.onerror = null;
      reject(new Error(`[TicketStub] image load timed out (7s): ${url}`));
    }, 7000);
    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      reject(new Error(`[TicketStub] image failed to load: ${url}`));
    };
    img.src = url;
  });
}

/** Does this team logo read on the cream scoreboard? Renders the logo offscreen,
 *  composites each opaque pixel over cream (#faf7f0), and measures the fraction
 *  that clears a modest WCAG contrast (≥1.6) against the cream. Near-white logos
 *  (few visible pixels) return false → the caller backs them with a colour tile so
 *  they never vanish. Measurement failure fails SAFE-VISIBLE (assume it reads). */
function logoReadsOnCream(img: HTMLImageElement): boolean {
  try {
    const S = 48;
    const off = document.createElement('canvas');
    off.width = S;
    off.height = S;
    const octx = off.getContext('2d');
    if (!octx) return true;
    const iw = (img as any).width || (img as any).naturalWidth || S;
    const ih = (img as any).height || (img as any).naturalHeight || S;
    const scale = Math.min(S / iw, S / ih);
    const w = iw * scale;
    const h = ih * scale;
    octx.drawImage(img, (S - w) / 2, (S - h) / 2, w, h);
    const d = octx.getImageData(0, 0, S, S).data;
    let opaque = 0;
    let visible = 0;
    for (let i = 0; i < d.length; i += 4) {
      const a = d[i + 3] / 255;
      if (a < 0.35) continue;
      opaque++;
      const r = d[i] * a + 0xfa * (1 - a);
      const g = d[i + 1] * a + 0xf7 * (1 - a);
      const b = d[i + 2] * a + 0xf0 * (1 - a);
      if (contrastRatio(rgbToHex(r, g, b), '#faf7f0') >= 1.6) visible++;
    }
    return opaque === 0 ? false : visible / opaque >= 0.55;
  } catch {
    return true;
  }
}

/**
 * Render the ticket-stub share graphic for one attended game.
 * Returns a 1080×1920 (true 9:16) canvas ready for window.HGB_Export.showCardModal.
 *
 * Async because it must fully load the gold crest BEFORE drawing (showCardModal
 * snapshots the canvas synchronously — a not-yet-loaded crest would render blank).
 */
export async function drawTicketStub(opts: TicketStubOpts): Promise<HTMLCanvasElement> {
  const { game, anchor, handle, badges = [], gameOrdinal, arenaOrdinal } = opts;
  const codeStyle = opts.codeStyle ?? 'qr';
  const crestUrl = opts.crestUrl ?? '/puck-passport/crest-gold.png';

  // ── team colour (spec colour rule) ──
  // anchor if it exists, isn't 'none', AND is one of the two teams; else home.
  const anchorAbbrev =
    anchor && anchor.source !== 'none' && (anchor.abbrev === game.home.abbrev || anchor.abbrev === game.away.abbrev)
      ? anchor.abbrev
      : game.home.abbrev;
  const teamRaw = pickTeamColor(anchorAbbrev);
  // Story gradient: darken the top stop for pale teams so white text stays legible.
  // Darken the gradient's top stop for pale/mid teams (yellow, silver, light blue)
  // so the white masthead stays legible; darkening toward black preserves hue.
  const storyTop = luminance(teamRaw) > 0.32 ? darken(teamRaw, 0.5) : teamRaw;
  const storyDk = darken(storyTop, 0.62);
  // The team colour used as a solid header/final/chip FILL (kept vivid).
  const teamFill = teamRaw;
  const onFill = readableInk(teamFill); // readable text on that fill
  const accentCream = accentOnCream(teamRaw); // team accent as text on cream

  const GOLD = '#e7c66b';
  const CREAM = '#fbf9f3';
  const INK = '#14140f';
  const inkA = (a: number) => `rgba(20,20,15,${a})`;
  const whiteA = (a: number) => `rgba(255,255,255,${a})`;

  // ── canvas (true 9:16, 3× the 360×640 mockup) ──
  const SCALE = 3;
  const W = 360;
  const H = 640;
  const canvas = document.createElement('canvas');
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(SCALE, SCALE);
  ctx.textBaseline = 'alphabetic';

  // Role fonts (see the file header). `hist` is the keepsake face and is used
  // EXACTLY ONCE on this artifact (the "PUCK PASSPORT" wordmark); `ui` carries
  // team names, scores, arena and holder; `mono` is ticket-stamp metadata only.
  const hist = (px: number, wt = 700) => `${wt} ${px}px "Newsreader", Georgia, serif`;
  const ui = (px: number, wt = 600) => `${wt} ${px}px "Instrument Sans", sans-serif`;
  const mono = (px: number, wt = 500) => `${wt} ${px}px "JetBrains Mono", monospace`;

  // preload crest (fail-loud if missing → we still draw the disc, sans emblem)
  let crest: HTMLImageElement | null = null;
  try {
    crest = await loadImage(crestUrl);
  } catch (e) {
    console.error(e);
  }

  // preload BOTH team logos (must be decoded before showCardModal snapshots the
  // canvas). Each resolves to the image + a contrast verdict on the cream board;
  // a missing/failed file → null, and drawTeamRow falls back to the colour chip.
  const logoUrlFor = opts.logoUrlFor ?? ((ab: string) => `/logos/${ab.toUpperCase()}_light.svg`);
  const logos: Record<string, { img: HTMLImageElement; needsTile: boolean } | null> = {};
  await Promise.all(
    [game.away.abbrev, game.home.abbrev].map(async (ab) => {
      if (ab in logos) return; // same team twice (shouldn't happen) — load once
      try {
        const img = await loadImage(logoUrlFor(ab));
        const readable = logoReadsOnCream(img);
        if (!readable)
          console.warn(`[TicketStub] ${ab} logo reads low-contrast on cream — backing with a colour tile.`);
        logos[ab] = { img, needsTile: !readable };
      } catch (e) {
        console.error(e);
        logos[ab] = null; // fall back to the colour abbrev chip
      }
    }),
  );

  // ══ BACKGROUND: 168deg team gradient + faint diagonal weave ══
  const g = ctx.createLinearGradient(W * 0.1, 0, W * 0.9, H);
  g.addColorStop(0, storyTop);
  g.addColorStop(0.62, storyDk);
  g.addColorStop(1, '#170406');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // diagonal weave overlay (opacity ~.05)
  ctx.save();
  ctx.globalAlpha = 0.05;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  for (let d = -H; d < W; d += 26) {
    ctx.beginPath();
    ctx.moveTo(d, 0);
    ctx.lineTo(d + H, H);
    ctx.stroke();
  }
  ctx.restore();

  // ══ MASTHEAD (compact, centred): crest medallion + wordmark + tagline ══
  const mastY = 18;
  const discR = 26; // 52px disc (bigger medallion)
  const wordmark = 'PUCK PASSPORT';
  const tagline = 'PROOF YOU WERE THERE';
  // Wordmark = the ONE keepsake-face moment on the stub. Newsreader's advance is
  // far wider than the old condensed face, so it is auto-fit into the room left
  // beside the crest disc rather than nailed to a fixed size.
  const WM_MAX_W = W - 24 * 2 - discR * 2 - 10;
  const wmPx = fitFont(ctx, wordmark, (p) => hist(p, 700), 21, WM_MAX_W, 14);
  ctx.font = hist(wmPx, 700);
  const wmW = ctx.measureText(wordmark).width;
  const gap = 10;
  const groupW = discR * 2 + gap + wmW;
  const groupX = (W - groupW) / 2;
  const discCx = groupX + discR;
  const discCy = mastY + discR;
  // disc: cream fill + gold ring
  ctx.beginPath();
  ctx.arc(discCx, discCy, discR, 0, Math.PI * 2);
  ctx.fillStyle = CREAM;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = GOLD;
  ctx.stroke();
  if (crest) {
    // Clip to just inside the gold ring, then draw the emblem larger so it fills
    // the disc (the crest PNG carries its own transparent margin, so a small draw
    // size looked tiny). Clip prevents any spill onto the ring.
    ctx.save();
    ctx.beginPath();
    ctx.arc(discCx, discCy, discR - 1.5, 0, Math.PI * 2);
    ctx.clip();
    const cs = 62;
    ctx.drawImage(crest, discCx - cs / 2, discCy - cs / 2, cs, cs);
    ctx.restore();
  }
  // wordmark + tagline (left-aligned, vertically centred against the disc)
  const wmX = groupX + discR * 2 + gap;
  ctx.textAlign = 'left';
  ctx.font = hist(wmPx, 700);
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(wordmark, wmX, discCy + 3);
  ctx.font = mono(8, 400);
  ctx.fillStyle = GOLD;
  ctx.save();
  ctx.letterSpacing = '1.4px';
  ctx.fillText(tagline, wmX + 1, discCy + 15);
  ctx.restore();

  // ══ THE PASS (cream, rounded, hero) ══
  const passW = 314;
  const passX = (W - passW) / 2;
  const passTop = mastY + discR * 2 + 16; // masthead + headroom

  // We lay out the pass sections top-down, measuring as we go, then draw the
  // rounded cream body underneath at the final height.
  const px = passX; // pass left
  const padX = 14;

  // Pre-compute section geometry --------------------------------------------------
  const HD_H = 26; // header strip
  // scoreboard
  const BOARD_PAD_T = 14;
  const ROW_H = 40;
  const ROW_GAP = 11;
  const FINAL_GAP = 11;
  const FINAL_H = 20;
  const BOARD_PAD_B = 12;
  const boardH = BOARD_PAD_T + ROW_H * 2 + ROW_GAP + FINAL_GAP + FINAL_H + BOARD_PAD_B;
  // details grid (2 rows)
  const ROWS_PAD_T = 12;
  const FROW_H = 34;
  const rowsH = ROWS_PAD_T + FROW_H * 2 + 4;
  // holder
  const HOLDER_H = 40;
  // stamps (badges) — one wrapping row; hide the block when none
  const hasStamps = badges.length > 0;
  const STAMPS_H = hasStamps ? 34 : 6;
  // souvenir stub
  const BP_PAD_T = 12;
  const BP_LBL_H = 18;
  // QR path = a WIDE "QR-noise band" (real QR centred in a field of decorative
  // module-noise that fades into the cream), taller than the old square so the
  // real QR keeps enough resolution to scan; PDF417 keeps its short band.
  const codeH = codeStyle === 'pdf417' ? 52 : 84;
  const BP_PAD_B = 13;
  const bpH = BP_PAD_T + BP_LBL_H + codeH + BP_PAD_B;

  const passH = HD_H + boardH + rowsH + HOLDER_H + STAMPS_H + bpH;

  // draw cream body (rounded, clipped) + soft shadow
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 12;
  rrect(ctx, px, passTop, passW, passH, 15);
  ctx.fillStyle = CREAM;
  ctx.fill();
  ctx.restore();
  ctx.save();
  rrect(ctx, px, passTop, passW, passH, 15);
  ctx.clip();

  let y = passTop;

  // ── header strip (team fill) ──
  ctx.fillStyle = teamFill;
  ctx.fillRect(px, y, passW, HD_H);
  ctx.textBaseline = 'middle';
  ctx.font = mono(8, 400);
  ctx.fillStyle = onFill === '#ffffff' ? whiteA(0.85) : inkA(0.75);
  ctx.textAlign = 'left';
  ctx.save();
  ctx.letterSpacing = '1px';
  ctx.fillText('ISSUED BY HOCKEYGAMEBOT', px + padX, y + HD_H / 2 + 0.5);
  ctx.restore();
  const season = seasonFromGameId(game.game_id);
  // Season tag = stamp metadata ⇒ mono (was the display face).
  ctx.font = mono(9, 700);
  ctx.fillStyle = onFill;
  ctx.textAlign = 'right';
  ctx.fillText(season ? `NHL · ${season}` : 'NHL', px + passW - padX, y + HD_H / 2 + 0.5);
  y += HD_H;

  // ── scoreboard (the hero) ──
  const bg2 = ctx.createLinearGradient(0, y, 0, y + boardH);
  bg2.addColorStop(0, '#faf7f0');
  bg2.addColorStop(1, '#efe9db');
  ctx.fillStyle = bg2;
  ctx.fillRect(px, y, passW, boardH);

  // resolve scores / winner (guards: manual w/o scores, non-final, PARTIAL scores).
  // Only treat scores as present when BOTH are finite numbers — a final game with
  // one score undefined would otherwise render the literal "undefined" and resolve
  // a bogus "FINAL · TIE". Partial ⇒ dashes + neutral status (no winner, no TIE).
  const homeScore = game.home?.score ?? NaN;
  const awayScore = game.away?.score ?? NaN;
  const bothScoresFinite = Number.isFinite(homeScore) && Number.isFinite(awayScore);
  const hasScores =
    bothScoresFinite &&
    !(game.is_manual && (game.home_score == null || game.away_score == null)) &&
    (game.is_manual || game.status === 'final');
  const winner: 'home' | 'away' | null = !hasScores
    ? null
    : homeScore > awayScore
      ? 'home'
      : awayScore > homeScore
        ? 'away'
        : null;

  const drawTeamRow = (team: TicketStubTeam, rowY: number, isLoser: boolean, score: number) => {
    const chipColor = pickTeamColor(team.abbrev);
    const CHIP = 40;
    const chipX = px + padX;
    const logo = logos[team.abbrev];
    if (logo && logo.img) {
      // real team logo in the chip box. Losers dim to preserve the winner emphasis.
      ctx.save();
      if (isLoser) ctx.globalAlpha = 0.5;
      if (logo.needsTile) {
        // near-white logo would vanish on cream → subtle team-colour tile behind it
        rrect(ctx, chipX, rowY, CHIP, CHIP, 7);
        ctx.fillStyle = isLoser ? mix(chipColor, '#efe9db', 0.45) : chipColor;
        ctx.fill();
      }
      // fit the logo into the box (padded), preserving its aspect ratio
      const inset = 2;
      const bx = CHIP - inset * 2;
      const iw = (logo.img as any).width || (logo.img as any).naturalWidth || bx;
      const ih = (logo.img as any).height || (logo.img as any).naturalHeight || bx;
      const s = Math.min(bx / iw, bx / ih);
      const lw = iw * s;
      const lh = ih * s;
      ctx.drawImage(logo.img, chipX + (CHIP - lw) / 2, rowY + (CHIP - lh) / 2, lw, lh);
      ctx.restore();
    } else {
      // no logo file → original colour chip + abbrev (fail-loud fallback)
      const chipInk = readableInk(chipColor);
      rrect(ctx, chipX, rowY, CHIP, CHIP, 7);
      ctx.fillStyle = isLoser ? mix(chipColor, '#efe9db', 0.45) : chipColor;
      ctx.fill();
      ctx.font = ui(13, 700);
      ctx.fillStyle = isLoser ? inkA(0.5) : chipInk;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(team.abbrev, chipX + 20, rowY + 21);
    }
    // city / nick
    const { city, nick } = splitTeamName(team.name, team.short_name);
    const tx = px + padX + 40 + 11;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    // city — team identity copy ⇒ Instrument Sans
    ctx.font = ui(9, 600);
    ctx.fillStyle = isLoser ? inkA(0.5) : inkA(0.6);
    ctx.save();
    ctx.letterSpacing = '0.5px';
    ctx.fillText(city.toUpperCase(), tx, rowY + 13);
    ctx.restore();
    // score width first, so a long nick ("GOLDEN KNIGHTS") shrinks to fit the
    // gap before the score instead of overlapping it. Score = Instrument Sans
    // 700 (structured numeric read); 28px, since the sans face sets much wider
    // than the condensed one it replaced and 32px crowded a 2-digit score.
    const scoreStr = hasScores ? String(score) : '–';
    ctx.font = ui(28, 700);
    const scoreW = ctx.measureText(scoreStr).width;
    const nickMaxW = px + passW - padX - scoreW - 12 - tx;
    const nickText = nick.toUpperCase();
    // Nick floor drops 15→11: "GOLDEN KNIGHTS" in Instrument Sans needs the room.
    const nickPx = fitFont(ctx, nickText, (p) => ui(p, 700), 21, nickMaxW, 11);
    ctx.font = ui(nickPx, 700);
    ctx.fillStyle = isLoser ? inkA(0.6) : INK;
    ctx.fillText(truncate(ctx, nickText, nickMaxW), tx, rowY + 37);
    // score (right)
    ctx.font = ui(28, 700);
    ctx.fillStyle = isLoser ? inkA(0.6) : INK;
    ctx.textAlign = 'right';
    ctx.fillText(scoreStr, px + passW - padX, rowY + 35);
    ctx.textAlign = 'left';
  };

  let by = y + BOARD_PAD_T;
  // away row (top), then home row — matches "away @ home"
  drawTeamRow(game.away, by, winner === 'home', awayScore);
  by += ROW_H + ROW_GAP;
  drawTeamRow(game.home, by, winner === 'away', homeScore);
  by += ROW_H;

  // final tag
  const np = normalizePeriod(game.last_period_type);
  let finalText: string;
  if (!hasScores) {
    finalText = game.status === 'final' ? 'FINAL' : 'SCHEDULED';
  } else if (winner) {
    const wNick = splitTeamName(
      winner === 'home' ? game.home.name : game.away.name,
      winner === 'home' ? game.home.short_name : game.away.short_name,
    ).nick.toUpperCase();
    const otTag =
      np.code === 'REG' ? '' : np.code === 'SO' ? ' IN SHOOTOUT' : ` IN ${np.label}`;
    finalText = `FINAL · ${wNick} WIN${otTag}`;
  } else {
    finalText = 'FINAL · TIE';
  }
  const fy = by + FINAL_GAP;
  // Result chip carries a team NAME ⇒ Instrument Sans. It is sized to its own
  // text, so it must auto-fit: "FINAL · GOLDEN KNIGHTS WIN IN SHOOTOUT" in a
  // sans face would otherwise run past the pass edge (the condensed face used
  // to absorb it). Budget = pass width minus padding minus the chip's own 20px
  // of horizontal padding.
  ctx.save();
  ctx.letterSpacing = '0.6px';
  const finalMaxW = passW - padX * 2 - 20;
  const finalPx = fitFont(ctx, finalText, (p) => ui(p, 700), 11, finalMaxW, 7.5);
  ctx.font = ui(finalPx, 700);
  const ftW = Math.min(ctx.measureText(finalText).width, finalMaxW);
  rrect(ctx, px + padX, fy, ftW + 20, FINAL_H, 3);
  ctx.fillStyle = teamFill;
  ctx.fill();
  ctx.fillStyle = onFill;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(finalText, px + padX + 10, fy + FINAL_H / 2 + 0.5);
  ctx.restore();
  // board bottom hairline
  y += boardH;
  ctx.fillStyle = inkA(0.24);
  ctx.fillRect(px, y - 1, passW, 1);

  // ── details grid (2×2) ──
  const detDate = { label: 'Date', value: formatStubDate(game.date) };
  const detArena = { label: 'Arena', value: game.venue ?? 'Venue TBD' };
  const detAdapt = adaptiveDetail(game.game_id);
  // Returns the rendered value width so a paired field can claim the remaining
  // room. Value font shrinks (14→9) to fit maxW before any ellipsis — long arena
  // names ("Prudential Center") stay whole instead of truncating early.
  const drawField = (
    f: { label: string; value: string },
    anchorX: number,
    fyy: number,
    align: 'left' | 'right',
    accent: boolean,
    maxW: number,
    /** Value face: 'mono' for the DATE (date-like metadata), else Instrument Sans. */
    valueRole: 'ui' | 'mono' = 'ui',
  ): number => {
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    // Detail-grid LABELS are always the mono stamp face.
    ctx.font = mono(8, 500);
    ctx.fillStyle = accent ? accentCream : inkA(0.55);
    ctx.save();
    ctx.letterSpacing = '0.8px';
    ctx.fillText(f.label.toUpperCase(), anchorX, fyy);
    ctx.restore();
    const val = f.value.toUpperCase();
    const valFont = valueRole === 'mono' ? (p: number) => mono(p, 500) : (p: number) => ui(p, 600);
    // Both faces set wider than the old condensed value, so the fit floor drops
    // 9→7.5 to keep long arena names ("Scotiabank Arena") whole.
    const vpx = fitFont(ctx, val, valFont, 12, maxW, 7.5);
    ctx.font = valFont(vpx);
    ctx.fillStyle = INK;
    const clipped = truncate(ctx, val, maxW);
    ctx.fillText(clipped, anchorX, fyy + 15);
    return ctx.measureText(clipped).width;
  };
  const gutter = 12; // min gap between the two columns
  let ry = y + ROWS_PAD_T + 8;
  // top row: date (left) + game-type/round (right, accent). Season is NOT repeated
  // here — it lives once in the header ("NHL · <season>"); this cell holds the
  // adaptive game-type field instead. (The mockup's puck-drop time has no backing
  // data, so it is never fabricated.)
  const adaptW = drawField(detAdapt, px + passW - padX, ry, 'right', true, passW * 0.46, 'ui');
  // DATE value is the one mono value in the grid (date-like ⇒ stamp face).
  drawField(detDate, px + padX, ry, 'left', false, passW - padX * 2 - adaptW - gutter, 'mono');
  ry += FROW_H;
  // bottom row: arena across the full width (its own row now the grid is 3 fields).
  drawField(detArena, px + padX, ry, 'left', false, passW - padX * 2, 'ui');
  y += rowsH;

  // ── holder (ruled annotation) ──
  ctx.strokeStyle = inkA(0.24);
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(px + padX, y + 2);
  ctx.lineTo(px + passW - padX, y + 2);
  ctx.stroke();
  ctx.setLineDash([]);
  // The collection stat (Nth GAME + Nth ARENA). When a handle is present it sits
  // right-aligned opposite the PASSPORT HOLDER · @handle line; when there's NO
  // handle (logged-out / private) the holder line is dropped, so the stat instead
  // LEFT-aligns into that freed column — no empty half, no lopsided right-only row.
  const drawCollectionStat = (align: 'left' | 'right', anchorX: number) => {
    ctx.textAlign = align;
    if (gameOrdinal && gameOrdinal > 0) {
      // "37TH GAME" is a bare count ⇒ Instrument Sans
      ctx.font = ui(11.5, 700);
      ctx.fillStyle = accentCream;
      ctx.save();
      ctx.letterSpacing = '0.4px';
      ctx.fillText(`${ordinal(gameOrdinal)} GAME`, anchorX, y + 20);
      ctx.restore();
    }
    if (arenaOrdinal && arenaOrdinal > 0) {
      ctx.font = mono(8, 500);
      ctx.fillStyle = inkA(0.55);
      ctx.save();
      ctx.letterSpacing = '0.5px';
      ctx.fillText(`${ordinal(arenaOrdinal)} ARENA ATTENDED`, anchorX, y + 33);
      ctx.restore();
    }
    ctx.textAlign = 'left';
  };
  // Intentional logged-out share-funnel fallback: a shareable stub with no
  // attributable handle still points at the generic passport URL (operator's call).
  if (handle) {
    // Holder = a MATCHED PAIR with the collection stat on the right: a bold display
    // value on top, a mono caption beneath. @handle sits at the SAME size + baseline
    // as the "37TH GAME" hero and "PASSPORT HOLDER" drops to the caption row level
    // with "6TH ARENA ATTENDED" — so the two columns read as one balanced row (was
    // a lonely oversized 16px handle floating over a tiny label).
    ctx.textAlign = 'left';
    // holder handle = identity copy ⇒ Instrument Sans, level with "37TH GAME"
    ctx.font = ui(11.5, 700);
    ctx.fillStyle = INK;
    ctx.save();
    ctx.letterSpacing = '0.4px';
    ctx.fillText(`@${handle}`, px + padX, y + 20);
    ctx.restore();
    ctx.font = mono(8, 500);
    ctx.fillStyle = inkA(0.55);
    ctx.save();
    ctx.letterSpacing = '0.5px';
    ctx.fillText('PASSPORT HOLDER', px + padX, y + 33);
    ctx.restore();
    // right: collection stat opposite the holder line
    drawCollectionStat('right', px + passW - padX);
  } else {
    // no handle → reflow the stat to the left so the row isn't lopsided
    drawCollectionStat('left', px + padX);
  }
  ctx.textAlign = 'left';
  y += HOLDER_H;

  // ── badge stamps ──
  if (hasStamps) {
    let sx = px + padX;
    const sy = y + 4;
    ctx.textBaseline = 'middle';
    for (const label of badges) {
      const txt = label.toUpperCase();
      // Badge labels are NAMES, not stamps ⇒ Instrument Sans (mono stays reserved
      // for ticket metadata: serial, date, ADMIT ONE, signature).
      ctx.font = ui(8, 700);
      ctx.save();
      ctx.letterSpacing = '0.5px';
      const tw = ctx.measureText(txt).width;
      const chipW = tw + 16;
      if (sx + chipW > px + passW - padX && sx > px + padX) {
        ctx.restore();
        break; // one row only (mockup); overflow chips dropped rather than wrap ugly
      }
      rrect(ctx, sx, sy, chipW, 18, 4);
      ctx.fillStyle = whiteA(0.4);
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = accentCream;
      ctx.stroke();
      ctx.fillStyle = accentCream;
      ctx.textAlign = 'left';
      ctx.fillText(txt, sx + 8, sy + 10);
      ctx.restore();
      sx += chipW + 6;
    }
    ctx.textBaseline = 'alphabetic';
  }
  y += STAMPS_H;

  // ── souvenir stub (perforation + code) ──
  // dashed tear line
  ctx.strokeStyle = inkA(0.4);
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(px, y);
  ctx.lineTo(px + passW, y);
  ctx.stroke();
  ctx.setLineDash([]);
  // notches (team-colour circles straddling the edges → ticket-tear illusion)
  ctx.fillStyle = teamFill;
  ctx.beginPath();
  ctx.arc(px, y, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(px + passW, y, 8, 0, Math.PI * 2);
  ctx.fill();
  // label row: ADMIT ONE · SCAN TO VIEW   +   serial
  const serial = stubSerial(game.game_id);
  const bpY = y + BP_PAD_T;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  // "ADMIT ONE" is the canonical ticket stamp ⇒ mono.
  ctx.font = mono(8.5, 700);
  ctx.fillStyle = INK;
  ctx.save();
  ctx.letterSpacing = '0.6px';
  ctx.fillText('ADMIT ONE · SCAN TO VIEW', px + padX, bpY + 10);
  ctx.restore();
  ctx.textAlign = 'right';
  ctx.font = mono(8.5, 500);
  ctx.fillStyle = inkA(0.55);
  ctx.fillText(serial, px + passW - padX, bpY + 10);
  ctx.textAlign = 'left';

  // code slot (QR-noise band or PDF417 wide band — both span the pass width)
  const codeY = bpY + BP_LBL_H;
  // No handle ⇒ encode the GENERIC passport URL (never "/@undefined"): a
  // logged-out/private stub is still shareable and funnels to the product page.
  const codeUrl = `https://hockeygamebot.com/puck-passport${handle ? `/@${handle}` : ''}`;
  if (codeStyle === 'qr' || codeStyle === 'qr-plain' || codeStyle === 'qr-boxnoise') {
    // Reserve the bottom of the code region for the human-readable URL; the band
    // (real QR + decorative noise, or a plain white rectangle) fills the rest.
    const URL_STRIP = 15;
    const bandH = codeH - URL_STRIP;
    const qrMode = codeStyle === 'qr-plain' ? 'plain' : codeStyle === 'qr-boxnoise' ? 'boxnoise' : 'fade';
    drawQrNoiseBand(ctx, codeUrl, game.game_id, px + padX, codeY, passW - padX * 2, bandH, INK, qrMode);
    // human-readable URL beneath the band (protocol stripped for width)
    ctx.font = mono(7.5, 500);
    ctx.fillStyle = inkA(0.5);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.save();
    ctx.letterSpacing = '0.3px';
    ctx.fillText(
      truncate(ctx, codeUrl.replace(/^https?:\/\//, ''), passW - padX * 2),
      px + passW / 2,
      codeY + bandH + 11,
    );
    ctx.restore();
    ctx.textAlign = 'left';
  } else {
    drawPdf417Stub(ctx, px + padX, codeY, passW - padX * 2, codeH);
  }

  ctx.restore(); // end pass clip

  // ══ SIGNATURE FOOTER (tiny, muted, pulled safely inward) ══
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = mono(9, 400);
  ctx.save();
  ctx.letterSpacing = '0.5px';
  const sig1 = 'Created with ';
  const sig2 = 'Puck Passport';
  const sig3 = ` · ${DOMAIN_UPPER.toLowerCase()}`;
  // measure to centre the mixed-weight line
  const w1 = ctx.measureText(sig1).width;
  ctx.font = mono(9, 700);
  const w2 = ctx.measureText(sig2).width;
  ctx.font = mono(9, 400);
  const w3 = ctx.measureText(sig3).width;
  const total = w1 + w2 + w3;
  let sxp = W / 2 - total / 2;
  const sigY = H - 22;
  ctx.textAlign = 'left';
  ctx.fillStyle = whiteA(0.6);
  ctx.fillText(sig1, sxp, sigY);
  sxp += w1;
  ctx.font = mono(9, 700);
  ctx.fillStyle = whiteA(0.85);
  ctx.fillText(sig2, sxp, sigY);
  sxp += w2;
  ctx.font = mono(9, 400);
  ctx.fillStyle = whiteA(0.6);
  ctx.fillText(sig3, sxp, sigY);
  ctx.restore();

  return canvas;
}

// ── code renderers ────────────────────────────────────────────────────────────

/** FNV-1a hash → 32-bit uint seed. Stable across calls for a given string. */
function hashSeed(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
/** mulberry32 PRNG → deterministic [0,1) stream from a uint seed. */
function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Draw a WIDE "QR-noise band": decorative QR-module noise fills the whole band as
 * a BACKGROUND texture (dissolving into the cream at the edges), and the real,
 * scannable QR (error-correction H, NO logo overlay — clean modules) sits inside a
 * solid WHITE rounded card floating centred on top of that noise. The white card
 * physically separates the crisp real code from the decorative field behind it, so
 * the QR never reads muddy against the noise.
 *
 * Scannability: the white card IS the quiet zone — the QR keeps a full ≥4-module
 * white margin on every side inside the card, and the noise lives BEHIND the opaque
 * card, so nothing decorative can ever crowd the code. The card carries a soft drop
 * shadow + faint hairline border so it reads as floating above the texture.
 *
 * The noise is seeded deterministically from `gameId` (a given stub always renders
 * the identical field). It peaks behind/around the card and fades toward both
 * horizontal ends (with a gentler vertical fade) so the texture emerges from behind
 * the card and melts back into the cardstock — no hard-edged rectangle.
 */
function drawQrNoiseBand(
  ctx: CanvasRenderingContext2D,
  url: string,
  gameId: string,
  x: number,
  y: number,
  bandW: number,
  bandH: number,
  ink: string,
  mode: 'fade' | 'plain' | 'boxnoise' = 'fade',
) {
  const qr = qrcode(0, 'H'); // auto version, highest EC — clean (no logo keep-out)
  qr.addData(url);
  qr.make();
  const count = qr.getModuleCount();
  const QUIET = 4; // ≥4-module white quiet zone inside the card → scannable margin
  const totalMods = count + QUIET * 2;

  // The white card is a square that fits the band height (minus a small margin so
  // its shadow reads). The QR + its full quiet zone live inside it.
  const boxMargin = 3;
  const boxSize = bandH - boxMargin * 2;
  const cell = boxSize / totalMods; // module size — drives BOTH the QR and the noise
  const boxX = x + (bandW - boxSize) / 2; // centre the card horizontally
  const boxY = y + boxMargin;
  // pixel origin of the QR proper (after its QUIET-module margin) — noise aligns to this
  const qOriginX = boxX + QUIET * cell;
  const qOriginY = boxY + QUIET * cell;

  // ── decorative module-noise BACKGROUND across the whole band, on the same cell
  //    grid. Drawn FIRST so the opaque white card sits on top. Alpha peaks in the
  //    middle (behind/around the card) and fades to 0 at the outer horizontal ends,
  //    with a gentler vertical fade, so the texture melts into the cream. ──
  const rand = mulberry32(hashSeed(gameId));

  // MODE 'fade': decorative noise across the whole band, dissolving into the cream
  // at the edges (the floating white square card below holds the QR).
  if (mode === 'fade') {
    const cols = Math.ceil(bandW / cell);
    const rows = Math.ceil(bandH / cell);
    const midX = x + bandW / 2;
    const midY = y + bandH / 2;
    ctx.fillStyle = ink;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cx = x + c * cell;
        const cy = y + r * cell;
        const on = rand() < 0.5;
        const jitter = rand();
        if (!on) continue;
        const dh = Math.abs(cx + cell / 2 - midX) / (bandW / 2);
        let ah = Math.max(0, Math.min(1, 1 - dh));
        ah = ah ** 1.4;
        const dv = Math.abs(cy + cell / 2 - midY) / (bandH / 2);
        const av = 1 - 0.65 * dv * dv;
        const alpha = 0.6 * ah * av * (0.7 + 0.3 * jitter);
        if (alpha <= 0.02) continue;
        ctx.globalAlpha = alpha;
        ctx.fillRect(cx, cy, cell + 0.4, cell + 0.4);
      }
    }
    ctx.globalAlpha = 1;
  }

  // white container: 'fade' = square card floating on the noise; 'plain'/'boxnoise'
  // = full-width rounded rectangle. Soft shadow + faint hairline border.
  const fullRect = mode !== 'fade';
  const cardX = fullRect ? x : boxX;
  const cardY = fullRect ? y : boxY;
  const cardW = fullRect ? bandW : boxSize;
  const cardH = fullRect ? bandH : boxSize;
  // box-noise is a hard-edged barcode panel: square corners, no soft shadow.
  const cardR = mode === 'boxnoise' ? 0 : fullRect ? 8 : 6;
  ctx.save();
  if (mode !== 'boxnoise') {
    ctx.shadowColor = 'rgba(0,0,0,0.28)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 2;
  }
  rrect(ctx, cardX, cardY, cardW, cardH, cardR);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.restore();
  rrect(ctx, cardX + 0.5, cardY + 0.5, cardW - 1, cardH - 1, cardR);
  ctx.strokeStyle = mode === 'boxnoise' ? 'rgba(20,20,15,0.30)' : 'rgba(20,20,15,0.14)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // MODE 'boxnoise': fill the white rectangle with bounded noise (clipped to it),
  // then punch a white keep-out square behind the centred QR (its quiet zone).
  if (mode === 'boxnoise') {
    ctx.save();
    rrect(ctx, cardX, cardY, cardW, cardH, cardR);
    ctx.clip();
    // Solid-black noise on the SAME crisp grid as the QR so the whole panel reads as
    // one big QR code — matching the real modules' darkness AND density (no fade).
    ctx.fillStyle = '#000000';
    const c0 = Math.floor((x - qOriginX) / cell);
    const c1 = Math.ceil((x + bandW - qOriginX) / cell);
    const r0 = Math.floor((y - qOriginY) / cell);
    const r1 = Math.ceil((y + bandH - qOriginY) / cell);
    for (let r = r0; r < r1; r++) {
      for (let c = c0; c < c1; c++) {
        const on = rand() < 0.5;
        rand(); // keep PRNG parity with the fade path
        if (!on) continue;
        const mx = Math.round(qOriginX + c * cell);
        const my = Math.round(qOriginY + r * cell);
        const mw = Math.round(qOriginX + (c + 1) * cell) - mx;
        const mh = Math.round(qOriginY + (r + 1) * cell) - my;
        ctx.fillRect(mx, my, mw, mh);
      }
    }
    ctx.restore();
    // TIGHT white quiet-zone keep-out behind the QR — just enough margin to scan,
    // so the QR reads as embedded IN the noise (not floating in a big white square).
    const qzM = 2; // modules of quiet zone (min for reliable scan)
    const qkX = boxX + (QUIET - qzM) * cell;
    const qkY = boxY + (QUIET - qzM) * cell;
    const qkS = (count + qzM * 2) * cell;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(qkX, qkY, qkS, qkS);
  }

  // ── crisp real QR inside the card (offset by the QUIET-module white margin) ──
  // Snap every module to integer pixel edges (round both edges, not origin+size) so
  // modules are pixel-crisp with no gaps/overlap — anti-aliased/soft modules fail
  // real scanners. qOriginX/Y are the pixel origin of the QR proper (after quiet zone).
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#000000';
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (!qr.isDark(row, col)) continue;
      const mx = Math.round(qOriginX + col * cell);
      const my = Math.round(qOriginY + row * cell);
      const mw = Math.round(qOriginX + (col + 1) * cell) - mx;
      const mh = Math.round(qOriginY + (row + 1) * cell) - my;
      ctx.fillRect(mx, my, mw, mh);
    }
  }
}

/** DECORATIVE ONLY — PDF417-look stacked band (NOT a functional code). Wired
 *  behind codeStyle:'pdf417' so switching is one line; swap in a real PDF417
 *  encoder here when a clean zero-dep lib is chosen (spec §7). */
function drawPdf417Stub(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(20,20,15,0.24)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  // TODO(pdf417): replace this decorative band with a real PDF417 encoder.
  const rows = 4;
  const rh = (h - 8) / rows;
  ctx.fillStyle = '#14140f';
  // deterministic pseudo-bars per row (not encoding anything real)
  const patterns = [
    [2, 1, 3, 2, 1, 4, 2, 2],
    [3, 2, 1, 4, 3, 2, 1, 3],
    [2, 3, 3, 1, 2, 3, 2, 2],
    [2, 1, 3, 2, 1, 4, 2, 2],
  ];
  for (let r = 0; r < rows; r++) {
    let bx = x + 4;
    const rowY = y + 4 + r * rh;
    const pat = patterns[r % patterns.length];
    let i = 0;
    while (bx < x + w - 4) {
      const bw = pat[i % pat.length];
      if (i % 2 === 0) ctx.fillRect(bx, rowY, bw, rh - 2);
      bx += bw;
      i++;
    }
  }
}

/**
 * Composite N ticket stubs side by side into one wide canvas — the X/Twitter share
 * format. A single tall 9:16 stub center-crops to a sliver in the X timeline; two
 * stubs side by side is ~1.125:1 (near-square) and previews UNCROPPED in-feed, while
 * also reading as a "collection" ("the games I've been to"). Reuses drawTicketStub
 * per cell (each keeps its own QR → the user's Passport), so there's one source of
 * truth for a stub's look. `gutter` is the cream seam between cells.
 */
export async function drawStubGrid(
  cells: TicketStubOpts[],
  gutter = 20,
  bg = '#efeee8',
): Promise<HTMLCanvasElement> {
  if (cells.length === 0) throw new Error('drawStubGrid: need at least one stub');
  const canvases = await Promise.all(cells.map((o) => drawTicketStub(o)));
  const w = canvases[0].width;
  const h = canvases[0].height;
  const out = document.createElement('canvas');
  out.width = w * canvases.length + gutter * (canvases.length - 1);
  out.height = h;
  const ctx = out.getContext('2d');
  if (!ctx) throw new Error('drawStubGrid: no 2d context');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, out.width, out.height);
  canvases.forEach((c, i) => ctx.drawImage(c, i * (w + gutter), 0));
  return out;
}
