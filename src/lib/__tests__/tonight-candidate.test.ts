import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { haversineKm } from '../arena-match';
import {
  classifyLocationOutcome,
  dismissGame,
  isGeoFailedBehindFallback,
  makeManualCandidate,
  pickCandidate,
  readDismissed,
  undismissGame,
} from '../tonight-candidate';
import type { TonightGame } from '../tonight-client';
import { installFakeWindow, uninstallFakeWindow, type StorageHandles } from './test-storage';

const DISMISS_KEY = 'hgb_pp_tonight_dismissed';
const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.parse('2026-01-15T18:00:00.000Z');

/** Madison Square Garden — the reference point for every distance fixture. */
const ME = { lat: 40.7505, lon: -73.9934 };

/** Degrees of latitude per km (great-circle, exact enough for fixtures). */
const KM_PER_DEG_LAT = (2 * Math.PI * 6371) / 360;

/** A point exactly `km` due north of ME. */
function northOf(km: number): { lat: number; lon: number } {
  return { lat: ME.lat + km / KM_PER_DEG_LAT, lon: ME.lon };
}

function game(
  gameId: string,
  opts: {
    home?: string;
    away?: string;
    arenaAt?: { lat: number; lon: number } | null;
  } = {},
): TonightGame {
  const { home = 'NYR', away = 'NJD', arenaAt = null } = opts;
  return {
    game_id: gameId,
    date: '2026-01-15',
    start_time: '2026-01-15T00:00:00Z',
    status: 'upcoming',
    window: 'pre',
    loggable: true,
    venue: `Arena ${gameId}`,
    arena: arenaAt ? { abbrev: home, name: `Arena ${gameId}`, lat: arenaAt.lat, lon: arenaAt.lon } : null,
    home: { id: 1, abbrev: home, name: home, score: 0 },
    away: { id: 2, abbrev: away, name: away, score: 0 },
    last_period_type: null,
  };
}

let store: StorageHandles;

beforeEach(() => {
  store = installFakeWindow();
});

afterEach(() => {
  uninstallFakeWindow();
});

describe('fixture sanity', () => {
  it('northOf produces the distance it claims', () => {
    for (const km of [0.5, 1, 4.9, 5.2, 50]) {
      const p = northOf(km);
      expect(haversineKm(ME.lat, ME.lon, p.lat, p.lon)).toBeCloseTo(km, 2);
    }
  });
});

describe('pickCandidate — geolocation', () => {
  it('matches a game whose arena is clearly inside the 5km radius', () => {
    const here = game('A', { arenaAt: northOf(1) });
    const far = game('B', { home: 'BOS', arenaAt: northOf(300) });

    const c = pickCandidate([here, far], null, ME);
    expect(c).not.toBeNull();
    expect(c!.source).toBe('geo');
    expect(c!.game.game_id).toBe('A');
    expect(c!.alternatives.map((g) => g.game_id)).toEqual(['B']);
  });

  it('matches right up to the 5km edge and not past it', () => {
    const inside = pickCandidate([game('A', { arenaAt: northOf(4.9) })], null, ME);
    expect(inside?.source).toBe('geo');

    const outside = pickCandidate([game('A', { arenaAt: northOf(5.2) })], null, ME);
    expect(outside).toBeNull();
  });

  it('does not match when every arena is clearly outside the radius', () => {
    const c = pickCandidate([game('A', { arenaAt: northOf(50) })], null, ME);
    expect(c).toBeNull();
  });

  it('refuses to guess when two arenas are within 0.5km of each other', () => {
    const a = game('A', { home: 'NYR', arenaAt: northOf(1.0) });
    const b = game('B', { home: 'NYI', arenaAt: northOf(1.3) });

    expect(pickCandidate([a, b], null, ME)).toBeNull();
  });

  it('picks the nearer arena once the two are more than 0.5km apart', () => {
    const a = game('A', { home: 'NYR', arenaAt: northOf(1.0) });
    const b = game('B', { home: 'NYI', arenaAt: northOf(4.0) });

    const c = pickCandidate([a, b], null, ME);
    expect(c?.source).toBe('geo');
    expect(c?.game.game_id).toBe('A');
  });

  it('ignores games with no arena coords (neutral site / outdoor)', () => {
    const noArena = game('A', { arenaAt: null });
    const real = game('B', { home: 'NYI', arenaAt: northOf(1) });

    expect(pickCandidate([noArena, real], null, ME)?.game.game_id).toBe('B');
  });

  it('falls through SILENTLY to the rooting team when the ambiguity guard trips', () => {
    const a = game('A', { home: 'NYR', arenaAt: northOf(1.0) });
    const b = game('B', { home: 'NYI', away: 'BOS', arenaAt: northOf(1.3) });

    const c = pickCandidate([a, b], 'BOS', ME);
    expect(c?.source).toBe('rooting_team');
    expect(c?.game.game_id).toBe('B');
  });
});

describe('pickCandidate — rooting team and precedence', () => {
  it('geo outranks the rooting team', () => {
    const atArena = game('A', { home: 'NYR', away: 'NYI', arenaAt: northOf(1) });
    const anchorGame = game('B', { home: 'BOS', away: 'TOR', arenaAt: northOf(400) });

    const c = pickCandidate([atArena, anchorGame], 'BOS', ME);
    expect(c?.source).toBe('geo');
    expect(c?.game.game_id).toBe('A');
  });

  it('matches the anchor as home OR away', () => {
    expect(pickCandidate([game('A', { home: 'BOS', away: 'TOR' })], 'BOS', null)?.game.game_id).toBe('A');
    expect(pickCandidate([game('A', { home: 'TOR', away: 'BOS' })], 'BOS', null)?.game.game_id).toBe('A');
  });

  it('returns null rather than a generic "some game is on" when nothing matches', () => {
    expect(pickCandidate([game('A', { home: 'TOR', away: 'MTL' })], 'BOS', null)).toBeNull();
    expect(pickCandidate([game('A')], null, null)).toBeNull();
    expect(pickCandidate([], 'BOS', null)).toBeNull();
  });

  it('tolerates a null/undefined game list', () => {
    expect(pickCandidate(undefined as unknown as TonightGame[], 'BOS', null)).toBeNull();
  });
});

describe('pickCandidate — dismissals', () => {
  it('skips a dismissed game entirely, including from alternatives', () => {
    const a = game('A', { home: 'NYR', arenaAt: northOf(1) });
    const b = game('B', { home: 'BOS', away: 'TOR' });

    const c = pickCandidate([a, b], 'BOS', ME, new Set(['A']));
    expect(c?.source).toBe('rooting_team');
    expect(c?.game.game_id).toBe('B');
    expect(c?.alternatives).toEqual([]);
  });

  it('returns null when every candidate is dismissed', () => {
    expect(pickCandidate([game('A'), game('B')], null, ME, new Set(['A', 'B']))).toBeNull();
  });
});

describe('makeManualCandidate', () => {
  it('marks the pick manual and lists every other game as an alternative', () => {
    const a = game('A');
    const b = game('B');
    const c = makeManualCandidate(b, [a, b]);

    expect(c.source).toBe('manual');
    expect(c.game.game_id).toBe('B');
    expect(c.alternatives.map((g) => g.game_id)).toEqual(['A']);
  });
});

describe('classifyLocationOutcome — 0R.5 A/B/C/D mapping', () => {
  const base = { permissionDenied: false, lookupFailed: false, hasCoords: false, hasGeoCandidate: false };

  it('A: permission denied wins regardless of anything else', () => {
    expect(classifyLocationOutcome({ ...base, permissionDenied: true })).toBe('permission_denied');
    expect(
      classifyLocationOutcome({ ...base, permissionDenied: true, hasCoords: true, hasGeoCandidate: true }),
    ).toBe('permission_denied');
  });

  it('B: a lookup failure (not a denial) is reported distinctly', () => {
    expect(classifyLocationOutcome({ ...base, lookupFailed: true })).toBe('lookup_failed');
  });

  it('B takes precedence over a stale/irrelevant hasGeoCandidate flag', () => {
    expect(classifyLocationOutcome({ ...base, lookupFailed: true, hasGeoCandidate: true })).toBe(
      'lookup_failed',
    );
  });

  it('no attempt has resolved yet: neither a failure nor coords ⇒ null (nothing to report)', () => {
    expect(classifyLocationOutcome(base)).toBeNull();
  });

  it('C: position resolved but no game matched nearby', () => {
    expect(classifyLocationOutcome({ ...base, hasCoords: true, hasGeoCandidate: false })).toBe('no_game');
  });

  it('D: position resolved and a game matched — the happy path', () => {
    expect(classifyLocationOutcome({ ...base, hasCoords: true, hasGeoCandidate: true })).toBe('found');
  });

  it('never conflates a failed attempt with "no game found" — permission/lookup failures must never imply no NHL game exists', () => {
    // Both C and a failure can technically co-occur if state is stale (e.g. a prior
    // successful fix's hasGeoCandidate lingering) — failure must still win.
    expect(classifyLocationOutcome({ ...base, permissionDenied: true, hasCoords: true })).toBe(
      'permission_denied',
    );
  });
});

describe('isGeoFailedBehindFallback — defect #9 (honest signal behind an anchor fallback)', () => {
  it('true: permission denied, but a rooting-team fallback still found a candidate', () => {
    expect(
      isGeoFailedBehindFallback({ locationOutcome: 'permission_denied', candidateSource: 'rooting_team' }),
    ).toBe(true);
  });

  it('true: lookup failed, but a manual pick is standing in', () => {
    expect(isGeoFailedBehindFallback({ locationOutcome: 'lookup_failed', candidateSource: 'manual' })).toBe(
      true,
    );
  });

  it('false: geo itself succeeded and IS the candidate — nothing to disclose', () => {
    expect(isGeoFailedBehindFallback({ locationOutcome: 'permission_denied', candidateSource: 'geo' })).toBe(
      false,
    );
    expect(isGeoFailedBehindFallback({ locationOutcome: 'found', candidateSource: 'geo' })).toBe(false);
  });

  it('false: no candidate at all — the dedicated no-candidate messaging branch already covers this', () => {
    expect(
      isGeoFailedBehindFallback({ locationOutcome: 'permission_denied', candidateSource: null }),
    ).toBe(false);
  });

  it('false: outcome is "no_game" or "found" (not a failure) even with a non-geo candidate', () => {
    expect(isGeoFailedBehindFallback({ locationOutcome: 'no_game', candidateSource: 'rooting_team' })).toBe(
      false,
    );
    expect(isGeoFailedBehindFallback({ locationOutcome: 'found', candidateSource: 'rooting_team' })).toBe(
      false,
    );
  });

  it('false: no outcome to report yet (null)', () => {
    expect(isGeoFailedBehindFallback({ locationOutcome: null, candidateSource: 'rooting_team' })).toBe(false);
  });
});

describe('dismissal persistence', () => {
  it('round-trips a dismissal that has not expired', () => {
    dismissGame('A', new Date(T0 + DAY).toISOString(), T0);
    expect(readDismissed(T0)).toEqual(new Set(['A']));
  });

  it('drops an entry once its expiry passes', () => {
    const expiresAt = new Date(T0 + DAY).toISOString();
    dismissGame('A', expiresAt, T0);

    expect(readDismissed(T0 + DAY - 1)).toEqual(new Set(['A']));
    expect(readDismissed(T0 + DAY)).toEqual(new Set()); // strictly-greater-than expiry
    expect(readDismissed(T0 + 2 * DAY)).toEqual(new Set());
  });

  it('is keyed per game_id — dismissing one never suppresses another', () => {
    dismissGame('A', new Date(T0 + DAY).toISOString(), T0);
    dismissGame('B', new Date(T0 + DAY).toISOString(), T0);

    expect(readDismissed(T0)).toEqual(new Set(['A', 'B']));
    undismissGame('A');
    expect(readDismissed(T0)).toEqual(new Set(['B']));
  });

  it('self-prunes expired entries on the next write', () => {
    dismissGame('OLD', new Date(T0 - DAY).toISOString(), T0 - 2 * DAY);
    dismissGame('NEW', new Date(T0 + DAY).toISOString(), T0);

    const stored = JSON.parse(store.localStorage.getItem(DISMISS_KEY) as string);
    expect(stored.map((e: { gameId: string }) => e.gameId)).toEqual(['NEW']);
  });

  it('replaces rather than duplicates when the same game is dismissed twice', () => {
    dismissGame('A', new Date(T0 + DAY).toISOString(), T0);
    dismissGame('A', new Date(T0 + 2 * DAY).toISOString(), T0);

    const stored = JSON.parse(store.localStorage.getItem(DISMISS_KEY) as string);
    expect(stored).toHaveLength(1);
    expect(stored[0].expiresAt).toBe(new Date(T0 + 2 * DAY).toISOString());
  });

  it('normalizes numeric game ids to strings', () => {
    dismissGame(2026020123 as unknown as string, new Date(T0 + DAY).toISOString(), T0);
    expect(readDismissed(T0).has('2026020123')).toBe(true);
  });

  it('fails safe to an empty set on corrupt or non-array storage', () => {
    store.localStorage.setItem(DISMISS_KEY, '{not json');
    expect(readDismissed(T0)).toEqual(new Set());

    store.localStorage.setItem(DISMISS_KEY, '{"gameId":"A"}');
    expect(readDismissed(T0)).toEqual(new Set());
  });

  it('drops entries whose expiresAt is missing or unparseable', () => {
    store.localStorage.setItem(DISMISS_KEY, JSON.stringify([{ gameId: 'A' }, { gameId: 'B', expiresAt: 'soon' }]));
    expect(readDismissed(T0)).toEqual(new Set());
  });

  it('returns an empty set and never throws without a window (SSR)', () => {
    uninstallFakeWindow();
    expect(readDismissed(T0)).toEqual(new Set());
    expect(() => dismissGame('A', new Date(T0 + DAY).toISOString(), T0)).not.toThrow();
    expect(() => undismissGame('A')).not.toThrow();
  });
});
