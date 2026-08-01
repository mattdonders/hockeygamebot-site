/**
 * Client for GET /v1/passport/tonight — the Tonight's Game candidate set.
 *
 * Contract note: the server returns EVERY eligible candidate and deliberately does not
 * pick "yours" — it cannot know your rooting team or where your phone is. Choosing among
 * candidates is a client-local decision (see pickCandidate).
 *
 * FAILURE RULE: a failed fetch yields NO CARD, never a broken dashboard. Tonight's Game
 * is an enhancement on a page that already works; if the schedule can't load, the user
 * should simply not see it. So every error path resolves to `null` rather than throwing.
 */

const API = 'https://api.hockeygamebot.com';

/** Timing state for a candidate, decided server-side. */
export type TonightWindow = 'pre' | 'open';

export type TonightTeam = {
  id: number;
  abbrev: string;
  name: string;
  short_name?: string | null;
  score: number;
};

/** Canonical arena identity + coordinates for the ON-DEVICE location match. */
export type TonightArena = {
  abbrev: string;
  name: string;
  lat: number;
  lon: number;
};

export type TonightGame = {
  game_id: string;
  date: string;
  start_time: string | null;
  /** upcoming | live | final */
  status: string;
  window: TonightWindow;
  /** May this write the permanent record? Server-decided; never infer it client-side. */
  loggable: boolean;
  /** Display text only — NEVER used for location matching (use `arena`). */
  venue: string | null;
  /** null when the venue isn't a known current arena (neutral site / outdoor). */
  arena: TonightArena | null;
  home: TonightTeam;
  away: TonightTeam;
  last_period_type: string | null;
};

export type TonightResponse = {
  /** The date evaluated — present even when `games` is empty, so a quiet night is
   *  distinguishable from a broken response. */
  date: string | null;
  now: string;
  games: TonightGame[];
};

/**
 * Fetch tonight's candidates.
 *
 * @param opts.date  YYYY-MM-DD override (testing / off-season development)
 * @param opts.now   ISO timestamp override — moves the evaluation clock. Without it the
 *                   window keys off the real clock, which makes the loggable path
 *                   unreachable outside the season.
 * @returns the response, or `null` on ANY failure (network, non-2xx, bad JSON, abort).
 */
export async function fetchTonight(
  opts: { date?: string; now?: string; signal?: AbortSignal } = {},
): Promise<TonightResponse | null> {
  const url = new URL('/v1/passport/tonight', API);
  if (opts.date) url.searchParams.set('date', opts.date);
  if (opts.now) url.searchParams.set('now', opts.now);

  try {
    const res = await fetch(url.toString(), { signal: opts.signal });
    if (!res.ok) {
      console.warn(`[tonight] schedule responded ${res.status} — card suppressed`);
      return null;
    }
    const data = (await res.json()) as TonightResponse;
    if (!data || !Array.isArray(data.games)) {
      // A shape we don't recognise is a contract violation, not "no games" — say so
      // rather than rendering an empty-but-healthy-looking state.
      console.warn('[tonight] unexpected payload shape — card suppressed');
      return null;
    }
    return data;
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') return null; // navigated away; not an error
    console.warn('[tonight] fetch failed — card suppressed', err);
    return null;
  }
}
