#!/usr/bin/env python3
"""
Generate public/og/playoffs.png — OG image for the /playoffs/2026 page.

Same visual language as generate_og_main.py / generate_og_teams.py — dark
background, diagonal texture, red accent bar, Barlow Condensed typography.
Tuned copy for the playoffs landing: "Stanley Cup Playoffs 2026" hero,
"Model predictions · 10,000 sims per series" context.

Usage: /Users/mattdonders/.virtualenvs/hockeygamebot/bin/python scripts/generate_og_playoffs.py
Output: public/og/playoffs.png
"""

import asyncio
from pathlib import Path

ROOT       = Path(__file__).parent.parent
OUTPUT_DIR = ROOT / "public" / "og"

RED      = "#E8002D"
RED_DARK = "#5a0010"
BG       = "#0d0d14"

HTML = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700;800;900&family=Barlow:ital,wght@0,400;0,500;1,400&display=swap" rel="stylesheet">
<style>
  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  body {{ width: 1200px; height: 630px; overflow: hidden; background: #0a0a0f; font-family: 'Barlow', sans-serif; }}

  .card {{
    width: 1200px; height: 630px;
    background: {BG};
    position: relative; overflow: hidden; display: flex;
  }}

  .card::before {{
    content: ''; position: absolute; inset: 0;
    background-image: repeating-linear-gradient(-45deg, transparent, transparent 40px, #ffffff03 40px, #ffffff03 41px);
    pointer-events: none; z-index: 0;
  }}

  /* Extra atmospheric glow bottom-right so the corner doesn't feel empty */
  .card::after {{
    content: ''; position: absolute;
    right: -200px; bottom: -200px;
    width: 600px; height: 600px;
    background: radial-gradient(circle, {RED}22 0%, transparent 70%);
    pointer-events: none; z-index: 0;
  }}

  .accent-bar {{
    width: 8px; height: 100%;
    background: linear-gradient(180deg, {RED} 0%, {RED_DARK} 100%);
    flex-shrink: 0; position: relative; z-index: 1;
  }}

  .content {{
    flex: 1;
    padding: 48px 72px 44px 56px;
    display: flex; flex-direction: column;
    position: relative; z-index: 1;
  }}

  .brand {{
    font-family: 'Barlow Condensed', sans-serif;
    font-size: 16px; font-weight: 700;
    letter-spacing: 0.14em; text-transform: uppercase;
    color: #ffffff35;
  }}

  .eyebrow {{
    font-family: 'Barlow Condensed', sans-serif;
    font-size: 18px; font-weight: 700;
    letter-spacing: 0.22em; text-transform: uppercase;
    color: {RED}; margin-bottom: 10px;
  }}

  .hero {{
    font-family: 'Barlow Condensed', sans-serif;
    font-size: 108px; font-weight: 900;
    line-height: 0.88; text-transform: uppercase;
    letter-spacing: -0.01em; color: #ffffff;
    margin-bottom: 28px;
    text-shadow: 0 0 80px {RED}30;
  }}

  .subtitle {{
    font-family: 'Barlow', sans-serif;
    font-size: 20px; font-weight: 400;
    color: #ffffff55; letter-spacing: 0.02em;
    line-height: 1.5;
    max-width: 720px;
  }}

  .middle {{ flex: 1; display: flex; flex-direction: column; justify-content: center; }}

  /* Stat row — reinforces the "this is a real model" angle */
  .stats {{
    display: flex; gap: 42px;
    margin-top: 20px;
    padding-top: 20px;
    border-top: 1px solid #ffffff10;
  }}
  .stat {{ display: flex; flex-direction: column; gap: 4px; }}
  .stat-num {{
    font-family: 'Barlow Condensed', sans-serif;
    font-size: 34px; font-weight: 700;
    color: #ffffffd0; line-height: 1;
  }}
  .stat-label {{
    font-family: 'Barlow Condensed', sans-serif;
    font-size: 12px; font-weight: 700;
    letter-spacing: 0.18em; text-transform: uppercase;
    color: #ffffff45;
  }}
  .stat-num .red {{ color: {RED}; }}

  .context-line {{
    font-family: 'Barlow', sans-serif;
    font-size: 15px; font-style: italic;
    color: #ffffff45;
  }}
</style>
</head>
<body>
<div class="card">
  <div class="accent-bar"></div>
  <div class="content">
    <div class="brand">HockeyGameBot</div>
    <div class="middle">
      <div class="eyebrow">★ Model Projections</div>
      <div class="hero">2026 Stanley Cup<br>Playoff Predictions</div>
      <div class="subtitle">Series win probability, game-length distributions, and series tracker for every matchup. Updated daily.</div>
      <div class="stats">
        <div class="stat">
          <div class="stat-num"><span class="red">10,000</span> sims</div>
          <div class="stat-label">Per Series · Monte Carlo</div>
        </div>
        <div class="stat">
          <div class="stat-num">Elo + xGF blend</div>
          <div class="stat-label">Live-updated bracket</div>
        </div>
      </div>
    </div>
    <div class="context-line">hockeygamebot.com/playoffs/2026</div>
  </div>
</div>
</body>
</html>"""


async def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    from playwright.async_api import async_playwright
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={"width": 1200, "height": 630})
        await page.set_content(HTML, wait_until="networkidle")
        out = OUTPUT_DIR / "playoffs.png"
        await page.screenshot(path=str(out), full_page=False)
        await browser.close()

    print(f"✓  {out}")


if __name__ == "__main__":
    asyncio.run(main())
