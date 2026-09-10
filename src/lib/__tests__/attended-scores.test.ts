import { describe, it, expect } from 'vitest';
import { attendedScoresKnown } from '../attended-scores';

/**
 * The rule that stops a hydrated D1 row from rendering a fabricated 0–0
 * "FINAL · TIE" on the share ticket. See `attendedScoresKnown` and `mapD1Row`.
 */
describe('attendedScoresKnown', () => {
  it('is true when the server row carries both scores', () => {
    expect(attendedScoresKnown({ rowHomeScore: 4, rowAwayScore: 3 })).toBe(true);
  });

  it('is FALSE when the server row carries neither score and there is no snapshot', () => {
    // The defect case: is_final = 1, scores null. Without this the row rendered
    // as a confident 0–0 tie for a game that had a real result.
    expect(attendedScoresKnown({ rowHomeScore: null, rowAwayScore: null })).toBe(false);
  });

  it('is FALSE on a PARTIAL score — one known side is not a result', () => {
    expect(attendedScoresKnown({ rowHomeScore: 4, rowAwayScore: null })).toBe(false);
    expect(attendedScoresKnown({ rowHomeScore: null, rowAwayScore: 3 })).toBe(false);
  });

  it('a real 0 is a score, not a missing value', () => {
    // A shutout's 0 must not be mistaken for "unknown" — that would blank the
    // score on every 1–0 game's stub.
    expect(attendedScoresKnown({ rowHomeScore: 1, rowAwayScore: 0 })).toBe(true);
    expect(attendedScoresKnown({ rowHomeScore: 0, rowAwayScore: 0 })).toBe(true);
  });

  it('falls back to the local display snapshot when the server row has no scores', () => {
    expect(
      attendedScoresKnown({
        rowHomeScore: null,
        rowAwayScore: null,
        snapHomeScore: 2,
        snapAwayScore: 1,
      }),
    ).toBe(true);
  });

  it('is FALSE when neither source has scores', () => {
    expect(
      attendedScoresKnown({
        rowHomeScore: undefined,
        rowAwayScore: undefined,
        snapHomeScore: undefined,
        snapAwayScore: undefined,
      }),
    ).toBe(false);
  });
});
