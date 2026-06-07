# Implementation Plan — Skaters Multi-Season + Playoff Leaderboard

**Status:** Planned, not started. Needs one decision (see §1) before build.
**Source spec:** `2026-06-06-skaters-page-multi-season-playoff-leaderboard.md`
**Why a plan first:** architectural change (new 7.6 MB data source, build-vs-client decision, name joins). Too large to one-shot blind to `main`.

---

## §1 — DECISION NEEDED: where does the 7.6 MB live?

`player-season-stats` is ~7.6 MB. Two options:

**A) Build-time bake (recommended).** Fetch in `skaters.astro` frontmatter via `loadPlayerSeasonStatsAll()`, pre-join names, pre-compute a slim per-(player,season) row array, serialize into the page. Pros: no client fetch, instant, same pattern as today. Cons: bigger HTML payload (mitigate by trimming fields to only what the table needs → likely ~2-3 MB gzipped).

**B) Client fetch.** Page ships light, fetches 7.6 MB on mount, processes in-browser. Pros: smaller initial HTML. Cons: spinner/loading state, slower first paint, more moving parts, must handle fetch failure.

→ **Recommend A** for consistency with the existing build-time pattern and no loading state. Confirm before building.

---

## §2 — Data layer

1. `stats-loader.ts`: add `loadPlayerSeasonStatsAll(): Record<string, PlayerSeasonStats>` (returns the whole map, not per-player).
2. Name join: `player-season-stats` rows have no name. Build a `Map<player_id, {first,last,slug,display}>` from `loadPlayers()` (covers active) + fall back to `player_career.json` / a static id→name map for retired players not in current `players.json`. Rows whose id resolves to no name → skip (or show "—").
3. New slim row type `SeasonStatRow` = `{ player_id, slug, first_name, last_name, team, pos, group, season, gameType, gp, goals, a1, a2, assists, points, shots, ixg, toi_5v5_sec, xgf_pct_5v5, cf_pct_5v5, limited }` — drop per-season percentiles from the multi-season path (not aggregatable).

## §3 — Aggregation helper (`lib/aggregate-seasons.ts`)

`aggregate(rows: SeasonStatRow[], fromSeason, toSeason, gameType): AggRow[]`
- Filter rows to `gameType` + season in [from,to].
- Group by player_id.
- Sum: gp, goals, a1, a2, assists, points, shots, ixg, toi_5v5_sec.
- Weighted avg by toi_5v5_sec: xgf_pct_5v5, cf_pct_5v5.
- team = most recent season's team in range; if >1 distinct → "2 teams" indicator.
- limited = OR across seasons.
- Drop rows with summed gp < 5 (multi-season noise floor).
- Single-season range → return rows as-is (must byte-match current behavior).

## §4 — UI wiring (SkatersTable)

- Replace disabled Season `<select>` with **From** + **To** dropdowns. Options = seasons present for the active gameType (playoffs: only seasons with ≥1 playoff row). Default From=To=current season.
- Game Type chip toggle already exists — repoint it from `po_*` current-season fields to the aggregated dataset.
- When range spans >1 season: hide percentile sub-lines / `*_p` columns and the Advanced/On-Ice tabs that rely on season-specific RAPM (or show "—"). Counting + Rates tabs work from aggregates.
- Min GP filter → apply to aggregated gp (already filters gp; just point at agg).
- "All time" shortcut button (nice-to-have): sets From=earliest, To=latest.
- Preserve: single-season default = today's exact behavior, all existing tabs/sorts/filters/min-TOI/export.

## §5 — Reuse learnings from player-page playoff toggle

- Chip styling: bordered `chip()` already present in this component — reuse, don't reinvent.
- No "fewer than 30 GP" footnote for playoffs (short runs are normal) — same call as the career table.
- TOI column = 5v5 only, tooltip says so.
- Ordinals via shared helper, no double-suffix.

## §6 — Verification (Marner checkpoints from spec)

1. Data: aggregated Marner row, Playoffs, all available seasons → confirm GP/G/A/P totals (should be ~ sum of the 10 playoff seasons now in data).
2. UI: screenshot Playoffs mode, multi-season, sorted by points desc. Light + dark + mobile.

## §7 — Risk notes

- Retired-player name coverage is the soft spot — verify a known retired playoff scorer resolves, else add a fallback id→name map.
- HTML size under option A — measure gzipped page weight after baking; if >4 MB gzipped, switch to option B.
- The existing `po_*` current-season playoff path should be removed once the aggregated path covers current-season playoffs, to avoid two sources of truth.
