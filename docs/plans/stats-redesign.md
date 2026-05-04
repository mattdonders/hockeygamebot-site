# Stats Site Redesign Plan — Offseason 2026

Authored: 2026-05-04. Based on Opus (product) + Sonnet (architecture) analysis.

---

## Strategic North Star

**Do not try to out-table hockeystats.com.** They have 5+ years of SEO, player headshots, PWHL coverage, and a 5-figure Twitter following. Competing on breadth loses.

**Win on:**
1. **Editorial narrative** — every player page tells a story, not just a number grid
2. **Publishable card artifacts** — the page IS a shareable object. Users generate, download, post. Hockeystats has zero card output.
3. **Bot pipeline parity** — every viz on the site is the same one the bots already vetted in production. Our data has credibility because 2,000+ followers already rely on it.
4. **Design** — the editorial system (Barlow Condensed, JetBrains Mono, `#EFEEE8` bg) is genuinely better. Use it.

We have the full offseason + Claude agents + strong PM. Ship the core lane first, then backfill breadth if traffic warrants it.

---

## Priority Sequence

| Phase | Deliverable | Dependency | Notes |
|---|---|---|---|
| **1** | Split `player_games.json` → per-player files | None | 9.4 MB file kills page load. Each player gets `src/data/stats/game-log/{player_id}.json` (~15-20 KB each). `getStaticPaths` reads individual file only. |
| **2** | Player detail page (`/stats/player/[slug]`) | Phase 1 | Flagship. Fingerprint + RAPM block + game log sparkline + "Generate Card" CTA. |
| **3** | Goalie export + `/stats/goalies` page | Phase 1 | `player_game_features.gsax` exists. Add `goalies.json` to `export_stats_data.py`. ~100 goalies. |
| **4** | Card generation as web service | Phase 2 | Free tier (IP-limited, 3/day, watermarked). No auth required at launch. Expose 3-4 card types (see card inventory). |
| **5** | Auth: email magic link + D1 + Workers KV | None (parallel) | D1 `users` table + KV session tokens. No passwords at MVP. Google/X OAuth second. |
| **6** | Patreon billing link | Phase 5 | Patreon OAuth → writes `patreon_tier` to `users` row. Unlock unlimited cards + unwatermarked. |
| **7** | Sortable/filterable full table | Phase 3 | Vanilla JS island (~200 lines). Sort by column, filter by pos/team/min GP. No framework. |
| **8** | Compare page (`/stats/compare`) | Phase 2 | Two-player overlay. Dual fingerprints, shared scale. High shareability, cheap to build. |
| **9** | Lines export + `/stats/lines` | Phase 3 | Forward lines + D-pairs from `line_stats_*.csv`. |
| **10** | Teams aggregate page | Phase 9 | 32-team aggregates from player data. |
| **11** | Favoriting + personalized home | Phase 5 | "Your Teams Tonight" at top of hero. Follow → notify → card → share loop. |

---

## URL Structure

```
/stats                          → hub: tonight's featured player, leaderboard preview
/stats/players                  → sortable/filterable skater table (715 players)
/stats/player/[slug]            → skater detail (pre-rendered for all 715) ← FLAGSHIP
/stats/goalies                  → goalie table: GSAx, GSAA, sv%, xSv%
/stats/goalie/[slug]            → goalie detail (~100 players)
/stats/lines                    → forward lines + defense pairs
/stats/teams                    → 32-team aggregates
/stats/leaderboards             → existing, keep
/stats/cards                    → card generation UI (auth-gated for paid tier)
/stats/compare                  → two-player overlay
/account                        → login, register, profile, Patreon link
```

Keep `/stats/player/[slug]` — do NOT change to `/stats/players/[slug]` (breaks existing links).

---

## Data Export Targets

Add to `hgb-bot/scripts/export_stats_data.py`:

```
src/data/stats/
  _meta.json              ← add goalie_count, line_count
  skaters.json            ← rename from players.json (summary only, no game log)
  goalies.json            ← NEW: ~100 goalies, GSAx/GSAA/sv%/xSv%/percentiles
  lines.json              ← NEW: forward lines + D-pairs, CF%/xGF%/GF%/TOI
  teams.json              ← NEW: 32 team aggregates
  leaderboards.json       ← keep, add RAPM + GSAx categories
  game-log/
    {player_id}.json      ← NEW: split from player_games.json (per-player, lazy-loaded)
```

**Headshots:** Reference NHL CDN directly — no pipeline change needed.
```
https://assets.nhle.com/mugs/nhl/60x60/{player_id}.png
```

---

## Card Inventory & Tier Classification

26 card scripts total. Categorized by user-facing value:

### Tier 1 — User-facing, paid features (~3-4 to expose initially)

| Script | What it is |
|---|---|
| `generate_hgb_grid_card.py` | Net RAPM hero + 3×3 colored metric tile grid — the signature card |
| `generate_hgb_rapm_card.py` | Per-player RAPM breakdown card |
| `generate_goalie_gsax_card.py` | GSAx leaderboard card (goalie) |
| `generate_goalie_zone_card.py` | Save% vs league avg by zone |
| `generate_with_without_card.py` | Two-player with/without comparison |

### Tier 1b — Design variants (consolidate to 1-2 "official" formats)

Cards A through F are design iterations of the same player card concept — not 6 distinct products. Pick the best 2, deprecate the rest.

| Script | What it is |
|---|---|
| `generate_hgb_card_a.py` | Horizontal bar editorial — cleanest |
| `generate_hgb_card_b.py` | Grouped-by-category layout |
| `generate_hgb_card_c.py` | Wide two-column |
| `generate_hgb_card_d.py` | Editorial light, narrative offense/defense grouping |
| `generate_hgb_card_e.py` | Card C + horizontal bars |
| `generate_hgb_card_f.py` | Card E + flat bar list |
| `generate_hgb_de.py` | Generates D+E together |
| `generate_player_combined_card.py` | HGB metrics + NHL Edge side-by-side |
| `generate_player_overview_card.py` | NHL Edge skating metrics |

### Tier 2 — Bot-posted leaderboards (not user-requestable, but displayable on site)

| Script | What it is |
|---|---|
| `generate_faceoff_card.py` | Faceoff Impact Above Expected leaderboard |
| `generate_line_card.py` | Forward line leaderboard |
| `generate_penalty_value_card.py` | Contextual Penalty Value leaderboard |
| `generate_rebound_card.py` | Rebound Creation Above Expected leaderboard |
| `generate_shot_sequencing_card.py` | Shot origin leaderboard |
| `generate_impact_leaderboard.py` | HGB Impact + Rating combined |
| `generate_goalie_alt_card.py` | GSAA by difficulty tier + shot location map |

### Tier 3 — Internal / one-off (do not expose)

| Script | What it is |
|---|---|
| `generate_pregame_card.py` | Pre-game team stats (bot-only) |
| `generate_penalty_scatter.py` | Penalty draw vs take scatter (internal) |
| `generate_rapm_comparison_graphic.py` | HGB vs Evolving Hockey comparison (one-off) |
| `generate_rapm_top10_graphic.py` | Top 10 HGB vs EH (one-off) |

**Bottom line: 17+ scripts sounds like a lot but it's really ~5 distinct user-facing card concepts + 6 A-F design variants that need consolidation + internal tooling.**

---

## Auth Architecture

**Identity:** Cloudflare D1 + Workers KV. No Supabase, Clerk, or Auth0.

```sql
-- D1
users (id TEXT PK, email TEXT UNIQUE, google_sub TEXT, x_sub TEXT,
       patreon_user_id TEXT, patreon_tier TEXT, created_at INT, updated_at INT)

user_prefs (user_id TEXT FK, pref_key TEXT, pref_value TEXT JSON, updated_at INT)
-- pref keys: "fav_teams" (array of abbrevs), "fav_players" (array of slugs)
```

**Sessions:** Workers KV, 30-day TTL. Key: `sessions:{token}` → `{user_id, email, patreon_tier}`. `HttpOnly; Secure; SameSite=Lax` cookie. Trivially revocable.

**MVP auth flow:** Magic link (email → 15-min token → click → session). No passwords at v1 — lower attack surface, zero bcrypt. Add Google/X OAuth second.

**Patreon linking:** Separate from identity. User must be logged in first. Flow: Link button → Patreon OAuth → callback → fetch membership tier via Patreon API → write to `users.patreon_tier` → refresh session token in KV.

**Patreon webhooks:** `POST /api/webhooks/patreon` → verify signature → update tier in D1. Pull-based nightly re-verify as backup (Patreon webhooks are unreliable).

---

## Card Generation Pipeline

**Architecture:** D1 job table + Hetzner poller (no CF Queues — not on free tier).

```sql
card_jobs (id TEXT PK, user_id TEXT, card_type TEXT, params_hash TEXT, status TEXT,
           r2_key TEXT, created_at INT, completed_at INT, error TEXT)
-- status: queued | processing | done | failed
```

**Flow:**
1. `POST /api/cards/request` → write to `card_jobs` with `status=queued`, return `job_id`
2. Hetzner cron (every 30s): pull pending jobs, run Python script, upload PNG to R2, PATCH to `done`
3. Client polls `GET /api/cards/jobs/{job_id}` until done (max 90s, every 3s). On done: pre-signed R2 URL.

**Cache:** `sha256(card_type + season + player_id)` → R2 key. On request, check R2 before creating job. ~90% cache hit rate after first generation.

**Rate limiting:** Count `card_jobs` for `user_id` in last 24h. Free: 3/day (IP-limited before auth). Patreon-linked: unlimited.

**Latency:** 5-12s acceptable with progress indicator. No email notification at v1.

---

## Visualization Priorities (Design Notes)

**Ship these — they fit the editorial system:**
- Percentile fingerprint (8-axis horizontal bar stack) — already exists, push harder
- RAPM scatter (off vs def, quadrant-labeled, Barlow Condensed labels)
- Game log sparklines (per-category bars, percentile-colored)
- Two-player comparison overlay

**Avoid:**
- Shot maps (only with extreme editorial restraint — no rainbow heatmaps)
- 3D, animated transitions, chart.js defaults, donut charts
- Full real-time shift charts (too expensive, too niche)

---

## What We're NOT Building (v1)

- Historical season selector (one season at a time for now)
- PWHL coverage
- Advanced shot-quality filters
- Mobile app integration
- Live shift charts
- Glossary page (inline tooltips instead)

---

*Last updated: 2026-05-04*
*Next review: Start of 2026-27 season*
