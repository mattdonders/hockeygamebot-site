# Mock State Capture Instructions

Reference for capturing `/v1/scoreboard` snapshots during live games for offseason testing.

## How it works

`home-editorial?mock=STATE` loads `/public/mock/scoreboard.STATE.json` instead of the live API.
Polling is disabled in mock mode — page stays frozen on that snapshot.

## Capture command

Run from the repo root (`hockeygamebot-site/`):

```bash
bash scripts/capture-mock-state.sh <state-name>
```

Each run overwrites the previous file for that state. No deploy needed — JSON is served from `public/`.

## States to capture (in order during a game night)

| State name | When to run | What it tests |
|---|---|---|
| `pre` | Morning, ~9–10 AM ET | Pre-state, long countdown, no goalie data yet |
| `pre-afternoon` | ~3–4 PM ET | Pre-state, goalie data now populated |
| `live-p1` | ~10–15 min into first game | First live card, scores low, WP near 50/50 |
| `live-intermission` | Right after a period buzzer | Intermission state |
| `live-mixed` | During game 1 if game 2 hasn't started | Some live + some pre in same payload |
| `live-p3-close` | Last 5 min of a 1-goal game | High WP, best bigcard test — **most valuable** |
| `live-ot` | If any game goes OT | Period 4+, WP near 50% |
| `post` | After all games final | Full post-state, `previous_day` populated |

## Test URLs (after capture)

```
/home-editorial?mock=pre
/home-editorial?mock=pre-afternoon
/home-editorial?mock=live-p1
/home-editorial?mock=live-intermission
/home-editorial?mock=live-mixed
/home-editorial?mock=live-p3-close
/home-editorial?mock=live-ot
/home-editorial?mock=post
```

Works on both local dev and the Cloudflare Pages preview URL (`rewrite.hockeygamebot-site.pages.dev`).

## Companion endpoint captures (grab after each game ends)

These feed the "Game of the Night" WP chart and goal impact table:

```bash
GAME_ID=2025030241   # replace with actual game ID from the scoreboard JSON

curl -s "https://api.hockeygamebot.com/v1/games/${GAME_ID}/flow" \
  | python3 -m json.tool > public/mock/flow.${GAME_ID}.json

curl -s "https://api.hockeygamebot.com/v1/games/${GAME_ID}/events" \
  | python3 -m json.tool > public/mock/events.${GAME_ID}.json
```

## Where mock files live

```
public/mock/
  scoreboard.pre.json          ← template, replace with real capture
  scoreboard.live-p2.json      ← template
  scoreboard.live-p3-close.json
  scoreboard.live-ot.json
  scoreboard.post.json
  flow.{gameId}.json           ← add after capture
  events.{gameId}.json         ← add after capture
```

## Notes

- Template files ship with plausible but fake data — good enough to QA layout
- Real captures replace templates; commit them so the whole team can test
- `previous_day.games` in the scoreboard response is what populates the "Yesterday" grid
- Goalie data is SSR (fetched at build time from NHL API) — not in the scoreboard JSON
