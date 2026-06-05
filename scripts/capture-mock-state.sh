#!/bin/bash
# Capture a /v1/scoreboard snapshot and save it as a named mock state.
#
# Usage:
#   bash scripts/capture-mock-state.sh <state-name>
#
# State names to capture tomorrow (May 4):
#   pre            — morning before any game starts (~9-10 AM ET)
#   pre-afternoon  — afternoon after goalie data populates (~3-4 PM ET)
#   live-p1        — ~10-15 min into first game
#   live-p2        — second period of first game
#   live-intermission — right after a period ends
#   live-mixed     — game 1 live + game 2 not yet started
#   live-p3-close  — last 5 min, 1-goal game (most valuable)
#   live-ot        — if any game goes OT
#   post           — after all games final (midnight-ish)
#
# Each capture overwrites the previous file for that state.
# Run multiple times if you want — last one wins.

STATE=${1:-"snapshot-$(date +%H%M)"}
OUTFILE="public/mock/scoreboard.${STATE}.json"
API="https://api.hockeygamebot.com/v1/scoreboard"

echo "Capturing $API → $OUTFILE"
curl -s --fail "$API" | python3 -m json.tool > "$OUTFILE"

if [ $? -eq 0 ]; then
  echo "✓ Saved $OUTFILE"
  echo "  Test at: /home-editorial?mock=${STATE}"
else
  echo "✗ Fetch failed — check API or try again"
  rm -f "$OUTFILE"
  exit 1
fi
