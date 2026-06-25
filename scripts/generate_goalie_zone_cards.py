"""generate_goalie_zone_cards.py — Batch-generate goalie zone-map PNG cards and upload to R2.

Layout (light mode, 960px wide):
  Header: HOCKEYgamebot ANALYTICS / GOALIE PERFORMANCE CARD · 2025-26
  Hero row: Goalie name | SV% / GSAx / SA tiles
  Two-column body:
    Left — GSAA by xG difficulty tier (bar chart, data from goalies.json)
    Right — Save% vs League Average by Zone (KDE contour map from SQLite shots)

Data sources:
  - src/data/stats/goalies.json  → stats, bins, goalie_id  (already in site repo)
  - hgb_analytics.sqlite          → raw shot x/y coordinates (for KDE)

R2 key: stats/goalie-cards/{goalie_id}.png

Usage
-----
    # Single goalie (debug)
    python scripts/generate_goalie_zone_cards.py --goalie "Swayman" --db ~/path/to/hgb_analytics.sqlite

    # All qualified goalies (500+ SA), dry-run
    python scripts/generate_goalie_zone_cards.py --all --dry-run --db ~/hgb-analytics/data/hgb_analytics.sqlite

    # Production (Hetzner)
    python scripts/generate_goalie_zone_cards.py --all --db ~/hgb-analytics/data/hgb_analytics.sqlite

    # Skip goalies already in R2 unless --force
    python scripts/generate_goalie_zone_cards.py --all --force --db ~/hgb-analytics/data/hgb_analytics.sqlite

Credentials (R2 S3-compatible API, same as upload_stats_r2.py in hgb-analytics):
    R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ACCOUNT_ID — set in .env or environment
"""
from __future__ import annotations

import argparse
import asyncio
import base64
import io
import json
import logging
import os
import sqlite3
import tempfile
from pathlib import Path

import numpy as np

log = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

_REPO       = Path(__file__).resolve().parents[1]
_GOALIES_JSON = _REPO / "src" / "data" / "stats" / "goalies.json"
_OUT_DIR    = _REPO / "exports" / "goalie-cards"
_BUCKET     = "hgb-media"
_R2_PREFIX  = "stats/goalie-cards"

SEASON      = "20252026"
MIN_SA      = 500

FONT = (
    '<link rel="preconnect" href="https://fonts.googleapis.com">'
    '<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed'
    ':wght@400;700;800;900&display=swap" rel="stylesheet">'
)

BG      = "#EFEEE8"
SURFACE = "#FFFFFF"
INK     = "#0d0d14"
RED     = "#E8002D"
GREEN   = "#15803d"
MUTED   = "rgba(13,13,20,0.45)"
BORDER  = "rgba(13,13,20,0.14)"

BIN_LABELS = [
    "Easiest  (xG < 0.014)",
    "Low      (xG 0.014–0.032)",
    "Medium   (xG 0.032–0.067)",
    "Hard     (xG 0.067–0.119)",
    "Hardest  (xG 0.12+)",
]


# ── Goalie data from site JSON ───────────────────────────────────────────────

def load_goalies() -> list[dict]:
    with open(_GOALIES_JSON) as f:
        return json.load(f)


def find_goalie(goalies: list[dict], search: str) -> dict | None:
    s = search.lower()
    for g in goalies:
        name = (g.get("name") or "").lower()
        first = (g.get("first_name") or "").lower()
        last  = (g.get("last_name") or "").lower()
        if s in name or s in last or s in (f"{first} {last}"):
            return g
    return None


# ── Shot coordinates from SQLite ─────────────────────────────────────────────

def load_shots(db_path: str, goalie_id: int, season: str) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """Return (gx, gy, gg, lx, ly, lg) — goalie and league shot arrays (x_n, y_n, is_goal)."""
    con = sqlite3.connect(db_path)
    try:
        goalie_q = f"""
            SELECT ABS(s.x_coord) as x_n,
                   CASE WHEN s.x_coord>=0 THEN s.y_coord ELSE -s.y_coord END as y_n,
                   s.is_goal
            FROM shots s
            JOIN games g ON s.game_id=g.game_id
            JOIN event_players ep ON s.game_id=ep.game_id AND s.event_id=ep.event_id
            WHERE ep.role='goalie_in_net' AND ep.player_id={goalie_id}
              AND s.is_empty_net_shot=0 AND g.season='{season}'
              AND ABS(s.x_coord) BETWEEN 25 AND 89
        """
        league_q = f"""
            SELECT ABS(s.x_coord) as x_n,
                   CASE WHEN s.x_coord>=0 THEN s.y_coord ELSE -s.y_coord END as y_n,
                   s.is_goal
            FROM shots s
            JOIN games g ON s.game_id=g.game_id
            JOIN event_players ep ON s.game_id=ep.game_id AND s.event_id=ep.event_id
            WHERE ep.role='goalie_in_net' AND s.is_empty_net_shot=0
              AND g.season='{season}' AND ABS(s.x_coord) BETWEEN 25 AND 89
        """
        import pandas as pd
        gdf = pd.read_sql_query(goalie_q, con)
        ldf = pd.read_sql_query(league_q, con)
    finally:
        con.close()
    return (
        gdf.x_n.values, gdf.y_n.values, gdf.is_goal.values.astype(float),
        ldf.x_n.values, ldf.y_n.values, ldf.is_goal.values.astype(float),
    )


# ── KDE ──────────────────────────────────────────────────────────────────────

def compute_kde(gx, gy, gg, lx, ly, lg, bw: float = 6.0, step: float = 1.5):
    """Nadaraya-Watson KDE: delta save% (goalie sv% − league sv%) at each grid point."""
    xr = np.arange(25 + step/2, 89, step)
    yr = np.arange(-42.5 + step/2, 42.5, step)
    gxg, gyg = np.meshgrid(xr, yr, indexing='ij')
    fx, fy = gxg.ravel(), gyg.ravel()

    def _ksv(sx, sy, sg, batch=300):
        sv = np.zeros(len(fx))
        for i in range(0, len(fx), batch):
            dx = fx[i:i+batch, None] - sx
            dy = fy[i:i+batch, None] - sy
            w  = np.exp(-(dx**2 + dy**2) / (2 * bw**2))
            ws = w.sum(axis=1)
            sv[i:i+batch] = np.where(ws > 1e-6, (w * (1 - sg)).sum(axis=1) / ws, np.nan)
        return sv

    sv_g = _ksv(gx, gy, gg)
    sv_l = _ksv(lx, ly, lg)
    delta = (sv_g - sv_l).reshape(len(xr), len(yr))
    return xr, yr, delta


# ── Zone map PNG (matplotlib contourf, rink drawn programmatically) ──────────

def render_zone_png(xr, yr, delta) -> bytes:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import matplotlib.patches as mpatches
    from matplotlib.colors import TwoSlopeNorm

    LEVELS = [-0.06, -0.04, -0.02, -0.01, 0, 0.01, 0.02, 0.04, 0.06]
    XX, YY = np.meshgrid(xr, yr, indexing='ij')

    fig, ax = plt.subplots(figsize=(5.5, 4.6), dpi=150)
    fig.subplots_adjust(0, 0, 1, 1)
    fig.patch.set_facecolor("none")
    ax.set_facecolor("#DCF0F8")   # ice surface

    # ── Rink markings ──
    # Boards (full zone, rounded)
    boards = mpatches.FancyBboxPatch(
        (25, -42.5), 75, 85,
        boxstyle="round,pad=0,rounding_size=28",
        linewidth=1.2, edgecolor="#888", facecolor="none",
        transform=ax.transData, zorder=5
    )
    ax.add_patch(boards)

    # Ice fill
    ice = mpatches.FancyBboxPatch(
        (25, -42.5), 75, 85,
        boxstyle="round,pad=0,rounding_size=28",
        linewidth=0, facecolor="#DCF0F8",
        transform=ax.transData, zorder=1
    )
    ax.add_patch(ice)

    # Goal line (red)
    ax.axvline(89, color="#E8002D", linewidth=1.2, zorder=4, alpha=0.7)

    # Crease (blue D-shape)
    crease = mpatches.Arc((89, 0), 12, 12, angle=0, theta1=90, theta2=270,
                           color="#4682B4", linewidth=1.0, zorder=4)
    ax.add_patch(crease)
    ax.fill_betweenx([-6, 6], [89, 89], [83, 83], color="#4682B4", alpha=0.15, zorder=3)

    # Goal posts
    ax.plot([89, 89], [-3, 3], color="#555", linewidth=3.5, solid_capstyle="butt", zorder=5)

    # Faceoff circles
    for yfo in [-22, 22]:
        circle = mpatches.Circle((69, yfo), 15, fill=False,
                                  edgecolor="#E8002D", linewidth=0.8, alpha=0.5, zorder=4)
        ax.add_patch(circle)
        ax.plot(69, yfo, 'o', color="#E8002D", markersize=3, alpha=0.6, zorder=4)

    # ── KDE contour surface ──
    norm = TwoSlopeNorm(vmin=-0.06, vcenter=0, vmax=0.06)
    cf   = ax.contourf(XX, YY, delta, levels=LEVELS, cmap='coolwarm_r',
                       alpha=0.82, zorder=2, extend='both', norm=norm)

    # Clip everything to rounded rink shape
    clip = mpatches.FancyBboxPatch(
        (25, -42.5), 75, 85,
        boxstyle="round,pad=0,rounding_size=28",
        linewidth=0, facecolor="none", edgecolor="none",
        transform=ax.transData
    )
    ax.add_patch(clip)
    for collection in ax.collections:
        collection.set_clip_path(clip)
    for line in ax.lines:
        line.set_clip_path(clip)

    ax.set_xlim(25, 100)
    ax.set_ylim(-42.5, 42.5)
    ax.axis("off")

    buf = io.BytesIO()
    fig.savefig(buf, format="png", bbox_inches="tight", pad_inches=0,
                dpi=150, transparent=True)
    plt.close(fig)
    buf.seek(0)

    # Rotate portrait: slot at top, blue line at bottom
    from PIL import Image as PILImage
    img  = PILImage.open(buf).rotate(-90, expand=True)
    buf2 = io.BytesIO()
    img.save(buf2, format="PNG")
    return buf2.getvalue()


# ── GSAA tier bar HTML ────────────────────────────────────────────────────────

def _bar_html(label: str, gsax: float, max_abs: float, sub: str = "") -> str:
    color   = GREEN if gsax >= 0 else RED
    sign    = "+" if gsax >= 0 else ""
    bar_pct = (abs(gsax) / max_abs) * 50
    if gsax >= 0:
        bar_style = f"margin-left:50%;width:{bar_pct:.1f}%"
    else:
        bar_style = f"margin-left:{50 - bar_pct:.1f}%;width:{bar_pct:.1f}%"
    return f"""
<div style="margin-bottom:11px">
  <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:3px">
    <span style="font-size:13px;font-weight:600;letter-spacing:0.03em;color:{INK}">{label}</span>
    <span style="font-size:16px;font-weight:800;color:{color};letter-spacing:-0.02em">{sign}{gsax:.1f}</span>
  </div>
  <div style="position:relative;height:7px;background:rgba(13,13,20,0.10);border-radius:4px;overflow:hidden">
    <div style="position:absolute;top:0;height:100%;background:{color};border-radius:4px;{bar_style}"></div>
    <div style="position:absolute;top:0;left:50%;width:1px;height:100%;background:rgba(13,13,20,0.25)"></div>
  </div>
  {"<div style='font-size:10px;color:" + MUTED + ";margin-top:2px'>" + sub + "</div>" if sub else ""}
</div>"""


# ── Full card HTML ────────────────────────────────────────────────────────────

def build_card_html(goalie: dict, zone_png: bytes) -> str:
    name    = goalie.get("name", "Unknown")
    first   = goalie.get("first_name") or name.split(".")[0].strip()
    last    = goalie.get("last_name") or name.split(".")[-1].strip()
    team    = goalie.get("team_abbrev") or "NHL"
    gsax    = float(goalie.get("gsax", 0))
    sv_pct  = goalie.get("sv_pct")
    sa      = int(goalie.get("sa", 0))
    gp      = goalie.get("gp") or len(goalie.get("games", []))

    gsax_sign = f"+{gsax:.1f}" if gsax >= 0 else f"{gsax:.1f}"
    gsax_col  = GREEN if gsax >= 0 else RED
    sv_str    = f".{round(sv_pct * 1000):03d}" if sv_pct is not None else "—"

    # GSAA bars from bins (already in JSON, same data as the old CSV)
    bins     = sorted(goalie.get("bins", []), key=lambda b: b.get("bin_label", ""))
    max_abs  = max((abs(float(b.get("gsax", 0))) for b in bins), default=1.0)
    bars_html = ""
    for i, b in enumerate(bins):
        label    = BIN_LABELS[i] if i < len(BIN_LABELS) else b.get("bin_label", f"Tier {i+1}")
        b_gsax   = float(b.get("gsax", 0))
        b_sv     = b.get("sv_pct")
        b_lg     = b.get("league_sv_pct")
        b_sa     = int(b.get("sa", 0))
        sub_parts = [f"{b_sa} SA"]
        if b_sv is not None:
            sub_parts.append(f"sv% .{round(b_sv*1000):03d} vs .{round(b_lg*1000):03d} lg avg")
        bars_html += _bar_html(label, b_gsax, max_abs, " · ".join(sub_parts))

    zone_b64 = base64.b64encode(zone_png).decode()

    return f"""<!DOCTYPE html><html><head><meta charset="utf-8">{FONT}
<style>
  *, *::before, *::after {{ margin:0; padding:0; box-sizing:border-box; }}
  body {{ background:{BG}; font-family:'Barlow Condensed',sans-serif; width:960px; padding:28px 32px; }}
  .wm   {{ font-size:10px; font-weight:700; letter-spacing:0.22em; color:{MUTED}; text-transform:uppercase; margin-bottom:3px; }}
  .rl   {{ font-size:11px; font-weight:700; letter-spacing:0.22em; color:{RED}; text-transform:uppercase; }}
  .rule {{ height:2px; background:{RED}; margin:12px 0 20px; }}
  .sl   {{ font-size:10px; font-weight:700; letter-spacing:0.14em; text-transform:uppercase; color:{MUTED}; margin-bottom:3px; }}
  .sv   {{ font-size:26px; font-weight:800; color:{INK}; letter-spacing:-0.02em; }}
  .stit {{ font-size:10px; font-weight:700; letter-spacing:0.16em; text-transform:uppercase;
           color:{MUTED}; margin-bottom:12px; padding-bottom:6px; border-bottom:1px solid {BORDER}; }}
</style></head><body>

<div class="wm">HockeyGameBot Analytics</div>
<div class="rl">Goalie Performance Card · 2025–26 Regular Season</div>
<div class="rule"></div>

<!-- Hero -->
<div style="display:flex;align-items:center;gap:20px;margin-bottom:24px">
  <div style="flex:1">
    <div style="font-size:44px;font-weight:900;letter-spacing:0.01em;text-transform:uppercase;
                color:{INK};line-height:0.95">{last}</div>
    <div style="font-size:13px;font-weight:600;letter-spacing:0.10em;color:{MUTED};margin-top:5px">
      {first} · {team} · Goaltender · {gp} GP
    </div>
  </div>
  <div style="display:grid;grid-template-columns:repeat(3,1fr);background:{SURFACE};
              border:1px solid {BORDER};overflow:hidden">
    <div style="text-align:center;padding:12px 24px">
      <div class="sl">SV%</div>
      <div class="sv">{sv_str}</div>
    </div>
    <div style="text-align:center;padding:12px 24px;border-left:1px solid {BORDER};border-right:1px solid {BORDER}">
      <div class="sl">GSAx</div>
      <div style="font-size:26px;font-weight:800;color:{gsax_col};letter-spacing:-0.02em">{gsax_sign}</div>
    </div>
    <div style="text-align:center;padding:12px 24px">
      <div class="sl">SA</div>
      <div class="sv">{sa:,}</div>
    </div>
  </div>
</div>

<!-- Body: two columns -->
<div style="display:flex;gap:28px;align-items:stretch">

  <!-- Left: GSAA tiers -->
  <div style="flex:0 0 400px">
    <div class="stit">GSAA by Shot Difficulty Tier</div>
    {bars_html}
    <div style="font-size:10px;color:{MUTED};margin-top:16px;line-height:1.6">
      Goals saved above expected · bin-calibrated vs league avg save% per xG tier<br>
      Fenwick shots · xg_xgb model · 2025–26 Regular Season
    </div>
  </div>

  <!-- Divider -->
  <div style="width:1px;background:{BORDER};flex-shrink:0;align-self:stretch"></div>

  <!-- Right: Zone map -->
  <div style="flex:1;display:flex;flex-direction:column">
    <div class="stit">Save% vs League Average by Zone</div>
    <div style="flex:1;display:flex;align-items:center;justify-content:center">
      <img src="data:image/png;base64,{zone_b64}"
           style="max-height:340px;max-width:100%;object-fit:contain;display:block"/>
    </div>
    <div style="display:flex;align-items:center;justify-content:center;gap:10px;margin-top:10px">
      <span style="font-size:10px;font-weight:700;letter-spacing:0.08em;color:{MUTED}">&larr; WORSE</span>
      <div style="width:120px;height:7px;border-radius:3px;
                  background:linear-gradient(to right,#b91c1c,#ffffff,#1d4ed8)"></div>
      <span style="font-size:10px;font-weight:700;letter-spacing:0.08em;color:{MUTED}">BETTER &rarr;</span>
    </div>
    <div style="font-size:10px;color:{MUTED};text-align:center;margin-top:4px;letter-spacing:0.04em">
      Raw sv% vs league avg · kernel density · 6ft bandwidth
    </div>
  </div>

</div>

</body></html>"""


# ── Playwright screenshot ─────────────────────────────────────────────────────

async def screenshot_html(html: str, out_path: Path) -> None:
    from playwright.async_api import async_playwright
    tmp = Path(tempfile.mktemp(suffix=".html"))
    tmp.write_text(html, encoding="utf-8")
    async with async_playwright() as pw:
        br = await pw.chromium.launch()
        pg = await br.new_page(viewport={"width": 1020, "height": 900}, device_scale_factor=2)
        await pg.goto(f"file://{tmp}")
        await pg.wait_for_load_state("networkidle")
        await pg.wait_for_timeout(600)
        body = await pg.query_selector("body")
        await body.screenshot(path=str(out_path))
        await br.close()
    tmp.unlink(missing_ok=True)


# ── R2 upload ─────────────────────────────────────────────────────────────────

def get_r2_client():
    import boto3
    account_id = os.environ["R2_ACCOUNT_ID"]
    return boto3.client(
        "s3",
        endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )


def r2_key_exists(client, key: str) -> bool:
    try:
        client.head_object(Bucket=_BUCKET, Key=key)
        return True
    except Exception:
        return False


def upload_to_r2(client, local_path: Path, r2_key: str) -> None:
    client.upload_file(
        str(local_path), _BUCKET, r2_key,
        ExtraArgs={"ContentType": "image/png", "CacheControl": "public, max-age=86400"},
    )
    log.info("uploaded %s → s3://%s/%s", local_path.name, _BUCKET, r2_key)


# ── Main ──────────────────────────────────────────────────────────────────────

async def generate_one(goalie: dict, db_path: str, out_dir: Path,
                       dry_run: bool, r2_client, force: bool) -> bool:
    name      = goalie.get("name", "unknown")
    goalie_id = goalie.get("goalie_id")
    r2_key    = f"{_R2_PREFIX}/{goalie_id}.png"
    out_path  = out_dir / f"{goalie_id}.png"

    if not force and r2_client and r2_key_exists(r2_client, r2_key):
        log.info("skip %-24s — already in R2", name)
        return False

    log.info("generating %-24s (id=%s)", name, goalie_id)

    if dry_run:
        log.info("  [dry-run] would generate + upload %s", r2_key)
        return True

    # Load shots and compute KDE
    try:
        gx, gy, gg, lx, ly, lg = load_shots(db_path, goalie_id, SEASON)
    except Exception as e:
        log.warning("  shot load failed for %s: %s", name, e)
        return False

    log.info("  shots: %d goalie | %d league — computing KDE…", len(gx), len(lx))
    xr, yr, delta = compute_kde(gx, gy, gg, lx, ly, lg)

    log.info("  rendering zone map…")
    zone_png = render_zone_png(xr, yr, delta)

    log.info("  building card HTML…")
    html = build_card_html(goalie, zone_png)

    log.info("  screenshotting…")
    out_dir.mkdir(parents=True, exist_ok=True)
    await screenshot_html(html, out_path)

    if r2_client:
        upload_to_r2(r2_client, out_path, r2_key)

    return True


async def main_async(args: argparse.Namespace) -> None:
    from dotenv import load_dotenv
    load_dotenv(_REPO / ".env")

    goalies_path = Path(args.goalies_json) if args.goalies_json else _GOALIES_JSON
    with open(goalies_path) as f:
        goalies = json.load(f)
    log.info("loaded %d goalies from %s", len(goalies), goalies_path)

    if args.goalie:
        target = find_goalie(goalies, args.goalie)
        if not target:
            log.error("no goalie found matching '%s'", args.goalie)
            return
        candidates = [target]
    else:
        candidates = [g for g in goalies if int(g.get("sa", 0)) >= MIN_SA]
        log.info("%d qualified goalies (≥%d SA)", len(candidates), MIN_SA)

    if not args.db:
        log.error("--db path to hgb_analytics.sqlite is required")
        return

    r2_client = None if args.dry_run else get_r2_client()
    out_dir   = Path(args.out_dir) if args.out_dir else _REPO / "exports" / "goalie-cards"

    generated = skipped = errors = 0
    for g in candidates:
        try:
            did = await generate_one(g, args.db, out_dir,
                                     dry_run=args.dry_run,
                                     r2_client=r2_client,
                                     force=args.force)
            if did:
                generated += 1
            else:
                skipped += 1
        except Exception as e:
            log.error("failed %s: %s", g.get("name"), e)
            errors += 1

    log.info("done — generated=%d skipped=%d errors=%d", generated, skipped, errors)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--goalie",       help="Partial name match for single-goalie debug run")
    ap.add_argument("--all",          action="store_true", help="Generate for all qualified goalies (≥500 SA)")
    ap.add_argument("--db",           required=True, help="Path to hgb_analytics.sqlite")
    ap.add_argument("--goalies-json", help="Path to goalies.json (default: src/data/stats/goalies.json in site repo)")
    ap.add_argument("--out-dir",      help="Local output directory (default: exports/goalie-cards/ in site repo)")
    ap.add_argument("--season",       default=SEASON, help=f"Season string (default: {SEASON})")
    ap.add_argument("--dry-run",      action="store_true", help="Print what would happen without generating")
    ap.add_argument("--force",        action="store_true", help="Regenerate even if R2 key already exists")
    args = ap.parse_args()

    if not args.goalie and not args.all:
        ap.error("specify --goalie NAME or --all")

    asyncio.run(main_async(args))


if __name__ == "__main__":
    main()
