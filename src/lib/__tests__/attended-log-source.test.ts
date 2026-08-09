import { describe, expect, it } from 'vitest';
import { shouldShowLogPrompt } from '../attended-log-source';

/**
 * 0R.3 (locked): one logical write = one primary result surface. Tonight's Game
 * writes must NOT also surface the global att-logprompt (AttendedTracker owns a
 * consolidated in-card cel-list instead); every other add source still relies on
 * the global prompt as its only result surface.
 */
describe('shouldShowLogPrompt', () => {
  it('suppresses the global prompt for a Tonight log', () => {
    expect(shouldShowLogPrompt('tonight')).toBe(false);
  });

  it('shows the global prompt for a manual/search add', () => {
    expect(shouldShowLogPrompt('manual')).toBe(true);
  });

  it('shows the global prompt for a bulk import add', () => {
    expect(shouldShowLogPrompt('import')).toBe(true);
  });

  it('defaults to showing the prompt when source is omitted (legacy call sites)', () => {
    expect(shouldShowLogPrompt(undefined)).toBe(true);
  });
});
