/**
 * PREVIEW/TEST INFRASTRUCTURE — NOT a data source for production.
 *
 * Only reachable when PUBLIC_CHANGELOG_FIXTURE is baked to `true` at build
 * time (astro.config.mjs, gated on Cloudflare Pages' auto-injected
 * CF_PAGES_BRANCH !== 'main'), which cannot happen in a production build.
 *
 * Stands in for GET /v1/passport/changelog on Cloudflare Pages preview
 * deployments, where hgb-api's changelog endpoint isn't reachable yet (no
 * preview D1/R2 in this account — see
 * docs/plans/puck-passport-whats-new-implementation-plan-2026-08-06.md).
 * Content mirrors hgb-api's data/passport-changelog.json verbatim (the two
 * real launch entries) so preview verification exercises real copy.
 *
 * Delete this file (and its one call site in fetchChangelog) once hgb-api's
 * changelog endpoint is deployed somewhere preview builds can reach.
 */

import type { ChangelogResponse } from './passport-changelog';

export const PREVIEW_CHANGELOG_FIXTURE: ChangelogResponse = {
  schema_version: 1,
  latest_sequence: 2,
  entries: [
    {
      sequence: 2,
      id: 'public-passport-privacy-delay',
      published_at: '2026-08-06T17:00:00Z',
      title: 'More privacy for public passports',
      summary: 'Newly logged games now appear on public passports after a delay.',
      body: "When you log a game, it may indicate that you are currently at an arena. To better protect your real-time location, newly logged games now appear on your public passport only after the next morning's refresh.\n\nThe game is still saved to your account immediately and remains available to you while signed in. Only its appearance on the public version of your passport is delayed.",
      category: 'privacy',
      platforms: ['web', 'ios'],
    },
    {
      sequence: 1,
      id: 'gordie-howe-fight-accuracy',
      published_at: '2026-08-06T16:00:00Z',
      title: 'More accurate Gordie Howe Hat Trick badges',
      summary:
        'Puck Passport now uses confirmed fight data when awarding Gordie Howe Hat Trick badges.',
      body: 'A Gordie Howe Hat Trick requires a goal, an assist, and a fight in the same game. Puck Passport previously estimated the fight portion using penalty-minute data.\n\nThe badge now uses confirmed fight events from game play-by-play whenever that data is available, making both new and previously logged games more accurate.',
      category: 'improved',
      platforms: ['web', 'ios'],
    },
  ],
};
