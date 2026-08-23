/** Screenshot the rewritten /methodology page (light + dark) from the built dist/. */
import { chromium } from '/Users/mattdonders/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';
import { createServer } from 'http';
import { createReadStream, existsSync, statSync } from 'fs';
import { extname, join, dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = join(__dirname, '..', 'dist');
const MIME = { '.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.json':'application/json','.woff2':'font/woff2','.woff':'font/woff','.ttf':'font/ttf','.ico':'image/x-icon' };
function serveDir(distDir, port){return new Promise(resolve=>{const s=createServer((req,res)=>{let u=req.url.split('?')[0];if(u.endsWith('/'))u+='index.html';let f=join(distDir,u);if(!existsSync(f))f=f+'.html';if(!existsSync(f)&&existsSync(join(distDir,u,'index.html')))f=join(distDir,u,'index.html');if(!existsSync(f)){res.writeHead(404);res.end('404');return;}res.writeHead(200,{'Content-Type':MIME[extname(f)]||'application/octet-stream'});createReadStream(f).pipe(res);});s.listen(port,'localhost',()=>resolve(s));});}
(async()=>{
  const PORT=4341; const server=await serveDir(DIST_DIR,PORT);
  const browser=await chromium.launch({headless:true});
  for(const theme of ['light','dark']){
    const ctx=await browser.newContext({deviceScaleFactor:2, viewport:{width:1200,height:1400}, colorScheme:theme});
    const page=await ctx.newPage();
    await page.goto(`http://localhost:${PORT}/methodology/`,{waitUntil:'networkidle'});
    await page.evaluate((t)=>{document.documentElement.setAttribute('data-theme',t);}, theme);
    await page.evaluate(()=>document.fonts.ready);
    const p=`/tmp/methodology_${theme}.png`;
    await page.screenshot({path:p, fullPage:true});
    console.log(`  ${p}: ${statSync(p).size} bytes`);
    await ctx.close();
  }
  await browser.close(); server.close();
  console.log('Done.');
})();
