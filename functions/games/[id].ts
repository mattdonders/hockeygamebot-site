interface Env {
  ASSETS: Fetcher;
}

const API_BASE = 'https://api.hockeygamebot.com';
const SITE     = 'https://hockeygamebot.com';
const GAME_ID_RE = /^\d{10}$/;

export const onRequestGet: PagesFunction<Env> = async ({ params, request, env }) => {
  const id = params.id as string;

  // Pass non-game-ID paths (e.g. /games/index.html) straight to static assets
  if (!GAME_ID_RE.test(id)) {
    return env.ASSETS.fetch(request);
  }

  // Fetch SPA shell + game metadata in parallel
  const shellUrl = new URL('/games/index.html', request.url).toString();
  const [shellResp, apiResp] = await Promise.all([
    env.ASSETS.fetch(shellUrl),
    fetch(`${API_BASE}/v1/games/${id}/boxscore`).catch(() => null),
  ]);

  let title       = 'Game · HockeyGameBot';
  let description = 'Live xG, win probability, and advanced stats · HockeyGameBot';

  if (apiResp?.ok) {
    try {
      const d    = await apiResp.json() as any;
      const away = d.awayTeam?.abbrev as string | undefined;
      const home = d.homeTeam?.abbrev as string | undefined;
      const state = (d.gameState ?? '') as string;

      if (away && home) {
        const awayScore = d.awayTeam?.score ?? 0;
        const homeScore = d.homeTeam?.score ?? 0;

        if (state === 'LIVE' || state === 'CRIT') {
          title       = `LIVE · ${away} ${awayScore}–${homeScore} ${home} · HockeyGameBot`;
          description = `Live xG, win probability, and advanced stats for ${away} @ ${home}.`;
        } else if (state === 'FINAL' || state === 'OFF') {
          title       = `${away} ${awayScore}–${homeScore} ${home} · HockeyGameBot`;
          description = `Final score, xG model, and advanced stats for ${away} @ ${home}.`;
        } else {
          title       = `${away} @ ${home} · HockeyGameBot`;
          description = `Preview, xG model, and advanced stats for ${away} @ ${home}.`;
        }
      }
    } catch {
      // Fall through to generic metadata
    }
  }

  const esc = (s: string) => s.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const t   = esc(title);
  const d   = esc(description);
  const url = `${SITE}/games/${id}`;
  const img = `${SITE}/og/main.png`;

  const injected = `  <meta property="og:type"        content="website" />
  <meta property="og:title"       content="${t}" />
  <meta property="og:description" content="${d}" />
  <meta property="og:url"         content="${url}" />
  <meta property="og:image"       content="${img}" />
  <meta name="twitter:card"        content="summary_large_image" />
  <meta name="twitter:title"       content="${t}" />
  <meta name="twitter:description" content="${d}" />
  <meta name="twitter:image"       content="${img}" />
  <meta name="description"         content="${d}" />
</head>`;

  const html = (await shellResp.text())
    .replace('<title>Game · HockeyGameBot</title>', `<title>${t}</title>`)
    .replace('</head>', injected);

  // Short cache: 60s for live games, 1 hour for final/pre
  const isLive = title.startsWith('LIVE');
  return new Response(html, {
    headers: {
      'Content-Type':  'text/html;charset=UTF-8',
      'Cache-Control': isLive ? 'public, max-age=60' : 'public, max-age=3600',
    },
  });
};
