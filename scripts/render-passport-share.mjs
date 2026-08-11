/**
 * Puck Passport share-artifact render harness (throwaway-cheap, no test infra).
 *
 * Renders the three canvas share artifacts — drawTicketStub (A), drawStubGrid (B)
 * and drawPassportCard (C) — headlessly against FABRICATED data, straight out of
 * `src/components/react/puck-passport-share.ts`, and writes the exact PNG the
 * share modal would show (`canvas.toDataURL()`, not a screenshot of the modal).
 *
 * Why this and not the full dev-server flow: these three functions take plain
 * data in and hand a canvas back — no auth, no API, no React. Driving them
 * directly renders the SAME pixels the app would, with fabricated stress-case
 * data the real fixtures can't easily produce (double-digit scores, 1,234-shot
 * passports, "Golden Knights" long nicks).
 *
 * Usage:  node scripts/render-passport-share.mjs [outDir]
 * Needs:  playwright chromium available (npx playwright is resolved from the repo
 *         root workspace; see PLAYWRIGHT_PKG below).
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.argv[2] || path.join(ROOT, '.render-out');

// ── 1. bundle the share module for the browser ───────────────────────────────
const bundle = await build({
  entryPoints: [path.join(ROOT, 'src/components/react/puck-passport-share.ts')],
  bundle: true,
  format: 'iife',
  globalName: 'PPShare',
  write: false,
  target: 'es2022',
});
const bundleJs = bundle.outputFiles[0].text;

// ── 2. serve public/ + node_modules/ (fontsource) + the harness page ─────────
const MIME = {
  '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.json': 'application/json', '.html': 'text/html',
};
const PAGE = `<!doctype html><meta charset="utf-8"><title>pp render harness</title>
<link rel="stylesheet" href="/fonts.css">
<body style="margin:0;background:#333"><script src="/bundle.js"></script>`;
// Fontsource CSS, hand-assembled so the harness serves the SAME self-hosted
// faces Fonts.astro imports (400/500/600/700 Instrument Sans, 500/600/700
// Newsreader, 400/500 JetBrains Mono).
const face = (fam, file, wt) =>
  `@font-face{font-family:"${fam}";font-style:normal;font-weight:${wt};font-display:block;src:url("${file}") format("woff2");}`;
const FONTS_CSS = [
  ...[400, 500, 600, 700].map((w) =>
    face('Instrument Sans', `/nm/@fontsource/instrument-sans/files/instrument-sans-latin-${w}-normal.woff2`, w)),
  ...[500, 600, 700].map((w) =>
    face('Newsreader', `/nm/@fontsource/newsreader/files/newsreader-latin-${w}-normal.woff2`, w)),
  ...[400, 500].map((w) =>
    face('JetBrains Mono', `/nm/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-${w}-normal.woff2`, w)),
  // Legacy Barlow faces — only so a `git stash`-ed BEFORE render (the pre-migration
  // Barlow typography) is faithful for side-by-side comparison. Unused after the
  // Newsreader / Instrument Sans / JetBrains Mono migration.
  ...[700, 800, 900].map((w) =>
    face('Barlow Condensed', `/nm/@fontsource/barlow-condensed/files/barlow-condensed-latin-${w}-normal.woff2`, w)),
  ...[400, 500, 600, 700].map((w) =>
    face('Barlow', `/nm/@fontsource/barlow/files/barlow-latin-${w}-normal.woff2`, w)),
].join('\n');

const server = createServer(async (req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  try {
    if (url === '/' || url === '/index.html') return send(res, '.html', PAGE);
    if (url === '/bundle.js') return send(res, '.js', bundleJs);
    if (url === '/fonts.css') return send(res, '.css', FONTS_CSS);
    const file = url.startsWith('/nm/')
      ? path.join(ROOT, 'node_modules', url.slice(4))
      : path.join(ROOT, 'public', url);
    if (!file.startsWith(ROOT)) throw new Error('path escape');
    send(res, path.extname(file), await readFile(file));
  } catch {
    res.writeHead(404).end('not found');
  }
});
function send(res, ext, body) {
  res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream' }).end(body);
}
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

// ── 3. drive it with playwright ──────────────────────────────────────────────
const PLAYWRIGHT_PKG = process.env.PLAYWRIGHT_PKG || 'playwright';
const { chromium } = await import(PLAYWRIGHT_PKG);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log(`  [page:${m.type()}]`, m.text()); });
await page.goto(base);
await page.evaluate(async () => {
  await Promise.all([
    '700 36px "Newsreader"', '700 28px "Instrument Sans"', '600 14px "Instrument Sans"',
    '500 12px "Instrument Sans"', '700 10px "JetBrains Mono"', '500 9px "JetBrains Mono"',
    '400 9px "JetBrains Mono"',
  ].map((f) => document.fonts.load(f)));
  await document.fonts.ready;
});

// Which faces actually resolved? A face that never loads renders as a silent
// system fallback — the exact bug the prime lists exist to prevent.
const faceReport = await page.evaluate(() => {
  const want = [
    ['Newsreader', 700], ['Instrument Sans', 500], ['Instrument Sans', 600],
    ['Instrument Sans', 700], ['JetBrains Mono', 400], ['JetBrains Mono', 500],
  ];
  return want.map(([fam, wt]) => `${fam} ${wt}: ${document.fonts.check(`${wt} 16px "${fam}"`)}`);
});
console.log('font faces loaded:\n  ' + faceReport.join('\n  '));

// Are Instrument Sans digits fixed-advance (tabular) by default? Canvas 2D has
// no font-variant-numeric, so this is the only way to know.
const digits = await page.evaluate(() => {
  const c = document.createElement('canvas').getContext('2d');
  const out = {};
  for (const font of ['700 28px "Instrument Sans"', '500 12px "Instrument Sans"', '700 28px "JetBrains Mono"']) {
    c.font = font;
    out[font] = '0123456789'.split('').map((d) => +c.measureText(d.repeat(10)).width.toFixed(3));
  }
  return out;
});
console.log('digit advance widths (x10 glyphs):');
for (const [f, ws] of Object.entries(digits)) {
  const uniq = [...new Set(ws)];
  console.log(`  ${f} → ${uniq.length === 1 ? `TABULAR (all ${uniq[0]})` : `PROPORTIONAL (min ${Math.min(...ws)} max ${Math.max(...ws)})`}`);
}

// ── 4. scenarios (ALL FABRICATED — no production data) ───────────────────────
const team = (abbrev, name, short, score) => ({ abbrev, name, short_name: short, score });
const GAMES = {
  base: {
    game_id: '2023030234', date: '2023-05-03',
    away: team('EDM', 'Edmonton Oilers', 'Oilers', 3),
    home: team('VGK', 'Vegas Golden Knights', 'Golden Knights', 5),
    venue: 'T-Mobile Arena', last_period_type: 'REG', status: 'final',
  },
  longNames: {
    game_id: '2022020451', date: '2022-12-14',
    away: team('CBJ', 'Columbus Blue Jackets', 'Blue Jackets', 10),
    home: team('NJD', 'New Jersey Devils', 'Devils', 11),
    venue: 'Prudential Center', last_period_type: 'REG', status: 'final',
  },
  overtime: {
    game_id: '2024020088', date: '2024-10-22',
    away: team('TOR', 'Toronto Maple Leafs', 'Maple Leafs', 4),
    home: team('MTL', 'Montreal Canadiens', 'Canadiens', 5),
    venue: 'Bell Centre', last_period_type: '2OT', status: 'final',
  },
  shootout: {
    game_id: '2021020310', date: '2021-12-01',
    away: team('SEA', 'Seattle Kraken', 'Kraken', 2),
    home: team('TBL', 'Tampa Bay Lightning', 'Lightning', 3),
    venue: 'Amalie Arena', last_period_type: 'SO', status: 'final',
  },
  historic: {
    game_id: '2010020123', date: '2010-11-06',
    away: team('DET', 'Detroit Red Wings', 'Red Wings', 1),
    home: team('TOR', 'Toronto Maple Leafs', 'Maple Leafs', 2),
    venue: 'Scotiabank Arena', last_period_type: 'REG', status: 'final',
  },
  manualNoScore: {
    game_id: 'manual-abc123', date: '1998-02-11',
    away: team('NYR', 'New York Rangers', 'Rangers', NaN),
    home: team('NJD', 'New Jersey Devils', 'Devils', NaN),
    venue: null, last_period_type: null, status: 'final', is_manual: true,
    home_score: null, away_score: null,
  },
};
const BADGES = ['Hat Trick', 'Overtime Winner', 'Comeback Kid'];
const stub = (game, extra = {}) => ({
  game, anchor: null, handle: 'mattdonders', badges: BADGES,
  gameOrdinal: 37, arenaOrdinal: 6, codeStyle: 'qr', ...extra,
});

const PASSPORTS = {
  high: {
    counters: { games: 128, periods: 389, goals: 742, shots: 1234, playersSeen: 986 },
    arenas: { homeRinks: 19, total: 32, distinctBuildings: 24 },
    tiers: [
      { label: 'Games', rungName: 'Veteran', earned: true, progress: '128 / 250 to Legend' },
      { label: 'Goals', rungName: 'Legend', earned: true, progress: '1,500 goals' },
      { label: 'Shots', rungName: 'Collector', earned: true, progress: '1,234 / 2,000 to Archivist' },
      { label: 'Players', rungName: 'Scout', earned: true, progress: '986 / 1,000 to Bird Dog' },
      { label: 'Arenas', rungName: 'Wanderer', earned: false, progress: '19 / 20 to Wanderer' },
    ],
    badges: [
      { label: 'Overtime Thriller', rarity: '1 in 42 games', blurb: 'Attended a game decided in overtime' },
      { label: 'Hat Trick Witness', rarity: '1 in 18 games', blurb: 'Saw a player score three goals in one game' },
      { label: 'Double Overtime', rarity: '1 in 96 games', blurb: 'Attended a playoff game that needed two extra periods' },
    ],
    records: [
      { key: 'scoring', label: 'Highest Scoring', value: '11 goals', sub: 'CBJ @ NJD · Dec 14, 2022' },
      { key: 'longest', label: 'Longest Game', value: '3 periods (2OT)', sub: 'TOR @ MTL · Oct 22, 2024', total_time: '92:56' },
      { key: 'comeback', label: 'Biggest Comeback', value: '4 goals', sub: 'EDM @ VGK · May 3, 2023' },
    ],
    boxIncomplete: true, unverifiedCount: 3, handle: 'mattdonders',
  },
  low: {
    counters: { games: 2, periods: 6, goals: 7, shots: 61, playersSeen: 38 },
    arenas: { homeRinks: 1, total: 32, distinctBuildings: 1 },
    tiers: [
      { label: 'Games', rungName: 'Rookie', earned: false, progress: '2 / 5 to Rookie' },
      { label: 'Goals', rungName: 'Rookie', earned: false, progress: '7 / 25 to Rookie' },
      { label: 'Shots', rungName: 'Rookie', earned: false, progress: '61 / 100 to Rookie' },
      { label: 'Players', rungName: 'Rookie', earned: false, progress: '38 / 50 to Rookie' },
      { label: 'Arenas', rungName: 'Rookie', earned: false, progress: '1 / 3 to Rookie' },
    ],
    badges: [], records: [], boxIncomplete: false, unverifiedCount: 0, handle: null,
  },
};

const SCENARIOS = [
  ['A-stub-representative', () => window.PPShare.drawTicketStub(ARG), stub(GAMES.base)],
  ['A-stub-long-names-double-digit', () => window.PPShare.drawTicketStub(ARG), stub(GAMES.longNames)],
  ['A-stub-overtime-playoff', () => window.PPShare.drawTicketStub(ARG), stub(GAMES.overtime)],
  ['A-stub-shootout', () => window.PPShare.drawTicketStub(ARG), stub(GAMES.shootout)],
  ['A-stub-historic-date-long-arena', () => window.PPShare.drawTicketStub(ARG), stub(GAMES.historic)],
  ['A-stub-no-handle-no-badges', () => window.PPShare.drawTicketStub(ARG), stub(GAMES.base, { handle: null, badges: [], gameOrdinal: 1, arenaOrdinal: 1 })],
  ['A-stub-manual-no-score', () => window.PPShare.drawTicketStub(ARG), stub(GAMES.manualNoScore, { badges: [] })],
  ['B-grid-two-games', () => window.PPShare.drawStubGrid(ARG), [stub(GAMES.base), stub(GAMES.longNames)]],
  ['C-passport-high-data', () => window.PPShare.drawPassportCard(ARG), PASSPORTS.high],
  ['C-passport-low-data', () => window.PPShare.drawPassportCard(ARG), PASSPORTS.low],
];

await fs.mkdir(OUT, { recursive: true });
for (const [name, fn, arg] of SCENARIOS) {
  const dataUrl = await page.evaluate(
    async ({ src, arg }) => {
      window.ARG = arg;
      // eslint-disable-next-line no-new-func
      const canvas = await new Function('ARG', `return (${src})()`)(arg);
      return { url: canvas.toDataURL('image/png'), w: canvas.width, h: canvas.height };
    },
    { src: fn.toString(), arg },
  );
  const file = path.join(OUT, `${name}.png`);
  await fs.writeFile(file, Buffer.from(dataUrl.url.split(',')[1], 'base64'));
  console.log(`✓ ${name}  ${dataUrl.w}×${dataUrl.h}  → ${file}`);
}

await browser.close();
server.close();
