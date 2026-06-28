# Codex Feature Ideas

Date: 2026-06-27

Purpose: capture feature directions that can make HockeyGameBot feel distinctive without copying HockeyStats or becoming a generic stat-table site.

## Product Lens

The best path is not more tables. HockeyGameBot should turn hockey data into fast, credible, shareable explanations.

HockeyStats is strong because it packages data into rituals: voting, draft trackers, rankings, cards, and live-event surfaces. HGB should learn from that product shape, not copy the exact mechanics.

The HGB advantage:

- Bot-first game automation
- Overnight SQL insight generation
- Player/team/game share cards
- Game-state context
- Discord-friendly artifacts
- Clear model explanations instead of exhaustive data warehouses

## 1. Trade / Signing Instant Dossier

A shareable player page mode for "what your team just got."

Core output:

- Talent percentile
- WAR / Impact recent trend
- Style tags such as "transition driver", "PP shooter", "defensive drag", "finisher"
- Last 3 seasons snapshot
- Closest comps
- Fit with new team if traded

Why it fits: fans already use player cards during roster news. This makes the workflow explicit.

## 2. Why The Model Likes / Hates Him

A concise model-readout panel on player pages.

Example structure:

- HGB likes: shot volume, 5v5 xG creation, recent Impact trend
- HGB worries: defensive RAPM, penalty differential, finishing regression
- Model view: current WAR below talent

Why it fits: it converts numbers into a scouting-style explanation while staying grounded in the model.

## 3. Game Turning Points Timeline

On game pages, add a narrative strip that explains why the game changed.

Candidate moments:

- Biggest WP swing
- Biggest xG sequence
- Goalie save of the game by xG prevented
- Best shift / line sequence
- "Game tilted here" moment

Why it fits: postgame sharing and bot voice are core HGB strengths.

## 4. Line Chemistry Cards

Player and team pages can produce "best with / worst with" cards.

Examples:

- Player A + Player B: 61.2 xGF%, +0.42 xG/60
- Player without linemate: drops to 48.0 xGF%
- Best 3-man line this season
- Most improved pair in last 10 games

Why it fits: hockey fans argue about line combos constantly, and HGB already has line data.

## 5. Player Archetype Badges

Give every player a small set of earned identity tags based on percentile buckets.

Example tags:

- Volume Shooter
- Transition Engine
- Net-front Finisher
- Play Driver
- Shelter Needed
- PK Specialist
- Low-event Stabilizer
- Power-play Merchant
- Regression Watch

Each badge should be explainable with the 2-3 stats that triggered it.

## 5A. RAPM Component Comparison Card

A two-player comparison card that puts RAPM components side by side.

Core output:

- Player A vs Player B
- EV offense
- EV defense
- PP impact
- PK impact
- finishing
- penalty differential
- teammate/opponent context if available
- concise "profile read" label for each player

Why it fits: fans often argue player-vs-player from a single overall WAR/Impact number. A component-level card shows *why* two players differ without turning the site into a table export.

Implementation note: this is a Claude Code-sized task. It should reuse existing RAPM/player-card data and produce a shareable artifact first; an interactive page can come later.

## 6. The War Room

A team-context voting or comparison tool. Not "who is better right now?", but "who fits this problem?"

Example prompts:

- Devils need a middle-six winger. Which player is the better fit?
- Would you take Player A at $5.5M for 3 years or Player B at $3.2M for 1 year?
- Which deadline target helps this roster more?

Why it fits: it creates a daily argument loop without cloning a raw player-ranking vote.

## 7. Trade Machine Lite

Not a cap-site clone. A simple "drop this player onto this team" analytics fit toy.

Output:

- Projected lineup role
- Strongest current teammate fit
- Who he likely replaces
- Team strengths changed
- Best case / worry / model verdict
- Share card

Can start with manual offseason depth charts and become more automated later.

## 8. Daily Debate Prompt

A daily discussion prompt generated from overnight insights.

Examples:

- Was the goalie actually the reason they lost?
- Is this player's heater real?
- Who drove the win: goalie, top line, or special teams?
- Which traded player needs more context?

Users vote or reply, then HGB shares the relevant context.

Why it fits: this makes the insight system interactive and turns analytics into fandom discussion without making HGB sound like the final judge.

## 9. Narrative Shift Cards

Shareable cards when a player/team narrative changes.

Examples:

- A struggling player starts showing stronger recent impact.
- A team's results start matching the underlying process.
- Deadline pickup check-in: profile since acquisition.

Why it fits: this is timely and artifact-native without relying on "we told you" framing.

## 10. Player Stock Market

A weekly board of model movement, not fantasy or betting.

Buckets:

- Rising
- Falling
- Volatile
- Undervalued
- Overheated
- Regression Watch
- Playoff Risers

Each entry needs a reason and a shareable card.

## 11. Lineup Lab

Let users pick 3 forwards or 2 defensemen and see historical chemistry.

Output:

- TOI together
- xGF%
- goal differential
- projected chemistry tags
- similar successful lines
- share card

Why it fits: turns line tables into a toy.

## 12. Explain This Game To Me

After every game, generate one summary panel.

Structure:

- Why the game ended the way it did
- Turning point
- Misleading stat
- Quiet player who swung it
- Goalie story
- Line matchup that mattered

Why it fits: HGB can own concise game explanation better than a table-first site.

## 13. Team Discord Pack

A page/button that creates a share bundle for a fan chat.

Example output:

- Best player card
- Worst player card
- Game turning point
- Trade target card
- One stat to argue about
- Copyable image bundle

Why it fits: users already share cards in Discord. Build directly for that workflow.

## Recommended First Bets

1. Trade / Signing Instant Dossier
2. Game Turning Points Timeline
3. Narrative Shift Cards
4. Daily Debate Prompt
5. Player Archetype Badges

The common requirement: every feature must produce a useful page state and a shareable artifact.
