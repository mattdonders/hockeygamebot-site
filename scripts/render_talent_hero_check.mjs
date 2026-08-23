/**
 * Render-test the migrated Talent+Shotmap card hero (50/50 TALENT% | TOI/G with
 * LTD SAMPLE / EARLY SAMPLE qualifiers). Serves dist/, clicks the Talent card
 * button, reads the modal <img> data URL (full-res canvas), writes PNGs to /tmp.
 * Covers all three hero states: full, limited_sample+value, null-pct+early.
 */
import { chromium } from '/Users/mattdonders/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';
import { createServer } from 'http';
import { createReadStream, existsSync, writeFileSync, statSync } from 'fs';
import { extname, join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = join(__dirname, '..', 'dist');
const MIME = { '.html':'text/html', '.js':'application/javascript', '.css':'text/css', '.png':'image/png', '.svg':'image/svg+xml', '.json':'application/json', '.woff2':'font/woff2', '.woff':'font/woff', '.ttf':'font/ttf' };

function serveDir(distDir, port) {
  return new Promise(resolve => {
    const server = createServer((req, res) => {
      let urlPath = req.url.split('?')[0];
      if (urlPath.endsWith('/')) urlPath += 'index.html';
      let filePath = join(distDir, urlPath);
      if (!existsSync(filePath)) filePath = filePath + '.html';
      if (!existsSync(filePath)) { res.writeHead(404); res.end('Not found: ' + urlPath); return; }
      res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] || 'application/octet-stream' });
      createReadStream(filePath).pipe(res);
    });
    server.listen(port, 'localhost', () => resolve(server));
  });
}

(async () => {
  const PORT = 4337;
  const server = await serveDir(DIST_DIR, PORT);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Headshots → 1x1 transparent PNG so image loads resolve (layout, not portrait).
  await page.route('https://api.hockeygamebot.com/**', async route => {
    const png1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
    await route.fulfill({ status: 200, contentType: 'image/png', body: png1x1 });
  });

  const players = [
    { slug: 'connor-mcdavid-8478402',   out: '/tmp/talent_hero_mcdavid.png',  note: 'full → no qualifiers' },
    { slug: 'matthew-schaefer-8485366', out: '/tmp/talent_hero_schaefer.png', note: 'limited_sample pct96 gp82 → LTD SAMPLE only' },
    { slug: 'tristan-luneau-8483482',   out: '/tmp/talent_hero_luneau.png',   note: 'limited_sample pct=null gp1 → TALENT — + LTD + EARLY·1 GP' },
  ];

  for (const p of players) {
    const url = `http://localhost:${PORT}/stats/player/${p.slug}/`;
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.fonts && document.fonts.status === 'loaded' || document.fonts.ready);
    await page.evaluate(() => document.fonts.ready);
    await page.click('#download-rating-card-btn');
    await page.waitForSelector('#hgb-card-modal img', { timeout: 30000 });
    // Wait for the <img> src (data URL) to be populated
    const dataUrl = await page.waitForFunction(() => {
      const img = document.querySelector('#hgb-card-modal img');
      return img && img.src && img.src.startsWith('data:image/png') ? img.src : null;
    }, { timeout: 30000 }).then(h => h.jsonValue());
    const b64 = dataUrl.split(',')[1];
    writeFileSync(p.out, Buffer.from(b64, 'base64'));
    console.log(`  ${p.slug}: ${statSync(p.out).size} bytes  (${p.note})`);
    // Close modal before next
    await page.evaluate(() => document.getElementById('hgb-card-modal')?.remove());
  }

  await browser.close();
  server.close();
  console.log('Done.');
})();
