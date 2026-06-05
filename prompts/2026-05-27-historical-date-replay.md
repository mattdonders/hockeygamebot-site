# Engineer Briefing — Historical Date Replay (`?date=YYYY-MM-DD`)

**Filed:** 2026-05-27
**Repo:** `hockeygamebot-site` (rewrite branch) + possibly `hgb-api` (depending on existing endpoint structure)
**Status:** Open. Non-blocking — file alongside the playoff-polish items.
**Priority:** Should ship before training camp opens (Sept 2026). The State A homepage flow (featured tracked team + tracked strip + 9-12-game slate) has never been validated with real data — we're in playoffs, so we've only tested State D and State E.3 in production. Better to surface bugs now than discover them on opening night.

---

## What we're building

A `?date=YYYY-MM-DD` query param that lets the homepage render any past date instead of always "today." Doubles as both a test harness for State A AND a useful feature (shareable URLs for historical game views).

## Why this is the right approach

Two options were considered: synthetic mock data vs historical date replay. Historical date replay wins because:
- Uses real game data + real bot post counts → catches real-data bugs
- Tests every PREGAME → LIVE → FINAL transition that actually happened
- Real-world edge cases (overtime, shootouts, late starts, weird scoring sequences) get exercised
- Side benefit: makes historical game views shareable via URL
- Mock data drifts from real schema over time and doesn't catch real-data bugs

The risk that some live-only state (intermission, in-game WP swings) can't be cleanly reconstructed from historical data is acceptable — FINAL state is what matters for testing the slate grid and the featured/tracked/pin cascade.

---

## Acceptance criteria

- [ ] `/?date=2026-03-01` renders that night's full slate of games
- [ ] Featured card uses **tracked team #1** if any tracked team was playing that night, else cascades through #2 → #3 → model's pick → identity hero
- [ ] Tracked teams strip renders correctly if #2 and/or #3 were playing
- [ ] Slate grid renders all remaining games as FINAL-state tiles
- [ ] Each game tile shows its actual FINAL state (since they all already happened)
- [ ] makeHero pin still works (localStorage with 3 AM expiry)
- [ ] "Yesterday's Results" section shows the previous day's games (date - 1)
- [ ] URL is shareable — `/?date=2026-03-01` opens directly to that slate in a fresh tab
- [ ] No `?date` param → defaults to today (no regression on current behavior)
- [ ] Invalid date (future date, malformed, before NHL season) → graceful fallback to today + a small banner: "Showing today instead — invalid date"
- [ ] Mobile rendering works the same way

## Specific test dates worth running through

Engineer should validate each scenario after build:

1. **Sat, March 1, 2026** — high-volume Saturday, ~12-14 games. Full slate stress test.
2. **Wed, Feb 11, 2026** — random midweek, ~6-8 games. Light slate.
3. **A date when all 3 tracked teams played** — pressure-tests the cascade ranking
4. **A date when NO tracked teams played** — pressure-tests the model's-pick fallback + cascade priority #5
5. **A date with an OT/SO game** — pressure-tests the bracket OT notation
6. **Opening night 2025-26** — Oct 7, 2025 — pressure-tests "lots of games happening simultaneously" scenario

## Implementation notes

- Schedule API endpoints already accept date parameters (the engineer recently fixed a UTC-midnight bug here)
- Game state, scores, bot post counts, xG, WP are all persisted to SQLite — historical reconstruction should be straightforward
- The renderer just needs to accept the date as input instead of always querying "today"
- Cascade logic stays the same — it just operates on a different date's game list

## Out of scope

- Live state reconstruction (intermission deltas, in-game WP curves at specific timestamps) — FINAL state is sufficient for slate testing
- Date picker UI (just URL param for now)
- Multi-date views or compare-two-nights views
- Embed-in-game-page integration

## Reporting back

Two checkpoints:

1. **After build:** Live URL with a sample historical date (recommend Sat Mar 1, 2026) + confirmation that all 6 test scenarios above render correctly
2. **Bugs surfaced:** Any State A logic bugs found during validation get filed as separate follow-ups, NOT bundled into this ticket. We want to know what's broken, then fix in clean small tickets.

## Time budget

~2-3 hours. Rendering logic already exists; this ticket just changes the data input.
