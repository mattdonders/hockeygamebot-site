import { describe, expect, it } from 'vitest';
import { tonightKillSwitchActive, type TonightResponse } from '../tonight-client';

function resp(overrides: Partial<TonightResponse> = {}): TonightResponse {
  return { date: '2026-01-15', now: '2026-01-15T00:00:00Z', games: [], ...overrides };
}

/**
 * 0R.7 (locked): the server kill switch. `enabled: false` must suppress the card
 * regardless of the local feature flag; an ABSENT field (older worker) must fail
 * SAFE to "enabled" — the fetch-failure rule already covers the truly-unreachable
 * case, so an old worker that simply doesn't know about this field yet must not be
 * mistaken for a killed one.
 */
describe('tonightKillSwitchActive', () => {
  it('is active when the server explicitly says enabled: false', () => {
    expect(tonightKillSwitchActive(resp({ enabled: false }))).toBe(true);
  });

  it('is inactive when the server says enabled: true', () => {
    expect(tonightKillSwitchActive(resp({ enabled: true }))).toBe(false);
  });

  it('fails safe to inactive when the field is absent (older worker)', () => {
    expect(tonightKillSwitchActive(resp())).toBe(false);
  });

  it('is inactive for a null/undefined response (the unreachable case, handled elsewhere)', () => {
    expect(tonightKillSwitchActive(null)).toBe(false);
    expect(tonightKillSwitchActive(undefined)).toBe(false);
  });
});
