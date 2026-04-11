#!/usr/bin/env python3
"""
Generate public/og/main.png — default OG image for hockeygamebot.com.

Same design language as generate_og_teams.py (no ghost, same layout,
same fonts, same red gradient accent bar).

Usage: /Users/mattdonders/.virtualenvs/hockeygamebot/bin/python scripts/generate_og_main.py
Output: public/og/main.png
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

  /* Diagonal line texture — identical to teams.png */
  .card::before {{
    content: ''; position: absolute; inset: 0;
    background-image: repeating-linear-gradient(-45deg, transparent, transparent 40px, #ffffff03 40px, #ffffff03 41px);
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

  /* Top watermark — identical to teams.png */
  .brand {{
    font-family: 'Barlow Condensed', sans-serif;
    font-size: 16px; font-weight: 700;
    letter-spacing: 0.14em; text-transform: uppercase;
    color: #ffffff35;
  }}

  /* Eyebrow — identical to teams.png */
  .eyebrow {{
    font-family: 'Barlow Condensed', sans-serif;
    font-size: 18px; font-weight: 700;
    letter-spacing: 0.22em; text-transform: uppercase;
    color: {RED}; margin-bottom: 10px;
  }}

  /* Hero — 2 lines to give each phrase its own visual weight */
  .hero {{
    font-family: 'Barlow Condensed', sans-serif;
    font-size: 96px; font-weight: 900;
    line-height: 0.9; text-transform: uppercase;
    letter-spacing: -0.01em; color: #ffffff;
    margin-bottom: 28px;
    text-shadow: 0 0 80px {RED}20;
  }}

  /* Subtitle — slightly smaller than teams.png to accommodate longer text */
  .subtitle {{
    font-family: 'Barlow', sans-serif;
    font-size: 20px; font-weight: 400;
    color: #ffffff55; letter-spacing: 0.02em;
    line-height: 1.5;
  }}

  .middle {{ flex: 1; display: flex; flex-direction: column; justify-content: center; }}

  /* Bottom context line — identical to teams.png */
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
      <div class="eyebrow">Live NHL Scoreboard</div>
      <div class="hero">Every NHL Game.<br>Every Night.</div>
      <div class="subtitle">Live scores &middot; Game updates &middot; Playoff cards &middot; Twitch stream</div>
    </div>
    <div class="context-line">hockeygamebot.com</div>
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
        out = OUTPUT_DIR / "main.png"
        await page.screenshot(path=str(out), full_page=False)
        await browser.close()

    print(f"✓  {out}")


if __name__ == "__main__":
    asyncio.run(main())
