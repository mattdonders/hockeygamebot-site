# Engineer Briefing — Multi-Season Player Career Table

**Filed:** 2026-05-25
**Repo:** `hgb-analytics` (pipeline) + `hockeygamebot-site` (UI)
**Status:** Open. Three-phase build, stop-point after phase 1.
**Reference:** JFresh tweet (attached) — per-player season-by-season GF% + xGF% at 5v5. Six seasons of Marner. The format is the entire value prop — multi-season comparison anchored to one player.

---

## What we're building

A "career snapshot" table on each player page showing season-by-season 5v5 performance. One row per season, columns for team, GP, TOI, GF%, xGF%. HGB design language (cream/ink, Barlow Condensed, red/green threshold cells on the % columns).

## Phase 1 — Data dependency check (~15-30 min, no other work)

The Hetzner SQLite (`~/hockeygamebot/data/hgb_analytics.sqlite` or wherever it lives in production) is presumed to have multi-season game data. **Verify before designing anything.**

Run on the Hetzner DB:

```sql
SELECT season, COUNT(*) AS games FROM games GROUP BY season ORDER BY season;
SELECT season, COUNT(DISTINCT player_id) AS players FROM player_game_features GROUP BY season ORDER BY season;
SELECT MIN(date), MAX(date), COUNT(*) FROM games WHERE season = (SELECT MIN(season) FROM games);
```

**Report back with:**
- Which seasons are present, with game counts per season
- Whether `player_game_features` (or whatever table holds per-player per-game aggregates) goes back the same range
- Any seasons that look partial (e.g., <500 games — suspicious)

**Stop point:** If only 2024-25 or 2025-26 are present, surface to Matt before proceeding. A 2-season table doesn't earn the build. We'd defer until a backfill happens.

## Phase 2 — Pipeline export (~2-3 hours, after phase 1 approval)

New export: `player_career.json` — keyed by `player_id`, value is an array of season records:

```json
{
  "8480012": {
    "player_id": 8480012,
    "full_name": "Mitch Marner",
    "seasons": [
      { "season": "20202021", "team": "TOR", "gp": 55, "toi_5v5_sec": 49230, "gf_pct": 73.8, "xgf_pct": 66.6 },
      { "season": "20212022", "team": "TOR", "gp": 72, "toi_5v5_sec": 62100, "gf_pct": 62.9, "xgf_pct": 60.5 }
    ]
  }
}
```

Notes:
- 5v5 only (matches JFresh strength state)
- xGF% comes from existing pipeline xG model (XGBoost, AUC 0.77 — same model used everywhere else, no methodology divergence)
- Sort seasons ascending in the array
- Include TOI in seconds (UI formats display)
- Skip seasons where TOI < 600 minutes (cup of coffee callups) OR mark them so UI can grey them out
- Include team affiliation per season (handles traded players cleanly — Marner row 6 shows VGK logo, not TOR)

## Phase 3 — UI: per-player career table on player page (~2 hours)

New section on the player detail page, slot it **between WAR breakdown and percentile profile**.

Layout:
- Section header: "CAREER — 5V5" with subtle red accent (match other section headers)
- Table rows: one per season, oldest to newest top-down (JFresh format)
- Columns: Team logo | Season | GP | TOI | GF% | xGF%
- Threshold colors on GF% and xGF% (≥55% green, ≤45% red, same logic as `/stats/lines`)
- Current season row gets a subtle highlight (left border or bg tint) so it pops
- Mobile: drop the TOI column if needed, keep team / season / GF% / xGF%

**Do NOT use the dark JFresh aesthetic** — apply HGB tokens (cream bg, Barlow Condensed, JetBrains Mono numbers).

## Out of scope

- **Leaderboard view** (e.g., "career xGF% leaders since 2020-21") — separate follow-up ticket, build after this lands
- Career charts / line graphs — table format only for v1, matches the JFresh restraint
- Per-season RAPM / WAR — defer to a Stage 2 if requested
- Playoff vs regular season split — single row per season, regular only
- Compare-two-players career view — defer

## Acceptance criteria

- [ ] Phase 1 data check report posted before any pipeline work starts
- [ ] `player_career.json` generated and deployed to R2
- [ ] Career table renders on player page with all available seasons
- [ ] Threshold colors apply to GF% and xGF%
- [ ] Traded players show correct team logo per season row
- [ ] Light + dark mode + mobile all render
- [ ] PNG export captures the career table (same canvas pattern as the rest of the page)

## Reporting back

Three checkpoints:
1. **After Phase 1:** data availability summary + Matt approval before continuing
2. **After Phase 2:** sample JSON for a high-profile player (e.g., Marner, Hischier, MacKinnon)
3. **After Phase 3:** sample URL + screenshots (light/dark/mobile) + PNG export

Don't ship Phase 3 if any season row is rendering incorrectly — better to surface than launch with broken data.
