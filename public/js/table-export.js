/**
 * HGB Stats — Table PNG Export
 * ============================================================
 * Renders the currently-visible stats table to a 2400×auto PNG
 * (2× scale for crisp sharing) and downloads it to the device.
 *
 * PUBLIC API
 *   window.HGB_Export.downloadTablePng(config)
 *
 * config shape:
 *   title       {string}     Section header, e.g. "LINES & PAIRS"
 *   filterChips {string[]}   Active filter labels, e.g. ["PLAYOFFS", "FORWARDS"]
 *   rows        {object[]}   Filtered row data — the same array your
 *                            applyFilters() returns, after ranking/sorting
 *   columns     {ColumnDef[]} Column spec (see below)
 *   filename    {string?}    Download filename; defaults to "{title}.png"
 *
 * ColumnDef shape:
 *   label      {string}                Header text (auto-uppercased)
 *   key        {string}                Row property to read
 *   width      {number}                Column pixel width at 1× (canvas doubles it)
 *   align      {'left'|'center'|'right'}
 *   fontFamily {'mono'|'body'}         Default 'mono'; use 'body' for name columns
 *   format     {(v, row) => string}    Optional value formatter
 *   color      {(v, row, tok) => string|null}
 *                                      Optional text color; receives tok={pos,neg}
 *                                      so callers never hardcode threshold colors
 *   bold       {boolean | (v, row) => boolean}
 *
 * ADDING TO A NEW PAGE
 *   1. Include this script before the page's <script define:vars> block
 *   2. Add --stats-pos and --stats-neg CSS vars to the page's :root
 *   3. Define a columns array + chip builder in the page script
 *   4. Call window.HGB_Export.downloadTablePng({...}) on button click
 *   No changes to this file required.
 *
 * COLOR TOKENS
 *   Brand colors are defined in TOKENS below.
 *   Threshold colors (pos/neg) are read at render time from the page's CSS
 *   custom properties --stats-pos and --stats-neg, making the page CSS the
 *   single source of truth for those values. TOKENS.posDefault /
 *   TOKENS.negDefault are only used as a fallback if the CSS vars are absent.
 */

(function () {
  'use strict';

  // ── Brand palette — must match --bg/--ink/--red/--surface in each stats page ──
  const TOKENS = {
    bg:         '#EFEEE8',
    surface:    '#FFFFFF',
    ink:        '#0D0D14',
    red:        '#E8002D',
    rowAlt:     '#F5F4EF',   // subtle cream for odd rows
    ink48:      'rgba(13,13,20,0.48)',
    ink14:      'rgba(13,13,20,0.14)',
    ink06:      'rgba(13,13,20,0.06)',
    // Fallbacks only — runtime values come from CSS --stats-pos / --stats-neg
    posDefault: '#166534',
    negDefault: '#991b1b',
  };

  // ── Layout constants at 1× (canvas is drawn at SCALE×) ──────────────────────
  const SCALE    = 2;
  const PAD      = 40;
  const TITLE_H  = 72;
  const CHIPS_H  = 46;
  const HEADER_H = 36;
  const ROW_H    = 34;
  const FOOT_H   = 20;

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function _cssVar(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  function _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(x, y, w, h, r);
    } else {
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
    }
  }

  function _ellipsize(ctx, text, maxW) {
    if (ctx.measureText(text).width <= maxW) return text;
    let t = text;
    while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
    return t + '…';
  }

  function _drawCell(ctx, text, x, cy, colWidth, align, color, bold, fontFamily) {
    const ff = fontFamily === 'body'
      ? '"Barlow", sans-serif'
      : '"JetBrains Mono", monospace';
    const weight = bold ? '700' : '400';
    ctx.font = `${weight} 12px ${ff}`;
    ctx.fillStyle = color || TOKENS.ink;
    ctx.textBaseline = 'middle';

    const pad = 8;
    const maxW = colWidth - pad * 2;
    const display = _ellipsize(ctx, text, maxW);

    if (align === 'left') {
      ctx.textAlign = 'left';
      ctx.fillText(display, x + pad, cy);
    } else if (align === 'right') {
      ctx.textAlign = 'right';
      ctx.fillText(display, x + colWidth - pad, cy);
    } else {
      ctx.textAlign = 'center';
      ctx.fillText(display, x + colWidth / 2, cy);
    }
  }

  function _drawHeader(ctx, text, x, cy, colWidth, align, sorted, sortDir) {
    ctx.font = '700 10px "Barlow Condensed", sans-serif';
    ctx.fillStyle = sorted ? TOKENS.ink : TOKENS.ink48;
    ctx.textBaseline = 'middle';

    const pad = 8;
    const arrow = sorted ? (sortDir === 'desc' ? ' ↓' : ' ↑') : '';
    const label = text.toUpperCase() + arrow;

    if (align === 'left') {
      ctx.textAlign = 'left';
      ctx.fillText(label, x + pad, cy);
    } else {
      ctx.textAlign = 'center';
      ctx.fillText(label, x + colWidth / 2, cy);
    }
  }

  function _drawPill(ctx, text, x, cy, colWidth, bg, fg) {
    ctx.font = '700 10px "Barlow Condensed", sans-serif';
    const tw  = ctx.measureText(text).width;
    const pH  = 18;
    const pW  = Math.max(tw + 16, 24);
    const px  = x + colWidth / 2 - pW / 2;
    const py  = cy - pH / 2;
    _roundRect(ctx, px, py, pW, pH, 3);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.fillStyle = fg;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(text, x + colWidth / 2, cy);
  }

  // ── Main export function ─────────────────────────────────────────────────────

  async function downloadTablePng(config) {
    const { title, filterChips = [], rows, columns, filename } = config;

    if (!rows || rows.length === 0) {
      alert('No rows to export — apply a less restrictive filter first.');
      return;
    }

    // Ensure fonts are ready (they should be — page already loaded them)
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }

    // Read threshold colors from the page's CSS custom properties at render time
    const tok = {
      pos: _cssVar('--stats-pos', TOKENS.posDefault),
      neg: _cssVar('--stats-neg', TOKENS.negDefault),
    };

    // Auto-width: fit canvas exactly to column content + padding
    const colsTotal = columns.reduce((s, c) => s + c.width, 0);
    const W = colsTotal + PAD * 2;

    const totalH = TITLE_H + CHIPS_H + HEADER_H + rows.length * ROW_H + FOOT_H;

    const canvas = document.createElement('canvas');
    canvas.width  = W * SCALE;
    canvas.height = totalH * SCALE;
    const ctx = canvas.getContext('2d');
    ctx.scale(SCALE, SCALE);

    // ── Background ────────────────────────────────────────────────────────────
    ctx.fillStyle = TOKENS.bg;
    ctx.fillRect(0, 0, W, totalH);

    let y = 0;

    // ── Title ─────────────────────────────────────────────────────────────────
    ctx.fillStyle = TOKENS.ink;
    ctx.font = '800 30px "Barlow Condensed", sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(title.toUpperCase(), PAD, y + TITLE_H / 2);
    y += TITLE_H;

    // ── Filter chips + brand pill ─────────────────────────────────────────────
    const chipH  = 24;
    const chipY0 = y + (CHIPS_H - chipH) / 2;
    let cx = PAD;

    ctx.font = '700 10px "Barlow Condensed", sans-serif';

    // Filter chips — left side, black
    for (const chip of filterChips) {
      const text = chip.toUpperCase();
      const tw   = ctx.measureText(text).width;
      const chipW = tw + 22;

      _roundRect(ctx, cx, chipY0, chipW, chipH, 3);
      ctx.fillStyle = TOKENS.ink;
      ctx.fill();

      ctx.fillStyle = TOKENS.bg;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillText(text, cx + 11, chipY0 + chipH / 2);

      cx += chipW + 8;
    }

    // Brand pill — right side, red background
    const brandText = 'HOCKEYGAMEBOT.COM';
    const btw = ctx.measureText(brandText).width;
    const bChipW = btw + 22;
    const bx = W - PAD - bChipW;

    _roundRect(ctx, bx, chipY0, bChipW, chipH, 3);
    ctx.fillStyle = TOKENS.red;
    ctx.fill();

    ctx.fillStyle = TOKENS.bg;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(brandText, bx + 11, chipY0 + chipH / 2);

    y += CHIPS_H;

    // ── Top border ────────────────────────────────────────────────────────────
    ctx.fillStyle = TOKENS.ink;
    ctx.fillRect(0, y, W, 2);
    y += 2;

    // ── Table header ──────────────────────────────────────────────────────────
    ctx.fillStyle = TOKENS.surface;
    ctx.fillRect(0, y, W, HEADER_H);

    let colX = PAD;
    for (const col of columns) {
      _drawHeader(ctx, col.label, colX, y + HEADER_H / 2, col.width, col.align, col.sorted, col.sortDir);
      colX += col.width;
    }

    ctx.fillStyle = TOKENS.ink14;
    ctx.fillRect(0, y + HEADER_H - 1, W, 1);
    y += HEADER_H;

    // ── Rows ──────────────────────────────────────────────────────────────────
    for (let i = 0; i < rows.length; i++) {
      const row  = rows[i];
      const rowY = y + i * ROW_H;

      ctx.fillStyle = i % 2 === 0 ? TOKENS.surface : TOKENS.rowAlt;
      ctx.fillRect(0, rowY, W, ROW_H);

      ctx.fillStyle = TOKENS.ink06;
      ctx.fillRect(0, rowY + ROW_H - 1, W, 1);

      colX = PAD;
      for (const col of columns) {
        const value = row[col.key];
        const text  = col.format
          ? col.format(value, row)
          : (value != null ? String(value) : '—');

        if (col.pill) {
          const pillStyle = col.pill(value, row);
          if (pillStyle) {
            _drawPill(ctx, text, colX, rowY + ROW_H / 2, col.width, pillStyle.bg, pillStyle.fg);
            colX += col.width;
            continue;
          }
        }

        const color = col.color ? col.color(value, row, tok) : null;
        const bold  = typeof col.bold === 'function' ? col.bold(value, row) : !!col.bold;

        _drawCell(
          ctx, text,
          colX, rowY + ROW_H / 2, col.width,
          col.align, color, bold, col.fontFamily || 'mono'
        );
        colX += col.width;
      }
    }

    y += rows.length * ROW_H;

    // Bottom breathing room (FOOT_H = 20px, just padding — brand mark is in title row)
    ctx.fillStyle = TOKENS.bg;
    ctx.fillRect(0, y, W, FOOT_H);

    // ── Show modal ────────────────────────────────────────────────────────────
    const fname = filename || (title.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.png');
    showCardModal(canvas, fname);
  }

  // ── Shared image modal ────────────────────────────────────────────────────────
  // Used by downloadTablePng above and by all per-page card generators.
  // Call HGB_Export.showCardModal(canvas, filename) from any page.

  function showCardModal(canvas, filename) {
    document.getElementById('hgb-card-modal')?.remove();
    const dataUrl = canvas.toDataURL('image/png');
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
                  (navigator.userAgent.includes('Mac') && 'ontouchend' in document);
    const overlay = document.createElement('div');
    overlay.id = 'hgb-card-modal';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.92);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px;';
    overlay.innerHTML = `
      <div style="position:relative;max-width:min(90vw,900px);width:100%;">
        <button id="hgb-modal-close" style="position:absolute;top:-40px;right:0;background:none;border:none;color:#fff;font-size:28px;cursor:pointer;line-height:1;opacity:0.7;">×</button>
        <img src="${dataUrl}" alt="${filename}" style="width:100%;height:auto;display:block;border:1px solid rgba(255,255,255,0.12);" />
        <div style="display:flex;align-items:center;justify-content:space-between;margin-top:10px;gap:12px;">
          <span style="font-family:'JetBrains Mono',monospace;font-size:10px;color:rgba(255,255,255,0.4);letter-spacing:0.06em;">
            ${isIOS ? 'Long-press image to save · ' : ''}${filename}
          </span>
          ${!isIOS ? `<a href="${dataUrl}" download="${filename}" style="font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:0.10em;text-transform:uppercase;padding:6px 14px;background:#fff;color:#0d0d14;text-decoration:none;white-space:nowrap;">↓ Download</a>` : ''}
        </div>
      </div>`;
    document.body.appendChild(overlay);
    document.getElementById('hgb-modal-close').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', esc); }
    });
  }

  window.HGB_Export = { downloadTablePng: downloadTablePng, showCardModal: showCardModal };
})();
