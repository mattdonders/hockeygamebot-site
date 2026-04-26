/**
 * hero-selection.ts — Layer 2.3
 *
 * Implements `pickHeroGame()` — the unified hero rotation logic for the
 * TODAY mode unified hero card.
 *
 * Hero rotation rules (three sub-states):
 *
 *   PRE-GAME (no live games):
 *     → hero = next chronological game by start_time_utc
 *
 *   LIVE (any game in {live, intermission, shootout}):
 *     → hero = highest excitement-scored live game
 *     → uses existing `pickHero()` from excitement.ts with stickiness
 *     → currentHeroId should be threaded through polls for stickiness
 *
 *   FINAL (all games final, none live):
 *     → hero = highest narrative-score finished game
 *     → uses `calcExcitement()` for final games (negative range, but relative
 *       ordering is still meaningful — OT finals > blowout regulars)
 *
 * Returns null only if games array is empty.
 *
 * Sub-state detection:
 *   - 'live'  → any game in {live, intermission, shootout}
 *   - 'pre'   → all games in {pre}
 *   - 'final' → all games in {final}
 *
 * The caller (home-v2 hydration) passes `currentHeroId` from the previous
 * poll for stickiness. On first render (SSR bake-in), currentHeroId is null.
 */

import { calcExcitement, pickHero, type ExcitementGame } from './excitement';
import type { ScoreboardGame, ScoreboardData, SlateData } from './hydration';

// ── Sub-state detection ────────────────────────────────────────────────────

export type TodaySubState = 'pre' | 'live' | 'final';

/** Detect TODAY sub-state from a list of scoreboard games. */
export function detectSubState(games: ScoreboardGame[]): TodaySubState {
  if (games.length === 0) return 'pre';
  const liveLike = new Set<string>(['live', 'intermission', 'shootout']);
  const hasLive = games.some(g => liveLike.has(g.game_state));
  if (hasLive) return 'live';
  const allFinal = games.every(g => g.game_state === 'final');
  if (allFinal) return 'final';
  // Some pre + some final, none live → 'pre' (next-to-start wins)
  return 'pre';
}

// ── ExcitementGame adapter for ScoreboardGame ──────────────────────────────

/**
 * Map a ScoreboardGame to the minimal ExcitementGame interface that
 * calcExcitement() and pickHero() require.
 */
function toExcitementGame(g: ScoreboardGame): ExcitementGame {
  const stateMap: Record<string, string> = {
    pre: 'scheduled',
    live: 'live',
    intermission: 'live', // treat intermission as live for scoring
    shootout: 'live',
    final: 'final',
  };
  return {
    id: g.game_id,
    status: stateMap[g.game_state] ?? 'scheduled',
    period: g.clock.period ?? undefined,
    time_remaining: g.clock.time_remaining ?? undefined,
    start_time: g.start_time_utc ?? undefined,
    home_team: { score: g.home_team.score },
    away_team: { score: g.away_team.score },
  };
}

// ── Hero pick result ───────────────────────────────────────────────────────

export interface HeroPickResult {
  game: ScoreboardGame;
  subState: TodaySubState;
  /** True if this game is the editorial "Game of the Night" from the slate. */
  isFeaturedMatchup: boolean;
}

/**
 * Pick the hero game from a scoreboard snapshot + optional slate.
 *
 * @param scoreboard  Full scoreboard response from /v1/scoreboard
 * @param slate       Slate doc (null when not yet written — pre-8 AM ET)
 * @param currentHeroId  The game_id of the current hero (for stickiness in live mode).
 *                       Pass null on first render.
 */
export function pickHeroGame(
  scoreboard: ScoreboardData,
  slate: SlateData | null,
  currentHeroId?: string | null,
): HeroPickResult | null {
  const games = scoreboard.games;
  if (games.length === 0) return null;

  const subState = detectSubState(games);
  const featuredMatchupId = slate?.featured_matchup?.game_id ?? null;

  let heroGame: ScoreboardGame | null = null;

  if (subState === 'pre') {
    // Pre-game: next chronological game by start_time_utc.
    const sorted = [...games].sort((a, b) => {
      const at = a.start_time_utc ? Date.parse(a.start_time_utc) : Infinity;
      const bt = b.start_time_utc ? Date.parse(b.start_time_utc) : Infinity;
      return at - bt;
    });
    heroGame = sorted[0] ?? null;
  } else if (subState === 'live') {
    // Live: use excitement scoring with stickiness.
    const liveGames = games.filter(g =>
      g.game_state === 'live' || g.game_state === 'intermission' || g.game_state === 'shootout'
    );

    if (liveGames.length === 0) {
      // Fallback: shouldn't happen given subState === 'live', but be safe.
      heroGame = games[0] ?? null;
    } else {
      const excitementGames = liveGames.map(toExcitementGame);
      const picked = pickHero(excitementGames, { currentHeroId: currentHeroId ?? null });
      if (picked) {
        heroGame = liveGames.find(g => g.game_id === picked.id) ?? null;
      }
    }
  } else {
    // Final: pick highest excitement-scored finished game.
    // calcExcitement on final games returns values in the -75..-55 range,
    // so relative ordering still works (OT finals rank highest).
    let best: { game: ScoreboardGame; score: number } | null = null;
    for (const g of games) {
      const eg = toExcitementGame(g);
      const score = calcExcitement(eg);
      if (!best || score > best.score) {
        best = { game: g, score };
      }
    }
    heroGame = best?.game ?? null;
  }

  if (!heroGame) return null;

  return {
    game: heroGame,
    subState,
    isFeaturedMatchup: !!featuredMatchupId && heroGame.game_id === featuredMatchupId,
  };
}
