/** Render the Season card for a limited historical season (Kastelic 2021-22).
 *  PHASE env (before|after) names the output file. */
import { chromium } from '/Users/mattdonders/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';
import { createServer } from 'http';
import { createReadStream, existsSync, writeFileSync, statSync } from 'fs';
import { extname, join, dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = join(__dirname, '..', 'dist');
const MIME = { '.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.json':'application/json','.woff2':'font/woff2','.woff':'font/woff','.ttf':'font/ttf' };
function serveDir(distDir, port){return new Promise(resolve=>{const s=createServer((req,res)=>{let u=req.url.split('?')[0];if(u.endsWith('/'))u+='index.html';let f=join(distDir,u);if(!existsSync(f))f=f+'.html';if(!existsSync(f)){res.writeHead(404);res.end('404');return;}res.writeHead(200,{'Content-Type':MIME[extname(f)]||'application/octet-stream'});createReadStream(f).pipe(res);});s.listen(port,'localhost',()=>resolve(s));});}
(async()=>{
  const PHASE = process.env.PHASE || 'after';
  const PORT=4340; const server=await serveDir(DIST_DIR,PORT);
  const browser=await chromium.launch({headless:true});
  const ctx=await browser.newContext({deviceScaleFactor:2});
  const page=await ctx.newPage();
  await page.route('https://api.hockeygamebot.com/**',async r=>{await r.fulfill({status:200,contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==','base64')});});
  await page.goto(`http://localhost:${PORT}/stats/player/mark-kastelic/`,{waitUntil:'networkidle'});
  await page.evaluate(()=>document.fonts.ready);
  // select the limited historical season, then render the Season card
  await page.evaluate(()=>document.dispatchEvent(new CustomEvent('hgb:season-select',{detail:{season:'2021-22'}})));
  await page.click('#download-season-card-btn');
  await page.waitForSelector('#hgb-card-modal img',{timeout:30000});
  const dataUrl=await page.waitForFunction(()=>{const i=document.querySelector('#hgb-card-modal img');return i&&i.src&&i.src.startsWith('data:image/png')?i.src:null;},{timeout:30000}).then(h=>h.jsonValue());
  const p=`/tmp/season_ltd_${PHASE}.png`; writeFileSync(p,Buffer.from(dataUrl.split(',')[1],'base64'));
  console.log(`  ${p}: ${statSync(p).size} bytes`);
  await browser.close(); server.close();
})();
