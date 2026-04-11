#!/usr/bin/env python3
"""
Generate public/og/teams.png — static OG image for the /teams page.

Clean variant (no ghost watermark) — approved 2026-04-11.

Usage: /Users/mattdonders/.virtualenvs/hockeygamebot/bin/python scripts/generate_og_teams.py
"""

import asyncio
from pathlib import Path

ROOT        = Path(__file__).parent.parent
OUTPUT_DIR  = ROOT / "public" / "og"

RED      = "#E8002D"
RED_DARK = "#5a0010"
BG       = "#0d0d14"

SHARED_CSS = f"""
  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  body {{ width: 1200px; height: 630px; overflow: hidden; background: #0a0a0f; font-family: 'Barlow', sans-serif; }}

  .card {{
    width: 1200px; height: 630px;
    background: {BG};
    position: relative; overflow: hidden; display: flex;
  }}

  /* Diagonal line texture */
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

  /* Ghost HGB — half the opacity of clinch card ghost logo (0.045 → 0.022),
     sized and positioned so it fits fully within the right side */
  .ghost {{
    position: absolute;
    right: 50px;
    top: 50%;
    transform: translateY(-50%);
    font-family: 'Barlow Condensed', sans-serif;
    font-size: 260px;
    font-weight: 900;
    color: #ffffff;
    opacity: 0.022;
    line-height: 1;
    letter-spacing: 0.08em;
    z-index: 0;
    user-select: none;
  }}

  .content {{
    flex: 1;
    padding: 48px 72px 44px 56px;
    display: flex; flex-direction: column;
    position: relative; z-index: 1;
  }}

  /* Top watermark — identical to .brand in clinch card */
  .brand {{
    font-family: 'Barlow Condensed', sans-serif;
    font-size: 16px; font-weight: 700;
    letter-spacing: 0.14em; text-transform: uppercase;
    color: #ffffff35;
  }}

  /* Eyebrow — identical to .clinch-type */
  .eyebrow {{
    font-family: 'Barlow Condensed', sans-serif;
    font-size: 18px; font-weight: 700;
    letter-spacing: 0.22em; text-transform: uppercase;
    color: {RED}; margin-bottom: 10px;
  }}

  /* Hero — single line, sized to fit */
  .hero {{
    font-family: 'Barlow Condensed', sans-serif;
    font-size: 96px; font-weight: 900;
    line-height: 0.9; text-transform: uppercase;
    letter-spacing: -0.01em; color: #ffffff;
    margin-bottom: 26px;
    text-shadow: 0 0 80px {RED}20;
    white-space: nowrap;
  }}

  .subtitle {{
    font-family: 'Barlow', sans-serif;
    font-size: 24px; font-weight: 400;
    color: #ffffff55; letter-spacing: 0.02em;
  }}

  .middle {{ flex: 1; display: flex; flex-direction: column; justify-content: center; }}

  /* Bottom context line — italic, same as .context-line in clinch card */
  .context-line {{
    font-family: 'Barlow', sans-serif;
    font-size: 15px; font-style: italic;
    color: #ffffff45;
  }}
"""

HEAD = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700;800;900&family=Barlow:ital,wght@0,400;0,500;1,400&display=swap" rel="stylesheet">
<style>{SHARED_CSS}</style>
</head>
<body>"""

BODY_CONTENT = """
    <div class="accent-bar"></div>
    <div class="content">
      <div class="brand">HockeyGameBot</div>
      <div class="middle">
        <div class="eyebrow">Team Bot Directory</div>
        <div class="hero">Find Your Team Bot</div>
        <div class="subtitle">32 NHL bots &middot; Twitter&nbsp;/&nbsp;X &amp; Bluesky</div>
      </div>
      <div class="context-line">hockeygamebot.com/teams</div>
    </div>"""

HTML_WITH_GHOST = f"""{HEAD}
<div class="card">
  <div class="ghost">HGB</div>
  {BODY_CONTENT}
</div>
</body></html>"""

HTML_NO_GHOST = f"""{HEAD}
<div class="card">
  {BODY_CONTENT}
</div>
</body></html>"""


async def render(html: str, path: Path) -> None:
    from playwright.async_api import async_playwright
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={"width": 1200, "height": 630})
        await page.set_content(html, wait_until="networkidle")
        await page.screenshot(path=str(path), full_page=False)
        await browser.close()
    print(f"✓  {path}")


async def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    await render(HTML_NO_GHOST, OUTPUT_DIR / "teams.png")


if __name__ == "__main__":
    asyncio.run(main())
