"""
Generate light-mode OG images (1200x630) for HockeyGameBot using HTML + Playwright.
Run: python3 scripts/generate-og-images.py
Output: public/og/*.png
"""

from playwright.sync_api import sync_playwright
import os, textwrap

OUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'public', 'og')
os.makedirs(OUT_DIR, exist_ok=True)

# ── Base CSS matching the site's design system ────────────────────────────────

BASE_CSS = """
  @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;800&family=Barlow:wght@400;600&family=JetBrains+Mono:wght@500;700&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg:      #EFEEE8;
    --surface: #FFFFFF;
    --ink:     #0d0d14;
    --red:     #E8002D;
    --ink-04: rgba(13,13,20,0.04);
    --ink-06: rgba(13,13,20,0.06);
    --ink-10: rgba(13,13,20,0.10);
    --ink-14: rgba(13,13,20,0.14);
    --ink-20: rgba(13,13,20,0.20);
    --ink-32: rgba(13,13,20,0.32);
    --ink-48: rgba(13,13,20,0.48);
  }
  html, body {
    width: 1200px; height: 630px;
    background: var(--bg);
    font-family: 'Barlow', sans-serif;
    -webkit-font-smoothing: antialiased;
    overflow: hidden;
  }

  /* Outer shell: cream + grid, matching the site mast */
  .shell {
    width: 1200px; height: 630px;
    background-color: var(--bg);
    background-image:
      linear-gradient(var(--ink-04) 1px, transparent 1px),
      linear-gradient(90deg, var(--ink-04) 1px, transparent 1px);
    background-size: 96px 96px;
    display: flex;
    flex-direction: column;
    padding: 48px 64px 44px;
    position: relative;
  }
  /* Left accent bar */
  .shell::before {
    content: '';
    position: absolute;
    left: 0; top: 0; bottom: 0;
    width: 7px;
    background: var(--red);
  }

  /* Eyebrow */
  .eyebrow {
    font-family: 'Barlow Condensed', sans-serif;
    font-weight: 700; font-size: 13px; letter-spacing: 0.22em;
    text-transform: uppercase; color: var(--ink-48);
    margin-bottom: 20px;
    display: flex; align-items: center; gap: 8px;
  }
  .eyebrow .pip {
    width: 5px; height: 5px; border-radius: 50%;
    background: var(--red); flex-shrink: 0;
  }

  /* White card — matches .mast-card on the site */
  .white-card {
    background: var(--surface);
    border: 1px solid var(--ink);
    padding: 40px 48px 36px;
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }

  .headline {
    font-family: 'Barlow Condensed', sans-serif;
    font-weight: 800;
    text-transform: uppercase;
    line-height: 0.92;
    letter-spacing: -0.01em;
    color: var(--ink);
  }
  .headline em { color: var(--red); font-style: normal; }

  .sub {
    font-family: 'Barlow', sans-serif;
    font-size: 20px; font-weight: 400;
    color: var(--ink-48); line-height: 1.45;
    margin-top: 18px;
  }

  /* Bottom meta row inside white card */
  .meta-row {
    display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
  }
  .chip {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px; font-weight: 700;
    letter-spacing: 0.12em; text-transform: uppercase;
    padding: 5px 12px;
    border: 1px solid var(--ink-14);
    color: var(--ink-48);
  }
  .chip.active { background: var(--ink); color: var(--bg); border-color: var(--ink); }

  /* Stat tiles row */
  .stat-tiles {
    display: flex; gap: 0;
    border: 1px solid var(--ink-14); align-self: flex-start;
  }
  .stat-tile {
    padding: 14px 32px; text-align: center;
    border-right: 1px solid var(--ink-14);
  }
  .stat-tile:last-child { border-right: none; }
  .stat-label {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px; font-weight: 500; letter-spacing: 0.12em;
    text-transform: uppercase; color: var(--ink-48); margin-bottom: 6px;
  }
  .stat-val {
    font-family: 'Barlow Condensed', sans-serif;
    font-weight: 800; font-size: 44px; line-height: 1;
    letter-spacing: -0.02em; color: var(--red);
  }
"""

def make_html(body_content):
    return f"""<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<style>{BASE_CSS}</style>
</head><body>{body_content}</body></html>"""


# ── OG image definitions ──────────────────────────────────────────────────────

def card(eyebrow, headline, sub, bottom='', headline_size='96px'):
    """White-card OG template matching the site mast/hero pattern."""
    return make_html(f"""
<div class="shell">
  <div class="eyebrow"><span class="pip"></span>{eyebrow}</div>
  <div class="white-card">
    <div>
      <div class="headline" style="font-size:{headline_size}">{headline}</div>
      <p class="sub">{sub}</p>
    </div>
    <div class="meta-row">{bottom}</div>
  </div>
</div>
""")

IMAGES = {

  'default': card(
    'HockeyGameBot',
    'Every NHL Game.<br><em>Every Night.</em>',
    'Live scores · game updates · player ratings · WAR · model signals',
    '<span class="chip">hockeygamebot.com</span>',
    headline_size='96px',
  ),

  'stats': card(
    'HGB Stats · Dashboard',
    'Your Hockey<br><em>Command Center.</em>',
    'Followed teams · model signals · Draft capital · player ratings',
    '<span class="chip active">Dashboard</span><span class="chip">Skaters</span><span class="chip">Impact</span>',
    headline_size='92px',
  ),

  'player': card(
    'HGB Stats · Player',
    'HGB<br><em>Player Stats.</em>',
    'Season-by-season · Rating · WAR · Impact · career RAPM',
    '<span class="chip">Rating</span><span class="chip">WAR</span><span class="chip">Impact</span>',
    headline_size='112px',
  ),

  'skaters': card(
    'HGB Stats · Skaters',
    'All Skaters.<br><em>Every Stat.</em>',
    'Skater production · RAPM · WAR · Impact · xG/60 · TOI/GP',
    '<span class="chip">5v5 only</span><span class="chip">2025–26</span><span class="chip">updated nightly</span>',
  ),

  'goalies': card(
    'HGB Stats · Goalies',
    'All Goalies.<br><em>GSAx &amp; Beyond.</em>',
    'Goals saved above expected · save percentage · workload',
    '<span class="chip">GSAx</span><span class="chip">Sv%</span><span class="chip">SA · TOI</span>',
  ),

  'teams': card(
    'HGB Stats · Teams',
    'All 32 Teams.<br><em>Every Metric.</em>',
    'xGF% · GF% · Impact rank · Draft capital · model signals',
    '<span class="chip">5v5 analytics</span><span class="chip">2025–26</span>',
  ),

  'cards': card(
    'HGB Explore · Studio',
    'Generate.<br><em>Your Analytics.</em>',
    'Rating cards · RAPM profiles · side-by-side comparisons · share-ready PNGs',
    '<span class="chip">Player Cards</span><span class="chip">Shareable PNG</span>',
  ),

  'explore': card(
    'HGB Explore · Labs',
    'Explore.<br><em>Every Angle.</em>',
    'Scatter any two stats · compare players side by side',
    '<span class="chip">Interactive</span><span class="chip">2025–26</span>',
  ),

  'methodology': card(
    'HGB Stats · Methodology',
    'The Model<br><em>Behind the Numbers.</em>',
    'RAPM · WAR · HGB Rating · Impact — how we compute them and why',
    '<span class="chip">Open methodology</span><span class="chip">hockeygamebot.com</span>',
    headline_size='88px',
  ),

  'analysis': card(
    'HGB Analysis',
    'HGB<br><em>Analysis.</em>',
    'Deep dives · model explainers · season reviews · editorial analytics',
    '<span class="chip">hockeygamebot.com</span>',
    headline_size='112px',
  ),

}

# ── Render ────────────────────────────────────────────────────────────────────

def render_all():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={'width': 1200, 'height': 630})
        for name, html in IMAGES.items():
            page.set_content(html)
            # Wait for Google Fonts to load
            try:
                page.wait_for_load_state('networkidle', timeout=8000)
            except:
                page.wait_for_timeout(2000)
            out = os.path.join(OUT_DIR, f'{name}.png')
            page.screenshot(path=out)
            print(f'  ✓  {name}.png')
        browser.close()

if __name__ == '__main__':
    print('Generating OG images...')
    render_all()
    print(f'\nDone. Files in public/og/')
