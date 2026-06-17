<script lang="ts">
  import type { PageData } from './$types';
  import { goto } from '$app/navigation';

  let { data }: { data: PageData } = $props();

  function fmtDisplay(iso: string): string {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  }

  function shiftDate(iso: string, days: number): string {
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + days);
    return dt.toISOString().slice(0, 10);
  }

  function navigate(iso: string) {
    goto(`?date=${iso}`, { replaceState: false });
  }

  function gameStatus(g: any): string {
    if (!g.game_state) return '';
    const s = String(g.game_state).toUpperCase();
    if (s === 'FINAL' || s === 'OFF') {
      if (g.period > 3 && g.period_type === 'OT') return 'Final · OT';
      if (g.period > 3 && g.period_type === 'SO') return 'Final · SO';
      return 'Final';
    }
    if (s === 'LIVE' || s === 'CRIT') return 'Live';
    if (s === 'FUT' || s === 'PRE') return 'Scheduled';
    return g.game_state;
  }

  function isLive(g: any): boolean {
    const s = String(g.game_state ?? '').toUpperCase();
    return s === 'LIVE' || s === 'CRIT';
  }

  function isFinal(g: any): boolean {
    const s = String(g.game_state ?? '').toUpperCase();
    return s === 'FINAL' || s === 'OFF';
  }
</script>

<svelte:head>
  <title>Games · {data.date} — HockeyGameBot</title>
  <meta name="description" content="NHL game results and scores for {data.date}." />
</svelte:head>

<!-- ── PAGE MAST ── -->
<section class="mast">
  <div class="mast-ghost">GAMES</div>
  <div class="mast-corners">
    <div class="corner tl"></div>
    <div class="corner tr"></div>
    <div class="corner bl"></div>
    <div class="corner br"></div>
  </div>
  <div class="wrap mast-inner">
    <p class="eyebrow"><span class="pip"></span>NHL Schedule</p>
    <div class="mast-card">
      <h1>Game <em>browser</em></h1>
      <p class="dek">Results, scores, and game data by date</p>
    </div>
  </div>
</section>

<!-- ── DATE NAV ── -->
<div class="date-bar">
  <div class="wrap date-inner">
    <button class="nav-btn" onclick={() => navigate(shiftDate(data.date, -1))} aria-label="Previous day">
      ← Prev
    </button>
    <div class="date-center">
      <span class="date-label">{fmtDisplay(data.date)}</span>
      <input
        class="date-input"
        type="date"
        value={data.date}
        onchange={(e) => navigate((e.currentTarget as HTMLInputElement).value)}
        max={new Date().toISOString().slice(0, 10)}
      />
    </div>
    <button class="nav-btn" onclick={() => navigate(shiftDate(data.date, 1))} aria-label="Next day">
      Next →
    </button>
  </div>
</div>

<!-- ── GAMES ── -->
<div class="games-section">
  <div class="wrap">
    {#if data.error}
      <div class="empty-state">
        <p class="empty-title">Error loading games</p>
        <p class="empty-sub">{data.error}</p>
      </div>
    {:else if data.games.length === 0}
      <div class="empty-state">
        <div class="empty-icon">
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
            <circle cx="20" cy="20" r="18" stroke="currentColor" stroke-width="1.5" stroke-dasharray="4 3"/>
            <path d="M14 20h12M20 14v12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </div>
        <p class="empty-title">No games on this date</p>
        <p class="empty-sub">Try navigating to a date during the regular season or playoffs.</p>
      </div>
    {:else}
      <div class="games-grid">
        {#each data.games as g (g.game_id ?? g.id ?? Math.random())}
          <div class="game-card" class:is-live={isLive(g)} class:is-final={isFinal(g)}>
            <div class="card-status">
              <span class="status-pill" class:live={isLive(g)} class:final={isFinal(g)}>
                {gameStatus(g)}
              </span>
            </div>
            <div class="card-teams">
              <div class="team-row" class:winner={isFinal(g) && g.away_score > g.home_score}>
                <span class="team-abbr">{g.away_team ?? g.awayTeam}</span>
                {#if g.away_score != null}
                  <span class="team-score">{g.away_score}</span>
                {:else}
                  <span class="team-score muted">—</span>
                {/if}
              </div>
              <div class="team-row" class:winner={isFinal(g) && g.home_score > g.away_score}>
                <span class="team-abbr">{g.home_team ?? g.homeTeam}</span>
                {#if g.home_score != null}
                  <span class="team-score">{g.home_score}</span>
                {:else}
                  <span class="team-score muted">—</span>
                {/if}
              </div>
            </div>
            {#if g.venue || g.start_time_utc}
              <div class="card-meta">
                {#if g.venue}<span>{g.venue}</span>{/if}
                {#if g.start_time_utc}
                  <span>{new Date(g.start_time_utc).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}</span>
                {/if}
              </div>
            {/if}
          </div>
        {/each}
      </div>
      <p class="games-count">{data.games.length} game{data.games.length !== 1 ? 's' : ''} · {fmtDisplay(data.date)}</p>
    {/if}
  </div>
</div>

<style>
  /* ── Masthead (shared pattern) ── */
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
    font-size: clamp(120px, 20vw, 260px);
    line-height: 0.85;
    text-transform: uppercase;
    letter-spacing: -0.02em;
    color: rgba(13,13,20,0.05);
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    white-space: nowrap;
  }
  .mast-corners { position: absolute; inset: 0; pointer-events: none; z-index: 1; }
  .corner { position: absolute; width: 16px; height: 16px; }
  .tl { top: 16px; left: 16px; border-top: 1px solid var(--ink-20); border-left: 1px solid var(--ink-20); }
  .tr { top: 16px; right: 16px; border-top: 1px solid var(--ink-20); border-right: 1px solid var(--ink-20); }
  .bl { bottom: 16px; left: 16px; border-bottom: 1px solid var(--ink-20); border-left: 1px solid var(--ink-20); }
  .br { bottom: 16px; right: 16px; border-bottom: 1px solid var(--ink-20); border-right: 1px solid var(--ink-20); }

  .mast-inner {
    position: relative;
    z-index: 2;
    padding-top: 40px;
    padding-bottom: 36px;
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
    margin-bottom: 16px;
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
    padding: 24px 32px 20px;
    max-width: 480px;
  }
  h1 {
    font-family: var(--display);
    font-weight: 900;
    font-size: clamp(32px, 5vw, 60px);
    line-height: 1;
    text-transform: uppercase;
    letter-spacing: -0.01em;
    color: var(--ink);
    margin-bottom: 12px;
  }
  h1 em { color: var(--red); font-style: normal; }
  .dek {
    font-family: var(--mono);
    font-size: 11px;
    color: var(--ink-48);
    letter-spacing: 0.06em;
  }

  /* ── Date navigation ── */
  .date-bar {
    background: var(--surface);
    border-bottom: 1px solid var(--ink-14);
    position: sticky;
    top: 52px;
    z-index: 50;
  }
  .date-inner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
    height: 52px;
  }
  .nav-btn {
    font-family: var(--mono);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--ink-48);
    background: none;
    border: none;
    cursor: pointer;
    padding: 6px 0;
    transition: color 0.1s;
    white-space: nowrap;
  }
  .nav-btn:hover { color: var(--ink); }
  .date-center {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }
  .date-label {
    font-family: var(--display);
    font-weight: 700;
    font-size: 14px;
    letter-spacing: 0.04em;
    color: var(--ink);
    line-height: 1;
  }
  .date-input {
    font-family: var(--mono);
    font-size: 10px;
    color: var(--ink-32);
    background: none;
    border: none;
    outline: none;
    cursor: pointer;
    text-align: center;
  }
  .date-input::-webkit-calendar-picker-indicator { opacity: 0.3; cursor: pointer; }

  /* ── Games section ── */
  .games-section {
    padding: 40px 0 80px;
  }
  .games-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 1px;
    background: var(--ink-14);
    border: 1px solid var(--ink-14);
    margin-bottom: 16px;
  }
  .game-card {
    background: var(--surface);
    padding: 20px 20px 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    transition: background 0.1s;
  }
  .game-card:hover { background: var(--bg); }
  .game-card.is-live { border-left: 3px solid #00E5FF; }

  .card-status { display: flex; align-items: center; }
  .status-pill {
    font-family: var(--mono);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--ink-32);
  }
  .status-pill.live { color: #00E5FF; }
  .status-pill.final { color: var(--ink-48); }

  .card-teams { display: flex; flex-direction: column; gap: 6px; }
  .team-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
  }
  .team-abbr {
    font-family: var(--display);
    font-weight: 800;
    font-size: 22px;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    color: var(--ink-48);
    line-height: 1;
    transition: color 0.1s;
  }
  .team-row.winner .team-abbr { color: var(--ink); }
  .team-score {
    font-family: var(--mono);
    font-size: 20px;
    font-weight: 700;
    color: var(--ink-32);
    font-variant-numeric: tabular-nums;
    line-height: 1;
  }
  .team-row.winner .team-score { color: var(--ink); }
  .team-score.muted { color: var(--ink-20); }

  .card-meta {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-family: var(--mono);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink-32);
    border-top: 1px solid var(--ink-06);
    padding-top: 10px;
  }

  /* ── Empty state ── */
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 80px 32px;
    gap: 16px;
    text-align: center;
  }
  .empty-icon { color: var(--ink-20); }
  .empty-title {
    font-family: var(--display);
    font-weight: 900;
    font-size: 28px;
    text-transform: uppercase;
    letter-spacing: -0.01em;
    color: var(--ink-32);
  }
  .empty-sub {
    font-family: var(--mono);
    font-size: 11px;
    color: var(--ink-32);
    letter-spacing: 0.06em;
    max-width: 360px;
  }

  .games-count {
    font-family: var(--mono);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: var(--ink-32);
    text-transform: uppercase;
  }

  @media (max-width: 640px) {
    .mast-card { padding: 16px 20px; }
    .date-inner { height: auto; padding: 10px 0; flex-direction: column; gap: 8px; align-items: flex-start; }
    .date-center { align-items: flex-start; }
    .games-grid { grid-template-columns: repeat(2, 1fr); }
  }
</style>
