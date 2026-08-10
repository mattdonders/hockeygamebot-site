import { describe, expect, it } from 'vitest';
import { resolveEarnedResult } from '../earned-result';
import type { EarnedDelta } from '../../components/react/AttendedTracker';

const CATALOG = [
  { id: 'ot-warrior', label: 'OT Warrior' },
  { id: 'shutout-fan', label: 'Shutout Fan' },
];

const GAME = { away: 'BOS', home: 'NYR', venue: 'Madison Square Garden' };

function delta(overrides: Partial<EarnedDelta['earned']> = {}, current: EarnedDelta['current'] = { games: 5, arenas: 3 }): EarnedDelta {
  return {
    earned: { badges: [], new_arena: false, milestones: [], ...overrides },
    current,
  };
}

describe('resolveEarnedResult', () => {
  // ── Idempotency ────────────────────────────────────────────────────────────
  it('returns null when the write was not newly created (idempotent retry)', () => {
    const vm = resolveEarnedResult(delta({ milestones: ['games-50'] }), {
      tone: 'historical',
      created: false,
      catalog: CATALOG,
      game: GAME,
    });
    expect(vm).toBeNull();
  });

  // ── Bare success ─────────────────────────────────────────────────────────
  it('produces the bare historical VM when delta is null but the add was created', () => {
    const vm = resolveEarnedResult(null, { tone: 'historical', created: true, catalog: CATALOG, game: GAME });
    expect(vm).toEqual({
      eyebrow: 'Passport Updated',
      heroKind: 'bare',
      heroTitle: 'Added to your Passport',
      heroSubtitle: undefined,
      secondary: [],
      totals: undefined,
      tone: 'historical',
    });
  });

  it('never fabricates earned items for a bare success', () => {
    const vm = resolveEarnedResult(null, { tone: 'live', created: true, catalog: CATALOG, game: GAME });
    expect(vm?.heroKind).toBe('bare');
    expect(vm?.secondary).toEqual([]);
  });

  // ── Hero priority ────────────────────────────────────────────────────────
  it('promotes a milestone to hero over an arena and a badge', () => {
    const vm = resolveEarnedResult(
      delta({ milestones: ['games-50'], new_arena: true, badges: ['ot-warrior'] }),
      { tone: 'historical', created: true, catalog: CATALOG, game: GAME },
    );
    expect(vm?.heroKind).toBe('milestone');
    expect(vm?.heroTitle).toBe('50th game');
    expect(vm?.heroSubtitle).toBe('Milestone reached');
  });

  it('promotes a new arena to hero over a badge when there is no milestone', () => {
    const vm = resolveEarnedResult(delta({ new_arena: true, badges: ['ot-warrior'] }, { games: 5, arenas: 7 }), {
      tone: 'historical',
      created: true,
      catalog: CATALOG,
      game: GAME,
    });
    expect(vm?.heroKind).toBe('arena');
    expect(vm?.heroTitle).toBe('New arena');
    expect(vm?.heroSubtitle).toBe('Rink 7 of 32 collected');
  });

  it('falls back to "New rink collected" when current.arenas is falsy', () => {
    const vm = resolveEarnedResult(delta({ new_arena: true }, { games: 1, arenas: 0 }), {
      tone: 'historical',
      created: true,
      catalog: CATALOG,
      game: GAME,
    });
    expect(vm?.heroSubtitle).toBe('New rink collected');
  });

  it('promotes a badge to hero when there is no milestone or new arena', () => {
    const vm = resolveEarnedResult(delta({ badges: ['ot-warrior'] }), {
      tone: 'historical',
      created: true,
      catalog: CATALOG,
      game: GAME,
    });
    expect(vm?.heroKind).toBe('badge');
    expect(vm?.heroTitle).toBe('OT Warrior');
    expect(vm?.heroSubtitle).toBe('Badge unlocked');
  });

  it('falls back to the bare hero when a delta exists but nothing was earned', () => {
    const vm = resolveEarnedResult(delta(), { tone: 'historical', created: true, catalog: CATALOG, game: GAME });
    expect(vm?.heroKind).toBe('bare');
    expect(vm?.heroTitle).toBe('Added to your Passport');
    // Totals still render — this is a real delta, unlike the no-delta bare case.
    expect(vm?.totals).toBe('5 games  ·  3 arenas');
  });

  // ── Secondary grouping ───────────────────────────────────────────────────
  it('groups everything not promoted to hero into secondary, hero item excluded', () => {
    const vm = resolveEarnedResult(
      delta({ milestones: ['games-50', 'games-100'], new_arena: true, badges: ['ot-warrior', 'shutout-fan'] }, { games: 100, arenas: 9 }),
      { tone: 'historical', created: true, catalog: CATALOG, game: GAME },
    );
    expect(vm?.heroTitle).toBe('50th game'); // first milestone promoted
    expect(vm?.secondary).toEqual([
      { icon: '✦', label: '100th game' },
      { icon: '✦', label: 'Rink 9 of 32 collected' },
      { icon: '✦', label: 'OT Warrior' },
      { icon: '✦', label: 'Shutout Fan' },
    ]);
  });

  it('excludes the hero badge from secondary when a badge is promoted to hero', () => {
    const vm = resolveEarnedResult(delta({ badges: ['ot-warrior', 'shutout-fan'] }), {
      tone: 'historical',
      created: true,
      catalog: CATALOG,
      game: GAME,
    });
    expect(vm?.heroTitle).toBe('OT Warrior');
    expect(vm?.secondary).toEqual([{ icon: '✦', label: 'Shutout Fan' }]);
  });

  // ── Eyebrow / tone ───────────────────────────────────────────────────────
  it('uses "Passport Updated" for historical tone regardless of what was earned', () => {
    const withEarn = resolveEarnedResult(delta({ badges: ['ot-warrior'] }), {
      tone: 'historical',
      created: true,
      catalog: CATALOG,
      game: GAME,
    });
    const bare = resolveEarnedResult(delta(), { tone: 'historical', created: true, catalog: CATALOG, game: GAME });
    expect(withEarn?.eyebrow).toBe('Passport Updated');
    expect(bare?.eyebrow).toBe('Passport Updated');
  });

  it('uses "Tonight" for live tone when something was earned, "Game Logged" when not', () => {
    const withEarn = resolveEarnedResult(delta({ badges: ['ot-warrior'] }), {
      tone: 'live',
      created: true,
      catalog: CATALOG,
      game: GAME,
    });
    const bare = resolveEarnedResult(delta(), { tone: 'live', created: true, catalog: CATALOG, game: GAME });
    expect(withEarn?.eyebrow).toBe('Tonight');
    expect(bare?.eyebrow).toBe('Game Logged');
  });

  // ── Totals pluralization ─────────────────────────────────────────────────
  it('pluralizes totals for counts other than one', () => {
    const vm = resolveEarnedResult(delta({}, { games: 0, arenas: 2 }), {
      tone: 'historical',
      created: true,
      catalog: CATALOG,
      game: GAME,
    });
    expect(vm?.totals).toBe('0 games  ·  2 arenas');
  });

  it('keeps totals singular for a count of exactly one', () => {
    const vm = resolveEarnedResult(delta({}, { games: 1, arenas: 1 }), {
      tone: 'historical',
      created: true,
      catalog: CATALOG,
      game: GAME,
    });
    expect(vm?.totals).toBe('1 game  ·  1 arena');
  });

  // ── No-double-surface invariant ──────────────────────────────────────────
  // The VM is the SOLE data the card renders from; AttendedTracker's
  // toggleSearchResult/addManualGame suppress the generic att-logprompt banner
  // (clear `justAdded`) whenever this function is on the code path for a single
  // historical add, so exactly one of {banner, card} ever renders for a given
  // add. That suppression is exercised via the component wiring, not here — this
  // asserts the VM side of the contract: a resolved VM is non-null exactly when
  // a result should be shown at all.
  it('resolves a non-null VM whenever a result should be shown (created=true)', () => {
    const vm = resolveEarnedResult(delta({ badges: ['ot-warrior'] }), {
      tone: 'historical',
      created: true,
      catalog: CATALOG,
      game: GAME,
    });
    expect(vm).not.toBeNull();
  });
});
