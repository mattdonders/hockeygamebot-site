/**
 * PREVIEW/TEST INFRASTRUCTURE — NOT a data source for production.
 *
 * Only reachable when PUBLIC_CHANGELOG_FIXTURE is baked to `true` at build
 * time (wrangler.toml's `[env.preview.vars]`, scoped to Cloudflare Pages'
 * built-in "preview" environment), which cannot happen in a production build.
 *
 * Stands in for GET /v1/passport/changelog on Cloudflare Pages preview
 * deployments, where hgb-api's changelog endpoint isn't reachable yet (no
 * preview D1/R2 in this account — see
 * docs/plans/puck-passport-whats-new-implementation-plan-2026-08-06.md).
 * Content mirrors hgb-api's data/passport-changelog.json verbatim (three
 * backfilled historical entries plus the two real launch-day entries) so
 * preview verification exercises real copy.
 *
 * Sequences 1-3 (team-records-perspective, ticket-stubs, milestone-tiers) are
 * BACKFILLED historical entries — they shipped to production (2026-07-28,
 * 2026-07-30, 2026-08-02 respectively) before this changelog feature existed,
 * so they sit at/below CHANGELOG_LAUNCH_BASELINE_SEQUENCE and must never read
 * as unread; they're still visible in the permanent history, just not
 * flagged as new. See docs/plans/puck-passport-whats-new-implementation-plan-2026-08-06.md §16.
 *
 * Delete this file (and its one call site in fetchChangelog) once hgb-api's
 * changelog endpoint is deployed somewhere preview builds can reach.
 */

import type { ChangelogResponse } from './passport-changelog';

export const PREVIEW_CHANGELOG_FIXTURE: ChangelogResponse = {
  schema_version: 1,
  latest_sequence: 5,
  entries: [
    {
      sequence: 5,
      id: 'public-passport-privacy-delay',
      published_at: '2026-08-06T17:00:00Z',
      title: 'More privacy for public passports',
      summary: 'Newly logged games now appear on public passports after a delay.',
      body: "When you log a game, it may indicate that you are currently at an arena. To better protect your real-time location, newly logged games now appear on your public passport only after the next morning's refresh.\n\nThe game is still saved to your account immediately and remains available to you while signed in. Only its appearance on the public version of your passport is delayed.",
      category: 'privacy',
      platforms: ['web', 'ios'],
    },
    {
      sequence: 4,
      id: 'gordie-howe-fight-accuracy',
      published_at: '2026-08-06T16:00:00Z',
      title: 'More accurate Gordie Howe Hat Trick badges',
      summary:
        'Puck Passport now uses confirmed fight data when awarding Gordie Howe Hat Trick badges.',
      body: 'A Gordie Howe Hat Trick requires a goal, an assist, and a fight in the same game. Puck Passport previously estimated the fight portion using penalty-minute data.\n\nThe badge now uses confirmed fight events from game play-by-play whenever that data is available, making both new and previously logged games more accurate.',
      category: 'improved',
      platforms: ['web', 'ios'],
    },
    {
      sequence: 3,
      id: 'milestone-tiers',
      published_at: '2026-08-02T09:00:00Z',
      title: 'Milestone Tiers',
      summary:
        'Track your progress with five-rung milestone tiers across Games, Goals, Shots, Players, and Arenas.',
      body: "Puck Passport now tracks five progress tiers — Rookie, Veteran, All-Star, Legend, and Hall of Fame — across Games, Goals, Shots, Players seen, and Arenas visited (Rung V for arenas is \"The 32 Club\"). Tiers are computed by the server and now appear on your public passport page too, not just your own dashboard.",
      category: 'new',
      platforms: ['web'],
    },
    {
      sequence: 2,
      id: 'ticket-stubs',
      published_at: '2026-07-30T09:00:00Z',
      title: 'Ticket stubs — proof you were there',
      summary: "Turn any logged game into a shareable ticket stub with your game and arena number.",
      body: "Turn any game you've logged into a shareable ticket stub — final score, date, arena, your game and arena number, and the badges you earned that night.\n\nPost it to your story: the stub's QR code sends friends straight to your Passport. On X, post two games side by side in one image, sized to show in full with no cropping.",
      category: 'new',
      platforms: ['web'],
    },
    {
      sequence: 1,
      id: 'team-records-perspective',
      published_at: '2026-07-28T09:00:00Z',
      title: 'Your record against every team',
      summary: "Team records now take your team's perspective, with overtime and shootout losses split out.",
      body: "Team records now take your team's perspective. Overtime and shootout losses split out from regulation losses.\n\nTap any badge to see the games behind it: matchup, date, and final score. Older and relocated teams show their real names now — the Whalers are the Whalers again.",
      category: 'improved',
      platforms: ['web'],
    },
  ],
};
