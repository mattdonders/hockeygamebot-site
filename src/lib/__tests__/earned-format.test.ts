import { describe, expect, it } from 'vitest';
import { formatMilestoneLabel, ordinal, resolveBadgeLabels } from '../earned-format';

describe('ordinal', () => {
  it('formats common suffixes', () => {
    expect(ordinal(1)).toBe('1st');
    expect(ordinal(2)).toBe('2nd');
    expect(ordinal(3)).toBe('3rd');
    expect(ordinal(4)).toBe('4th');
  });

  it('handles the 11-13 teen exception', () => {
    expect(ordinal(11)).toBe('11th');
    expect(ordinal(12)).toBe('12th');
    expect(ordinal(13)).toBe('13th');
  });

  it('handles larger numbers', () => {
    expect(ordinal(21)).toBe('21st');
    expect(ordinal(50)).toBe('50th');
    expect(ordinal(102)).toBe('102nd');
  });
});

describe('formatMilestoneLabel', () => {
  it('formats a games milestone', () => {
    expect(formatMilestoneLabel('games-50')).toBe('50th game');
  });

  it('formats an arenas milestone', () => {
    expect(formatMilestoneLabel('arenas-10')).toBe('10th arena');
  });

  it('falls back to the raw id for an unrecognized kind', () => {
    expect(formatMilestoneLabel('players-5')).toBe('players-5');
  });

  it('falls back to the raw id when the number segment does not parse', () => {
    expect(formatMilestoneLabel('games-abc')).toBe('games-abc');
  });
});

describe('resolveBadgeLabels', () => {
  const catalog = [
    { id: 'ot-warrior', label: 'OT Warrior' },
    { id: 'shutout-fan', label: 'Shutout Fan' },
  ];

  it('resolves ids to catalog labels', () => {
    expect(resolveBadgeLabels(['ot-warrior', 'shutout-fan'], catalog)).toEqual([
      'OT Warrior',
      'Shutout Fan',
    ]);
  });

  it('falls back to the raw id when a badge is not in the catalog', () => {
    expect(resolveBadgeLabels(['mystery-badge'], catalog)).toEqual(['mystery-badge']);
  });

  it('returns an empty array for an empty id list', () => {
    expect(resolveBadgeLabels([], catalog)).toEqual([]);
  });
});
