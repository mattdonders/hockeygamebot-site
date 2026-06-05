/**
 * hydration.ts — Layer 2.2
 *
 * Client-side data hydration for /home-v2.
 *
 * Exports:
 *   fetchScoreboard()      — GET /v1/scoreboard wrapper
 *   fetchSlate()           — GET /v1/slate wrapper (404 = null, not error)
 *   startHydrationLoop()   — setInterval-based poller (scoreboard 60s, slate 5min)
 *   stopHydrationLoop()    — cleans up intervals
 *
 * Design decisions:
 *   - `cache: 'default'` — lets the CF edge cache absorb 99% of polls
 *   - On error / non-2xx: logs to console, returns null (previous data retained)
 *   - Slate 404 is normal pre-8 AM ET and returns null gracefully
 *   - Tab visibility: caller gates polling via document.visibilityState
 *
 * Called from the home-v2 body script after initial SSR render.
 */

// ── Type imports (re-export shapes that callers need) ──────────────────────

/** Scoreboard data shape — mirrors the Worker's /v1/scoreboard response. */
export interface ScoreboardTeam {
  id: number;
  abbrev: string;
  name: string;
  short_name: string;
  score: number;
}

export interface ScoreboardClock {
  period: number | null;
  time_remaining: string | null;
  in_intermission: boolean | null;
  clock_at: string | null;
}

export interface ScoreboardMetricPair {
  home: number | null;
  away: number | null;
}

export interface ScoreboardStats {
  shots_on_goal: ScoreboardMetricPair;
  xg: ScoreboardMetricPair;
  xg_5v5: ScoreboardMetricPair;
  win_probability: ScoreboardMetricPair;
}

export interface ScoreboardEvent {
  type: string;
  description: string;
  time_ago: string | null;
  period?: number | null;
  time?: string | null;
}

export type GameState = 'pre' | 'live' | 'intermission' | 'shootout' | 'final';

export interface ScoreboardGame {
  game_id: string;
  game_state: GameState;
  strength_state: string | null;
  venue: string | null;
  start_time_utc: string | null;
  home_team: ScoreboardTeam;
  away_team: ScoreboardTeam;
  clock: ScoreboardClock;
  stats: ScoreboardStats;
  last_event: ScoreboardEvent | null;
  recent_events: ScoreboardEvent[];
  three_stars: Array<Record<string, unknown>> | null;
}

export interface ScoreboardData {
  date: string;
  games: ScoreboardGame[];
  previous_day: {
    hockey_date: string;
    games: ScoreboardGame[];
  };
  cached: boolean;
}

/** Slate prediction entry. */
export interface SlatePrediction {
  game_id: string;
  home_wp: number;
  away_wp: number;
}

/** Slate matchup preview entry. */
export interface SlateMatchupPreview {
  game_id: string;
  headline: string;
  key_matchup?: {
    home_player: string;
    away_player: string;
    context: string;
  };
  x_factor?: string;
}

/** Slate storyline entry. */
export interface SlateStoryline {
  type: string;
  player?: string;
  team?: string;
  headline: string;
  context: string;
}

/** Slate featured matchup. */
export interface SlateFeaturedMatchup {
  game_id: string;
  tag?: { label: string; kind: string };
  reasoning?: string;
  byline?: { left: string; right: string };
}

/** Full slate doc (extracted from the API envelope's `doc` field). */
export interface SlateData {
  hockey_date?: string;
  predictions?: SlatePrediction[];
  matchup_previews?: SlateMatchupPreview[];
  storylines?: SlateStoryline[];
  featured_matchup?: SlateFeaturedMatchup;
  recap_summary?: unknown;
  player_of_night?: unknown;
  three_stars_rollup?: unknown;
}

// ── Fetch helpers ──────────────────────────────────────────────────────────

const SCOREBOARD_URL = 'https://api.hockeygamebot.com/v1/scoreboard';
const SLATE_URL = 'https://api.hockeygamebot.com/v1/slate';

/**
 * Fetch the live scoreboard. Returns null on any failure (network error,
 * non-2xx, parse failure). Never throws.
 */
export async function fetchScoreboard(date?: string): Promise<ScoreboardData | null> {
  try {
    const url = date ? `${SCOREBOARD_URL}?date=${encodeURIComponent(date)}` : SCOREBOARD_URL;
    const res = await fetch(url, { cache: 'default' });
    if (!res.ok) {
      console.warn(`[hydration] Scoreboard fetch failed: HTTP ${res.status}`);
      return null;
    }
    const data = (await res.json()) as ScoreboardData;
    return data;
  } catch (err) {
    console.warn('[hydration] Scoreboard fetch threw:', err);
    return null;
  }
}

/**
 * Fetch the slate editorial doc. Returns null when:
 *   - HTTP 404 (normal pre-8 AM ET — not an error)
 *   - Any other error
 * Extracts `doc` from the envelope `{ hockey_date, doc, generated_at, updated_at }`.
 */
export async function fetchSlate(date?: string): Promise<SlateData | null> {
  try {
    const url = date ? `${SLATE_URL}?date=${encodeURIComponent(date)}` : SLATE_URL;
    const res = await fetch(url, { cache: 'default' });
    if (res.status === 404) {
      // Normal before 8 AM ET — slate not yet written.
      return null;
    }
    if (!res.ok) {
      console.warn(`[hydration] Slate fetch failed: HTTP ${res.status}`);
      return null;
    }
    const raw = (await res.json()) as Record<string, unknown>;
    // API returns envelope: { hockey_date, doc, generated_at, updated_at }
    if (raw.doc && typeof raw.doc === 'object') {
      return raw.doc as SlateData;
    }
    // Fallback: maybe already the flat doc
    return raw as SlateData;
  } catch (err) {
    console.warn('[hydration] Slate fetch threw:', err);
    return null;
  }
}

// ── Hydration loop ──────────────────────────────────────────────────────────

const SCOREBOARD_POLL_MS = 60_000;   // 60s — matches CF edge cache TTL
const SLATE_POLL_MS = 5 * 60_000;   // 5min — matches CF edge cache TTL

let _scoreboardIntervalId: ReturnType<typeof setInterval> | null = null;
let _slateIntervalId: ReturnType<typeof setInterval> | null = null;

export interface HydrationLoopOptions {
  /** Called every 60s with fresh scoreboard data (null on fetch failure — retain previous). */
  onScoreboardUpdate: (s: ScoreboardData) => void;
  /** Called every 5min with fresh slate data. Null means no slate yet (pre-8AM) or error. */
  onSlateUpdate: (s: SlateData | null) => void;
  /** Override poll interval for scoreboard (ms). Default: 60000. */
  scoreboardPollInterval?: number;
  /** Override poll interval for slate (ms). Default: 300000. */
  slatePollInterval?: number;
}

/**
 * Start the hydration loop. Calls callbacks immediately on first poll
 * (so there's no 60s wait for the first client-side update), then
 * repeats at the configured cadence.
 *
 * Respects tab visibility — polling pauses when the document is hidden
 * and resumes when it becomes visible again (handled here via the
 * visibilitychange listener).
 */
export function startHydrationLoop(opts: HydrationLoopOptions): void {
  stopHydrationLoop(); // Clear any existing loops first.

  const scoreboardMs = opts.scoreboardPollInterval ?? SCOREBOARD_POLL_MS;
  const slateMs = opts.slatePollInterval ?? SLATE_POLL_MS;

  let paused = false;

  // Pause when tab is hidden; resume when visible.
  function onVisibilityChange() {
    paused = document.hidden;
  }
  document.addEventListener('visibilitychange', onVisibilityChange);

  // Scoreboard: fire immediately, then every 60s.
  async function pollScoreboard() {
    if (paused) return;
    const data = await fetchScoreboard();
    if (data) opts.onScoreboardUpdate(data);
  }

  // Slate: fire immediately, then every 5min.
  async function pollSlate() {
    if (paused) return;
    const data = await fetchSlate();
    opts.onSlateUpdate(data); // null is intentional — caller handles "no slate"
  }

  // Fire first poll immediately (async — won't block).
  void pollScoreboard();
  void pollSlate();

  _scoreboardIntervalId = setInterval(() => void pollScoreboard(), scoreboardMs);
  _slateIntervalId = setInterval(() => void pollSlate(), slateMs);

  // Store cleanup reference so stopHydrationLoop can remove the listener.
  _visibilityCleanup = () => {
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };
}

let _visibilityCleanup: (() => void) | null = null;

/** Stop the hydration loop and remove all listeners. */
export function stopHydrationLoop(): void {
  if (_scoreboardIntervalId !== null) {
    clearInterval(_scoreboardIntervalId);
    _scoreboardIntervalId = null;
  }
  if (_slateIntervalId !== null) {
    clearInterval(_slateIntervalId);
    _slateIntervalId = null;
  }
  if (_visibilityCleanup) {
    _visibilityCleanup();
    _visibilityCleanup = null;
  }
}
