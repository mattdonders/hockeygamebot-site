# Engineer + Frontend Agent Briefing — Homepage Redesign

**Filed:** 2026-05-25
**Repo:** `hockeygamebot-site` (rewrite branch)
**Status:** Open. Spin up a dedicated frontend agent for design + iteration. Engineer reviews + commits.
**Reference:** Current homepage at `rewrite.hockeygamebot-site.pages.dev/` is what we're replacing — it's a sparse grid with a live ticker, doesn't communicate identity, doesn't drive anywhere meaningful.

---

## CRITICAL POSITIONING — read this twice before designing

**HockeyGameBot is a social media bot network first. The website is a secondary surface.**

- 32 team bots (@CARGameBot, @MTLGameBot, etc.) post live during every NHL game across X, Bluesky, and Threads
- A central `@hockey_gamebot` brand account exists as a firehose
- The personal account (`@mattdonders`) carries the analytical voice
- The website (`hockeygamebot.com`) is the *retention layer* — it's where people come BACK to dig into stats, read analysis, see player cards
- **The bots are the product. The site supports the product.**

This positioning is non-negotiable. Don't design a "modern stats site" homepage that buries the bot identity. The bot identity IS the headline.

## Three visitor types — homepage must serve each in 5 seconds

1. **First-timer from a tweet** ("what is HockeyGameBot?")
   - Needs: identity statement, what HGB does, why follow
   - Wants: a clear CTA to follow their team's bot

2. **Fan dropping by mid-game** ("what's happening tonight?")
   - Needs: live scores, links to team bots, bot activity feed
   - Wants: see their team's game and follow along

3. **Recurring analyst** ("what's new?")
   - Needs: latest analysis post, fresh stats/cards, recent threads
   - Wants: depth — career tables, line detail pages, player cards

## Homepage primary job

**Drive visitors to follow team bots on social.** Every other piece of the page serves this or supports retention.

Secondary job: **Drive analyst-type visitors to /analysis (long-form) and /stats (depth).**

## Proposed homepage structure (top to bottom)

### 1. Hero strip (full bleed)
- Logo + tagline: **"32 team bots covering every NHL game. Live cards, goal alerts, post-game analysis."**
- Two CTAs (button-style, prominent):
  - **Primary:** "Find Your Team Bot →" (goes to `/teams`)
  - **Secondary:** "Browse Analytics →" (goes to `/stats`)
- Optional sub-line: "Plus open analytics for when the game's over."

### 2. Tonight's slate (if games active) OR "Last night" recap
- IF games tonight: compact ticker, 3-5 games max, each game card links to the team bot pages
- IF no games: "Last night: X games covered" with quick stats or top performer
- Always present some signal of activity — never blank

### 3. Bot proof of life — "From the bot network"
- Recent posts feed (4-5 cards): latest tweets/posts from team bots + brand account
- Each card shows: bot avatar, team logo, post text/preview, timestamp, link to social
- This is the heartbeat — proves it's a living, active network
- Pull from a JSON manifest or the bot output stream

### 4. Featured analysis card
- The most recent `/analysis` post
- Hero image / cover + lede + "Read full analysis →"
- This is the retention magnet — long-form draws return visits + drives engagement

### 5. Built for fans who watch — analytics teaser
- Heading: "Built for fans who watch"
- 3-4 cards:
  - "Career receipts" — featured player career table PNG (rotates daily)
  - "Anomaly of the day" — from the anomaly detector pipeline
  - "Top line this week" — link to line detail page
  - "Live game cards" — promo for what bots post during games
- Each card links to the relevant deep page

### 6. Voice statement strip
- Short brand voice manifesto:
  - "The model has receipts."
  - "Analyst voice, not influencer voice."
  - "Data-anchored, no hype."
- Three to five lines. Establishes brand without being precious.

### 7. Footer
- Bot output ticker (the developer-flavor live activity feed) — relegated to here, NOT above the fold
- Standard footer links: Teams · Stats · Analysis · Account · Support
- Social links (X, Bluesky, Threads, Reddit)

## CRITICAL: Adaptive calendar states

The homepage cannot be designed for a single calendar moment. NHL seasons swing from 15-game regular-season nights to single-game conference finals to multi-week offseason droughts. Design the page as a **system that adapts to game volume + season state**, not one fixed layout.

The 5 states the homepage must handle:

### State A — Regular season, full night (10-16 games)
- Compact game ticker, 6-8 games visible with "View all →" link
- Bot activity feed shows high-velocity posts from many bots
- Featured analysis present but balanced against game volume
- "Tonight's biggest matchup" pinned (use WP gap, xGF% gap, or playoff implications to pick)

### State B — Regular season, light night (2-5 games)
- All games visible in ticker with more breathing room per game
- Each game card can show more context (current score, period, WP if live)
- Analytics teaser gets more visual weight
- Bot feed shows fewer but richer posts

### State C — Playoffs, multiple series active (2-4 games)
- Game cards get larger — each playoff game matters more individually
- **New element: series state widget** per game (logos + series score, "BEST OF 7 · CAR LEADS 2-1")
- Featured analysis surfaces pre/post-game writeups specific to active series
- Anomaly detector cards pivot to playoff lines/players only
- Bot activity feed prioritizes team bots actually playing

### State D — Playoffs, single game (Conference Finals / Stanley Cup Final)
- Single game gets the spotlight — large hero-tier card
- Series state widget is dominant: logos, series score, "GAME 3 · TONIGHT"
- Latest WP card embedded (live during game)
- Featured analysis is the pre/post-game piece for THIS series
- Parallel cards: top lines this series, key player matchups
- Bot activity: filtered to the 2 active team bots + brand account

### State E — Off-day or offseason (no games tonight)
**Sub-states:**
- **Playoff off-day, series ongoing** ("Back tomorrow for Game 4")
  - Series state widget still prominent
  - "What we're watching" panel: anomalies, trending lines, key player setups
  - Recent /analysis post prominent
- **Between series** ("Next series starts Friday")
  - Matchup preview becomes hero
  - Schedule countdown
- **True offseason (June–September)**
  - Featured analysis becomes the cover story
  - Stats hub gets more prominence (career tables, leaderboards)
  - Personal account thread feed surfaces
  - Newsletter/follow CTAs more aggressive
  - NO game ticker — show "Season returns October X" or equivalent
  - "Find your team bot" stays important — offseason is when fans pick teams to follow

### Design implication

The frontend agent should produce **modular section components** that compose differently per state, not 5 different page templates. A "GameCard" component should know how to render compact (State A) vs hero-sized (State D). A "SeriesWidget" should hide when no series is active. A "BotFeed" should adapt to high-volume vs low-volume mode.

State detection happens via data (count of games tonight, count of active series, calendar date). Build the state-detection helper as part of Phase 2 so it's testable.

**In the Phase 1 mockups: produce variants for State A (regular season full night), State D (single playoff game — TODAY'S state), and State E.3 (offseason).** Those three points define the gradient.

## What NOT to do

- **Do NOT make the homepage look like a stats dashboard.** No giant leaderboards above the fold. No data-density-first layout. Those belong on `/stats/*` and `/teams/{abbr}`.
- **Do NOT bury the bot identity.** If a first-time visitor doesn't understand HGB is a bot network within 3 seconds, the page failed.
- **Do NOT hero-feature the live scoreboard.** Live game state is a nice signal but it's not the brand. The brand is the bot network covering it.
- **Do NOT use generic "Welcome to HockeyGameBot" hero copy.** Lead with the product description.
- **Do NOT add a giant feature grid** ("Lines, Players, Goalies, Teams, Cards…"). The nav already does that. The homepage tells visitors WHY to use the site, not WHAT'S on it.
- **Do NOT redesign the nav as part of this ticket.** Nav stays.

## Design language

- HGB cream/ink palette
- Barlow Condensed headers, JetBrains Mono for numbers
- Red accent (`#E8002D` or established HGB red) used sparingly for CTAs + highlights
- Light AND dark mode (existing tokens)
- Mobile-first responsive
- The grid background pattern: keep, but don't let it dominate when content is sparse — fill with content above it

## Frontend agent workflow

**Phase 1 — Mockup, no code (~1-2 hours)**

Frontend agent produces 2-3 mockup directions in HTML/inline-CSS (no Astro components, no integration). Drop in `docs/plans/homepage-mockup-{N}.html`. Each mockup explores a different visual emphasis:

- **Mockup A — bot-first**: hero dominated by bot identity + recent posts feed prominent
- **Mockup B — magazine-style**: hero + featured analysis as cover story + cards below
- **Mockup C — hybrid**: hero + ticker + analysis + posts feed + analytics teaser

Matt reviews, picks one direction (or hybrid elements from each).

**Phase 2 — Build (~3-4 hours, after mockup approved)**

Frontend agent + engineer convert the approved mockup to Astro components:
- New page: `src/pages/index.astro` (replace current)
- Pull data: latest `/analysis` post (via content collections), recent bot posts (manifest), tonight's games (existing API)
- Components: hero, ticker, bot feed, analysis card, analytics teaser, voice strip, footer

**Phase 3 — Polish + ship (~1 hour)**

- Mobile rendering across all sections
- Light + dark mode
- Loading states for live data
- PNG export NOT needed for homepage (defer)

## Out of scope

- Newsletter signup form (separate ticket)
- Account / login flow changes
- Search bar
- Nav redesign
- New `/teams` index changes (those exist, link to them)
- Performance optimization beyond standard Astro defaults
- A/B testing infrastructure

## Acceptance criteria

- [ ] Phase 1 mockups posted with sample data
- [ ] Matt approves a direction
- [ ] Phase 2 build matches approved mockup
- [ ] First-time visitor understands HGB is a bot network in <5 seconds (test on someone unfamiliar)
- [ ] Primary CTA ("Find Your Team Bot") is the most prominent action
- [ ] Featured /analysis post renders correctly
- [ ] Live ticker handles "no games tonight" gracefully
- [ ] Bot post feed pulls real recent activity
- [ ] Mobile + light + dark all render
- [ ] Empty states are designed (no live games, no recent analysis, no recent bot posts)

## Reporting back

Three checkpoints:

1. **After Phase 1 mockups:** all 3 HTML files in `docs/plans/`, screenshot each, post for Matt's pick
2. **After Phase 2 build:** live URL on rewrite branch + screenshots (light/dark/mobile)
3. **After Phase 3 polish:** final URL + any architectural decisions worth flagging

## Strategic priority

This is THE page most visitors will see. Higher leverage than any sub-page redesign. Don't ship until it actually serves the three visitor types listed at the top. Better to send 4 mockups than ship a fast first attempt.
