/**
 * auto-mode.ts — client-side mode resolver for /home-v2 (SITE-HOME-05).
 *
 * Layer 1.8 (April 2026): collapsed from 4 modes (live/recap/tomorrow/offseason)
 * to 3 modes (today/yesterday/offseason). The mode bar now reflects TIME (today
 * vs yesterday vs offseason), NOT game state (live vs final). TODAY mode is a
 * stateful canvas that internally adapts based on game data:
 *
 *   - Any live/intermission/shootout games → live sub-state hero
 *   - All games final → recap wall sub-state
 *   - All games pre (slate available) → preview + predictions sub-state
 *   - All games pre (no slate yet) → schedule-only + "Predictions coming soon"
 *   - Mixed states → live treatment (live games bubble to hero)
 *
 * Resolution order on every page load
 * -----------------------------------
 *   1. ?mode=<mode>           — explicit URL override; wins over everything
 *                                EXCEPT the sessionStorage override (#2).
 *      Wait — actually #1 only wins if there's NO sessionStorage override.
 *      Order is: sessionStorage > URL param > auto-detect.
 *   2. sessionStorage[hgb-mode-override]  — sticky across reloads in-tab.
 *      Set when the user clicks a ModeBar pill. Cleared by clearOverride().
 *   3. detectMode(scoreboardData)         — auto-default fallback.
 *
 * Hockey-day boundary
 * -------------------
 * The site uses 6 AM ET as "hockey today" rollover (matches the iOS app
 * + the Python bot). Schedule data passed to detectMode() is expected
 * to already reflect this — i.e. when the user loads the page at 1 AM
 * local on April 25, "today" is still April 24's slate. The Python
 * pipeline handles this when it produces the schedule mock.
 *
 * detectMode() rules — applied in order (Layer 1.8):
 *   1. today has games (any state) → 'today'
 *   2. today empty AND yesterday has games → 'yesterday'
 *   3. both empty → 'offseason'
 *
 * That's it. No 60-min-before-puck-drop flip — TODAY mode handles all
 * sub-states internally. YESTERDAY and OFFSEASON are always reachable via
 * manual ModeBar click.
 */

export type HomeMode = 'today' | 'yesterday' | 'offseason';

/** All three modes the resolver knows about. */
export const HOME_MODES: ReadonlyArray<HomeMode> = ['today', 'yesterday', 'offseason'] as const;

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
 * Pure function — given a scoreboard snapshot, return the mode that
 * auto-detection should default to.
 *
 * Layer 1.8 (April 2026): simplified from 5 rules to 3. The `now`
 * parameter is intentionally dropped — time-of-day no longer influences
 * the mode; only the presence/absence of games does. TODAY mode is a
 * stateful canvas that renders differently based on `games[].game_state`
 * distribution (handled client-side in home-v2.astro).
 *
 * detectMode() rules:
 *   1. today has games (any state: pre/live/intermission/shootout/final) → 'today'
 *   2. today empty AND previous_day has games → 'yesterday'
 *   3. both empty (true offseason) → 'offseason'
 */
export function detectMode(scoreboard: Scoreboard): 'today' | 'yesterday' | 'offseason' {
  // Rule 1: any games today → TODAY (sub-state branching happens in the page layer).
  if (scoreboard.games.length > 0) return 'today';

  // Rule 2: today empty but yesterday has games → YESTERDAY.
  if (scoreboard.previous_day.games.length > 0) return 'yesterday';

  // Rule 3: both empty → OFFSEASON.
  return 'offseason';
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
  /** Layer 1.8: `now` is no longer used by detectMode() — kept for API compatibility. */
  now?: Date;
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
  return { mode: detectMode(ctx.schedule), source: 'auto' };
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
