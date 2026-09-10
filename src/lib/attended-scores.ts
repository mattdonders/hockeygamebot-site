/**
 * Was a real score carried for BOTH sides of an attended game, or is the rendered
 * score a placeholder?
 *
 * `TeamSide.score` is a plain `number`, so `mapD1Row` fills an unknown score with
 * `?? 0` to satisfy the type. That is fine for a list row, but it made a row the
 * server flagged `is_final` render on the share ticket as a confident 0–0
 * "FINAL · TIE" for a game that actually ended 4–3. There is no 0–0 final in
 * hockey — an unscored final is missing data, not a tie.
 *
 * Extracted here (rather than inlined in the component) so the rule itself is
 * directly testable without mounting AttendedTracker.
 *
 * Sources are checked in the same precedence order `mapD1Row` uses: the server
 * row first, then the local display snapshot captured at add time.
 */
export function attendedScoresKnown(args: {
  rowHomeScore?: number | null;
  rowAwayScore?: number | null;
  snapHomeScore?: number | null;
  snapAwayScore?: number | null;
}): boolean {
  const home = args.rowHomeScore ?? args.snapHomeScore;
  const away = args.rowAwayScore ?? args.snapAwayScore;
  return home != null && away != null;
}
