/**
 * team-records.ts — perspective-anchored attended-game records (W-L-OTL).
 *
 * Puck Passport "rooting perspective" prototype (Phase 1, client-side). Recomputes
 * BOTH team-record framings from the per-game facts the browser already holds —
 * ZERO dependency on the frozen `attended_summary.js` endpoint:
 *
 *   Table B (neutral) — "Every team you've seen": each team's raw W-L-OTL across
 *     all attended FINALS, BOTH sides credited (today's server ledger + an OTL
 *     column). A Devils fan's list contains BOTH `NJD 6-4-2` and `TOR 2-3-0`.
 *
 *   Table A (anchored) — "Your record vs each team": pick a rooting anchor team;
 *     for every final the anchor played, file the ANCHOR's result under the
 *     OPPONENT. Games the anchor didn't play collapse to a single "N neutral
 *     games" line (a W-L only exists relative to a rooting side).
 *
 * W-L-OTL fold (both tables): winner → W; loser → OTL when the game ended in
 * OT/SO (via the shared `normalizePeriod`, byte-for-byte the server's semantics),
 * else L. A manual game with no OT signal / missing-or-tied score contributes
 * W-L only (or nothing) — never a fabricated OTL or a guessed winner.
 *
 * This module is PURE (no React / DOM) so it is unit-testable in isolation via
 * `npx tsx` — see team-records.test.ts.
 */

import { normalizePeriod } from '../components/react/puck-passport-badges';

// ── Types ────────────────────────────────────────────────────────────────────

/** A win/loss/overtime-loss tally. */
export type WLOTL = { w: number; l: number; otl: number };

/** The minimal per-game facts both tables need. AttendedGame projects onto this
 *  (see toRecordGame in AttendedTracker). Abbrev is the identity key; name is
 *  carried through for display. Scores are nullable so a manual game with no
 *  score entered is never scored as a fabricated 0-0. */
export interface TeamRecordGame {
  homeAbbrev: string;
  homeName: string;
  homeScore: number | null;
  awayAbbrev: string;
  awayName: string;
  awayScore: number | null;
  isFinal: boolean;
  /** REG | OT | SO | playoff-OT variants | null (manual w/ no OT signal). */
  lastPeriodType: string | null;
  isManual?: boolean;
}

/** One opponent row in the anchored table (Table A). */
export type OpponentRecord = WLOTL & { abbrev: string; name: string };

/** The anchored view for one anchor team (Table A). */
export type AnchoredRecords = {
  anchor: string; // abbrev
  anchorName: string;
  overall: WLOTL; // the anchor's own W-L-OTL across every game it played
  opponents: OpponentRecord[]; // sorted, most-played first
  neutralGames: number; // finals the anchor did not play in
};

/** One team row in the neutral table (Table B). */
export type NeutralRecord = WLOTL & { abbrev: string; name: string };

/** How an anchor was chosen (drives the UI label/nudge). */
export type AnchorSource = 'inferred' | 'explicit' | 'none';

// ── Tunable inference constants ──────────────────────────────────────────────
// Auto-anchoring a rooting team from attendance is only safe when ONE team clearly
// dominates the slate — otherwise a genuine two-team fan (e.g. 25 Devils / 22
// Rangers home games) gets mis-anchored. The guard requires the leader to clear
// EITHER threshold. Tune once real attendance distributions are in (spec Phase 2).

/** The leading team's HOME-game count must be ≥ this share of ALL attended games. */
export const ANCHOR_DOMINANCE_MIN_SHARE = 0.4;
/** …OR ≥ this multiple of the SECOND-most-attended team's home-game count. */
export const ANCHOR_DOMINANCE_NEXT_MULTIPLE = 2;

// ── Core outcome helper ──────────────────────────────────────────────────────

type Outcome = {
  winnerAbbrev: string;
  loserAbbrev: string;
  /** True when the game was decided in OT/SO ⇒ the loser earns an OTL, not an L. */
  beyondReg: boolean;
};

/** Decide a final game's outcome, or null when no winner can be trusted (a tie,
 *  or a manual game missing a score). Never guesses a winner. */
function outcomeOf(g: TeamRecordGame): Outcome | null {
  if (!g.isFinal) return null;
  if (g.homeScore == null || g.awayScore == null) return null;
  if (g.homeScore === g.awayScore) return null; // no winner to credit
  const homeWon = g.homeScore > g.awayScore;
  // Manual games carry no reliable period signal — normalizePeriod maps a null/
  // unknown period to REG, so a manual game never fabricates an OTL (spec).
  const beyondReg = normalizePeriod(g.lastPeriodType).code !== 'REG';
  return {
    winnerAbbrev: homeWon ? g.homeAbbrev : g.awayAbbrev,
    loserAbbrev: homeWon ? g.awayAbbrev : g.homeAbbrev,
    beyondReg,
  };
}

/** Credit a single result into a WLOTL accumulator. */
function credit(rec: WLOTL, won: boolean, beyondReg: boolean): void {
  if (won) rec.w += 1;
  else if (beyondReg) rec.otl += 1;
  else rec.l += 1;
}

/** Total decided games a record represents. */
export function totalGames(r: WLOTL): number {
  return r.w + r.l + r.otl;
}

/** Format a record as "W-L-OTL". */
export function formatRecord(r: WLOTL): string {
  return `${r.w}-${r.l}-${r.otl}`;
}

// ── Table B: neutral, every team both sides ──────────────────────────────────

/** Sort teams for display: most-decided-games first, then wins, then OTL, then
 *  abbrev — a stable, deterministic order (matches the anchored-table sort). */
function compareRecords(a: NeutralRecord | OpponentRecord, b: NeutralRecord | OpponentRecord): number {
  return (
    totalGames(b) - totalGames(a) ||
    b.w - a.w ||
    b.otl - a.otl ||
    a.abbrev.localeCompare(b.abbrev)
  );
}

/** Table B — every team's raw W-L-OTL across all attended finals (both sides). */
export function neutralRecords(games: TeamRecordGame[]): NeutralRecord[] {
  const map = new Map<string, NeutralRecord>();
  const ensure = (abbrev: string, name: string): NeutralRecord => {
    let rec = map.get(abbrev);
    if (!rec) {
      rec = { abbrev, name, w: 0, l: 0, otl: 0 };
      map.set(abbrev, rec);
    } else if (!rec.name && name) {
      rec.name = name; // backfill a name if an earlier game lacked one
    }
    return rec;
  };
  for (const g of games) {
    const o = outcomeOf(g);
    if (!o) continue;
    const home = ensure(g.homeAbbrev, g.homeName);
    const away = ensure(g.awayAbbrev, g.awayName);
    const homeWon = o.winnerAbbrev === g.homeAbbrev;
    // credit() only reads beyondReg for the LOSER, so passing it to both is safe.
    credit(home, homeWon, o.beyondReg);
    credit(away, !homeWon, o.beyondReg);
  }
  return Array.from(map.values()).sort(compareRecords);
}

// ── Table A: anchored to one rooting team ────────────────────────────────────

/** Table A — the anchor team's record vs each opponent, plus its overall record
 *  and a count of neutral games (finals the anchor did not play in). */
export function anchoredRecords(games: TeamRecordGame[], anchor: string): AnchoredRecords {
  const overall: WLOTL = { w: 0, l: 0, otl: 0 };
  const oppMap = new Map<string, OpponentRecord>();
  let neutralGames = 0;
  let anchorName = anchor;

  for (const g of games) {
    if (!g.isFinal) continue;
    const isHome = g.homeAbbrev === anchor;
    const isAway = g.awayAbbrev === anchor;
    if (!isHome && !isAway) {
      // A final the anchor did not play in — a neutral game (no rooting result).
      // Only count it as neutral once it is a real, decided/played final.
      neutralGames += 1;
      continue;
    }
    if (isHome && g.homeName) anchorName = g.homeName;
    if (isAway && g.awayName) anchorName = g.awayName;

    const o = outcomeOf(g);
    if (!o) continue; // played but no trustworthy result (tie / missing score)

    const oppAbbrev = isHome ? g.awayAbbrev : g.homeAbbrev;
    const oppName = isHome ? g.awayName : g.homeName;
    let opp = oppMap.get(oppAbbrev);
    if (!opp) {
      opp = { abbrev: oppAbbrev, name: oppName, w: 0, l: 0, otl: 0 };
      oppMap.set(oppAbbrev, opp);
    } else if (!opp.name && oppName) {
      opp.name = oppName;
    }
    const anchorWon = o.winnerAbbrev === anchor;
    credit(opp, anchorWon, o.beyondReg);
    credit(overall, anchorWon, o.beyondReg);
  }

  return {
    anchor,
    anchorName,
    overall,
    opponents: Array.from(oppMap.values()).sort(compareRecords),
    neutralGames,
  };
}

// ── Inference: which team is the user's likely rooting anchor ─────────────────

export type AnchorInference = {
  anchor: string | null; // abbrev, or null when no team dominates
  /** Per-team home-game counts, ranked (leader first). Exposed for debugging/UI. */
  ranked: { abbrev: string; homeGames: number; totalGames: number }[];
};

/** Infer the rooting anchor: the team whose HOME games the user attended most
 *  (being physically at a team's rink is the strongest fandom signal), tie-broken
 *  by total games involving the team. Auto-anchors ONLY if the leader clears the
 *  dominance guard (≥ MIN_SHARE of all attended games OR ≥ NEXT_MULTIPLE× the
 *  runner-up's home count); otherwise returns null (a genuine multi-team fan is
 *  left un-anchored rather than mis-anchored). Considers ALL attended games (not
 *  just finals) — attendance, not outcome, is the signal. */
export function inferAnchor(games: TeamRecordGame[]): AnchorInference {
  const homeGames = new Map<string, number>();
  const total = new Map<string, number>();
  const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);

  for (const g of games) {
    bump(homeGames, g.homeAbbrev);
    bump(total, g.homeAbbrev);
    bump(total, g.awayAbbrev);
  }

  const ranked = Array.from(homeGames.entries())
    .map(([abbrev, hg]) => ({ abbrev, homeGames: hg, totalGames: total.get(abbrev) ?? 0 }))
    .sort(
      (a, b) => b.homeGames - a.homeGames || b.totalGames - a.totalGames || a.abbrev.localeCompare(b.abbrev),
    );

  const leader = ranked[0];
  if (!leader || leader.homeGames === 0) return { anchor: null, ranked };

  const nextHome = ranked[1]?.homeGames ?? 0;
  const share = games.length > 0 ? leader.homeGames / games.length : 0;
  const dominant =
    share >= ANCHOR_DOMINANCE_MIN_SHARE || leader.homeGames >= ANCHOR_DOMINANCE_NEXT_MULTIPLE * nextHome;

  return { anchor: dominant ? leader.abbrev : null, ranked };
}
