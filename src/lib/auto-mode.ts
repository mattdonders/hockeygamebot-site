/**
 * auto-mode.ts — client-side mode resolver for /home-v2 (SITE-HOME-05).
 *
 * Picks LIVE or RECAP based on time of day + tonight's schedule. TOMORROW
 * and OFFSEASON are ALWAYS manual-click — they never auto-default. This is
 * intentional: most fans want to know what's happening RIGHT NOW (live) or
 * what just happened (recap). Tomorrow + offseason are deliberate
 * "step out of tonight" destinations.
 *
 * Resolution order on every page load
 * -----------------------------------
 *   1. ?mode=<mode>           — explicit URL override; wins over everything
 *                                EXCEPT the sessionStorage override (#2).
 *      Wait — actually #1 only wins if there's NO sessionStorage override.
 *      Order is: sessionStorage > URL param > auto-detect.
 *   2. sessionStorage[hgb-mode-override]  — sticky across reloads in-tab.
 *      Set when the user clicks a ModeBar pill. Cleared by clearOverride().
 *   3. detectMode(scheduleData, now)      — auto-default fallback.
 *
 * Hockey-day boundary
 * -------------------
 * The site uses 6 AM ET as "hockey today" rollover (matches the iOS app
 * + the Python bot). Schedule data passed to detectMode() is expected
 * to already reflect this — i.e. when the user loads the page at 1 AM
 * local on April 25, "today" is still April 24's slate. The Python
 * pipeline handles this when it produces the schedule mock.
 *
 * detectMode() rules — applied in order:
 *   1. Any game today is in {live, intermission, shootout} → 'live'
 *   2. Now ≥ first_game_start − 60min AND first game not yet final → 'live'
 *   3. All games today are final AND it's still hockey-today      → 'recap'
 *   4. We're in the early-morning "post-late-game" window         → 'recap'
 *   5. Otherwise (offseason, no games at all)                     → 'recap'
 *
 * Why RECAP is the default offseason fallback (rule 5)
 * ----------------------------------------------------
 * Per the spec: even when there are no games today and no games yesterday,
 * RECAP shows "the most recent slate with games" (could be the Stanley Cup
 * Final wrap-up or last preseason game). The recap PAGE owns the
 * fallback-to-most-recent-slate logic; auto-mode just picks recap.
 *
 * `?mode=offseason` exists as a manual destination for the dedicated
 * "we're in the offseason" countdown page — that's a deliberate click,
 * not an auto-default.
 */

export type HomeMode = 'live' | 'recap' | 'tomorrow' | 'offseason';

/** All four modes the resolver knows about. */
export const HOME_MODES: ReadonlyArray<HomeMode> = ['live', 'recap', 'tomorrow', 'offseason'] as const;

/** sessionStorage key used by the ModeBar override (read by /home-v2). */
export const MODE_OVERRIDE_KEY = 'hgb-mode-override';

/**
 * Per-game state values the auto-mode resolver cares about. Mirrors the
 * `state` field on game tiles — keeping a separate type here so the
 * auto-mode contract is independent of GameTileEntry's evolution.
 *
 *   - 'pre'           — scheduled, not started
 *   - 'live'          — clock running
 *   - 'intermission'  — between periods
 *   - 'shootout'      — overtime → shootout (special-case treated as live)
 *   - 'final'         — game over (regulation / OT / SO)
 */
export type AutoModeGameState = 'pre' | 'live' | 'intermission' | 'shootout' | 'final';

/**
 * Per-game entry in the scoreboard games[] array.
 *
 * Layer 1.5 (April 2026): this is a subset of the full ScoreboardGame shape.
 * The fields listed here are what detectMode() and the slate strip need.
 * The Worker returns the full per-game shape; TypeScript structurally matches
 * via the fields we actually use.
 *
 * Note: the field is `game_state` (not `state`) to match the locked scoreboard
 * schema. The inline detectMode script in home-v2.astro also uses game_state.
 */
export interface GameLiveState {
  /** NHL game ID (string — playoff IDs may have season encoding). */
  game_id: string;
  /** 5-state site vocab (pre/live/intermission/shootout/final). */
  game_state: AutoModeGameState;
  home_team: { id: number; abbrev: string; name: string; short_name: string; score: number };
  away_team: { id: number; abbrev: string; name: string; short_name: string; score: number };
  /** ISO; useful for sorting + countdown to first puck. */
  start_time_utc: string | null;
}

/**
 * Scoreboard consumed by detectMode(). Matches scoreboard mock variants
 * + GET /v1/scoreboard from the Worker — see auto-mode-schemas.ts.
 *
 * Layer 1.5 (April 2026): replaces ScheduleSnapshot. The envelope changed
 * from {today: {hockey_date, first_game_start_iso, games[]}, yesterday: {games_count}}
 * to {date, games[], previous_day: {hockey_date, games[]}, cached}.
 *
 * detectMode() rules are IDENTICAL — only the field access paths changed.
 */
export interface Scoreboard {
  /** Hockey date for this scoreboard (YYYY-MM-DD). */
  date: string;
  /**
   * All games on this hockey date.
   * Already disambiguated by the 6 AM ET hockey-day boundary. Empty
   * array means "no games tonight" (offseason or cache miss).
   */
  games: GameLiveState[];
  /**
   * Previous calendar day — used for the early-morning RECAP rollover detection.
   * If previous_day.games.length > 0, RECAP points back at last night's slate.
   */
  previous_day: {
    hockey_date: string;
    /** Full game array — RECAP mode uses this without a second fetch. */
    games: GameLiveState[];
  };
  cached: boolean;
}

/**
 * @deprecated Use Scoreboard. ScheduleSnapshot was the Layer 1 name before Layer 1.5.
 * Kept as alias so any remaining references don't break.
 */
export type ScheduleSnapshot = Scoreboard;

/**
 * Pure function — given a scoreboard and a `now` timestamp, return
 * the mode that auto-detection should default to.
 *
 * Uses millisecond UTC math throughout so the function is timezone-
 * independent (the Worker is responsible for ET-aware disambiguation;
 * this function just compares two epoch values).
 *
 * The function never returns 'tomorrow' or 'offseason' — those are
 * manual-only destinations.
 *
 * detectMode() rules:
 *   1. Any game in {live, intermission, shootout} → LIVE
 *   2. Now ≥ first puck − 60min AND first game not yet final → LIVE
 *   3. Otherwise → RECAP (recap page handles "no games today" fallback)
 */
export function detectMode(scoreboard: Scoreboard, now: Date): 'live' | 'recap' {
  const games = scoreboard.games;

  // Derive states array from the per-game array.
  const states: AutoModeGameState[] = games.map(g => g.game_state);
  const gamesCount = games.length;

  // Rule 1: any game in-progress → LIVE (covers all states between puck
  // drop and final horn, including overtime → shootout).
  const liveLikeStates: ReadonlyArray<AutoModeGameState> = ['live', 'intermission', 'shootout'];
  if (states.some(s => liveLikeStates.includes(s))) return 'live';

  // Rule 2: pre-game window — first game starts ≤ 60 min from now AND
  // games > 0 AND no game has reached final yet (allow scheduling overlap
  // where game 1 is final but a later game is in pre-window).
  //
  // Layer 1.5: first_game_start_iso is now derived from games[] instead of
  // being a precomputed field in the envelope. We take the minimum start_time_utc.
  if (gamesCount > 0) {
    let firstStartMs = Infinity;
    for (const g of games) {
      if (g.start_time_utc) {
        const ms = Date.parse(g.start_time_utc);
        if (Number.isFinite(ms) && ms < firstStartMs) firstStartMs = ms;
      }
    }
    if (Number.isFinite(firstStartMs)) {
      const windowOpensMs = firstStartMs - 60 * 60 * 1000;
      const allFinal = states.every(s => s === 'final');
      if (now.getTime() >= windowOpensMs && !allFinal) {
        return 'live';
      }
    }
  }

  // Rule 3-5 collapse to RECAP. The recap page itself handles
  // "no games today, fall back to most recent slate".
  return 'recap';
}

/**
 * Resolve the mode that /home-v2 should render. Combines (a) any explicit
 * URL `?mode=` param, (b) the sessionStorage manual override, and (c) the
 * auto-detect rules.
 *
 * Returns whichever mode wins. Always returns one of HOME_MODES.
 */
export interface ResolveModeContext {
  url: URL;
  /** Layer 1.5: Scoreboard (was ScheduleSnapshot). ScheduleSnapshot is now an alias. */
  schedule: Scoreboard;
  now: Date;
  /** Reads sessionStorage; injected for testability. */
  readOverride?: () => string | null;
}

export interface ResolvedMode {
  mode: HomeMode;
  /** How the mode was selected — drives the AUTO/MANUAL telemetry stamp. */
  source: 'override' | 'url' | 'auto';
}

/**
 * Resolve the active mode using the documented order:
 *
 *   1. sessionStorage[hgb-mode-override]  — sticky in-tab manual choice
 *   2. ?mode=<mode>                       — direct-link or share-URL
 *   3. detectMode(schedule, now)          — auto fallback
 *
 * Why does sessionStorage outrank the URL param?
 * Because the user's last manual click is the most recent expression of
 * intent. URL params usually come from share-links / external referrers;
 * if a user explicitly clicked TOMORROW and then hit refresh, they
 * shouldn't get bounced back to whatever ?mode= was in their address bar.
 * Clicking "↻ AUTO" clears the override and re-runs detection.
 */
export function resolveMode(ctx: ResolveModeContext): ResolvedMode {
  const reader = ctx.readOverride ?? defaultOverrideReader;

  // 1. sessionStorage override
  const overrideRaw = reader();
  if (overrideRaw && isHomeMode(overrideRaw)) {
    return { mode: overrideRaw, source: 'override' };
  }

  // 2. URL param
  const urlRaw = ctx.url.searchParams.get('mode');
  if (urlRaw && isHomeMode(urlRaw)) {
    return { mode: urlRaw, source: 'url' };
  }

  // 3. Auto-detect
  return { mode: detectMode(ctx.schedule, ctx.now), source: 'auto' };
}

function defaultOverrideReader(): string | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.sessionStorage.getItem(MODE_OVERRIDE_KEY);
  } catch {
    return null;
  }
}

export function isHomeMode(value: unknown): value is HomeMode {
  return typeof value === 'string' && (HOME_MODES as ReadonlyArray<string>).includes(value);
}

/**
 * Persist the user's manual mode choice. Called from ModeBar click
 * handlers in the page-level script. Silently no-ops if sessionStorage
 * is unavailable (private browsing, blocked storage).
 */
export function setOverride(mode: HomeMode): void {
  try {
    if (typeof window === 'undefined') return;
    window.sessionStorage.setItem(MODE_OVERRIDE_KEY, mode);
  } catch {
    /* storage blocked — fall through */
  }
}

/**
 * Clear the manual override and re-run auto-detection on next load.
 * Wired to the "↻ AUTO" link in ModeBar.
 */
export function clearOverride(): void {
  try {
    if (typeof window === 'undefined') return;
    window.sessionStorage.removeItem(MODE_OVERRIDE_KEY);
  } catch {
    /* storage blocked — fall through */
  }
}
