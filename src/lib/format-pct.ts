/**
 * Percentage formatting utilities (D1-16).
 *
 * Two distinct sources feed percentages on the site:
 *   - Static R2-export values are 0-1 fractions (`toPct`).
 *   - D1 `series_predictions.win_pct_a/win_pct_b` are 0-100 but aren't
 *     guaranteed to sum to 100 (independent per-side rounding upstream) —
 *     `normalizePctPair` re-normalizes so the pair always sums to 100.
 */

export function toPct(fraction: number, decimals = 0): number {
  return +(fraction * 100).toFixed(decimals);
}

export function normalizePctPair(a: number, b: number): [number, number] {
  const total = a + b;
  if (!Number.isFinite(total) || total <= 0) return [50, 50];
  const pctA = Math.round((a / total) * 100);
  return [pctA, 100 - pctA];
}
