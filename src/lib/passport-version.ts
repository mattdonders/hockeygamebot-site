/**
 * Puck Passport — first-visit onboarding bookkeeping.
 *
 * Onboarding is now a SEPARATE concern from the changelog/"What's New" feed
 * (see src/lib/passport-changelog.ts) — a one-time tour gated on a plain
 * completed/not-completed flag, not a version comparison. It used to share a
 * single `hgb_pp_last_seen_version` key with the changelog; that key is
 * migrated (not discarded) into passport-changelog.ts's
 * `hgb_pp_onboarding_completed` + `puck_passport_changelog_seen_through` keys
 * via `migrateLegacyChangelogState()`, which callers must run before reading
 * onboarding-completed state here.
 *
 * Persistence is localStorage-only (per-device) — this is a one-time local
 * tour, not account state, so it deliberately does not sync across devices.
 */

export {
  ONBOARDING_COMPLETED_KEY,
  migrateLegacyChangelogState,
  readOnboardingCompleted,
  writeOnboardingCompleted,
} from './passport-changelog';
