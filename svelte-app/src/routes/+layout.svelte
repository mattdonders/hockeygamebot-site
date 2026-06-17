<script lang="ts">
  import '../app.css';
  import { page } from '$app/state';

  let { children } = $props();

  const navLinks = [
    { href: '/games',         label: 'Games'   },
    { href: '/stats/skaters', label: 'Skaters' },
    { href: '/stats/goalies', label: 'Goalies' },
    { href: '/stats/teams',   label: 'Teams'   },
    { href: '/stats/lines',   label: 'Lines'   },
    { href: '/stats/impact',  label: 'Impact'  },
    { href: '/playoffs/2026', label: 'Playoffs' },
    { href: '/results',       label: 'Results' },
  ];

  function isActive(href: string) {
    return page.url.pathname === href || page.url.pathname.startsWith(href + '/');
  }
</script>

<svelte:head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</svelte:head>

<nav class="nav">
  <div class="wrap nav-inner">
    <a class="brand" href="/">
      Hockey<span class="dot"></span>Gamebot
    </a>
    <div class="nav-links">
      {#each navLinks as l}
        <a href={l.href} class:active={isActive(l.href)}>{l.label}</a>
      {/each}
    </div>
  </div>
</nav>

{@render children()}

<footer class="footer">
  <div class="wrap footer-inner">
    <span class="footer-wordmark">Hockey<span class="dot"></span>Gamebot</span>
    <span class="mono-label">5v5 · NHL · 2025–26 · Data via HGB Analytics</span>
  </div>
</footer>

<style>
  .nav {
    position: sticky;
    top: 0;
    z-index: 100;
    background: var(--surface);
    border-bottom: 2px solid var(--ink);
  }
  .nav-inner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
    height: 52px;
  }
  .brand {
    font-family: var(--display);
    font-weight: 900;
    font-size: 18px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--ink);
    white-space: nowrap;
    display: flex;
    align-items: center;
  }
  .dot {
    display: inline-block;
    width: 5px;
    height: 5px;
    background: var(--red);
    border-radius: 50%;
    margin: 0 5px;
    flex-shrink: 0;
  }
  .nav-links {
    display: flex;
    align-items: center;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .nav-links::-webkit-scrollbar { display: none; }
  .nav-links a {
    font-family: var(--body);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.10em;
    text-transform: uppercase;
    color: var(--ink-48);
    padding: 6px 14px;
    white-space: nowrap;
    border-left: 1px solid var(--ink-14);
    transition: color 0.1s, background 0.1s;
  }
  .nav-links a:last-child { border-right: 1px solid var(--ink-14); }
  .nav-links a:hover { color: var(--ink); background: var(--ink-06); }
  .nav-links a.active { background: var(--ink); color: var(--bg); }

  .footer {
    border-top: 1px solid var(--ink-14);
    padding: 24px 0;
    margin-top: 80px;
  }
  .footer-inner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 12px;
  }
  .footer-wordmark {
    font-family: var(--display);
    font-weight: 900;
    font-size: 16px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    display: flex;
    align-items: center;
  }

  @media (max-width: 640px) {
    .nav-inner { height: auto; padding: 10px 0; flex-wrap: wrap; }
    .nav-links a { padding: 5px 10px; font-size: 9px; }
  }
</style>
