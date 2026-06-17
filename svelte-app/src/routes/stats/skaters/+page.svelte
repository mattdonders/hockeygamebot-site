<script lang="ts">
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  type Player = (typeof data.players)[number];
  type SortKey = 'war' | 'gs' | 'p60' | 'g60' | 'goals' | 'assists' | 'points' | 'rapm' | 'ixg' | 'gp';

  let sortKey = $state<SortKey>('war');
  let sortDir = $state<'asc' | 'desc'>('desc');
  let posFilter = $state<'ALL' | 'F' | 'D'>('ALL');
  let query = $state('');

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      sortDir = sortDir === 'desc' ? 'asc' : 'desc';
    } else {
      sortKey = key;
      sortDir = 'desc';
    }
  }

  const filtered = $derived.by(() => {
    let rows = data.players;
    if (posFilter !== 'ALL') rows = rows.filter((p) => p.pos_group === posFilter);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      rows = rows.filter(
        (p) =>
          p.display_name.toLowerCase().includes(q) ||
          p.team.toLowerCase().includes(q) ||
          p.pos.toLowerCase().includes(q)
      );
    }
    return rows;
  });

  const sorted = $derived(
    [...filtered].sort((a, b) => {
      const va = (a[sortKey] as number | null) ?? -Infinity;
      const vb = (b[sortKey] as number | null) ?? -Infinity;
      return sortDir === 'desc' ? vb - va : va - vb;
    })
  );

  const COLS: { key: SortKey; label: string; title: string; align: 'left' | 'right' }[] = [
    { key: 'gp',     label: 'GP',   title: 'Games Played',       align: 'right' },
    { key: 'goals',  label: 'G',    title: 'Goals',              align: 'right' },
    { key: 'assists',label: 'A',    title: 'Assists',            align: 'right' },
    { key: 'points', label: 'Pts',  title: 'Points',             align: 'right' },
    { key: 'g60',    label: 'G/60', title: 'Goals per 60 min',   align: 'right' },
    { key: 'p60',    label: 'P/60', title: 'Points per 60 min',  align: 'right' },
    { key: 'ixg',    label: 'ixG',  title: 'Individual Expected Goals (cumulative)', align: 'right' },
    { key: 'war',    label: 'WAR',  title: 'Wins Above Replacement', align: 'right' },
    { key: 'gs',     label: 'GS',   title: 'Avg Game Score',     align: 'right' },
    { key: 'rapm',   label: 'RAPM', title: 'Regularized Adjusted Plus-Minus', align: 'right' },
  ];

  function fmtVal(p: Player, key: SortKey): string {
    const v = p[key];
    if (v == null) return '—';
    if (key === 'rapm') return (v as number) > 0 ? `+${(v as number).toFixed(3)}` : (v as number).toFixed(3);
    if (key === 'war' || key === 'gs') return (v as number).toFixed(2);
    if (key === 'p60' || key === 'g60') return (v as number).toFixed(2);
    if (key === 'ixg') return (v as number).toFixed(1);
    return String(v);
  }

  function isPos(v: number | null): boolean {
    return v != null && v > 0;
  }
  function isNeg(v: number | null): boolean {
    return v != null && v < 0;
  }
</script>

<svelte:head>
  <title>Skater Ratings — HockeyGameBot</title>
  <meta name="description" content="NHL skater leaderboard: WAR, Game Score, RAPM, points, and expected goals. Sortable, filterable." />
</svelte:head>

<!-- ── PAGE MAST ── -->
<section class="mast">
  <div class="mast-ghost">SKATERS</div>
  <div class="mast-corners">
    <div class="corner tl"></div>
    <div class="corner tr"></div>
    <div class="corner bl"></div>
    <div class="corner br"></div>
  </div>
  <div class="wrap mast-inner">
    <p class="eyebrow"><span class="pip"></span>2025–26 NHL Season</p>
    <div class="mast-card">
      <h1>Skater <em>ratings</em></h1>
      <p class="dek">WAR · Game Score · RAPM · Expected Goals · {sorted.length} skaters</p>
    </div>
  </div>
</section>

<!-- ── CONTROLS ── -->
<div class="controls-bar">
  <div class="wrap controls-inner">
    <div class="pos-chips">
      {#each ['ALL', 'F', 'D'] as p}
        <button
          class="chip"
          class:active={posFilter === p}
          onclick={() => (posFilter = p as typeof posFilter)}
        >{p === 'ALL' ? 'All Skaters' : p === 'F' ? 'Forwards' : 'Defense'}</button>
      {/each}
    </div>
    <div class="search-wrap">
      <input
        class="search"
        type="search"
        placeholder="Search player or team…"
        bind:value={query}
      />
    </div>
  </div>
</div>

<!-- ── TABLE ── -->
<div class="table-wrap">
  <div class="wrap">
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th class="col-rank" scope="col">#</th>
            <th class="col-player" scope="col">Player</th>
            <th class="col-pos" scope="col">Pos</th>
            {#each COLS as col}
              <th
                class="col-stat"
                class:active={sortKey === col.key}
                scope="col"
                title={col.title}
                onclick={() => toggleSort(col.key)}
              >
                {col.label}
                {#if sortKey === col.key}
                  <span class="sort-arrow">{sortDir === 'desc' ? '↓' : '↑'}</span>
                {:else}
                  <span class="sort-arrow muted">↕</span>
                {/if}
              </th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each sorted as p, i (p.player_id)}
            <tr>
              <td class="col-rank td-rank">{i + 1}</td>
              <td class="col-player td-player">
                <a href="/stats/player/{p.slug}">
                  <span class="player-name">{p.display_name}</span>
                  <span class="player-team">{p.team}</span>
                </a>
              </td>
              <td class="col-pos td-pos">{p.pos}</td>
              {#each COLS as col}
                <td
                  class="col-stat td-stat"
                  class:active-col={sortKey === col.key}
                  class:pos-val={col.key === 'war' || col.key === 'rapm' ? isPos(p[col.key] as number | null) : false}
                  class:neg-val={col.key === 'war' || col.key === 'rapm' ? isNeg(p[col.key] as number | null) : false}
                >
                  {fmtVal(p, col.key)}
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>

      {#if sorted.length === 0}
        <div class="empty-state">
          <span class="empty-icon">—</span>
          <p>No players match your filters.</p>
        </div>
      {/if}
    </div>
    <p class="table-footer">
      {sorted.length} of {data.players.length} skaters · Minimum 20 GP · Click any column header to sort
    </p>
  </div>
</div>

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
    font-size: clamp(100px, 16vw, 220px);
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
    max-width: 560px;
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
    line-height: 1.6;
  }

  /* ── Controls ── */
  .controls-bar {
    border-bottom: 1px solid var(--ink-14);
    background: var(--surface);
    position: sticky;
    top: 52px;
    z-index: 50;
  }
  .controls-inner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
    height: 52px;
  }
  .pos-chips {
    display: flex;
    align-items: center;
    gap: 0;
  }
  .chip {
    font-family: var(--mono);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--ink-48);
    background: none;
    border: none;
    border-right: 1px solid var(--ink-14);
    padding: 6px 16px;
    cursor: pointer;
    transition: color 0.1s, background 0.1s;
    height: 100%;
  }
  .chip:first-child { border-left: 1px solid var(--ink-14); }
  .chip:hover { color: var(--ink); background: var(--ink-06); }
  .chip.active { background: var(--ink); color: var(--bg); }

  .search-wrap { display: flex; align-items: center; }
  .search {
    font-family: var(--mono);
    font-size: 11px;
    color: var(--ink);
    background: var(--bg);
    border: 1px solid var(--ink-20);
    padding: 6px 12px;
    width: 200px;
    outline: none;
    transition: border-color 0.1s;
  }
  .search::placeholder { color: var(--ink-32); }
  .search:focus { border-color: var(--ink); }

  /* ── Table ── */
  .table-wrap {
    padding: 32px 0 64px;
  }
  .table-scroll {
    overflow-x: auto;
    border: 1px solid var(--ink-14);
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-family: var(--mono);
    font-size: 12px;
  }
  thead tr {
    background: var(--ink);
    color: var(--bg);
  }
  thead th {
    padding: 10px 12px;
    font-family: var(--mono);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    white-space: nowrap;
    text-align: right;
    cursor: default;
  }
  thead th.col-player { text-align: left; }
  thead th.col-pos { text-align: center; }
  thead th.col-rank { text-align: center; width: 36px; }
  thead th.col-stat { cursor: pointer; }
  thead th.col-stat:hover { background: rgba(255,255,255,0.08); }
  thead th.col-stat.active { color: var(--bg); }

  .sort-arrow { margin-left: 4px; font-size: 9px; }
  .sort-arrow.muted { opacity: 0.3; }

  tbody tr {
    border-bottom: 1px solid var(--ink-06);
    transition: background 0.08s;
  }
  tbody tr:nth-child(even) { background: rgba(13,13,20,0.015); }
  tbody tr:hover { background: var(--ink-06); }

  tbody td {
    padding: 9px 12px;
    text-align: right;
    color: var(--ink-72);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .td-rank {
    text-align: center;
    font-size: 10px;
    color: var(--ink-32);
    font-weight: 700;
    width: 36px;
  }
  .td-player {
    text-align: left;
    min-width: 160px;
  }
  .td-player a {
    display: flex;
    align-items: baseline;
    gap: 8px;
    text-decoration: none;
  }
  .td-player a:hover .player-name { color: var(--red); }
  .player-name {
    font-family: var(--body);
    font-size: 13px;
    font-weight: 600;
    color: var(--ink);
    transition: color 0.1s;
  }
  .player-team {
    font-family: var(--mono);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: var(--ink-32);
    text-transform: uppercase;
  }
  .td-pos {
    text-align: center;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: var(--ink-48);
    text-transform: uppercase;
  }
  .active-col { color: var(--ink); font-weight: 700; }
  .pos-val { color: #166534 !important; }
  .neg-val { color: #991b1b !important; }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 64px 32px;
    gap: 12px;
    font-family: var(--mono);
    font-size: 12px;
    color: var(--ink-32);
    letter-spacing: 0.08em;
  }
  .empty-icon { font-size: 32px; }

  .table-footer {
    margin-top: 12px;
    font-family: var(--mono);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: var(--ink-32);
    text-transform: uppercase;
  }

  @media (max-width: 640px) {
    .controls-inner { height: auto; padding: 10px 0; flex-wrap: wrap; gap: 10px; }
    .search { width: 100%; }
    .mast-card { padding: 16px 20px; }
  }
</style>
