/**
 * Which of tonight's candidates is "yours"?
 *
 * This runs CLIENT-SIDE on purpose. The server returns every eligible game because it
 * cannot know your rooting team or where your phone is — and if it guessed, the web app
 * and a future iOS app would eventually guess differently.
 *
 * Precedence (spec §4):
 *   1. geolocation match — you are physically at that arena. Strongest.
 *   2. rooting team plays — a reasonable GUESS; the user still confirms by tapping.
 *   3. nothing — render no card. Never surface a generic "some game is on tonight",
 *      which is noise for someone who wasn't there.
 *
 * CUT from v1: "last-detected arena". A single past location match is weak evidence that
 * silently becomes a standing assumption — true for a season-ticket holder, meaningless
 * after one road trip. It muddied the confidence hierarchy above.
 */
import { haversineKm, ARENA_MATCH_MAX_KM } from './arena-match';
import type { TonightGame } from './tonight-client';

/**
 * Match device coordinates against the arenas the SERVER supplied on each candidate —
 * NOT against the client's own bundled arena table.
 *
 * That distinction is the whole point of shipping coords in the payload: the server is
 * the single source of arena data, so web and a future iOS client can't drift, and each
 * only runs this ~20 lines of pure maths locally. Matching against a bundled table would
 * quietly reintroduce the second copy the design exists to avoid.
 *
 * Ambiguity guard mirrors arena-match.ts: if the two nearest arenas are within 0.5km of
 * each other IN DISTANCE FROM THE DEVICE (i.e. the device is near-equidistant from both —
 * not that the buildings are 0.5km apart) we refuse to guess. Real NHL buildings are
 * >10km apart, so this only trips on bad data — and a wrong arena means a wrong
 * permanent record.
 */
function gameAtMyArena(
  games: TonightGame[],
  coords: { lat: number; lon: number },
): TonightGame | null {
  const within = games
    .filter((g) => g.arena)
    .map((g) => ({ game: g, km: haversineKm(coords.lat, coords.lon, g.arena!.lat, g.arena!.lon) }))
    .filter((x) => x.km <= ARENA_MATCH_MAX_KM)
    .sort((a, b) => a.km - b.km);

  if (within.length === 0) return null;
  if (within.length > 1 && within[1].km - within[0].km < 0.5) return null; // ambiguous
  return within[0].game;
}

/** Why this candidate was chosen — reported as `tonight_candidate_source` so we can tell
 *  whether geolocation is doing anything in the wild or everyone is falling back.
 *  'manual' is the user explicitly picking from the "Find my game" list — never a guess,
 *  so it outranks both automatic sources once set (see TonightGameCard's precedence). */
export type CandidateSource = 'geo' | 'rooting_team' | 'manual';

export type Candidate = {
  game: TonightGame;
  source: CandidateSource;
  /** Other eligible games, for the "not this one?" reveal. */
  alternatives: TonightGame[];
};

/**
 * Pick the candidate to lead with.
 *
 * @param games      eligible candidates from the server
 * @param anchor     the user's rooting-team abbrev, or null
 * @param coords     device coordinates, or null when unavailable/denied
 * @param dismissed  game_ids the user has dismissed (still inside their window)
 */
export function pickCandidate(
  games: TonightGame[],
  anchor: string | null,
  coords: { lat: number; lon: number } | null,
  dismissed: Set<string> = new Set(),
): Candidate | null {
  const live = (games ?? []).filter((g) => !dismissed.has(g.game_id));
  if (live.length === 0) return null;

  // 1. Geolocation. Matched entirely on-device against the coords the server supplied,
  //    so the user's position is never transmitted.
  if (coords) {
    const atArena = gameAtMyArena(live, coords);
    if (atArena) {
      return { game: atArena, source: 'geo', alternatives: live.filter((g) => g !== atArena) };
    }
    // No arena nearby, ambiguous, or no game at the matched arena → fall through
    // SILENTLY. A convenience the user didn't ask for must never surface an error.
  }

  // 2. Rooting team — home or away.
  if (anchor) {
    const theirs = live.find((g) => g.home.abbrev === anchor || g.away.abbrev === anchor);
    if (theirs) {
      return { game: theirs, source: 'rooting_team', alternatives: live.filter((g) => g !== theirs) };
    }
  }

  // 3. No defensible candidate.
  return null;
}

/** The user explicitly picked `game` from the "Find my game" list — not a guess,
 *  so this always outranks whatever `pickCandidate` would have inferred. */
export function makeManualCandidate(game: TonightGame, games: TonightGame[]): Candidate {
  return { game, source: 'manual', alternatives: games.filter((g) => g !== game) };
}

// ── Location-outcome classification (0R.5) ───────────────────────────────────────
// When the user INTENTIONALLY invokes location discovery, four distinct outcomes are
// user-actionable — see the spec's locked "A/B/C/D" list. Internal state names
// (unset/deferred/suppressed, from geo-preference.ts) stay silent; these four do not.
// Pulled out as a pure function so the mapping is unit-testable without a browser.
export type LocationOutcome = 'permission_denied' | 'lookup_failed' | 'no_game' | 'found';

export function classifyLocationOutcome(input: {
  /** A. The browser/OS denied permission outright (geolocation error PERMISSION_DENIED). */
  permissionDenied: boolean;
  /** B. The lookup itself failed/timed out (POSITION_UNAVAILABLE / TIMEOUT) — not a denial. */
  lookupFailed: boolean;
  /** Did a position successfully resolve this attempt? */
  hasCoords: boolean;
  /** Given that position, did it land on a candidate via the geo source (see pickCandidate)? */
  hasGeoCandidate: boolean;
}): LocationOutcome | null {
  if (input.permissionDenied) return 'permission_denied'; // A
  if (input.lookupFailed) return 'lookup_failed'; // B
  if (!input.hasCoords) return null; // no attempt has resolved yet — nothing to report
  return input.hasGeoCandidate ? 'found' : 'no_game'; // D : C
}

// ── Dismissals ──────────────────────────────────────────────────────────────────
// Per GAME, expiring with that game's window (spec, locked 2026-07-31). Keyed by
// game_id — never by date or team — so dismissing one candidate cannot suppress another,
// and expiry cleans itself up on the next write with no scheduled job. Persistent enough not to annoy,
// temporary enough not to punish.

const DISMISS_KEY = 'hgb_pp_tonight_dismissed';

type DismissEntry = { gameId: string; expiresAt: string };

function readRaw(): DismissEntry[] {
  try {
    const raw = JSON.parse(window.localStorage.getItem(DISMISS_KEY) ?? '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

/** Currently-active dismissals: expired entries are filtered out of the returned Set in
 *  memory only — this never writes back. Actual pruning of the stored array happens on
 *  WRITE (dismissGame drops expired entries; undismissGame rewrites without the undone
 *  id), so an untouched store keeps stale entries until the next dismiss. */
export function readDismissed(now: number = Date.now()): Set<string> {
  if (typeof window === 'undefined') return new Set();
  const live = readRaw().filter((e) => {
    const t = Date.parse(e?.expiresAt ?? '');
    return Number.isFinite(t) && t > now;
  });
  return new Set(live.map((e) => String(e.gameId)));
}

/** Dismiss a game until its Tonight window expires. */
export function dismissGame(gameId: string, expiresAt: string, now: number = Date.now()): void {
  if (typeof window === 'undefined') return;
  try {
    const kept = readRaw().filter((e) => {
      const t = Date.parse(e?.expiresAt ?? '');
      return Number.isFinite(t) && t > now && String(e.gameId) !== String(gameId);
    });
    kept.push({ gameId: String(gameId), expiresAt });
    window.localStorage.setItem(DISMISS_KEY, JSON.stringify(kept));
  } catch {
    /* storage blocked — the dismissal simply won't survive a refresh */
  }
}

/** Undo a dismissal (the session-only affordance shown right after dismissing). */
export function undismissGame(gameId: string): void {
  if (typeof window === 'undefined') return;
  try {
    const kept = readRaw().filter((e) => String(e.gameId) !== String(gameId));
    window.localStorage.setItem(DISMISS_KEY, JSON.stringify(kept));
  } catch {
    /* non-fatal */
  }
}
