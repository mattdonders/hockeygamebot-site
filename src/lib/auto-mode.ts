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
 * Per-game live state — one entry per game on today's slate.
 *
 * Layer 1 (May 2026) replaced the old identity-less `games_states[]` array
 * with this richer per-game shape so the slate strip can match snapshot
 * data to tiles by `game_id`. `detectMode()` still works the same — it
 * derives the old states-array view via `today.games.map(g => g.state)`.
 */
export interface GameLiveState {
  /** NHL game ID (string — playoff IDs may have season encoding). */
  game_id: string;
  state: AutoModeGameState;
  home_team_id: number;
  away_team_id: number;
  /** 0 when state === 'pre'. */
  home_score: number;
  /** 0 when state === 'pre'. */
  away_score: number;
  /** null when state === 'pre' or 'final'. */
  period: number | null;
  /** 'MM:SS'; null when not in an active period. */
  time_remaining: string | null;
  /** ISO; useful for sorting + countdown to first puck. */
  start_time_utc: string;
}

/**
 * Schedule snapshot consumed by detectMode(). Matches schedule.json mock
 * + GET /v1/schedule/snapshot from the Worker — see auto-mode-schemas.ts.
 */
export interface ScheduleSnapshot {
  /**
   * "Today" — the games that should be displayed on /home-v2 right now.
   * Already disambiguated by the 6 AM ET hockey-day boundary. Empty
   * `games` array means "no games tonight".
   */
  today: {
    /** ISO yyyy-mm-dd; informational only, not used in math. */
    hockey_date: string;
    /**
     * UTC timestamp when the FIRST game of the night drops the puck.
     * `null` when games[] is empty (offseason, no games scheduled).
     */
    first_game_start_iso: string | null;
    /** Per-game array with identity + live state. Length = games count. */
    games: GameLiveState[];
  };
  /**
   * "Yesterday" — used for the early-morning RECAP rollover detection.
   * If games_count > 0 here, RECAP points back at last night's slate.
   */
  yesterday: {
    hockey_date: string;
    games_count: number;
  };
}

/**
 * Pure function — given a schedule snapshot and a `now` timestamp, return
 * the mode that auto-detection should default to.
 *
 * Uses millisecond UTC math throughout so the function is timezone-
 * independent (the schedule producer is responsible for ET-aware
 * disambiguation; this function just compares two epoch values).
 *
 * The function never returns 'tomorrow' or 'offseason' — those are
 * manual-only destinations.
 */
export function detectMode(schedule: ScheduleSnapshot, now: Date): 'live' | 'recap' {
  const today = schedule.today;

  // Derive the legacy "states-only" view from the per-game array. Same
  // logic as before — just a slightly different access pattern after the
  // Layer 1 schema change (per-game shape with identity + scores).
  const states: AutoModeGameState[] = today.games.map(g => g.state);
  const gamesCount = today.games.length;

  // Rule 1: any game in-progress → LIVE (covers all states between puck
  // drop and final horn, including overtime → shootout).
  const liveLikeStates: ReadonlyArray<AutoModeGameState> = ['live', 'intermission', 'shootout'];
  if (states.some(s => liveLikeStates.includes(s))) return 'live';

  // Rule 2: pre-game window — first game starts ≤ 60 min from now AND
  // games > 0 AND no game has reached final yet (allow scheduling overlap
  // where game 1 is final but a later game is in pre-window).
  if (gamesCount > 0 && today.first_game_start_iso) {
    const firstStartMs = Date.parse(today.first_game_start_iso);
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
  schedule: ScheduleSnapshot;
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
