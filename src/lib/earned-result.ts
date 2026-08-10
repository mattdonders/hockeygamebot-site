/**
 * Pure view-model for the WEB earned-result presentation (Block 1C, 2026-08) —
 * the historical-add counterpart of TonightGameCard's in-card `cel-list`.
 *
 * `resolveEarnedResult` mirrors the iOS `AttendedResultView`'s PRODUCT MEANING
 * (hero priority, eyebrow tone, bare-success fallback), not its pixels — this is a
 * card, not a modal. It never recomputes badge/milestone/arena TRUTH itself; it
 * only shapes the server's `EarnedDelta` (already-earned facts) into something a
 * component can render. See `AttendedTracker.tsx`'s `EarnedDelta` docblock for
 * what the server guarantees (delta only populated when `created` is true).
 */
import { formatMilestoneLabel, resolveBadgeLabels, type CatalogLabelEntry } from './earned-format';
import type { EarnedDelta } from '../components/react/AttendedTracker';

export type EarnedResultTone = 'live' | 'historical';

export type EarnedResultSecondaryItem = { icon: string; label: string };

export type EarnedResultVM = {
  eyebrow: string;
  heroKind: 'milestone' | 'arena' | 'badge' | 'bare';
  heroTitle: string;
  heroSubtitle?: string;
  secondary: EarnedResultSecondaryItem[];
  totals?: string;
  tone: EarnedResultTone;
};

export type ResolveEarnedResultOpts = {
  tone: EarnedResultTone;
  /** Whether THIS write newly created the row (server `data.created`, or the
   *  client's own "was it already in the list" check for logged-out adds). A
   *  retry/double-tap of an already-logged game must not re-announce anything. */
  created: boolean;
  catalog: CatalogLabelEntry[];
  game: { away: string; home: string; venue?: string | null };
};

const SECONDARY_MARK = '✦';

function pluralize(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

function totalsFrom(current: EarnedDelta['current']): string {
  return `${pluralize(current.games, 'game')}  ·  ${pluralize(current.arenas, 'arena')}`;
}

function arenaSubtitle(current: EarnedDelta['current']): string {
  return current.arenas ? `Rink ${current.arenas} of 32 collected` : 'New rink collected';
}

/** Shape a server `EarnedDelta` (or its absence) into the WEB result card's view
 *  model. Returns `null` when nothing should be surfaced at all — the idempotent-
 *  retry case (`created === false`), where announcing anything would re-celebrate
 *  a game the user already logged. */
export function resolveEarnedResult(
  delta: EarnedDelta | null,
  opts: ResolveEarnedResultOpts,
): EarnedResultVM | null {
  const { tone, created, catalog } = opts;

  // Idempotent retry / duplicate add — surface NOTHING celebratory.
  if (created === false) return null;

  // No delta at all (logged-out add, or the server returned no earned info even
  // though the row WAS created) — never fabricate earned items; show the quiet
  // bare-success card instead.
  if (!delta) {
    return {
      eyebrow: tone === 'live' ? 'Game Logged' : 'Passport Updated',
      heroKind: 'bare',
      heroTitle: 'Added to your Passport',
      heroSubtitle: undefined,
      secondary: [],
      totals: undefined,
      tone,
    };
  }

  const { earned, current } = delta;
  const milestoneLabels = (earned.milestones ?? []).map(formatMilestoneLabel);
  const badgeLabels = resolveBadgeLabels(earned.badges ?? [], catalog);
  const hasEarned = milestoneLabels.length > 0 || earned.new_arena || badgeLabels.length > 0;
  const eyebrow = tone === 'live' ? (hasEarned ? 'Tonight' : 'Game Logged') : 'Passport Updated';
  const totals = totalsFrom(current);

  const secondary: EarnedResultSecondaryItem[] = [];
  let heroKind: EarnedResultVM['heroKind'];
  let heroTitle: string;
  let heroSubtitle: string | undefined;

  // Hero PRIORITY: first milestone > new_arena > first badge > bare. Everything
  // NOT promoted to hero (remaining milestones, arena if not hero, remaining
  // badges) becomes a secondary "Also unlocked" row, in that same order.
  if (milestoneLabels.length > 0) {
    heroKind = 'milestone';
    heroTitle = milestoneLabels[0];
    heroSubtitle = 'Milestone reached';
    for (const label of milestoneLabels.slice(1)) secondary.push({ icon: SECONDARY_MARK, label });
    if (earned.new_arena) secondary.push({ icon: SECONDARY_MARK, label: arenaSubtitle(current) });
    for (const label of badgeLabels) secondary.push({ icon: SECONDARY_MARK, label });
  } else if (earned.new_arena) {
    heroKind = 'arena';
    heroTitle = 'New arena';
    heroSubtitle = arenaSubtitle(current);
    for (const label of badgeLabels) secondary.push({ icon: SECONDARY_MARK, label });
  } else if (badgeLabels.length > 0) {
    heroKind = 'badge';
    heroTitle = badgeLabels[0];
    heroSubtitle = 'Badge unlocked';
    for (const label of badgeLabels.slice(1)) secondary.push({ icon: SECONDARY_MARK, label });
  } else {
    heroKind = 'bare';
    heroTitle = 'Added to your Passport';
    heroSubtitle = undefined;
  }

  return { eyebrow, heroKind, heroTitle, heroSubtitle, secondary, totals, tone };
}
