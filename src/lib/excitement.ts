/**
 * Excitement scoring + hero selection (SITE-HOME-03 / Layer 3).
 *
 * Extracted from the production scoreboard at `src/pages/index.astro` so the
 * /home-v2 LiveHero + grid can share a single source of truth. The two
 * documented changes vs the prod implementation:
 *
 *   1. OT bonus bumped from 80 → 100 (live games). Live OT should reliably
 *      out-weigh ANY late-3rd urgency unless the regulation game is also
 *      tied + sub-1-minute.
 *
 *   2. New `pickHero()` helper applies *hero stickiness* — once a game is
 *      featured, it gets a +30 "I'm broadcast" bonus, and a challenger has
 *      to clear that bonus *plus a 20-point margin* to displace it. Goal:
 *      avoid the hero flickering between two near-equal-score games on
 *      consecutive polls.
 *
 *   3. OT-specific stickiness: if the current hero is in OT, *only another
 *      OT game* can displace it. Non-OT challengers are ignored regardless
 *      of margin. Rationale: a 1-goal 3rd-period game shouldn't kick a tied
 *      OT game off the hero just because urgency tipped the math.
 *
 * NOT touched here: `src/pages/index.astro` still has its inline copy of
 * `calcExcitement` / `calcExcitementBreakdown`. Migrating production to use
 * this util is a follow-up task — Layer 3 just creates the shared util and
 * uses it from /home-v2.
 */

// ── Types ───────────────────────────────────────────────────────────────────

/** The minimum game shape `calcExcitement` cares about. Both the production
 *  scoreboard's NHL-derived shape and the /home-v2 mock shape satisfy this. */
export interface ExcitementGame {
  /** Stable identifier — used for hero stickiness lookup. */
  id: string;
  /** "live" / "final" / "scheduled" / "upcoming" / etc. */
  status: string;
  /** 1-based period; 4+ = OT. */
  period?: number;
  /** "MM:SS" remaining in current period. */
  time_remaining?: string;
  /** ISO timestamp — only used for status === "scheduled". */
  start_time?: string;
  away_team?: { score?: number };
  home_team?: { score?: number };
}

export interface ExcitementContext {
  /** Game id of the currently-broadcast hero. Pass `null` on the first poll. */
  currentHeroId?: string | null;
}

export interface ExcitementBreakdown {
  total: number;
  reason: string;
}

// ── Internals ───────────────────────────────────────────────────────────────

/** Convert "MM:SS" remaining-in-period to minutes (float). 20:00 = 20.0 */
function timeRemainingToMins(timeRemaining: string | undefined): number {
  if (!timeRemaining) return 20;
  const parts = timeRemaining.split(':');
  if (parts.length !== 2) return 20;
  const m = parseInt(parts[0], 10);
  const s = parseInt(parts[1], 10);
  if (Number.isNaN(m) || Number.isNaN(s)) return 20;
  return m + s / 60;
}

const PERIOD_MULT = [0, 1.0, 1.5, 2.5, 4.0]; // index by period; OT clamps to 4.

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Compute a single excitement score for a game. Higher = more interesting.
 *
 * Live formula:
 *   closeness = max(0, 4 - goalDiff) * 15   // 1-goal=45, 2-goal=30, 3-goal=15
 *   periodMult = [0, 1.0, 1.5, 2.5, 4.0][period]
 *   urgency = (P3 || OT) ? (20 - remainMins) * 1.5 : 0
 *   otBonus = isOT ? 100 : 0
 *   total = closeness * periodMult + urgency + otBonus
 *
 * Final formula:
 *   -75 + (wentOT ? 20 : 0) + closeness/4
 *
 * Scheduled formula:
 *   -60 - hoursUntil
 */
export function calcExcitement(game: ExcitementGame): number {
  const status = game.status;

  if (status === 'scheduled' || status === 'upcoming') {
    const t = game.start_time ? new Date(game.start_time).getTime() : Date.now();
    const hoursUntil = (t - Date.now()) / 3600000;
    return -60 - hoursUntil;
  }

  if (status === 'final') {
    const away = game.away_team?.score ?? 0;
    const home = game.home_team?.score ?? 0;
    const goalDiff = Math.abs(away - home);
    const period = game.period ?? 3;
    const wentOT = period >= 4;
    const otBonus = wentOT ? 20 : 0;
    const closeness = Math.max(0, 4 - goalDiff) * 5; // 1-goal=15, 2-goal=10, 3-goal=5
    return -75 + otBonus + closeness;
  }

  // live (or anything else — treat as live)
  const period = game.period ?? 1;
  const away = game.away_team?.score ?? 0;
  const home = game.home_team?.score ?? 0;
  const goalDiff = Math.abs(away - home);
  const isOT = period >= 4;
  const closeness = Math.max(0, 4 - goalDiff) * 15;
  const periodMult = PERIOD_MULT[Math.min(period, 4)] ?? 1;
  const remainMins = timeRemainingToMins(game.time_remaining);
  const urgency = period === 3 || isOT ? (20 - remainMins) * 1.5 : 0;
  const otBonus = isOT ? 100 : 0; // bumped from 80
  return closeness * periodMult + urgency + otBonus;
}

/**
 * Debug companion — returns the same total alongside a short, human-readable
 * reason string. Useful for hero-pick logging or a debug overlay.
 */
export function calcExcitementBreakdown(game: ExcitementGame): ExcitementBreakdown {
  const status = game.status;

  if (status === 'scheduled' || status === 'upcoming') {
    const t = game.start_time ? new Date(game.start_time).getTime() : Date.now();
    const hoursUntil = (t - Date.now()) / 3600000;
    return { total: -60 - hoursUntil, reason: `scheduled ${hoursUntil.toFixed(1)}h away` };
  }

  if (status === 'final') {
    const fa = game.away_team?.score ?? 0;
    const fh = game.home_team?.score ?? 0;
    const fd = Math.abs(fa - fh);
    const fp = game.period ?? 3;
    const fotBonus = fp >= 4 ? 20 : 0;
    const fcl = Math.max(0, 4 - fd) * 5;
    return { total: -75 + fotBonus + fcl, reason: `final${fp >= 4 ? ' OT' : ''} diff=${fd}` };
  }

  const period = game.period ?? 1;
  const away = game.away_team?.score ?? 0;
  const home = game.home_team?.score ?? 0;
  const goalDiff = Math.abs(away - home);
  const isOT = period >= 4;
  const closeness = Math.max(0, 4 - goalDiff) * 15;
  const periodMult = PERIOD_MULT[Math.min(period, 4)] ?? 1;
  const remainMins = timeRemainingToMins(game.time_remaining);
  const urgency = period === 3 || isOT ? (20 - remainMins) * 1.5 : 0;
  const otBonus = isOT ? 100 : 0;
  const total = closeness * periodMult + urgency + otBonus;

  const parts: string[] = [];
  if (closeness) parts.push(`cls${closeness}×${periodMult}`);
  if (urgency) parts.push(`urg${urgency.toFixed(0)}`);
  if (otBonus) parts.push(`OT+${otBonus}`);
  return { total, reason: parts.join(' + ') || 'early' };
}

/** Is this game in overtime right now? Live OT only — final-OT is over. */
function isLiveOT(game: ExcitementGame): boolean {
  return game.status === 'live' && (game.period ?? 0) >= 4;
}

/**
 * Pick the featured "hero" game from a list, with hero stickiness.
 *
 * Scoring rules:
 *   - First poll (no `currentHeroId`): pick the highest-scoring game outright.
 *   - Subsequent polls: the current hero gets +30 "broadcast bonus" added to
 *     its excitement, and a challenger only displaces it if its raw
 *     excitement exceeds `currentHeroExcitement + 30 + 20` (challenger margin
 *     of 20 over the bonused hero). This prevents flicker between two
 *     near-equal-score games.
 *   - OT override: if the current hero is in OT, only OT challengers are
 *     considered. Non-OT challengers are ignored regardless of score.
 *   - If the hero has ended (status flipped to FINAL), it loses sticky
 *     status — the next pick is the highest-scoring game outright.
 *
 * Returns `null` only if `games` is empty.
 */
export function pickHero<T extends ExcitementGame>(
  games: readonly T[],
  context: ExcitementContext = {},
): T | null {
  if (games.length === 0) return null;

  // Score every game once.
  const scored = games.map(g => ({ game: g, score: calcExcitement(g) }));

  // First poll OR no hero present in this slate → highest score wins.
  const heroId = context.currentHeroId ?? null;
  const heroEntry = heroId ? scored.find(s => s.game.id === heroId) : null;

  // Hero rule: if there's no hero yet, the hero has ended (FINAL), or it's
  // a status we don't sustain stickiness for, fall through to plain max.
  const heroStillEligible = heroEntry && heroEntry.game.status !== 'final';

  if (!heroStillEligible) {
    let best = scored[0];
    for (let i = 1; i < scored.length; i++) {
      if (scored[i].score > best.score) best = scored[i];
    }
    return best.game;
  }

  const heroIsOT = isLiveOT(heroEntry.game);
  const STICKY_BONUS = 30;
  const CHALLENGER_MARGIN = 20;
  const heroBonused = heroEntry.score + STICKY_BONUS;

  // Find the strongest challenger that can actually displace the hero.
  let displacer: { game: T; score: number } | null = null;

  for (const entry of scored) {
    if (entry.game.id === heroEntry.game.id) continue;

    // OT-specific stickiness: hero in OT can only be displaced by another
    // OT game, period.
    if (heroIsOT && !isLiveOT(entry.game)) continue;

    if (entry.score > heroBonused + CHALLENGER_MARGIN) {
      if (!displacer || entry.score > displacer.score) {
        displacer = entry;
      }
    }
  }

  return displacer ? displacer.game : heroEntry.game;
}
