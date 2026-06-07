# DE Prompt — Add names to `player-season-stats`

**Filed:** 2026-06-06
**Blocking:** retired/inactive player names on the new multi-season skaters leaderboard.

## Problem

`GET /v1/stats/player-season-stats` is keyed by `player_id` and has **no name field**. The frontend joins names from `/v1/stats/players`, but that only covers the **715 current-season players** — the payload has **2,267 players** total (all seasons back to 2010-11). So **~1,552 retired/inactive players show as `#8470794`** instead of their name.

Concrete examples (top-25 all-time playoff scorers currently nameless):
- `#8470794` — 115 playoff pts
- `#8470638` — 108
- `#8471276` — 107
- `#8474053` — 97

These are almost certainly Bergeron/Giroux/Kane-era names. `player-career.json` also has no names, so there's no client-side fallback.

## Ask

Add **`name` and `slug`** to each player object in `player-season-stats` — **once per player at the top level**, not per season row (keeps the payload small):

```json
{
  "8478483": {
    "name": "Mitch Marner",
    "slug": "mitch-marner-8478483",
    "regular": [ ... ],
    "playoffs": [ ... ]
  }
}
```

`first_name` / `last_name` split is fine too if easier — frontend can join them. Slug is needed so the leaderboard rows link to the player page (`/stats/player/{slug}`); without it, retired players render as non-clickable rows.

## Frontend status

The leaderboard is built and live for active players. The slim build-time endpoint (`/data/skater-season-stats.json`) already reads `f`/`l`/`s` per player — once the upstream payload carries `name`/`slug` for all players, I just point the join at the payload itself instead of `players.json` and all 2,267 resolve. ~10-line change.

## Verify

After: confirm `#8470794` resolves to a real name and its row links to a player page.
