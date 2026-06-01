# Engineer Briefing — Homepage State A Build (Personalized Featured Game)

**Filed:** 2026-05-26
**Repo:** `hockeygamebot-site` (rewrite branch) + Account Settings data layer
**Status:** Open. SHIP TONIGHT if possible — tonight's COL @ VGK is the pressure test.
**Reference mockup:** `docs/plans/homepage-mockup-a.html` — design is locked. Build to match.

---

## What we're building

The State A homepage (regular season + playoff multi-game nights). Replaces the existing thin homepage. Three new pieces:

1. **Featured game card** — personalized to the user's #1 tracked team (or fallback)
2. **Tracked teams strip** — small cards for tracked teams #2 and #3 (when playing)
3. **makeHero pin button** — per-tile override that survives until 3 AM local time

The mockup at `docs/plans/homepage-mockup-a.html` is the visual + interaction spec. Match it pixel-for-pixel where possible.

## Tonight's pressure test

Conf Final Game 5: **COL @ VGK, ~8:30 PM ET**. We want this ticket shipped + deployed before puck drop so:
- A user tracking COL or VGK sees that game as their featured hero
- A user not tracking either sees the model's-pick fallback OR the pin pattern works manually

Stop-point: if the ticket can't ship by 7 PM ET, deploy what's done as a staged preview at `rewrite.hockeygamebot-site.pages.dev` without flipping production. We'll evaluate gaps after.

---

## Phase 1 — Data layer (~1-2 hours)

### Account Settings: tracked-team ranking

The existing schema lets users select up to 3 followed teams. Add an explicit ordering field so we can distinguish #1 / #2 / #3.

**Recommended schema change:**
```json
{
  "tracked_teams": [
    { "abbrev": "NJD", "rank": 1 },
    { "abbrev": "MTL", "rank": 2 },
    { "abbrev": "EDM", "rank": 3 }
  ]
}
```

If the existing structure is just an array, the array order = ranking (index 0 = rank 1). Either works. Pick the lower-friction migration.

**Account Settings UI:**
- Add drag-to-reorder (or simple ↑↓ arrows) on the team list
- Persist ranking to the user's profile
- Default new users to no tracked teams (will hit identity-hero fallback)

### Hero precedence cascade

Implement this logic at page render time (server-side or build-time as appropriate for Astro/CF Pages):

```
Featured game precedence (highest wins):
  1. Active pin (localStorage hgb_hero_override, until 3 AM local) — CLIENT-SIDE override
  2. Tracked team #1 (if playing tonight)
  3. Tracked team #2 (if #1 isn't playing)
  4. Tracked team #3 (if #2 isn't playing)
  5. Model's pick — pre-game xG matchup closest to even
  6. Identity hero — no specific game featured, generic "32 bots covering N games tonight"
```

Note: pin is client-side because localStorage is per-device. Server can render with cascade #2-#6, then JS hydrates the override on the client. If localStorage pin exists AND points to a valid game tonight, swap the featured card content before paint (avoid FOUC).

### Model's pick logic

For fallback #5, use the closest pre-game xGF differential from games tonight. Reuse existing pregame model output (already in pipeline). Add tiebreaker: playoff implications weight (standings-impact). Keep it simple for v1 — just "closest pre-game xG matchup."

---

## Phase 2 — UI: Featured game card (~2 hours)

Match the mockup. Key components:

- **Section header:** "Your Game Tonight" + eyebrow `// Tracking · {TEAM_NAME}` (or `// Model's Pick · No tracked games` for fallback)
- **Section meta (right):** "Personalized from Account · Manage tracked teams →"
- **Featured card:** Full-width, two-column grid (1.45fr 1fr)
- **Color bar at top** uses team primary colors (not red/red for default)

### Game-state matrix (CRITICAL — tonight's COL/VGK won't be live until 8:30 PM ET)

The featured card needs to handle FOUR states. The mockup shows LIVE only — extrapolate the others to the same visual language.

| State | When | Status indicator | Score area | Sidebar (right column) | Bot strip |
|---|---|---|---|---|---|
| **PREGAME** | Before puck drop | "Puck drop · 8:30 PM ET · TNT" | Hide score, show season records prominently OR "0 · 0" muted | Pregame model probability + matchup context (H2H this season, season records, key injuries if available) | "@BOT · pregame thread posted N min ago" or "Bots posting at 7:30 PM ET" |
| **LIVE** | Game in progress | Pulsing pip + "1st · 5:30" + arena | Current score, big numbers | Live stats (Shots, xG, Faceoffs, 5v5 xGF%) | "@BOT · N posts tonight" (live pip on each) |
| **INTERMISSION** | Between periods | "Intermission · End of 1st" + period summary | Score frozen at period end | Period stats summary (1st period totals) | Same as LIVE, no pip pulse |
| **FINAL** | Game ended | "FINAL" or "FINAL/OT" + game time | Final score, big numbers, winner in ink, loser dim | Three stars (if available) + recap link + final stats | "@BOT · Final post" + link to recap thread |

**Implementation hint:** A single `gameState` enum (`pregame`/`live`/`intermission`/`final`) determines which template variant renders. Don't try to make one template handle all four — too much conditional logic. Make four variants of the right-column sidebar and the score block, switch on state.

### Pregame WP source

Use pre-game model output (xG-based projected win probability), NOT the in-game EMA. These are stored separately in the pipeline. Confirm with stats engineer if uncertain which field to read.

### Fallback if state can't be determined

If `gameState` is null or unknown → render PREGAME variant. Better to show "Puck drop · TBD" than to fall back to LIVE with zero data.

### Bot strip behavior across states

- PREGAME: bot handles + last post timestamp ("posted 3 min ago: pregame thread")
- LIVE: bot handles + post count + live pip
- INTERMISSION: same as LIVE, no pip pulse
- FINAL: "@BOT · Final post + 3 stars" + recap link

If no games tonight at all → skip the featured card entirely, surface a "No games tonight" message + link to recent analysis.

## Phase 3 — UI: Tracked teams strip (~45 min)

Below the featured card, in the same section. Only renders if there are tracked teams #2 or #3 also playing.

- **Eyebrow:** `// Your other tracked teams tonight` (with border-top divider above)
- **Strip:** Up to 2 cards in a horizontal grid (`repeat(2, 1fr)`)
- Each card shows: rank tag (`// #2 · MTL`), color bar, team rows, score, WP value, FOLLOW @TeamBot link
- If only #2 is playing (not #3) → show 1 card, full width OR keep grid alignment with empty placeholder

## Phase 4 — UI: makeHero pin button (~1 hour)

On every game tile in the slate grid:
- Small button in top-right corner of each tile
- Text: `📌 Pin` (or just `📌` if space-constrained)
- Hidden by default (opacity:0), fades in on hover
- Click handler:
  1. Set `localStorage.hgb_hero_override = { game_id, expires_at: <3 AM local timestamp> }`
  2. Update UI immediately (no page reload) — promote pinned game to featured slot, demote previous featured to tracked strip or slate
  3. Visual state: pinned tile gets red border + red "📌 Pinned" badge (always visible at full opacity)
- Click again on pinned tile = unpin (clears localStorage, reverts to cascade default)

**Expiry handling:** On every page load, check `localStorage.hgb_hero_override`. If `expires_at < now()`, clear it. Don't render the page with an expired pin.

**Edge case:** If pinned game is already in tracked strip or featured slot via cascade, pin is redundant — show tile as already-active but don't visually duplicate.

---

## Slate grid

Stays as-is (existing pattern). Remove from slate any games promoted to featured or tracked strip (so we don't render duplicates).

## Empty states

- **No tracked teams configured:** Featured = model's pick. Tracked strip hidden entirely.
- **Tracked teams configured but none playing tonight:** Featured = model's pick. Tracked strip hidden. Add a small banner: "Your tracked teams aren't playing tonight — here's the model's pick."
- **No games tonight at all:** Skip featured section, skip tracked strip, skip slate. Show "No games tonight" hero with link to /analysis.
- **Single game night (e.g., conf finals):** Featured = the one game (whether tracked or not). Skip tracked strip. Skip slate. Effectively becomes State D — and we already have that mockup at `homepage-mockup-d-nohero.html`. **Use that pattern when game count = 1.**

## Acceptance criteria

- [ ] Account Settings supports team ranking (#1/#2/#3)
- [ ] Featured game card renders for user's tracked #1 (or fallback per cascade)
- [ ] Tracked strip renders for tracked #2 and #3 (when playing)
- [ ] makeHero pin button appears on every slate tile, hidden until hover
- [ ] Pinning a tile promotes it to featured slot immediately (no page reload)
- [ ] Pinned state visually distinct (red border + active badge)
- [ ] Pin expires at 3 AM local time, auto-clears on page load
- [ ] Cascade fallback works for: no tracked teams, tracked teams not playing, model's pick
- [ ] Single-game night uses State D layout (no featured section, game card is the page)
- [ ] No games tonight: graceful empty state with /analysis link
- [ ] **All four game states render: PREGAME, LIVE, INTERMISSION, FINAL** — verify each by visiting the card at different times tonight (pregame ~7pm, live ~9pm, final ~11pm next morning)
- [ ] **Tonight's specific test (COL @ VGK 8:30 PM ET):** card renders PREGAME until 8:30, transitions to LIVE without manual refresh after pipeline updates game state, transitions to FINAL when game ends
- [ ] Mobile rendering: featured stacks vertically, tracked strip wraps, pin button still tappable
- [ ] Light + dark mode

## Reporting back

Three checkpoints:

1. **After Phase 1 (data layer):** post in #engineering with the schema change + cascade logic decisions. Quick approval before UI work.
2. **After Phase 3 (featured + tracked strip):** sample URL with real data for tonight. Screenshot.
3. **After Phase 4 (pin):** live URL + demo of pinning + unpinning + 3 AM expiry working.

## Out of scope for this ticket

- Empty State E (offseason) — different page entirely, separate ticket
- Smart pin-expiry fallback ("game ended, restore tracked team?") — v1.1, manual unpin works for v1
- Visual polish on tracked-eye styling — flagged for later, not blocking
- Color bar gradient styling beyond solid team colors — nice-to-have
- Animation transitions between featured-slot swaps — nice-to-have

## Stop-points

- If Phase 1 reveals Account Settings schema change is bigger than 2 hours → surface to Matt before continuing
- If real data for COL/VGK reveals model's-pick logic edge cases → surface, don't force-ship
- If tonight's deploy can't make 7 PM ET → push to staged preview only, evaluate

---

## Reference mockup

`docs/plans/homepage-mockup-a.html` — design is locked, no design iteration in this ticket. If a layout choice needs interpretation, follow the mockup. If the mockup is genuinely ambiguous, surface to Matt rather than improvise.
