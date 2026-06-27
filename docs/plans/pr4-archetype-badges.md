# PR4: Player Archetype Badges

**Status**: Planning only — do not implement until post-pipeline-freeze  
**Complexity estimate**: 4–6 hours (frontend only, no pipeline changes needed)  
**Dependencies**: All existing `player` data fields in `players.json`; `rates_per_60`, `percentiles_vs_pos`, `gp`, `pos_group`

---

## Overview

Archetype badges are short, recognizable labels that distill a player's statistical profile into
an at-a-glance identity. Think "Sniper", "Two-Way D", "Shutdown Center". They appear on the
player page beneath the player's name/position chip and in leaderboard tooltips.

The goal is personality, not precision — a badge should feel true to what the player *is*, not
be a precise threshold certificate. Edge cases where a player sits between two archetypes should
resolve to whichever badge is more interesting, not whichever threshold they barely cleared.

---

## Badge Taxonomy (12 badges)

All thresholds are against `percentiles_vs_pos` (position-relative). "High" = ≥ 75th pct,
"Elite" = ≥ 90th pct, "Low" = ≤ 25th pct.

### Forwards (pos_group === 'F')

| Badge | Display label | Core condition | Tie-break / exclusion |
|---|---|---|---|
| **Sniper** | 🎯 Sniper | goals/60 ≥ 80th AND shots/60 ≥ 70th | Overrides Power Play Specialist if both qualify |
| **Playmaker** | 🎰 Playmaker | a1/60 ≥ 80th AND ixg/60 ≤ 60th | High first assists, shot creation comes from setting up others |
| **Power Play Specialist** | ⚡ PP Specialist | pp_toi_pct ≥ 80th AND (goals_pp OR a_pp based rank) ≥ 75th | Must have pp_toi available (non-null) |
| **Two-Way Forward** | 🔒 Two-Way F | ixg/60 ≥ 65th AND rapm_def_pct ≥ 65th | Requires rapm_def_pct non-null |
| **Possession Driver** | 💪 Possession | xgf_pct_5v5 ≥ 80th AND ixg/60 ≥ 50th | Dominates puck share, personal production is additive |
| **Energy / Grinder** | ⚙️ Grinder | ixg/60 ≤ 30th AND gp ≥ 50 AND hits/gp (if available) above median | Low shot creation, high games played = depth energy |
| **Emerging** | 🌱 Emerging | gp < 25 AND ixg/60 ≥ 70th | Sample-size caveat built into name |

### Defensemen (pos_group === 'D')

| Badge | Display label | Core condition | Tie-break / exclusion |
|---|---|---|---|
| **Offensive D** | 📈 Offensive D | ixg/60 ≥ 80th OR (shots/60 ≥ 75th AND a1/60 ≥ 70th) | — |
| **Shutdown D** | 🛡️ Shutdown D | rapm_def_pct ≥ 80th AND xgf_pct_5v5 ≤ 55th | Defense-first, not a puck-mover |
| **Two-Way D** | 🔄 Two-Way D | rapm_def_pct ≥ 65th AND ixg/60 ≥ 65th | Balanced elite — rarer badge, higher bar |
| **Possession D** | 💪 Possession | xgf_pct_5v5 ≥ 80th AND rapm_def_pct ≥ 50th | Wins the puck battle, not purely offensive |
| **PP Quarterback** | ⚡ PP QB | D only: pp_toi_pct ≥ 85th | High-usage PP D regardless of point totals |

### Minimum games played for any badge: **gp ≥ 10** (prevents small-sample noise)

If no badge qualifies, render no badge — an empty player is not a labeled player.

---

## Data Field Mapping

All fields are available in the current `PlayerSummary` / `PlayerRecord` type from `stats-loader.ts`.
No new API endpoints required.

```typescript
// Badge computation needs these fields (all present in players.json):
p.pos_group          // 'F' | 'D'
p.gp                 // games played
p.percentiles_vs_pos.goals   // goals/60 pct vs position
p.percentiles_vs_pos.shots   // shots/60 pct vs position
p.percentiles_vs_pos.ixg     // ixG/60 pct vs position
p.percentiles_vs_pos.a1      // first assists/60 pct (if available)
p.rapm_def_pct       // defensive RAPM percentile (may be null)
p.xgf_pct_5v5_pct   // xGF% pct vs position (may be null — check)
p.toi_pp_sec         // PP TOI in seconds (derive pp_toi_pct from this + total TOI)

// Derived in the badge function:
const pp_toi_pct = p.toi_pp_sec != null && p.toi_avg_sec > 0
  ? (p.toi_pp_sec / p.toi_avg_sec) * 100
  : null;
```

If `rapm_def_pct` is null for a player (< 300-min threshold), skip any badge that requires it
and fall through to the next matching badge.

---

## Render Location

### Primary: Player page header (`[slug].astro`)

Directly below the name row, inline with the position/team chip:

```
Jordan Kyrou          [RW] [STL]  [🎯 Sniper]
```

The badge renders as a pill with a small emoji and the label text. Use the same pill styling as
the existing position chip but with a distinct background: `hsl(45 90% 92%)` (warm amber) for
positive archetypes, `hsl(210 80% 93%)` (cool blue) for defensive ones, neutral gray for Grinder.

### Secondary: Leaderboard rows (skaters.astro)

Small badge pill in the player name column, after the team chip. Truncates to emoji-only at narrow
viewport widths (below 640px).

### Tooltip spec

On hover (or tap on mobile), show a short explainer in a tooltip anchored to the badge:

> **🎯 Sniper** — Top-quartile goals and shot rate for a forward. This player converts chances
> at an elite clip and generates volume to match.

One sentence max. Write all 12 tooltip strings at implementation time.

---

## Client-Side vs API

**Client-side computation only.** All percentile fields needed are already in `players.json`,
which is fetched at build time. A pure TypeScript function `computeArchetypeBadge(player)` can
derive the badge without any new endpoint.

```typescript
// src/lib/archetype-badges.ts (new file)
export type ArchetypeBadge = {
  key: string;       // 'sniper', 'playmaker', etc.
  label: string;     // 'Sniper'
  emoji: string;     // '🎯'
  tooltip: string;   // one-sentence explanation
  colorClass: string; // Tailwind/CSS class for the pill
};

export function computeArchetypeBadge(p: PlayerSummary): ArchetypeBadge | null { ... }
```

The function returns `null` if no badge qualifies. No pipeline changes. No new D1 or R2 data.

---

## Complexity & Build Order

1. **(0.5 hr)** Write `src/lib/archetype-badges.ts` — pure function, fully unit-testable
2. **(0.5 hr)** Write badge pill component (`src/components/ArchetypeBadge.astro`) — emoji + label + tooltip
3. **(1 hr)** Wire into `[slug].astro` player header; confirm it renders correctly for 5 known players
4. **(1 hr)** Wire into `skaters.astro` name column; handle truncation at narrow widths
5. **(1 hr)** Write all 12 tooltip strings; review for tone consistency
6. **(1–2 hr)** QA pass: spot-check 20 players, confirm badge distribution looks sane (should see every badge applied to at least 5–10 players across the league)

**Total: 4–6 hours**

---

## Open Questions / Follow-ups

- Should badges appear on the OG social card? Low priority for v1 — add to a follow-up once
  the badge set is stable for a full season.
- `a1/60` percentile — confirm this field name in `percentiles_vs_pos` (may be `a1` or `first_assists`).
- PP TOI pct percentile — currently derived manually above. Consider whether the pipeline should
  export a `pp_toi_pct_rank` directly to avoid duplicate derivation on site and in future OG images.
- Goaltenders: out of scope for v1. Consider a separate 3-badge set (Shot-Stopper, Rebound Control,
  High-Volume) for a future PR against the `goalies.json` data.
