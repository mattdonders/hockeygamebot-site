/**
 * Decision mocks for the two deferred Talent-card tasks. Renders REAL pixels (not
 * ASCII) so the design call is made on what ships, using the production page's own
 * @font-face set (JetBrains Mono ships only 400/500 latin → 700 is faux-bold at
 * runtime; embedding fonts would misrepresent that, so we render in-page instead).
 *
 *   Masthead LTD flag  → 3 variants: pill-beneath / asterisk+footnote / label-suffix
 *   History TOI/G      → 3 variants: table-column / 4th-hero-tile / current (no change)
 *
 * Serves dist/, injects each variant, screenshots to /tmp/mock_*.png.
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
  const PORT = 4338;
  const server = await serveDir(DIST_DIR, PORT);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ deviceScaleFactor: 2 });
  const page = await context.newPage();
  await page.route('https://api.hockeygamebot.com/**', async route => {
    const png1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
    await route.fulfill({ status: 200, contentType: 'image/png', body: png1x1 });
  });

  // ── MASTHEAD (Schaefer = real limited_sample) ────────────────────────────
  await page.goto(`http://localhost:${PORT}/stats/player/matthew-schaefer-8485366/`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);

  async function shotMast(name, mutate) {
    await page.evaluate(mutate);
    await page.evaluate(() => document.fonts.ready);
    const el = await page.$('.mast-card');
    await el.screenshot({ path: `/tmp/mock_masthead_${name}.png` });
    await page.reload({ waitUntil: 'networkidle' });        // reset DOM
    await page.evaluate(() => document.fonts.ready);
  }

  // V1 — pill beneath value
  await shotMast('pill', () => {
    const tile = document.querySelectorAll('.mast-right .hero-tile')[0];
    const pill = document.createElement('div');
    pill.textContent = 'LTD SAMPLE';
    pill.style.cssText = 'margin-top:8px;display:inline-block;font-family:var(--mono,"JetBrains Mono",monospace);font-size:10px;font-weight:700;letter-spacing:0.06em;color:#E8002D;background:rgba(232,0,45,0.10);padding:3px 8px;border-radius:4px;';
    tile.appendChild(pill);
  });

  // V2 — asterisk on value + footnote under the card
  await shotMast('asterisk', () => {
    const big = document.querySelectorAll('.mast-right .hero-tile')[0].querySelector('.tile-big');
    const star = document.createElement('sup');
    star.textContent = '*';
    star.style.cssText = 'font-size:0.5em;color:#E8002D;vertical-align:super;margin-left:2px;';
    big.appendChild(star);
    const card = document.querySelector('.mast-card');
    const foot = document.createElement('div');
    foot.textContent = '* limited multi-year sample';
    foot.style.cssText = 'position:absolute;bottom:8px;right:16px;font-family:var(--mono,"JetBrains Mono",monospace);font-size:10px;color:rgba(13,13,20,0.5);letter-spacing:0.02em;';
    card.style.position = 'relative';
    card.appendChild(foot);
  });

  // V3 — label suffix
  await shotMast('suffix', () => {
    const label = document.querySelectorAll('.mast-right .hero-tile')[0].querySelector('.tile-label');
    label.innerHTML = 'Talent <span style="color:#E8002D;font-weight:800;">· LTD</span>';
  });

  // ── HISTORY CARD (McDavid-like data, drawn into an injected canvas) ───────
  const HISTORY_DRAW = (mode) => {
    // constants mirror drawHistoryCard in [slug].astro
    const INK='#0D0D14', INK06='rgba(13,13,20,0.06)', INK10='rgba(13,13,20,0.10)',
          INK14='rgba(13,13,20,0.14)', INK32='rgba(13,13,20,0.32)', INK48='rgba(13,13,20,0.48)';
    const TEAM_C='#FF4C00'; // EDM orange
    const SCALE=2, W=560, PAD=28;
    const HERO_H=88, SEP_H=1, COL_H=36, ROW_H=36;
    const tierColor=(v)=> v==null?INK32 : v>=70?'#137333' : v<=30?'#E8002D' : INK48;

    const rows = [
      {season:'2025-26', gp:12, toi:'22:59', war:99, imp:98, gf:61, xgf:60},
      {season:'2024-25', gp:82, toi:'22:21', war:99, imp:99, gf:58, xgf:57},
      {season:'2023-24', gp:76, toi:'21:45', war:98, imp:98, gf:60, xgf:59},
      {season:'2022-23', gp:82, toi:'22:18', war:99, imp:99, gf:59, xgf:58},
      {season:'2021-22', gp:80, toi:'21:41', war:98, imp:97, gf:57, xgf:56},
      {season:'2020-21', gp:56, toi:'21:24', war:99, imp:98, gf:62, xgf:61},
    ];
    const N = rows.length;
    const H = HERO_H + SEP_H + COL_H + N*ROW_H + 10;

    const cv = document.createElement('canvas');
    cv.width = W*SCALE; cv.height = H*SCALE;
    cv.style.width = W+'px'; cv.style.height = H+'px';
    const ctx = cv.getContext('2d');
    ctx.scale(SCALE, SCALE);
    ctx.fillStyle='#FFFFFF'; ctx.fillRect(0,0,W,H);

    let y=0;
    // hero: headshot circle + tiles
    const heroR=38, hsCX=PAD+heroR, hsCY=y+HERO_H/2;
    ctx.beginPath(); ctx.arc(hsCX,hsCY,heroR,0,Math.PI*2);
    ctx.fillStyle='rgba(13,13,20,0.06)'; ctx.fill();
    ctx.strokeStyle=TEAM_C; ctx.lineWidth=2; ctx.stroke();
    ctx.font='800 22px "Barlow Condensed",sans-serif'; ctx.fillStyle=INK32;
    ctx.textBaseline='middle'; ctx.textAlign='center'; ctx.fillText('CM',hsCX,hsCY);

    const statX=hsCX+heroR+18;
    let heroStats=[
      {label:'HGB TALENT', big:'97%'},
      {label:'HGB WAR', big:'99%'},
      {label:'HGB GAME IMPACT', big:'98%'},
    ];
    if (mode==='herotile') heroStats.push({label:'TOI/G', big:'22:59'});
    const statW=(W-statX-PAD)/heroStats.length;
    for(let i=0;i<heroStats.length;i++){
      const hs=heroStats[i]; const sx=statX+i*statW+statW/2;
      if(i>0){ctx.fillStyle=INK10; ctx.fillRect(statX+i*statW,y+14,1,HERO_H-28);}
      ctx.font='700 9px "Barlow Condensed",sans-serif'; ctx.fillStyle=INK32;
      ctx.textBaseline='top'; ctx.textAlign='center'; ctx.fillText(hs.label,sx,y+14);
      ctx.font='800 30px "Barlow Condensed",sans-serif';
      ctx.fillStyle = hs.label==='TOI/G' ? 'rgba(13,13,20,0.72)' : TEAM_C;
      ctx.textBaseline='top'; ctx.fillText(hs.big,sx,y+27);
    }
    ctx.fillStyle=INK14; ctx.fillRect(0,y+HERO_H-1,W,1);
    y+=HERO_H;
    ctx.fillStyle=INK10; ctx.fillRect(0,y,W,SEP_H); y+=SEP_H;

    // column headers
    const withTOI = (mode==='column');
    const labels = withTOI ? ['TOI/G','WAR','IMPACT','GF%','xGF%'] : ['WAR','IMPACT','GF%','xGF%'];
    const SEASON_W=120, COL1_X=PAD;
    const VAL_AREA=W-PAD-(PAD+SEASON_W);
    const VAL_COL_W=VAL_AREA/labels.length;
    const VAL_CX_0=PAD+SEASON_W+VAL_COL_W/2;
    const valCenterX=(i)=>VAL_CX_0+i*VAL_COL_W;
    ctx.font='700 10px "JetBrains Mono", monospace'; ctx.fillStyle=INK32;
    ctx.textBaseline='middle'; ctx.textAlign='left'; ctx.fillText('SEASON',COL1_X,y+COL_H/2);
    ctx.textAlign='center';
    labels.forEach((l,i)=>ctx.fillText(l,valCenterX(i),y+COL_H/2));
    ctx.fillStyle=INK10; ctx.fillRect(0,y+COL_H-1,W,1); y+=COL_H;

    // rows
    for(let ri=0;ri<N;ri++){
      const s=rows[ri]; const ry=y+ri*ROW_H; const rowY=ry+ROW_H/2;
      if(ri%2===0){ctx.fillStyle=INK06; ctx.fillRect(0,ry,W,ROW_H);}
      if(ri===0){ctx.fillStyle='rgba(255,76,0,0.08)'; ctx.fillRect(0,ry,W,ROW_H);}
      ctx.fillStyle=INK06; ctx.fillRect(0,ry+ROW_H-1,W,1);
      ctx.font= ri===0?'700 12px "JetBrains Mono", monospace':'500 12px "JetBrains Mono", monospace';
      ctx.fillStyle= ri===0?INK:INK48; ctx.textBaseline='middle'; ctx.textAlign='left';
      ctx.fillText(s.season.replace('-','–'),COL1_X,rowY);
      ctx.font='400 9px "JetBrains Mono", monospace'; ctx.fillStyle=INK32;
      ctx.fillText(s.gp+' GP',COL1_X+56,rowY);
      const cells = withTOI
        ? [{v:s.toi,kind:'toi'},{v:s.war,kind:'pct'},{v:s.imp,kind:'pct'},{v:s.gf,kind:'ice'},{v:s.xgf,kind:'ice'}]
        : [{v:s.war,kind:'pct'},{v:s.imp,kind:'pct'},{v:s.gf,kind:'ice'},{v:s.xgf,kind:'ice'}];
      cells.forEach((c,i)=>{
        const cx=valCenterX(i);
        if(c.kind==='toi'){
          ctx.font='700 13px "JetBrains Mono", monospace'; ctx.fillStyle='rgba(13,13,20,0.72)';
          ctx.textAlign='center'; ctx.fillText(c.v,cx,rowY);
        } else if(c.kind==='pct'){
          ctx.font='700 13px "JetBrains Mono", monospace'; ctx.fillStyle=tierColor(c.v);
          ctx.textAlign='center'; ctx.fillText(Math.round(c.v)+'%',cx,rowY);
        } else {
          const color=c.v>=52?'#15803d':c.v>=48?'#888888':'#E8002D';
          ctx.font='700 13px "JetBrains Mono", monospace'; ctx.fillStyle=color;
          ctx.textAlign='center'; ctx.fillText(c.v,cx,rowY);
        }
      });
    }
    return cv.toDataURL('image/png');
  };

  for (const mode of ['column','herotile','current']) {
    const dataUrl = await page.evaluate(HISTORY_DRAW, mode);
    writeFileSync(`/tmp/mock_history_${mode}.png`, Buffer.from(dataUrl.split(',')[1],'base64'));
  }

  await browser.close();
  server.close();
  for (const f of ['masthead_pill','masthead_asterisk','masthead_suffix','history_column','history_herotile','history_current']) {
    const p=`/tmp/mock_${f}.png`; console.log(`  ${f}: ${statSync(p).size} bytes`);
  }
  console.log('Done.');
})();
