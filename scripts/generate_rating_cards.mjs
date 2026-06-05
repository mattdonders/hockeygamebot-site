/**
 * Generate rating card PNGs for two players using Playwright.
 * Serves the built dist/ directory, navigates to each player page,
 * clicks the "Rating Card →" button, waits for the download, saves to /tmp/.
 */
import { chromium } from '/Users/mattdonders/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';
import { createServer } from 'http';
import { createReadStream, existsSync, statSync } from 'fs';
import { extname, join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import * as fs from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = join(__dirname, '..', 'dist');

const MIME = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.woff':  'font/woff',
  '.ttf':   'font/ttf',
};

function serveDir(distDir, port) {
  return new Promise(resolve => {
    const server = createServer((req, res) => {
      let urlPath = req.url.split('?')[0];
      if (urlPath.endsWith('/')) urlPath += 'index.html';
      let filePath = join(distDir, urlPath);
      if (!existsSync(filePath)) {
        filePath = filePath + '.html';
      }
      if (!existsSync(filePath)) {
        res.writeHead(404); res.end('Not found: ' + urlPath);
        return;
      }
      const ext = extname(filePath);
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      createReadStream(filePath).pipe(res);
    });
    server.listen(port, 'localhost', () => {
      console.log(`Serving dist/ on http://localhost:${port}`);
      resolve(server);
    });
  });
}

async function generateCard(page, slug, outputPath) {
  console.log(`\nGenerating rating card for ${slug}...`);

  const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
  await page.click('#download-rating-card-btn');
  const download = await downloadPromise;
  await download.saveAs(outputPath);
  console.log(`  Saved to ${outputPath}`);
}

(async () => {
  const PORT = 4333;
  const server = await serveDir(DIST_DIR, PORT);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  // Intercept requests to external resources (headshots proxy) — return a transparent PNG
  await page.route('https://api.hockeygamebot.com/**', async route => {
    // Return a small 1x1 transparent PNG so image loads work
    const png1x1 = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );
    await route.fulfill({ status: 200, contentType: 'image/png', body: png1x1 });
  });

  const players = [
    { slug: 'connor-mcdavid-8478402', output: '/tmp/rating_v_final_mcdavid.png' },
    { slug: 'mason-lohrei-8482511',   output: '/tmp/rating_v_final_lohrei.png'  },
  ];

  for (const p of players) {
    const url = `http://localhost:${PORT}/stats/player/${p.slug}/`;
    console.log(`Navigating to ${url}`);
    await page.goto(url, { waitUntil: 'networkidle' });
    // Wait for fonts
    await page.waitForFunction(() => document.fonts.ready);
    await generateCard(page, p.slug, p.output);
    // Confirm file exists
    if (existsSync(p.output)) {
      const size = statSync(p.output).size;
      console.log(`  File size: ${size} bytes`);
    } else {
      console.error(`  ERROR: file not found at ${p.output}`);
    }
  }

  await browser.close();
  server.close();
  console.log('\nDone!');
})();
