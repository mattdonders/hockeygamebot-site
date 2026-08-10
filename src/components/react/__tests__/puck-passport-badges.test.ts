import { describe, it, expect } from 'vitest';
import { selectSpotlightTier, type TierBadgeView } from '../puck-passport-badges';

function tier(overrides: Partial<TierBadgeView>): TierBadgeView {
  return {
    id: 'tier-games',
    label: 'Games',
    family: 'tier',
    earned: false,
    maxed: false,
    rung: 0,
    rung_name: 'Rookie',
    value: 0,
    next_threshold: 10,
    next_rung_name: 'Rookie',
    progress: '0 / 10 to Rookie',
    fraction: 0,
    ...overrides,
  };
}

describe('selectSpotlightTier', () => {
  it('returns null for an empty tier list', () => {
    expect(selectSpotlightTier([])).toBeNull();
  });

  it('picks the non-maxed tier with the highest fraction', () => {
    const tiers = [
      tier({ id: 'tier-games', fraction: 0.2 }),
      tier({ id: 'tier-goals', fraction: 0.8 }),
      tier({ id: 'tier-shots', fraction: 0.5 }),
      tier({ id: 'tier-players', fraction: 0.1 }),
    ];
    expect(selectSpotlightTier(tiers)?.id).toBe('tier-goals');
  });

  it('ignores maxed tiers when picking the closest-to-advancing one', () => {
    const tiers = [
      tier({ id: 'tier-games', fraction: 1, maxed: true }),
      tier({ id: 'tier-goals', fraction: 0.6 }),
      tier({ id: 'tier-shots', fraction: 0.3 }),
    ];
    expect(selectSpotlightTier(tiers)?.id).toBe('tier-goals');
  });

  it('falls back to the first tier when every tier is maxed', () => {
    const tiers = [
      tier({ id: 'tier-games', fraction: 1, maxed: true }),
      tier({ id: 'tier-goals', fraction: 1, maxed: true }),
    ];
    expect(selectSpotlightTier(tiers)?.id).toBe('tier-games');
  });

  it('breaks ties deterministically by keeping the first max seen', () => {
    const tiers = [
      tier({ id: 'tier-games', fraction: 0.4 }),
      tier({ id: 'tier-goals', fraction: 0.4 }),
    ];
    expect(selectSpotlightTier(tiers)?.id).toBe('tier-games');
  });
});
