/**
 * team-records.test.ts — pure unit tests for the perspective-anchored records.
 *
 * Run:  npx tsx src/lib/team-records.test.ts
 * (No test runner dependency — a tiny assert harness, matching the repo's
 *  zero-dev-dep helper-testing convention. Exits non-zero on the first failure.)
 */

import {
  neutralRecords,
  anchoredRecords,
  inferAnchor,
  formatRecord,
  type TeamRecordGame,
  type WLOTL,
} from './team-records';

// ── Tiny assert harness ──────────────────────────────────────────────────────
let passed = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error(`✗ FAIL: ${msg}`);
    process.exit(1);
  }
  passed += 1;
}
function eqRec(actual: WLOTL | undefined, w: number, l: number, otl: number, msg: string): void {
  assert(!!actual, `${msg} — record exists`);
  assert(
    actual!.w === w && actual!.l === l && actual!.otl === otl,
    `${msg} — expected ${w}-${l}-${otl}, got ${actual ? formatRecord(actual) : 'undefined'}`,
  );
}

// ── Fixture: the 15-game worked example from the spec doc ─────────────────────
// 12 Devils games + 3 neutral. `p` = last_period_type. Scores are away@home per
// the {away, home} fields. Anchor under test = NJD.
function g(
  away: string,
  awayScore: number,
  home: string,
  homeScore: number,
  p: string | null = 'REG',
): TeamRecordGame {
  const NAMES: Record<string, string> = {
    NJD: 'Devils', TOR: 'Maple Leafs', NYR: 'Rangers', PHI: 'Flyers',
    BOS: 'Bruins', CAR: 'Hurricanes', WSH: 'Capitals', PIT: 'Penguins',
  };
  return {
    homeAbbrev: home, homeName: NAMES[home] ?? home, homeScore,
    awayAbbrev: away, awayName: NAMES[away] ?? away, awayScore,
    isFinal: true, lastPeriodType: p,
  };
}

const SLATE: TeamRecordGame[] = [
  // vs TOR — NJD 2-1-1
  g('TOR', 2, 'NJD', 4), // NJD W (reg)
  g('TOR', 1, 'NJD', 3), // NJD W (reg)
  g('TOR', 2, 'NJD', 1), // NJD L (reg)
  g('TOR', 3, 'NJD', 2, 'OT'), // NJD OTL (TOR wins in OT)
  // vs NYR — NJD 2-1-0
  g('NYR', 2, 'NJD', 5), // NJD W
  g('NYR', 1, 'NJD', 3), // NJD W
  g('NYR', 4, 'NJD', 2), // NJD L (reg)
  // vs PHI — NJD 1-0-1
  g('PHI', 2, 'NJD', 3), // NJD W
  g('PHI', 3, 'NJD', 2, 'SO'), // NJD OTL (PHI wins in SO)
  // vs BOS — NJD 1-1-0
  g('BOS', 1, 'NJD', 4), // NJD W
  g('BOS', 3, 'NJD', 1), // NJD L (reg)
  // vs CAR — NJD 0-1-0
  g('CAR', 2, 'NJD', 1), // NJD L (reg)
  // ── 3 neutral games (NJD not playing) ──
  g('TOR', 1, 'BOS', 3), // BOS beats TOR
  g('WSH', 4, 'NYR', 2), // WSH beats NYR
  g('PIT', 1, 'NYR', 3), // NYR beats PIT
];

// ── Table A (anchored to NJD) ────────────────────────────────────────────────
{
  const a = anchoredRecords(SLATE, 'NJD');
  const opp = new Map(a.opponents.map((o) => [o.abbrev, o]));
  eqRec(opp.get('TOR'), 2, 1, 1, 'Table A vs TOR');
  eqRec(opp.get('NYR'), 2, 1, 0, 'Table A vs NYR');
  eqRec(opp.get('PHI'), 1, 0, 1, 'Table A vs PHI');
  eqRec(opp.get('BOS'), 1, 1, 0, 'Table A vs BOS');
  eqRec(opp.get('CAR'), 0, 1, 0, 'Table A vs CAR');
  eqRec(a.overall, 6, 4, 2, 'Table A — NJD overall');
  assert(a.neutralGames === 3, `Table A — expected 3 neutral games, got ${a.neutralGames}`);
  // Most-played opponent sorts first, PHI (OTL) ahead of BOS at equal games/wins.
  assert(a.opponents[0].abbrev === 'TOR', 'Table A — TOR sorts first');
  assert(
    a.opponents.map((o) => o.abbrev).join(',') === 'TOR,NYR,PHI,BOS,CAR',
    `Table A — opponent order, got ${a.opponents.map((o) => o.abbrev).join(',')}`,
  );
}

// ── Table B (neutral, both sides) ────────────────────────────────────────────
{
  const b = neutralRecords(SLATE);
  const rec = new Map(b.map((r) => [r.abbrev, r]));
  eqRec(rec.get('NJD'), 6, 4, 2, 'Table B — NJD');
  // The spec's "NJD 6-6" is exactly W wins and (L+OTL) total losses — the OTL
  // column simply refines those 6 losses into 4 reg + 2 overtime.
  assert(rec.get('NJD')!.w === 6 && rec.get('NJD')!.l + rec.get('NJD')!.otl === 6, 'Table B — NJD reconciles to 6-6');
  eqRec(rec.get('TOR'), 2, 3, 0, 'Table B — TOR');
  eqRec(rec.get('NYR'), 2, 3, 0, 'Table B — NYR');
  eqRec(rec.get('BOS'), 2, 1, 0, 'Table B — BOS');
  eqRec(rec.get('PHI'), 1, 1, 0, 'Table B — PHI');
  eqRec(rec.get('CAR'), 1, 0, 0, 'Table B — CAR');
  eqRec(rec.get('WSH'), 1, 0, 0, 'Table B — WSH');
  eqRec(rec.get('PIT'), 0, 1, 0, 'Table B — PIT');
  assert(b.length === 8, `Table B — expected 8 teams, got ${b.length}`);
  assert(b[0].abbrev === 'NJD', 'Table B — NJD (most games) sorts first');
}

// ── OTL only fires on OT/SO ───────────────────────────────────────────────────
{
  const regLoss = neutralRecords([g('NJD', 1, 'TOR', 4, 'REG')]);
  eqRec(regLoss.find((r) => r.abbrev === 'NJD'), 0, 1, 0, 'REG loss → L, not OTL');
  const otLoss = neutralRecords([g('NJD', 1, 'TOR', 2, 'OT')]);
  eqRec(otLoss.find((r) => r.abbrev === 'NJD'), 0, 0, 1, 'OT loss → OTL');
  const soLoss = neutralRecords([g('NJD', 1, 'TOR', 2, 'SO')]);
  eqRec(soLoss.find((r) => r.abbrev === 'NJD'), 0, 0, 1, 'SO loss → OTL');
  // A manual game with no OT signal (null period) never fabricates an OTL.
  const manualLoss = neutralRecords([{ ...g('NJD', 1, 'TOR', 2, null), isManual: true }]);
  eqRec(manualLoss.find((r) => r.abbrev === 'NJD'), 0, 1, 0, 'manual loss w/ no period → L, never OTL');
  // A manual game with a missing score credits nobody (never guesses a winner).
  const noScore = neutralRecords([{ ...g('NJD', 1, 'TOR', 2, null), homeScore: null, isManual: true }]);
  assert(noScore.length === 0, 'manual game missing a score → no records');
}

// ── Inference dominance guard ─────────────────────────────────────────────────
{
  // Strong single-team fan: NJD home 8 of 15 (53%) → inferred.
  const strong: TeamRecordGame[] = [];
  for (let i = 0; i < 8; i++) strong.push(g('TOR', 1, 'NJD', 2));
  for (let i = 0; i < 4; i++) strong.push(g('NJD', 1, 'NYR', 2));
  for (let i = 0; i < 3; i++) strong.push(g('BOS', 1, 'PHI', 2));
  assert(inferAnchor(strong).anchor === 'NJD', 'inference — dominant NJD is anchored');

  // Near-tie two-team fan: NJD home 5, NYR home 4, plus 11 other single-team
  // home games → NJD share 5/20 = 25% (< 40%) AND 5 < 2×4 → NO anchor.
  const nearTie: TeamRecordGame[] = [];
  for (let i = 0; i < 5; i++) nearTie.push(g('TOR', 1, 'NJD', 2));
  for (let i = 0; i < 4; i++) nearTie.push(g('TOR', 1, 'NYR', 2));
  const others = ['BOS', 'PHI', 'CAR', 'WSH', 'PIT', 'CHI', 'DET', 'STL', 'COL', 'DAL', 'MIN'];
  for (const t of others) nearTie.push(g('NJD', 1, t, 2));
  assert(nearTie.length === 20, `inference fixture size, got ${nearTie.length}`);
  assert(inferAnchor(nearTie).anchor === null, 'inference — near-tie two-team fan is NOT anchored');

  // 2× rule alone: NJD home 6, NYR home 3, total 9 → share 6/9=67% would already
  // pass, so isolate the multiple rule with a low share: NJD 4, NYR 2, + 9 others
  // = 15 games → NJD share 4/15=27% (<40%) but 4 ≥ 2×2 → anchored via multiple.
  const byMultiple: TeamRecordGame[] = [];
  for (let i = 0; i < 4; i++) byMultiple.push(g('TOR', 1, 'NJD', 2));
  for (let i = 0; i < 2; i++) byMultiple.push(g('TOR', 1, 'NYR', 2));
  for (const t of ['BOS', 'PHI', 'CAR', 'WSH', 'PIT', 'CHI', 'DET', 'STL', 'COL']) byMultiple.push(g('NJD', 1, t, 2));
  assert(inferAnchor(byMultiple).anchor === 'NJD', 'inference — 2× runner-up rule anchors NJD');
  // no-games → no anchor, no throw.
  assert(inferAnchor([]).anchor === null, 'inference — empty slate → no anchor');
}

console.log(`✓ all ${passed} assertions passed`);
