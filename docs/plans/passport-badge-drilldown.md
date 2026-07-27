# Puck Passport — Badge event drill-down ("which game earned this badge?")

**Origin:** Reddit request (r/devils, u/therealme4): *"Is there a way to view the
events from the badges that I'm missing? I saw a Gordie Howe hat trick at some point
and I'm trying to remember who or when it was."* Matt: *"great feature idea, added to
my TODO for this week."*

**Goal:** tap an earned badge → see which attended game(s) earned it, with the player
where relevant ("Gordie Howe Hat Trick — Jack Hughes · NJD vs BOS · 2024-03-15").

**Verdict from scoping (2026-07-26):** SERVER + CLIENT feature, ~half a day. The
qualifying game_ids ARE computed server-side but then discarded, and the client no
longer holds box scores — so this can't be done client-only. Low risk. **No D1
migration** (data already read from `pp_backfilled_games` + `pp_backfilled_player_stats`).

## Badge categories

- **A — game + player (box-derived):** `hat-trick`, `four-goal-game`, `gordie-howe`,
  `three-point-night`. Both the game AND the player are known at compute time
  (`anyPlayer(box, pred)`, `attended_summary.js:44–52`) but not retained.
- **B — game, no player (score/period/id-derived):** `shutout`, `ot-winner`,
  `shootout`, `playoff-game`, `preseason-game`, `special-event` (event name already
  in `note`). Attributable to a specific game.
- **C — cumulative/tier:** `arenas-visited` + the 5 tier ladders. "Which game" is
  meaningless — leave non-tappable.

## Why not client-only
Summary badge entries are only `{id, label, family, count, rarity, note, total}`
(`attended_summary.js:584–604`; type at `AttendedTracker.tsx:198–211`). The compute
loop has every qualifying game in hand (`def.earns(g, box)`, :573–581) but keeps only
`count += 1`. Client has no box scores (`AttendedTracker.tsx:20–22`) → category A
can't be re-derived client-side, and re-deriving would violate the anti-divergence
house rule. Precedent to copy: `records.*` and `milestones` already carry
`game_id`+`player_id`+`name` (:728–735, :607–621) — apply that shape to badges.

## Implementation

**Server — `hgb-notify/hgb-api/src/endpoints/attended_summary.js` (the bulk):**
1. In the badge loop (:566–604), accumulate a `games[]` per badge instead of only
   counting: push `{game_id, date, matchup:{away,home}}` per qualifying final game.
2. For the 4 player-moment badges (A), swap the boolean `anyPlayer` for a
   find-qualifying-players helper so you can attach `player:{id, name:resolveName(id)}`.
3. Add `games` to `earned[]` entries. Bounded by attended-game count → payload fine.
4. Both authed GET + public POST get it free (shared `computeAttendedSummary`).

**Client — `hockeygamebot-site/src/components/react/AttendedTracker.tsx`:**
5. Extend `AttendedSummary.badges.earned` (:199) with
   `games?: {game_id; date; matchup; player?}[]`.
6. Add onClick + modal to the earned-badge branch (`renderCatalogBadge`, :2186–2198;
   chips are static divs today). Gate to `family !== 'collection'/'tier'`.
7. `trackEvent` on open (analytics already imported, :52). Reuse the record-card
   `name · matchup · date` render (`summaryRecordsToView`, :586–600).

## Gotcha
The Gordie Howe "which player" predicate is a heuristic (goal + assist + 5 PIM,
:48–50) — surface an "estimated" note in the modal, consistent with how it's earned.

## Gate before merge (per standing policy)
Codex adversarial review + perf pass on both the server + client diffs, then merge.
Server change is prod hgb-api (auto-deploys on push to main) — needs Matt's nod.
