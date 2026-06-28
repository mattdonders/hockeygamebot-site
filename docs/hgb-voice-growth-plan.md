# HGB Voice And Growth Plan

Date: 2026-06-28

Status: Draft for section-by-section review.

Purpose: define how HockeyGameBot should sound and publish across the site, bots, personal account, GameBot account, Discord, and future app/push surfaces. This is not a brand bible. It is an operating plan for turning HGB's data/artifacts into social reach without making the site a generic analytics platform or the personal account feel trapped.

## Review Plan

Review one section at a time:

1. Strategic goal
2. Account roles
3. Voice rules
4. Content pillars
5. Posting cadence
6. Artifact distribution workflow
7. Growth loops
8. Copy shapes
9. What HGB should never say
10. Implementation backlog

Each section should end with a practical decision. If a rule feels wrong, revise the rule before writing copy shapes or building automation.

## 1. Strategic Goal

HGB's growth goal is not "post more." It is to make HGB artifacts show up naturally in hockey conversations.

The desired behavior:

- a fan searches a player page and posts the player card in Discord
- a team bot posts a timely game or roster artifact
- the GameBot account posts the clean artifact with neutral framing
- the personal account quote-posts with context, opinion, or team-specific angle
- other fans reuse the artifact without needing HGB to explain every metric
- the site becomes the source people visit when they want the card, context, or model read

This matches the product north star:

> HockeyGameBot turns hockey data into fast, credible, shareable social artifacts.

Natural sharing is the end state, not the startup tactic. Early growth will require intentional seeding: GameBot account originals, personal-account quote-posts, replies with cards, request prompts, Discord sharing, and team/fanbase-specific posts. Being free helps because users can grab cards without friction, but most people will not discover that workflow unless the artifacts repeatedly show up where hockey conversation already happens.

The GameBot account should grow because it is useful, fast, and recognizable. The personal account can help bootstrap that growth, but HGB should not permanently depend on one personal feed.

Primary growth outcomes:

- more HGB cards/artifacts reposted by fans
- more player/team/game page visits from social and Discord
- more followers on the GameBot account
- more users recognizing HGB as a credible model/artifact source
- more bot output treated as trustworthy, not random automation
- more hockey conversation driven by HGB context, even when the post is not a hard take

Secondary outcomes:

- better launch path for iOS push notifications
- clearer content library for offseason posts
- fewer one-off posts that do not teach people what HGB is
- less pressure on the personal account to only post hockey

Decision rule:

Every publishing idea should answer at least two:

- does this produce a shareable artifact?
- does this make the model/bot feel more credible?
- does this help a fan support a point with credible context?
- does this start or improve a hockey conversation?
- does this teach people what the GameBot account is for?
- does this create a repeatable format?

## 2. Account Roles

HGB has several distribution surfaces, but they are not equally mature yet. The plan needs to separate current behavior from the future target state.

### Platform Inventory

Twitter / X:

- 32 team game bots
- 1 personal account
- 1 GameBot account

Bluesky:

- 32 team game bots
- 1 personal account
- 1 GameBot account

Threads:

- 1 personal account
- 1 GameBot account
- Communities can be used for targeted posting
- no team bot accounts today

### Current State

Personal account:

- posts almost all manual hockey content today
- has the most useful existing hockey reach
- is where most cards/artifacts currently get traction
- is also the account that can feel boxed in if every useful HGB artifact must come from it
- can combine a human hockey take with an HGB card, especially for team-specific conversation
- leans heavily into Devils Twitter because that is the owner's team and existing community

GameBot account:

- underutilized today because the following is small
- needs to post useful artifacts to gain followers and credibility
- cannot grow if every strong artifact is posted only from the personal account
- also cannot rely only on quote-posts from the personal account forever

Team bots:

- auto-post to Twitter / X and Bluesky
- are part of the original HGB product
- Twitter now charges for every automated tweet, while Twitter is still the largest hockey platform
- need a separate audit for what should be posted, what should be suppressed, and what deserves paid Twitter volume
- historically centered on play-by-play analysis, but the larger HGB data/model pipeline now creates an opportunity for faster insight/analysis than generic score apps

Site:

- is currently the durable home for cards, stats, and artifacts
- should stay quiet and credible
- should make social/bot output easier to trust and share

Future app:

- should eventually support interesting push notifications
- should not overload users by default
- should route users to useful game/player/team context when there is something worth opening

### Future Target Roles

#### Personal Account

Job:

Use existing hockey reach to seed HGB artifacts into real conversation.

Best uses:

- quote-posting HGB artifacts with actual opinion
- Devils-specific context
- product-building updates when interesting
- explaining why a card or model read is notable
- asking for player/team requests
- reacting to trades, signings, rumors, and playoff narratives

Tone:

- human
- opinionated when appropriate
- allowed to be informal
- allowed to say "I think"
- can carry the nuance that the GameBot account should not overdo

Risk:

If every useful hockey artifact only comes from the personal account, HGB never becomes its own destination and the personal account starts feeling boxed in.

#### GameBot Account

Job:

Be the official artifact feed and credibility layer.

Best uses:

- clean player cards
- trade/signing dossiers
- game turning points
- goalie cards
- team-vs-opponent snapshots
- line chemistry cards
- model signals
- methodology-lite posts
- bot/status announcements

Tone:

- neutral
- concise
- credible
- hockey-native
- not sterile
- careful with claims

The GameBot account should rarely sound like a person dunking on someone. It should sound like a trusted feed posting a useful hockey object.

Growth balance:

The GameBot account needs to post original artifacts to gain followers, but the personal account still needs the freedom to post original cards/artifacts directly when that is the right social move. The target is a balanced mix:

- GameBot account posts canonical artifact originals often enough to build identity
- personal account quote-posts selected GameBot posts with context/opinion
- personal account can still post some original artifacts directly, especially when the human angle matters
- over time, more artifact originals should shift to the GameBot account as its following and credibility grow

Growth constraint:

The GameBot account will not grow by accident. If the default remains "post from the personal account because it has reach," the GameBot account will keep feeling too small to use, which reinforces the same problem. The plan should intentionally force some recurring artifacts to originate from GameBot even when the personal account would get more immediate engagement.

Personal-account constraint:

If the personal account remains the only serious distribution surface, it effectively has to stay heavily hockey-focused. That may be acceptable, but it is a real tradeoff: non-hockey posting may cost hockey followers, and HGB remains tied to one personal feed.

Practical default:

- GameBot account should post the original artifact for recurring formats.
- Personal account should quote-post the best HGB originals with opinion/context.
- Personal account can still post original artifacts directly for high-context moments, Devils-specific discussion, or when speed/reach matters more than project-account growth.
- If an artifact is part of a planned recurring GameBot series, it should start on the GameBot account by default.
- Planned recurring formats should usually originate from HGB. Otherwise followers learn that the personal account is the only place they need to watch.

#### Team Bots

Job:

Move near-real-time data into team-specific feeds as quickly and reliably as possible.

Best uses:

- game state
- final/recap artifact
- notable player moments
- standings/playoff context
- milestone alerts
- team-specific model signals

Tone:

- factual
- fast
- scoped
- automated but not awkward

Team bots should not over-editorialize. Their credibility comes from speed, consistency, and useful artifacts.

Bot audit follow-up:

Create a separate team-bot posting audit. The question is not only "can we post this?" It is "is this worth automated platform cost and feed volume?" That audit should live outside this voice/growth plan.

Principle for this doc: bots must be fast, additive, and cost-aware. Threads is different because there are no team bots there today; growth should lean on manual community-targeted posts rather than bot syndication unless the platform strategy changes.

#### Site / Future App

Job:

Give every social artifact a durable home and every bot moment a deeper context path.

Best uses:

- canonical player/team/game/card pages
- artifact downloads
- page states worth screenshotting
- push-notification destinations
- methodology and model trust

Tone:

- quiet
- clear
- trustworthy
- low on hype

Decision rule:

Current state: the personal account carries reach.

Future state: the personal account interprets, the GameBot account publishes more recurring artifacts, the bots alert quickly, and the site/app preserve and contextualize.

## 3. Voice Rules

HGB voice should sound like a trusted hockey account posting something useful enough to share.

Core traits:

- natural
- credible
- direct
- concise
- hockey-native
- careful about uncertainty
- confident only when the evidence supports it

HGB should not sound:

- smug
- robotic
- like an AI feature demo
- like a betting tout
- like a fake scout
- like a model claiming to settle hockey forever
- like a brand trying too hard to be funny
- like the final authority on a player
- so cautious that it becomes vague

Preferred framing:

- "Jack Hughes' profile starts with high-end offense and chance creation."
- "The model is strongest on his offensive creation and power-play impact."
- "The concern is deployment/context, not the top-end offensive signal."
- "Small sample, but the recent trend is real enough to watch."
- "This is a model read, not a final verdict."
- "The numbers point to an offensive defenseman, with transition and power-play value carrying the profile."
- "Contract context matters here: the profile looks different at $2M than it does at $6M."

Careful does not mean empty. HGB should avoid overclaiming, but posts should still have a clear reason to exist. Sometimes the goal is not to declare a take; it is to give fans better context for discussion.

Number rule:

Lead with profile language before raw numbers. Exact percentiles and model values are useful on cards and pages, and the card itself can be the numeric anchor. Social copy should usually translate the read into hockey adjectives first and add extra numbers only when they materially clarify the point:

- high-end offense
- middling defense
- two-way forward
- offensive defenseman
- low-event stabilizer
- power-play driver
- speedy transition player
- sheltered finisher
- strong chance creator
- context-dependent depth piece

Why:

Hockey isolation models are useful but imperfect. Team effects, linemates, deployment, score effects, finishing variance, and role can still bleed into model output. HGB should use numbers to support the read when needed, not make every post sound like the model is the authority. In many artifact posts, the image already carries the numbers.

Contract/context rule:

Contract and cap data can support analysis when available, especially for trade/signing posts, roster-fit notes, and "what your team is getting" artifacts. HGB should use contract data as context, not become a cap-management workflow or "be a GM" site.

Avoid:

- "Receipts"
- "Proof"
- "We told you"
- "The model proves"
- "Player A is objectively better"
- "This debate is over"
- "Bot court"
- "HGB hates him" unless the site intentionally adopts that sharper phrasing later

Use "HGB likes..." carefully.

It can work in social copy when the point is clearly about model signals:

- "Why HGB likes the fit"
- "What HGB likes in the profile"

It should not imply the model has personal taste or total certainty:

- avoid "HGB loves him" as default official copy
- avoid "HGB hates him" unless deliberately used in a casual personal-account quote post

Decision rule:

Official HGB copy should describe the player/team/game profile in hockey terms first, then let the artifact carry the exact numbers. Personal-account amplification can be more explicit about opinion, caveats, and interpretation.

Recurring framing rule:

HGB should have recognizable post shapes, not rigid scripts. Plain labels such as "Profile Read," "Trade Fit," "Model Watch," or "Game Tilted Here" can help users understand the post type, but the account should not become so predictable that every post feels templated.

## 4. Content Pillars

HGB should repeat a small number of recognizable formats until people know what to expect.

### Player Artifacts

Job:

Make player arguments portable.

Formats:

- player card
- shotmap card
- talent card
- RAPM/history card
- trade/signing dossier
- profile signals / what drives the HGB profile
- comparison artifact
- RAPM component comparison card

Best windows:

- trades
- signings
- rumors
- playoff breakout games
- milestone pushes
- team Discord debates
- offseason ranking periods

### Game Artifacts

Job:

Explain what changed in a game, primarily through the game bots.

Formats:

- turning point
- goalie save/xG swing
- "game tilted here"
- line matchup
- final recap
- misleading scoreboard/process note

Best windows:

- live games
- immediately after final
- next morning recap
- playoff games

Distribution rule:

Game artifacts should usually stay with the game/team bots. The GameBot account or personal account should manually post them only when something is unusually interesting, highly shareable, playoff-relevant, or useful for a broader hockey conversation.

### Team Artifacts

Job:

Give fanbases a reason to share HGB even when no single player is the story.

Formats:

- team-vs-opponent snapshot
- team process vs results
- playoff/standings context
- special teams profile
- line chemistry board
- goalie/team support split

Best windows:

- playoff race
- trade deadline
- draft/free agency
- rival matchups
- losing streaks/winning streaks

### Model Trust Posts

Job:

Make HGB credible without turning every post into methodology class.

Formats:

- methodology-lite thread
- "what this stat means"
- "what this card does not say"
- model audit notes
- data freshness notes
- example-driven explanation

Best windows:

- offseason
- after model updates
- when a card gets attention
- when a surprising player ranking needs context

### Build-In-Public Posts

Job:

Use the personal account to make the project more relatable without diluting the GameBot account.

Formats:

- page redesign screenshots
- "what changed and why"
- artifact design iterations
- bot reliability updates
- asks for feedback

Best surface:

Personal account first. GameBot account only when the change directly affects users.

### Community Request / Fanbase Posts

Job:

Create lightweight audience loops around teams, players, and fan communities.

Formats:

- "reply with a player and I will post the card"
- "which team should get the next snapshot?"
- Threads Community posts
- team Discord card drops
- request fulfillment posts
- fanbase-specific player comparisons

Best windows:

- offseason
- trade/free agency windows
- after a card gets traction
- when a team-specific debate is already happening

Distribution rule:

These posts can start from either the personal account or GameBot account depending on the goal. Use the personal account for reach and conversational prompts; use the GameBot account when the goal is to train followers that GameBot is the source of the artifact.

Decision rule:

If a post does not fit one of these pillars, it probably belongs on the personal account or should not be posted.

## 5. Posting Cadence

The offseason plan should be sustainable. GameBot does not need a full-time content desk, and forced cadence will make the account worse.

Minimum viable presence:

- 1 GameBot-original artifact per week during quiet periods
- 2-3 GameBot-original artifacts per week when there is natural hockey context
- no quota for personal quote-posts
- no weak artifact just to hit a schedule

Natural context examples:

- trade rumor involving a player with an interesting HGB profile
- signing/extension news where a player card adds context
- fanbase debate where a comparison card helps
- playoff/game moment that the bots surfaced and people are discussing
- award/ranking debate where a profile card can support the conversation
- free agency/draft windows where player/team fit matters

Recommended account split:

- GameBot account posts clean artifacts first when the artifact is part of a recurring format or useful context for a broader hockey conversation
- personal account quote-posts only the GameBot posts that naturally deserve commentary
- personal account can still post hockey opinions directly when they are not HGB artifacts
- team bots keep automated output separate from manual GameBot account posts

During high-event windows:

- trade deadline
- draft
- free agency
- playoffs
- awards

Shift from scheduled cadence to event response:

- post the artifact quickly
- link to player/team page
- add one short neutral profile read
- use personal account for fuller opinion or fanbase-specific framing

During quiet windows:

- ranking/countdown formats only if they feel natural
- profile cards where HGB meaningfully differs from common perception
- team offseason previews
- player card request threads
- methodology-lite explainers

Reply vs quote workflow:

Use replies to enter an existing conversation. Use quote-posts to create a post that lives on the account's own feed.

For large-account news posts:

1. GameBot replies to the original post with the clean artifact and short context.
2. Personal account quote-posts the GameBot reply with the human take.

Why this works:

- the GameBot reply appears where fans are already reading the news conversation
- the personal quote-post gives the artifact timeline reach
- the GameBot account remains the artifact source
- the personal account adds interpretation without stealing the original artifact every time

Use a GameBot quote-post instead when the artifact is strong enough to stand alone as a GameBot account post, especially for recurring formats or major hockey news.

Guardrail:

Do not turn every GameBot reply into a personal quote-post. Use the two-step workflow selectively for posts with real audience fit, strong artifact relevance, or a take worth adding. Some takes should originate from the personal account. Some artifacts should originate from GameBot. Some GameBot replies should remain replies. The goal is healthy distribution, not a mechanical funnel.

Decision rule:

Consistency matters more than volume, but natural context matters more than consistency. One well-timed artifact in the right hockey conversation is better than five scheduled posts nobody asked for.

## 6. Artifact Playbook / Runbook

Every high-value artifact should have an operating playbook, not just a download button.

The useful question is:

> News happened. What do I do with HGB?

For each artifact type, define:

- when to use it
- where it originates
- which account acts first
- default post shape
- when personal should amplify
- when GameBot should reply vs quote-post
- whether bots should touch it
- destination URL
- when to avoid posting it
- when to refresh it

### Play 1: Player News / Trade Rumor / Signing

Use when:

- player is in trade rumors
- player signs or extends
- player changes teams
- fanbase is debating whether the player is good or worth the cost
- large hockey account posts news where a player card adds immediate context

Primary artifact:

- player card

Optional artifact:

- trade/signing dossier
- RAPM/history card
- shotmap card if playing style is the story
- RAPM component comparison if the debate is player-vs-player

Default origin:

- GameBot account if this is broadly relevant or part of a recurring format
- personal account if it is highly team-specific, Devils-specific, or requires a human take

Reply vs quote:

- GameBot replies to large-account news posts when the card directly adds context
- GameBot quote-posts when the artifact is strong enough to stand alone
- personal account quote-posts GameBot when there is a real take worth adding

Default GameBot shape:

- profile-first, number-light
- one sentence on what the player is
- one sentence/link to full card

Example:

`Vladar context: recent profile is stronger than the surface reputation, but contract/team context matters. Full card: {url}`

Default personal shape:

- human context
- team/fanbase angle
- explicit opinion if useful

Example:

`For Devils fans asking: this is why I would/would not be interested. The profile gives you {signal}, but I would still worry about {context}.`

Avoid when:

- the card does not add more than the news post already says
- the player profile is too incomplete or stale
- the post would read like engagement bait
- the only angle is dunking on a player/fanbase

Refresh when:

- trade/signing becomes official
- contract details arrive
- player changes team
- model/data update materially changes the profile
- playoff/offseason narrative creates a new reason to revisit

### Play 2: Team / Fanbase Debate

Use when:

- a fanbase is arguing about a roster need
- a team is linked to multiple players
- matchup-specific context matters
- team page or opponent filter can answer the question

Primary artifact:

- team snapshot
- team-vs-opponent view
- player card attached to team context
- line chemistry card

Default origin:

- personal account for conversational/fanbase targeting
- GameBot account for broad recurring team snapshots

Personal-account pattern:

Use the personal account when the post is clearly entering a specific fanbase conversation and the human/team angle matters more than training people to follow GameBot.

Example shape:

`I think he would fit {team} because {hockey reason}. The HGB card supports that with {profile signal}, but the concern is {context}.`

This is a good use of a card even if it does not originate from GameBot: the artifact supports the point, the post joins an existing conversation, and the human account carries the fanbase-specific angle.

Constraint:

The personal account is strongest for Devils-adjacent conversation. It can still carry broader hockey posts, but HGB should not assume the personal account has equal reach or credibility with every fanbase. GameBot, team bots, Threads Communities, replies under large accounts, and Discord sharing matter more for non-Devils reach.

Avoid when:

- the post would require cap workflow depth HGB does not support
- the team context is mostly speculation with no useful data angle

### Play 3: Game Moment

Use when:

- bot surfaces an unusually interesting game moment
- playoff/high-leverage game creates broader relevance
- a game artifact explains something fans are already discussing

Primary artifact:

- turning point
- goalie save/xG swing
- game tilted here
- final recap

Default origin:

- team/game bots

Manual exception:

- GameBot or personal account should manually post only when the moment is unusually shareable, playoff-relevant, or useful beyond one team feed.

Avoid when:

- it is ordinary play-by-play
- the bot already handled it and there is no broader conversation
- the artifact is only interesting because it is automated

### Play 4: Model Trust / Methodology-Lite

Use when:

- an artifact gets attention or pushback
- a surprising player/team profile needs context
- model update changes outputs
- offseason content needs durable trust-building

Primary artifact:

- short explainer
- example card
- "what this does / does not say" post

Default origin:

- GameBot account for official methodology-lite
- personal account for build-in-public or candid model discussion

Avoid when:

- it becomes a long methodology lecture
- it distracts from the artifact instead of supporting it
- it sounds defensive

Decision rule:

Do not build or post an artifact that has no obvious playbook. If nobody knows when to use it, which account should post it, or what conversation it belongs in, it is probably not ready.

## 7. Growth Loops

HGB growth should come from repeatable fan behaviors, not generic brand posting.

### Fanbase Request Loop

Ask for player/team/card requests, then fulfill a subset publicly.

Useful prompts:

- "Reply with a player and I will post the HGB card."
- "Which deadline target should get a dossier?"
- "Which team page should get the next opponent snapshot?"

Why it works:

Fans ask for their own team. The artifact naturally reaches a fanbase.

Guardrail:

Do not ask an empty room to reply. Public request prompts work for accounts with active reply behavior; they look weak when nobody answers. Until the GameBot account has enough active audience, request loops should usually start from:

- the personal account
- replies inside existing hockey conversations
- Discord
- Threads Communities
- direct prompts to specific fanbases

GameBot can fulfill the request by posting the artifact, but it does not always need to originate the request prompt.

Use GameBot-origin request prompts only when:

- the account has recent reply activity
- the prompt is tied to active news
- there is a clear fanbase/community target
- there are enough likely replies to avoid the post looking abandoned

### Reply Discovery Loop

GameBot replies under large, relevant posts with useful artifacts.

Why it works:

The artifact appears where fans are already reading and reacting. This is especially useful while the GameBot account is still small.

Rules:

- only reply when the artifact directly adds context
- keep copy short
- do not spam the same card under every mention
- prefer player/team/news posts where the card answers a live question

### Personal Amplification Loop

GameBot posts or replies with the artifact. Personal account selectively quote-posts with a human angle.

Why it works:

GameBot gets the source trail, while the personal account supplies reach and context.

Guardrail:

Do not quote-post every GameBot artifact. Amplify when there is a real take, a Devils/fanbase angle, or a post worth pushing into the personal timeline.

### Discord Context Loop

Design posts and cards that survive being pasted into Discord without thread context.

Why it works:

Users already grab cards for Discord. That behavior should be encouraged, not replaced.

### Threads Community Loop

Use Threads Communities for targeted manual posts.

Why it works:

Threads can expose artifacts to topic/fan communities without needing team bot accounts. It should not receive blind Twitter copy-paste; posts should fit the community context.

### Event Loop

Trades, signings, rumors, big games, and playoff moments trigger artifacts.

Why it works:

HGB is strongest when it reacts quickly with something credible and visual.

### Methodology Loop

When an artifact gets attention or pushback, publish a short explainer.

Why it works:

Trust grows from timely explanation, not from burying everyone in methodology upfront.

Decision rule:

Each growth loop should drive either a follow, a repost, a page visit, or a fan-generated share.

## 8. Copy Shapes

These are shapes, not templates. One size does not fit all. The goal is to define posture and useful defaults without making every GameBot post sound identical.

Constraint:

HGB does not currently have a mature library of human scouting-report text to pull from. Claude-generated scouting-style reports may become part of the system, but they need to follow the human-voice guidelines and avoid AI-sounding filler. Treat them as generated profile copy grounded in HGB signals, not as independent scouting authority. Until that workflow is proven, social copy is built from model signals, artifacts, page context, generated profile language, and the live conversation around the player/team/game.

That makes variety important: if every post follows the same sentence structure, people will learn to ignore it.

### Artifact-First

Use when the card does most of the work.

Shape:

- identify the player/team
- give one profile read
- attach/link the artifact

Example:

`{Player} profile card. High-end offensive creation with the card doing the number work. Full profile: {url}`

### News Reply

Use when replying under a large account or active news post.

Shape:

- short context label
- one useful read
- card/link

Example:

`{Player} context: the profile is driven more by finishing/shot quality than play-driving. Card: {url}`

### Trade / Fit

Use when a player is linked to a team, signs, extends, or becomes part of a fanbase debate.

Shape:

- team fit framing
- strongest player signal
- context flag

Example:

`{Team} fit read: {Player} brings real shot/scoring value. The context flag is whether the rest of the profile holds up away from the current role.`

### Personal Quote-Post

Use when the personal account adds the human take.

Shape:

- say what you think
- use the artifact as support
- add caveat if needed

Example:

`This is why I would be interested for {team}. The card backs up the scoring/shot-location piece, but I would still worry about {context}.`

### Caveat / Context

Use when the artifact could be overread.

Shape:

- give the read
- limit the claim
- point to the artifact/page for context

Example:

`Not a final verdict, but the profile points to {read}. The card is useful context, not the whole player.`

### Bot / Game

Use mostly for team/game bots.

Shape:

- state the event
- explain the added context
- keep it fast

Example:

`Game tilted here: {event}. The swing was driven by {reason}, not just the final shot count.`

Decision rule:

Official GameBot copy should make the artifact clear and useful. Personal copy can make the argument. Do not force a fixed template when the conversation calls for a different shape.

## 9. What HGB Should Never Say

Avoid copy that makes the model sound more certain than hockey allows.

Never default to:

- "proved"
- "receipts"
- "we told you"
- "debate over"
- "objectively better"
- "must"
- "fraud"
- "washed" as official account language
- "steal"
- "disaster"
- "awful contract"
- "HGB hates him"
- "AI says"
- "the model knows"
- "scouting report says" unless the source/workflow is clear
- dunking on fanbases
- dunking on players
- implying HGB has inside information
- pretending generated profile text is human scouting

Avoid product choices that create the same effect:

- leaderboards without scope
- cards without caveats
- screenshots where the metric meaning is unclear
- export-first posts
- engagement bait detached from an artifact
- generated scouting-style text without human-voice cleanup
- contract/value claims without contract/value model support

Personal account exception:

The personal account can be more casual or opinionated, but HGB artifacts should still carry the credible source layer. The personal account should not make the GameBot account look smug by association.

Decision rule:

HGB can be interesting without being smug.

## 10. Implementation Backlog

### Near Term

- Add this plan to the site-system docs and keep it reviewed section by section.
- Create 5-8 copy shapes for player cards, team snapshots, player news, and personal quote-posts.
- Define 3 GameBot-first recurring formats to test.
- Decide which artifact types usually originate from GameBot vs the personal account.
- Write first-pass artifact playbooks for player news, team/fanbase debate, and game moments.
- Add UTM/source tags or simple analytics labels for social links where practical.
- Add "share copy" text near key artifact buttons only if it helps the workflow.

### Offseason

- Build a small content calendar around:
  - trade/signing dossiers
  - player card requests
  - team offseason snapshots
  - methodology-lite explainers
  - model audit notes
- Create a separate team-bot platform/cost audit.
- Define 3-5 recurring GameBot account series names, if needed.
- Create a repeatable workflow for personal quote-post amplification.
- Test which formats drive page clicks vs reposts.
- Build a generated profile/scouting-style text workflow that follows the human-voice guidelines.

### Later

- Connect bot posts to canonical page states when live pages support it.
- Build push-notification copy rules for the future iOS app.
- Add artifact-specific landing states for high-value social posts.
- Build request/queue tooling if manual card requests become too much work.
- Add account/platform analytics for GameBot, personal-account amplification, replies, Threads Communities, and Discord-driven traffic.

Decision rule:

Do not automate volume before the voice and artifact formats are proven manually.
