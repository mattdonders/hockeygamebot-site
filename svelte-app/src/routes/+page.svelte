<script lang="ts">
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  const games = $derived(data.games ?? []);
  const statsDate = $derived(
    data.meta?.generated_at
      ? new Date(data.meta.generated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : null
  );

  const EXPLORE = [
    {
      href: '/stats/skaters',
      label: 'Skater Ratings',
      hed: 'Every skater, ranked.',
      sub: 'HGB Rating, WAR, and impact score for all NHL forwards and defensemen. Sortable, filterable, exportable.',
      cta: 'Browse Skaters',
    },
    {
      href: '/stats/goalies',
      label: 'Goalie Stats',
      hed: 'Between the pipes.',
      sub: 'GSAx, save percentage, and HGB WAR for every goalie with 500+ minutes. Career trends included.',
      cta: 'Browse Goalies',
    },
    {
      href: '/stats/teams',
      label: 'Team Stats',
      hed: '32 teams, one table.',
      sub: 'xGF%, HDCF%, shot share, and expected goals for every team at 5v5. Regular season and playoffs.',
      cta: 'Browse Teams',
    },
    {
      href: '/stats/impact',
      label: 'HGB Impact',
      hed: 'Who showed up tonight.',
      sub: "Per-game impact scores updated nightly. See who's running hot and who's dragging their line.",
      cta: 'View Impact',
    },
  ];

  // Format score display
  function fmtScore(g: any): string {
    if (!g?.home_score && g?.home_score !== 0) return '';
    return `${g.away_score}–${g.home_score}`;
  }

  function gameHref(g: any): string {
    return g?.game_id ? `/games/${g.game_id}` : '/results';
  }
</script>

<svelte:head>
  <title>HockeyGameBot — NHL Stats, Ratings & Win Probability</title>
  <meta name="description" content="Advanced NHL stats, player ratings, and live win probability. HGB Rating, WAR, expected goals, and more — updated daily." />
</svelte:head>

<!-- ── MASTHEAD ── -->
<section class="mast">
  <div class="mast-ghost">HGB</div>
  <div class="mast-corners">
    <div class="corner tl"></div>
    <div class="corner tr"></div>
    <div class="corner bl"></div>
    <div class="corner br"></div>
  </div>
  <div class="wrap mast-inner">
    <p class="eyebrow"><span class="pip"></span>2025–26 NHL Season</p>
    <div class="mast-card">
      <h1>Advanced NHL <em>stats</em>,<br>measured.</h1>
      <p class="dek">
        HGB Rating · WAR · Win Probability · Expected Goals
        {#if statsDate}
          <span class="dek-date">· Data as of {statsDate}</span>
        {/if}
      </p>
    </div>
  </div>
</section>

<!-- ── YESTERDAY'S RESULTS ── -->
{#if games.length > 0}
  <section class="results-section">
    <div class="wrap">
      <div class="section-head">
        <h2 class="section-title">Yesterday's <em>results</em></h2>
        <a class="more-link" href="/results">All results →</a>
      </div>
      <div class="results-grid">
        {#each games as g (g.game_id)}
          <a class="result-card" href={gameHref(g)}>
            <div class="result-teams">
              <div class="result-team">
                <span class="team-abbr">{g.away_team}</span>
                <span class="team-score" class:winner={g.away_score > g.home_score}>{g.away_score ?? '—'}</span>
              </div>
              <div class="result-team">
                <span class="team-abbr">{g.home_team}</span>
                <span class="team-score" class:winner={g.home_score > g.away_score}>{g.home_score ?? '—'}</span>
              </div>
            </div>
            <div class="result-meta">
              {g.game_state === 'FINAL' ? 'Final' : g.game_state ?? ''}
              {g.period > 3 && g.period_type === 'OT' ? ' · OT' : ''}
              {g.period > 3 && g.period_type === 'SO' ? ' · SO' : ''}
            </div>
          </a>
        {/each}
      </div>
    </div>
  </section>
{/if}

<!-- ── EXPLORE ── -->
<section class="explore-section">
  <div class="wrap">
    <div class="section-head">
      <h2 class="section-title">Explore the <em>numbers</em></h2>
      <span class="mono-label">Advanced stats · Every team · Every player</span>
    </div>
    <div class="explore-grid">
      {#each EXPLORE as tile (tile.href)}
        <a class="tile" href={tile.href}>
          <span class="tile-label">{tile.label}</span>
          <span class="tile-hed">{tile.hed}</span>
          <p class="tile-sub">{tile.sub}</p>
          <span class="tile-cta">{tile.cta} →</span>
        </a>
      {/each}
    </div>
  </div>
</section>

<style>
  /* ── Masthead ── */
  .mast {
    position: relative;
    overflow: hidden;
    border-bottom: 2px solid var(--ink);
    background: var(--bg);
    background-image:
      linear-gradient(rgba(13,13,20,0.04) 1px, transparent 1px),
      linear-gradient(90deg, rgba(13,13,20,0.04) 1px, transparent 1px);
    background-size: 96px 96px;
  }
  .mast-ghost {
    position: absolute;
    pointer-events: none;
    user-select: none;
    z-index: 0;
    font-family: var(--display);
    font-weight: 900;
    font-size: clamp(180px, 30vw, 320px);
    line-height: 0.85;
    text-transform: uppercase;
    letter-spacing: -0.02em;
    color: rgba(13,13,20,0.05);
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    white-space: nowrap;
  }
  .mast-corners {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 1;
  }
  .corner {
    position: absolute;
    width: 16px;
    height: 16px;
  }
  .tl { top: 16px; left: 16px; border-top: 1px solid var(--ink-20); border-left: 1px solid var(--ink-20); }
  .tr { top: 16px; right: 16px; border-top: 1px solid var(--ink-20); border-right: 1px solid var(--ink-20); }
  .bl { bottom: 16px; left: 16px; border-bottom: 1px solid var(--ink-20); border-left: 1px solid var(--ink-20); }
  .br { bottom: 16px; right: 16px; border-bottom: 1px solid var(--ink-20); border-right: 1px solid var(--ink-20); }

  .mast-inner {
    position: relative;
    z-index: 2;
    padding-top: 52px;
    padding-bottom: 48px;
  }
  .eyebrow {
    font-family: var(--mono);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--ink-48);
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 20px;
  }
  .pip {
    display: inline-block;
    width: 5px;
    height: 5px;
    background: var(--red);
    border-radius: 50%;
    flex-shrink: 0;
  }
  .mast-card {
    background: var(--surface);
    border: 1px solid var(--ink);
    padding: 32px 36px 28px;
    max-width: 680px;
  }
  h1 {
    font-family: var(--display);
    font-weight: 900;
    font-size: clamp(40px, 6vw, 72px);
    line-height: 1;
    text-transform: uppercase;
    letter-spacing: -0.01em;
    color: var(--ink);
    margin-bottom: 16px;
  }
  h1 em {
    color: var(--red);
    font-style: normal;
  }
  .dek {
    font-family: var(--mono);
    font-size: 12px;
    color: var(--ink-48);
    letter-spacing: 0.06em;
    line-height: 1.6;
  }
  .dek-date { color: var(--ink-32); }

  /* ── Section shared ── */
  .section-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 24px;
    margin-bottom: 24px;
  }
  .section-title {
    font-family: var(--display);
    font-weight: 900;
    font-size: clamp(26px, 3.5vw, 40px);
    text-transform: uppercase;
    letter-spacing: -0.005em;
    line-height: 1;
  }
  .section-title em { color: var(--red); font-style: normal; }
  .more-link {
    font-family: var(--mono);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: var(--ink-48);
    white-space: nowrap;
    transition: color 0.1s;
  }
  .more-link:hover { color: var(--ink); }

  /* ── Yesterday's results ── */
  .results-section {
    padding: 48px 0;
    border-bottom: 1px solid var(--ink-14);
  }
  .results-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 1px;
    background: var(--ink-14);
    border: 1px solid var(--ink-14);
  }
  .result-card {
    background: var(--surface);
    padding: 16px 18px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    transition: background 0.1s;
  }
  .result-card:hover { background: var(--bg); }
  .result-teams { display: flex; flex-direction: column; gap: 4px; }
  .result-team {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
  }
  .team-abbr {
    font-family: var(--display);
    font-weight: 800;
    font-size: 18px;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    color: var(--ink);
  }
  .team-score {
    font-family: var(--mono);
    font-size: 18px;
    font-weight: 700;
    color: var(--ink-32);
    font-variant-numeric: tabular-nums;
  }
  .team-score.winner { color: var(--ink); }
  .result-meta {
    font-family: var(--mono);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink-32);
  }

  /* ── Explore tiles ── */
  .explore-section {
    padding: 56px 0 72px;
  }
  .explore-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 1px;
    background: var(--ink-14);
    border: 1px solid var(--ink-14);
  }
  .tile {
    background: var(--surface);
    padding: 28px 24px 24px;
    display: flex;
    flex-direction: column;
    gap: 0;
    transition: background 0.1s;
  }
  .tile:hover { background: var(--bg); }
  .tile-label {
    font-family: var(--mono);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--red);
    margin-bottom: 12px;
  }
  .tile-hed {
    font-family: var(--display);
    font-weight: 900;
    font-size: 26px;
    line-height: 1;
    text-transform: uppercase;
    letter-spacing: -0.01em;
    color: var(--ink);
    margin-bottom: 14px;
  }
  .tile-sub {
    font-size: 13px;
    color: var(--ink-56);
    line-height: 1.55;
    flex: 1;
    margin: 0 0 20px;
  }
  .tile-cta {
    font-family: var(--mono);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink-48);
    border-top: 1px solid var(--ink-10);
    padding-top: 14px;
    transition: color 0.1s;
  }
  .tile:hover .tile-cta { color: var(--ink); }

  @media (max-width: 900px) {
    .explore-grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 600px) {
    .mast-card { padding: 20px; }
    .results-grid { grid-template-columns: repeat(2, 1fr); }
    .explore-grid { grid-template-columns: 1fr; }
    .section-head { flex-direction: column; gap: 8px; }
  }
</style>
