# PR5: Trade Dossier — "What Your Team Just Got"

**Status**: Planning only — scope before next trade deadline (Feb 2027)  
**Complexity estimate**: 8–14 hours (frontend-heavy; canvas card + new route)  
**Dependencies**: Existing `players.json`, `player-season-stats`, `player-shots` endpoints; optional: new team-fit endpoint

---

## Overview

When a trade is announced, every fan immediately wants to know: *who is this guy, and does he fit
our team?* The Trade Dossier is a shareable page (and a downloadable card) that answers both
questions in ~10 seconds. It is triggered from a player's profile page via a "Trade View" button
or via a direct URL like `/players/[slug]/dossier?to=TOR`.

The primary deliverable is a **social card** — a 1200×630 image optimized for Twitter/Bluesky
shares. The secondary deliverable is the web page it backs.

---

## Card Layout (ASCII mockup, 1200×630)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  [HGB logo]           TRADE DOSSIER             [STL → TOR]  2025-26    │
├──────────────┬──────────────────────────────────────────────────────────┤
│              │  JORDAN KYROU                    RW · Age 27              │
│  [headshot]  │  ─────────────────────────────────────────────────────── │
│   circular   │  HGB TALENT       97th    ████████████████████ ·         │
│   120×120    │  WAR (season)     84th    ██████████████████   ·         │
│              │  xG/60            91st    ███████████████████  ·         │
│              │  Goals/60         88th    ██████████████████   ·         │
├──────────────┴──────────────────────────────────────────────────────────┤
│  THIS SEASON (2025-26)                                                   │
│  GP: 68  |  G: 32  |  A: 41  |  PTS: 73  |  TOI/GP: 18:42             │
├─────────────────────────────────────────────────────────────────────────┤
│  FIT WITH  [TOR]                                                         │
│  Shot gen: team ranks 8th in xGF/60 → Kyrou (top 5%) should thrive     │
│  PP: TOR has 2 open PP1 slots · Kyrou used on PP1 in STL (74th pct)    │
│  Style: possession team → matches Kyrou's 80th-pct xGF%                │
├─────────────────────────────────────────────────────────────────────────┤
│  hockeygamebot.com/players/jordan-kyrou       [🔗 share]                │
└─────────────────────────────────────────────────────────────────────────┘
```

Card sections:
1. **Header bar** — HGB branding, "TRADE DOSSIER" label, FROM → TO team abbreviations, season
2. **Player identity** — headshot (same circular crop as existing OG card), name, position, age
3. **4-stat percentile bar chart** — horizontal bars, color-coded by percentile tier
4. **Season stats strip** — GP, G, A, PTS, TOI/GP in a clean one-liner
5. **Fit section** — 2–3 narrative bullets about fit with destination team (see data gaps below)
6. **Footer** — player page URL + share affordance

---

## Trigger Mechanism

### Option A (recommended): URL param on existing player page

`/players/jordan-kyrou?trade=TOR`

- Detects `?trade=ABBR` on page load
- Replaces the default team chip with a "STL → TOR" pill
- Reveals a "Download Trade Card" button below the player header
- Canvas card is rendered client-side (same pattern as existing stat cards)
- No new route, no extra build-time page

### Option B: Dedicated route

`/players/[slug]/dossier`

- Full Astro page at `src/pages/stats/player/[slug]/dossier.astro`
- Cleaner URL for sharing but requires generating a page per player at build time or SSR
- Preferred if we want the card to be the OG image for the dossier URL itself

**Decision**: Start with Option A (URL param) for v1 — zero build-time overhead, no route churn.
Upgrade to Option B if sharing behavior demands a dedicated OG image URL.

---

## Data Endpoints

### Already available

| Data | Source | Notes |
|---|---|---|
| Player bio (name, pos, age, headshot) | `players.json` | `PlayerSummary` in stats-loader |
| Percentiles (Talent, ixG, goals, shots) | `players.json` | `percentiles_vs_pos` |
| Season stats (GP, G, A, PTS, TOI) | `players.json` | Raw totals already present |
| Shot map data | `player-shots` endpoint | Can overlay season heatmap in card |
| Multi-season history | `player-season-stats` endpoint | Career context for consistency |

### Gaps — "Fit with new team" section

The fit narrative requires *team-level* data that is not currently exported:

| Data needed | Gap level | Workaround |
|---|---|---|
| Destination team's xGF/60 rank | **Medium** — team game stats aggregated but not team-level rates | Compute from `team-game-stats` endpoint: aggregate per team, cache client-side |
| PP slot availability on destination team | **High** — PP TOI by line not in any export | Manual annotation at trade time, or skip for v1 |
| Destination team's style profile | **Medium** — xGF%, CF% per team aggregatable | Derivable from `team-game-stats` if team-level sums are added to export |

For v1: drop the "Fit" section to a simpler **"Team Context"** box that shows destination team's
overall xGF% rank and one sentence ("Top-10 possession team" / "Bottom-third in shot generation")
— avoids the PP slot gap entirely.

For v2 (trade deadline prep, Jan 2027): add a `team-profiles.json` export to the pipeline with
per-team `xgf_60`, `xga_60`, `cf_pct_5v5`, `pp_rank`, `pk_rank`. One new export, <5 KB, can
power both the dossier and a future team comparison page.

---

## Client-Side Canvas vs Server-Rendered OG Image

### Client-side canvas (recommended for v1)
- Same pattern as the 5 existing stat cards in `[slug].astro`
- No infrastructure changes — renders on demand in the browser, download via `toBlob()`
- **Downside**: URL param approach (`?trade=TOR`) means the OG image for the shared link is still
  the generic player OG card, not the dossier card

### Server-rendered OG image
- A Cloudflare Worker route at `/og/trade/[slug]?to=ABBR` renders the card via `@cloudflare/resvg-wasm`
  (SVG → PNG at edge) or Satori (JSX → SVG → PNG)
- **Upside**: sharing the dossier URL shows the dossier card in link previews
- **Downside**: requires new Worker route, Satori/resvg wasm bundle (~500 KB), cold-start latency

**Decision**: v1 is client-side canvas (matches existing pattern, ships faster). v2 adds edge OG
image if the workflow becomes: "bot detects trade → posts dossier URL → card appears in preview".

---

## Build Order

1. **(1 hr)** Design finalize — confirm card layout, pick font sizes, write copy for all 5 sections
2. **(2 hr)** Canvas card renderer — `renderDossierCard(player, toTeam)` function; produces a
   `<canvas>` element; unit test with 3 known trade targets
3. **(1 hr)** URL param detection in `[slug].astro` — read `?trade=ABBR`, pass to card renderer,
   show/hide "Download Trade Card" button
4. **(1 hr)** "Team Context" section — aggregate destination team's xGF%/rank from existing
   `team-game-stats` data; 1-sentence template string logic
5. **(1 hr)** Download button UX — trigger canvas `toBlob()` → download filename
   `hgb-trade-kyrou-to-tor.png`; confirm aspect ratio matches Twitter card spec
6. **(1–2 hr)** QA — test with 3 real trades from 2025 deadline; confirm headshot loads,
   layout doesn't overflow at edge cases (long names, short stat lines)
7. **(1–2 hr, optional v1.5)** Bluesky/Twitter share button — pre-fills tweet with card download
   + dossier URL; reduces friction from "download → upload" to one click

**Total v1**: 8–10 hours  
**Total v2 (edge OG image)**: add 4–6 hours

---

## Pipeline Dependencies

No pipeline changes required for v1. The `team-profiles.json` export (see gaps above) is a
recommended v2 addition — add to `export_stats_data.py` alongside the other R2 uploads. Shape:

```json
{
  "TOR": {
    "xgf_60": 2.84,
    "xga_60": 2.41,
    "xgf_pct_5v5": 0.541,
    "cf_pct_5v5": 0.513,
    "pp_pct": 0.238,
    "pk_pct": 0.821,
    "pp_rank": 4,
    "pk_rank": 12,
    "xgf_rank": 3,
    "generated_at": "2026-04-01T06:00:00Z"
  },
  ...
}
```

---

## Open Questions

- **Headshots at trade time**: If a player is traded mid-season, does the NHL CDN headshot URL
  update to show new team jersey? Test with a known in-season trade before assuming yes.
- **Multiple trades**: Player traded twice in a season (rare but happens). The `?trade=TOR` param
  should always reflect the *destination* team, not the current roster team. Display name in card
  reads "STL → TOR" regardless of what `p.team_abbrev` shows.
- **Bot integration**: Phase 2 vision — when `cloudflare_notify.py` detects a trade via NHL API
  transaction feed, it auto-generates and posts the dossier card. Requires the server-side canvas
  approach (not client canvas). Flag this as the long-term target.
- **Season selection**: Dossier should default to current season stats. Show a season selector
  only if the player has 3+ seasons (otherwise the selector adds complexity with no benefit).
