#!/usr/bin/env python3
"""Take full-page screenshots of every HGB page type for design review."""
from playwright.sync_api import sync_playwright
from pathlib import Path
import time

BASE = "https://hockeygamebot.com"
OUT  = Path(__file__).parent / "screenshots"
OUT.mkdir(exist_ok=True)

PAGES = [
    ("home",           "/"),
    ("stats-index",    "/stats"),
    ("skaters",        "/stats/skaters"),
    ("goalies",        "/stats/goalies"),
    ("lines",          "/stats/lines"),
    ("wowy",           "/stats/wowy"),
    ("explore",        "/stats/explore"),
    ("impact",         "/stats/impact"),
    ("records",        "/stats/records"),
    ("teams-index",    "/stats/teams"),
    ("team-page",      "/teams/car"),
    ("player-page",    "/stats/player/mitch-marner-8478483"),
    ("series-page",    "/stats/series/2026-scf-car-vgk"),
    ("playoffs-2026",  "/playoffs/2026"),
    ("scoreboard",     "/scoreboard"),
    ("results",        "/results"),
    ("games-index",    "/games"),
    ("analysis",       "/analysis"),
    ("methodology",    "/methodology"),
]

def screenshot_page(page, name, url):
    full_url = BASE + url
    print(f"  {name}: {full_url}")
    try:
        page.goto(full_url, wait_until="networkidle", timeout=30000)
        time.sleep(2)  # let canvas/JS settle
        page.screenshot(path=OUT / f"{name}.png", full_page=True)
        print(f"    ✓ saved")
    except Exception as e:
        print(f"    ✗ {e}")

with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 1440, "height": 900})
    page = ctx.new_page()

    for name, url in PAGES:
        screenshot_page(page, name, url)

    browser.close()

print(f"\nDone. Screenshots in {OUT}")
