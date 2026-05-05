// game-modal.js — Shared game modal logic for scoreboard.astro and index.astro
// Loaded via <script src="/js/game-modal.js" defer> AFTER hgb-charts.js.
// Reads game card data from window.HGB_GAME_CARDS[gameId].
// Calls buildWpChart, buildXgFlowChart, pickTeamColor, ensureReadable from hgb-charts.js.

(function () {
  'use strict';

  // ─────────────────────────────────────────────────────────────────────────────
  // CONSTANTS
  // ─────────────────────────────────────────────────────────────────────────────
  const API_BASE = 'https://api.hockeygamebot.com';
  const LOGO_BASE = 'https://assets.nhle.com/logos/nhl/svg';
  const BRIGHTCOVE_PLAYER = 'https://players.brightcove.net/6415718365001/EXtG1xJ7H_default/index.html';

  // ─────────────────────────────────────────────────────────────────────────────
  // STATE
  // ─────────────────────────────────────────────────────────────────────────────
  let _modalOpener = null;

  // ─────────────────────────────────────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────────────────────────────────────
  function goalPeriodStr(t) {
    if (t <= 1200) return `P1 ${secToMs(t % 1200)}`;
    if (t <= 2400) return `P2 ${secToMs(t % 1200)}`;
    if (t <= 3600) return `P3 ${secToMs(t % 1200)}`;
    return `OT ${secToMs(t % 1200)}`;
  }

  function secToMs(s) {
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }

  function strengthBadge(s) {
    if (s === 'pp') return `<span class="modal-strength pp">PP</span>`;
    if (s === 'sh') return `<span class="modal-strength sh">SH</span>`;
    if (s === 'en') return `<span class="modal-strength en">EN</span>`;
    return '';
  }

  function buildGoalCard(g, color, teamAbbr) {
    const assists = (g.assists || []).join(', ');
    const scorerLine = g.scorer
      ? `🚨 ${g.scorer}${assists ? `<span class="modal-gc-assists"> · ${assists}</span>` : ''}`
      : '';

    // WP delta badge — team color background, white/black text based on luminance
    let wpBadge = '';
    if (g.wpDelta != null) {
      const sign = g.wpDelta >= 0 ? '+' : '';
      const tc = color && color.startsWith('#')
        ? (() => {
            const r = parseInt(color.slice(1, 3), 16);
            const g2 = parseInt(color.slice(3, 5), 16);
            const b = parseInt(color.slice(5, 7), 16);
            return (0.299 * r + 0.587 * g2 + 0.114 * b) > 140 ? '#000' : '#fff';
          })()
        : '#fff';
      wpBadge = `<span class="modal-gc-wp-delta" style="color:${tc};background:${color}cc">${sign}${(g.wpDelta * 100).toFixed(1)}%</span>`;
    }

    // Play button — highlight clip only (EDGE disabled, B2 egress concern)
    const playBtn = g.highlight_clip_id
      ? `<button class="modal-gc-play"
           data-url=""
           data-clip-id="${g.highlight_clip_id || ''}"
           data-scorer="${(g.scorer || '').replace(/"/g, '&quot;')}"
           data-assists="${assists.replace(/"/g, '&quot;')}"
           data-team="${teamAbbr}"
           data-wp-b="${g.scoringWpB != null ? g.scoringWpB.toFixed(1) : ''}"
           data-wp-a="${g.scoringWpA != null ? g.scoringWpA.toFixed(1) : ''}"
           data-wp-delta="${g.wpDelta != null ? (g.wpDelta * 100).toFixed(1) : ''}"
           aria-label="Watch goal replay">▶</button>`
      : '';

    return `<div class="modal-goal-card">
      <div class="modal-gc-top">
        <span class="modal-gc-abbr" style="color:${color}">${teamAbbr}</span>
        ${strengthBadge(g.strength)}
        <span class="modal-gc-score">${(g.score || '').replace('-', '–')}</span>
        <span class="modal-gc-time">${goalPeriodStr(g.t)}</span>
        ${wpBadge}
        ${playBtn}
      </div>
      ${scorerLine ? `<div class="modal-gc-scorer">${scorerLine}</div>` : ''}
    </div>`;
  }

  function buildGoalColumn(list, color, abbr, label) {
    return `<div class="modal-goals-col">
      <div class="modal-goals-col-hdr" style="color:${color}">${label}</div>
      ${list.length ? list.map(g => buildGoalCard(g, color, abbr)).join('') : '<div class="modal-no-goals">—</div>'}
    </div>`;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // MODAL OPEN / CLOSE
  // ─────────────────────────────────────────────────────────────────────────────
  function _hideModal() {
    document.getElementById('game-modal').style.display = 'none';
    document.body.style.overflow = '';
    _modalOpener && _modalOpener.focus();
    _modalOpener = null;
  }

  function closeModal() {
    _hideModal();
    if (location.search) history.replaceState({}, '', location.pathname);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SHARE / SCREENSHOT
  // ─────────────────────────────────────────────────────────────────────────────

  // Convert SVG <img> elements to letterboxed PNG data URLs.
  // html2canvas v1 ignores object-fit:contain, so we manually center the SVG
  // within the display bounding box and produce a same-size PNG.
  async function svgImgsToPng(container) {
    const imgs = Array.from(container.querySelectorAll('img[src]'));
    await Promise.all(imgs.map(img => new Promise(resolve => {
      const src = img.src;
      // @2x for retina — display dims from HTML attributes
      const dw = (parseInt(img.getAttribute('width')) || 60) * 2;
      const dh = (parseInt(img.getAttribute('height')) || 60) * 2;
      const tmp = new Image();
      tmp.onload = () => {
        const nw = tmp.naturalWidth || dw;
        const nh = tmp.naturalHeight || dh;
        // Letterbox: fit SVG within display box maintaining aspect ratio
        const svgRatio = nw / nh;
        const boxRatio = dw / dh;
        let sw, sh, sx, sy;
        if (svgRatio > boxRatio) {
          sw = dw; sh = Math.round(dw / svgRatio);
          sx = 0; sy = Math.round((dh - sh) / 2);
        } else {
          sh = dh; sw = Math.round(dh * svgRatio);
          sx = Math.round((dw - sw) / 2); sy = 0;
        }
        const c = document.createElement('canvas');
        c.width = dw; c.height = dh;
        c.getContext('2d').drawImage(tmp, sx, sy, sw, sh);
        try {
          img.src = c.toDataURL('image/png');
          img.style.objectFit = 'none'; // already letterboxed in the PNG
        } catch (e) { console.warn('[share] canvas draw failed:', src, e); }
        resolve();
      };
      tmp.onerror = resolve;
      tmp.src = src;
    })));
  }

  async function shareModal() {
    if (typeof html2canvas === 'undefined') return;
    const btn = document.getElementById('modal-share');
    btn.classList.add('capturing');
    btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.5"><circle cx="12" cy="12" r="10"/><polyline points="12 8 12 16"/></svg>';

    try {
      const panel = document.querySelector('.modal-panel');

      // Clone into a fixed 860px offscreen container so output is always wide
      const wrapper = document.createElement('div');
      wrapper.style.cssText = 'position:fixed;left:-9999px;top:0;width:860px;z-index:-1;';
      const clone = panel.cloneNode(true);
      clone.style.cssText = 'width:860px;max-width:860px;max-height:none;overflow:visible;border-radius:14px;animation:none;';
      // Hide interactive chrome in the clone
      clone.querySelectorAll('.modal-actions').forEach(el => el.style.display = 'none');
      // Swap to two-column goals layout for share card
      clone.querySelectorAll('.modal-goals-list').forEach(el => { el.hidden = true; el.style.display = 'none'; });
      clone.querySelectorAll('.modal-goals-grid').forEach(el => { el.hidden = false; el.style.display = 'grid'; });
      // Remove onerror hide handlers so failed loads stay visible for debugging
      clone.querySelectorAll('img[onerror]').forEach(img => img.removeAttribute('onerror'));
      // Inject branding — top right, absolute so it overlays the header area
      const brand = document.createElement('div');
      brand.style.cssText = 'position:absolute;top:14px;right:24px;font-size:11px;font-weight:700;letter-spacing:0.1em;color:rgba(255,255,255,0.35);pointer-events:none;';
      brand.textContent = 'hockeygamebot.com';
      clone.appendChild(brand);
      wrapper.appendChild(clone);
      document.body.appendChild(wrapper);

      // Convert SVG imgs → PNG data URLs (html2canvas can't render SVG img tags)
      await svgImgsToPng(clone);

      // Wait a frame for layout
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

      const canvas = await html2canvas(clone, {
        backgroundColor: '#0d0d0d',
        scale: 2,
        useCORS: true,
        allowTaint: false,
        logging: false,
        width: 860,
        windowWidth: 860,
      });

      document.body.removeChild(wrapper);

      canvas.toBlob(async blob => {
        const file = new File([blob], 'game.png', { type: 'image/png' });
        const isMobile = navigator.maxTouchPoints > 0 && window.matchMedia('(pointer: coarse)').matches;
        if (isMobile && navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file] }).catch(() => {});
        } else {
          const a = document.createElement('a');
          a.href = canvas.toDataURL('image/png');
          a.download = 'game-card.png';
          a.click();
        }
      }, 'image/png');
    } catch (e) {
      console.error('shareModal:', e);
    } finally {
      btn.classList.remove('capturing');
      btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>';
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // OPEN MODAL
  // ─────────────────────────────────────────────────────────────────────────────
  async function openModal(gameId, { push = true } = {}) {
    const modal = document.getElementById('game-modal');
    const content = document.getElementById('modal-content');
    _modalOpener = document.activeElement;
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    content.innerHTML = '<div class="modal-loading">Loading…</div>';
    document.getElementById('modal-close').focus();
    if (push) history.pushState({ gameId }, '', `?game=${gameId}`);

    let flow, eventsData;
    try {
      const [flowResp, evResp] = await Promise.all([
        fetch(`${API_BASE}/v1/games/${gameId}/flow`, { cache: 'no-store' }),
        fetch(`${API_BASE}/v1/games/${gameId}/events`, { cache: 'no-store' })
      ]);

      if (flowResp.ok) {
        flow = await flowResp.json();
      } else {
        const preview = await flowResp.text().then(t => t.slice(0, 500)).catch(() => '');
        console.warn(`[HGB flow] ${flowResp.status}${preview ? ` — ${preview}` : ''}`);
        flow = null;
      }

      if (evResp.ok) {
        eventsData = await evResp.json();
      } else {
        const preview = await evResp.text().then(t => t.slice(0, 500)).catch(() => '');
        console.warn(`[HGB events] ${evResp.status}${preview ? ` — ${preview}` : ''}`);
        eventsData = null;
      }
    } catch {
      content.innerHTML = '<div class="modal-loading">Failed to load game data.</div>';
      return;
    }

    const card = (window.HGB_GAME_CARDS || {})[gameId];
    if (!card) { content.innerHTML = '<div class="modal-loading">Game not found.</div>'; return; }
    modal.setAttribute('aria-label', `${card.away} at ${card.home}`);

    const flowOk = flow != null;
    const points = flowOk ? (flow.points || []).filter(p => p.wp != null).sort((a, b) => a.t - b.t) : [];
    // Anchor line to game start at home-team advantage baseline if first data point comes in late
    if (points.length && points[0].t > 0) points.unshift({ t: 0, wp: 0.5513 });
    // For final games, force the last WP point to the definitive outcome (1.0 home win / 0.0 away win)
    if (card.isFinal && points.length) {
      const finalWp = card.homeScore > card.awayScore ? 1.0 : 0.0;
      points[points.length - 1] = { ...points[points.length - 1], wp: finalWp };
    }
    const goals = flowOk ? (flow.goals || []).map(g => ({ ...g, isHome: g.is_home })) : [];

    // Compute WP delta for each goal (scoring team's perspective).
    //
    // Problem: the bot sometimes stores WP from a previous goal's computation at the
    // next goal's event timestamp (when the previous GOAL event had no WP in its payload).
    // This corrupts wpB if we naively take the last WP point before each goal.
    //
    // Fix: two-pass approach.
    // Pass 1 — for every goal, compute "effective post-goal WP" = after[0].wp (first WP
    //           data point strictly after the goal timestamp — always the freshest post-goal state).
    // Pass 2 — for each goal's wpB, prefer the effectiveWpAfter of the immediately preceding
    //           goal over the last raw data point if that goal was more recent.
    //           This chains goals together so a goal with no stored WP doesn't corrupt
    //           the delta of the next goal.
    const sortedGoals = goals.slice().sort((a, b) => a.t - b.t);
    const effectiveWpAfter = {};
    for (const g of sortedGoals) {
      const after = points.filter(p => p.t > g.t);
      effectiveWpAfter[g.t] = after.length ? after[0].wp : (points.length ? points[points.length - 1].wp : null);
    }

    for (const g of goals) {
      const wpA = effectiveWpAfter[g.t];
      const prevGoal = sortedGoals.filter(pg => pg.t < g.t).pop();
      const lastDataPt = points.filter(p => p.t < g.t).pop();
      let wpB = null;
      if (prevGoal != null && effectiveWpAfter[prevGoal.t] != null
          && (!lastDataPt || prevGoal.t >= lastDataPt.t)) {
        wpB = effectiveWpAfter[prevGoal.t]; // use prior goal's settled WP as baseline
      } else if (lastDataPt) {
        wpB = lastDataPt.wp;
      }
      if (wpB != null && wpA != null) {
        const rawDelta = wpA - wpB; // positive = better for home
        const scorerDelta = g.isHome ? rawDelta : -rawDelta;
        // Clamp to 0 — negative means corrupted/stale pre-goal WP data, never show minus badge
        g.wpDelta = Math.max(0, scorerDelta);
        g.scoringWpB = (g.isHome ? wpB : 1 - wpB) * 100;
        g.scoringWpA = (g.isHome ? wpA : 1 - wpA) * 100;
      }
    }

    // tMax: for live games, stretch to at least the end of the current period so a
    // single early goal doesn't collapse the chart to a tiny sliver.
    // Playoff OT periods are 20 min (1200s); regular season OT is 5 min (300s).
    // Infer playoff from game ID: positions 4-5 === '03' (e.g. 2025030101).
    const lastPointT = points.length ? points[points.length - 1].t : 0;
    const isPlayoffGame = String(card.id || '').slice(4, 6) === '03';
    const otPeriodSecs = isPlayoffGame ? 1200 : 300;
    const periodEndT = card.isFinal ? 0 : (() => {
      const p = card.period || 1;
      return p <= 3 ? p * 1200 : 3600 + (p - 3) * otPeriodSecs;
    })();
    const tMax = Math.max(lastPointT, periodEndT) || 3600;

    const sc = (a, b) => a > b ? 'lead' : a < b ? 'trail' : 'tie';
    const ac = sc(card.awayScore, card.homeScore);
    const hc = sc(card.homeScore, card.awayScore);

    function periodLabel(period, isOT) {
      if (isOT || period >= 4) return period === 5 ? 'SO' : 'OT';
      return ['', '1ST', '2ND', '3RD'][period] || `P${period}`;
    }

    const periodStr = card.isFinal
      ? (card.isOT ? 'FINAL · OT' : card.period > 4 ? 'FINAL · SO' : 'FINAL')
      : card.inIntermission
        ? `${periodLabel(card.period, card.isOT)} INT · ${card.clock}`
        : `${periodLabel(card.period, card.isOT)} · ${card.clock}`;

    const logoUrl = abbr => `${LOGO_BASE}/${abbr}_light.svg`;
    const logoImg = (abbr, dim) => `<img src="${logoUrl(abbr)}" width="60" height="60" style="object-fit:contain${dim ? ';opacity:0.3;filter:grayscale(0.5)' : ''}" onerror="this.style.display='none'">`;

    const xgEvents = eventsData?.events || [];
    const xgEvents5v5 = xgEvents.filter(ev => ev.payload?.situationCode === '1551');

    // Compute totals from events (more accurate than card values which are all-situations)
    function calcXgTotals(evs) {
      let home = 0, away = 0;
      for (const ev of evs) {
        if (ev.event_type !== 'SHOT_ON_GOAL' && ev.event_type !== 'MISSED_SHOT' && ev.event_type !== 'GOAL') continue;
        const xg = parseFloat(ev.payload?.xg);
        if (isNaN(xg) || xg <= 0) continue;
        const isHome = ev.event_team_id != null && ev.event_team_id === ev.home_team_id;
        if (isHome) home += xg; else away += xg;
      }
      return { home: home.toFixed(1), away: away.toFixed(1) };
    }
    const totalsAll = calcXgTotals(xgEvents);
    const totals5v5 = calcXgTotals(xgEvents5v5);

    const _unavailable = `<div class="modal-no-chart" style="font-style:italic">Unavailable.</div>`;
    const wpInner = !flowOk
      ? _unavailable
      : points.length >= 2
        ? buildWpChart(points, goals, card.home, card.away, card.homeColor, card.teamColor, tMax)
        : `<div class="modal-no-chart">Win probability chart will appear once the game is underway.</div>`;
    const xgInner5v5 = eventsData == null ? _unavailable : buildXgFlowChart(xgEvents5v5, goals, card.home, card.away, card.homeColor, card.teamColor, tMax);
    const xgInnerAll = eventsData == null ? _unavailable : buildXgFlowChart(xgEvents, goals, card.home, card.away, card.homeColor, card.teamColor, tMax);

    const chartHtml = `<div class="modal-chart-wrap" id="mc-${gameId}">
      <div class="modal-tabs">
        <button class="modal-tab-btn active" data-tab="wp">Win %</button>
        <button class="modal-tab-btn" data-tab="xg5v5">5V5 xG</button>
        <button class="modal-tab-btn" data-tab="xgall">All xG</button>
      </div>
      <div class="modal-tab-panel active" data-panel="wp">${wpInner}</div>
      <div class="modal-tab-panel" data-panel="xg5v5">${xgInner5v5}</div>
      <div class="modal-tab-panel" data-panel="xgall">${xgInnerAll}</div>
    </div>`;

    // For FINAL games, force WP to 100/0 based on winner — model rarely reaches exactly 100%
    const homeWpPct = card.isFinal
      ? (card.homeScore >= card.awayScore ? 100 : 0)
      : (card.winProbability != null ? Math.round(card.winProbability * 100) : null);
    const awayWpPct = homeWpPct != null ? 100 - homeWpPct : null;
    const awayReadable = ensureReadable(card.teamColor);
    const homeReadable = ensureReadable(card.homeColor);
    // Default header xG to 5v5 if we have event data, else fall back to the
    // event-based all-situations sum. NEVER fall through to card.xgAway /
    // card.xgHome — those are written by a different code path (game_state
    // table) with a different model, so they can disagree with the per-event
    // xG sum badly enough to invert.
    const hasXgEvents = totals5v5.home > 0 || totals5v5.away > 0 || totalsAll.home > 0 || totalsAll.away > 0;
    const initAwayXg = (totals5v5.home > 0 || totals5v5.away > 0) ? totals5v5.away : totalsAll.away;
    const initHomeXg = (totals5v5.home > 0 || totals5v5.away > 0) ? totals5v5.home : totalsAll.home;
    const initLbl = (totals5v5.home > 0 || totals5v5.away > 0) ? 'xG 5V5' : 'xG';
    const awayXgHtml = hasXgEvents ? `<div class="modal-xg" id="modal-xg-away-${gameId}" style="color:${awayReadable}">${initAwayXg} <span class="modal-xg-lbl">${initLbl}</span></div>` : '';
    const homeXgHtml = hasXgEvents ? `<div class="modal-xg" id="modal-xg-home-${gameId}" style="color:${homeReadable}">${initHomeXg} <span class="modal-xg-lbl">${initLbl}</span></div>` : '';
    const statsStripHtml = homeWpPct != null ? `
      <div class="modal-wp-lbl">WIN PROBABILITY</div>
      <div class="modal-wp-strip">
        <span class="modal-wp-pct away" style="color:${awayReadable}">${awayWpPct}%</span>
        <div class="modal-wp-bar" style="background:linear-gradient(90deg,${awayReadable} ${Math.max(0, awayWpPct - 8)}%,${homeReadable} ${Math.min(100, awayWpPct + 8)}%)"></div>
        <span class="modal-wp-pct home" style="color:${homeReadable}">${homeWpPct}%</span>
      </div>` : '';

    const awayGoals = goals.filter(g => !g.isHome);
    const homeGoals = goals.filter(g => g.isHome);

    // Single-column chronological list (modal view)
    const goalsList = !flowOk
      ? `<div class="modal-no-goals" style="font-style:italic">Goal data unavailable.</div>`
      : goals.length
      ? `<div class="modal-goals-list">
          ${(() => {
            const periodOf = t => t <= 1200 ? 'P1' : t <= 2400 ? 'P2' : t <= 3600 ? 'P3' : 'OT';
            const sorted = [...goals].sort((a, b) => a.t - b.t);
            let curPeriod = null;
            return sorted.map(g => {
              const p = periodOf(g.t);
              const sep = p !== curPeriod ? `<div class="modal-period-sep"><span>${p}</span></div>` : '';
              curPeriod = p;
              const color = g.isHome ? card.homeColor : card.teamColor;
              const abbr = g.isHome ? card.home : card.away;
              return sep + buildGoalCard(g, color, abbr);
            }).join('');
          })()}
        </div>`
      : '<div class="modal-no-goals">No goals yet.</div>';

    // Two-column grid (share card only — hidden in normal modal view)
    const goalsGrid = goals.length
      ? `<div class="modal-goals-grid" hidden>
          ${buildGoalColumn(awayGoals, card.teamColor, card.away, card.away)}
          ${buildGoalColumn(homeGoals, card.homeColor, card.home, card.home)}
        </div>`
      : '';

    const goalsHtml = goalsList + goalsGrid;

    content.innerHTML = `
      <div class="modal-header">
        <div class="modal-team">
          ${logoImg(card.away, ac === 'trail' && card.isFinal)}
          <div class="modal-abbr ${ac}">${card.away}</div>
          <div class="modal-city">${card.awayCity}</div>
          ${awayXgHtml}
        </div>
        <div class="modal-score-center">
          <div class="modal-scores">
            <span class="modal-n ${ac}">${card.awayScore}</span>
            <span class="modal-sep">–</span>
            <span class="modal-n ${hc}">${card.homeScore}</span>
          </div>
          <div class="modal-period">${periodStr}</div>
        </div>
        <div class="modal-team">
          ${logoImg(card.home, hc === 'trail' && card.isFinal)}
          <div class="modal-abbr ${hc}">${card.home}</div>
          <div class="modal-city">${card.homeCity}</div>
          ${homeXgHtml}
        </div>
      </div>
      ${card.isFinal && card.threeStars && card.threeStars.length ? `
      <div class="modal-stars-section">
        <div class="modal-wp-lbl">THREE STARS</div>
        <div class="modal-stars-row">
          ${card.threeStars.slice(0, 3).map(s => `
            <div class="modal-star">
              <div class="modal-star-icons">${'⭐'.repeat(s.star || 1)}</div>
              <div class="modal-star-name">${s.player_last_name || s.player_name || ''}${s.team_abbrev ? ` (${s.team_abbrev})` : ''}</div>
            </div>`).join('')}
        </div>
      </div>` : ''}
      ${statsStripHtml}
      ${chartHtml}
      <div class="modal-goals-section">
        <div class="modal-section-label">GOALS</div>
        ${goalsHtml}
      </div>`;

    // Wire tab buttons after innerHTML is set
    const chartWrap = document.getElementById(`mc-${gameId}`);
    if (chartWrap) {
      chartWrap.querySelectorAll('.modal-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          chartWrap.querySelectorAll('.modal-tab-btn').forEach(b => b.classList.toggle('active', b === btn));
          chartWrap.querySelectorAll('.modal-tab-panel').forEach(p => p.classList.toggle('active', p.dataset.panel === btn.dataset.tab));
          // Sync header xG numbers with active xG tab
          const awayEl = document.getElementById(`modal-xg-away-${gameId}`);
          const homeEl = document.getElementById(`modal-xg-home-${gameId}`);
          if (awayEl && homeEl) {
            if (btn.dataset.tab === 'xg5v5') {
              awayEl.innerHTML = `${totals5v5.away} <span class="modal-xg-lbl">xG 5V5</span>`;
              homeEl.innerHTML = `${totals5v5.home} <span class="modal-xg-lbl">xG 5V5</span>`;
            } else if (btn.dataset.tab === 'xgall') {
              awayEl.innerHTML = `${totalsAll.away} <span class="modal-xg-lbl">xG</span>`;
              homeEl.innerHTML = `${totalsAll.home} <span class="modal-xg-lbl">xG</span>`;
            }
            // WIN% tab: leave xG header unchanged
          }
        });
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // GOAL VIDEO POPUP (GVP)
  // ─────────────────────────────────────────────────────────────────────────────
  function closeGvp() {
    const gvp = document.getElementById('gvp');
    const gvpVideo = document.getElementById('gvp-video');
    const gvpIframe = document.getElementById('gvp-iframe');
    if (!gvp || gvp.hidden) return;
    gvp.hidden = true;
    gvpVideo.pause();
    gvpVideo.src = '';
    gvpIframe.src = '';
    gvpIframe.dataset.clipId = '';
  }

  function gvpShowTab(tab) {
    const gvpTabs = document.getElementById('gvp-tabs');
    const gvpVideo = document.getElementById('gvp-video');
    const gvpIframe = document.getElementById('gvp-iframe');
    gvpTabs.querySelectorAll('.gvp-tab').forEach(b => b.classList.toggle('active', b.dataset.gvpTab === tab));
    if (tab === 'edge') {
      gvpVideo.hidden = false;
      gvpIframe.hidden = true;
      gvpIframe.src = '';
      gvpVideo.play().catch(() => {});
    } else {
      gvpVideo.pause();
      gvpVideo.hidden = true;
      gvpIframe.hidden = false;
      gvpIframe.src = `${BRIGHTCOVE_PLAYER}?videoId=${gvpIframe.dataset.clipId}&autoplay=true`;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // EVENT LISTENERS — registered once DOM is ready
  // ─────────────────────────────────────────────────────────────────────────────
  function _registerListeners() {
    // Modal close / share
    document.getElementById('modal-close').addEventListener('click', closeModal);
    document.getElementById('modal-share').addEventListener('click', shareModal);
    document.getElementById('modal-backdrop').addEventListener('click', closeModal);

    // Keyboard: Escape closes both overlays; Tab traps focus inside modal
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') { closeModal(); closeGvp(); }
      if (e.key === 'Tab') {
        const modal = document.getElementById('game-modal');
        if (modal.style.display === 'none') return;
        const focusable = Array.from(modal.querySelectorAll(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )).filter(el => el.offsetParent !== null);
        if (focusable.length < 2) return;
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) { e.preventDefault(); last.focus(); }
        } else {
          if (document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      }
    });

    // Back/forward button support
    window.addEventListener('popstate', e => {
      if (e.state && e.state.gameId) {
        openModal(e.state.gameId, { push: false });
      } else {
        _hideModal();
      }
    });

    // GVP close buttons
    document.getElementById('gvp-close').addEventListener('click', closeGvp);
    document.getElementById('gvp-backdrop').addEventListener('click', closeGvp);

    // GVP tab switching
    document.getElementById('gvp-tabs').addEventListener('click', e => {
      const tab = e.target.closest('.gvp-tab');
      if (tab) gvpShowTab(tab.dataset.gvpTab);
    });

    // Delegate clicks on play buttons (rendered dynamically inside modal)
    document.addEventListener('click', e => {
      const btn = e.target.closest('.modal-gc-play');
      if (!btn) return;
      e.stopPropagation();

      const scorer = btn.dataset.scorer;
      const assists = btn.dataset.assists;
      const team = btn.dataset.team;
      const wpB = btn.dataset.wpB;
      const wpA = btn.dataset.wpA;
      const delta = btn.dataset.wpDelta;
      const clipId = btn.dataset.clipId;

      const gvpScorer = document.getElementById('gvp-scorer');
      const gvpWp = document.getElementById('gvp-wp');
      const gvpTabs = document.getElementById('gvp-tabs');
      const gvpVideo = document.getElementById('gvp-video');
      const gvpIframe = document.getElementById('gvp-iframe');
      const gvp = document.getElementById('gvp');

      // Scorer line
      gvpScorer.textContent = scorer
        ? (assists ? `${scorer} · ${assists}` : scorer)
        : 'Goal';

      // WP line
      if (wpB && wpA && delta) {
        const d = parseFloat(delta);
        const sign = d >= 0 ? '+' : '';
        const cls = d >= 0 ? 'pos' : 'neg';
        gvpWp.innerHTML = `${team} win probability: <strong>${wpB}%</strong> → <strong>${wpA}%</strong><span class="gvp-wp-delta ${cls}">${sign}${delta}%</span>`;
      } else {
        gvpWp.innerHTML = '';
      }

      const hasEdge = !!btn.dataset.url;
      const hasClip = !!clipId;
      const hasBoth = hasEdge && hasClip;

      // Show tabs only when both sources exist
      gvpTabs.hidden = !hasBoth;
      gvpIframe.dataset.clipId = clipId || '';

      if (hasEdge) {
        // EDGE available — default to it
        gvpVideo.src = btn.dataset.url;
        gvpVideo.hidden = false;
        gvpIframe.hidden = true;
        gvpIframe.src = '';
        if (hasBoth) gvpTabs.querySelectorAll('.gvp-tab').forEach(b => b.classList.toggle('active', b.dataset.gvpTab === 'edge'));
      } else {
        // Highlight clip only — go straight to iframe
        gvpVideo.src = '';
        gvpVideo.hidden = true;
        gvpIframe.src = `${BRIGHTCOVE_PLAYER}?videoId=${clipId}&autoplay=true`;
        gvpIframe.hidden = false;
      }

      gvp.hidden = false;
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // INIT
  // ─────────────────────────────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _registerListeners);
  } else {
    _registerListeners();
  }

  // Expose public API on window
  window.openModal = openModal;
  window.closeModal = closeModal;

})();
