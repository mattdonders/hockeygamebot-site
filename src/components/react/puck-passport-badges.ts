/**
 * Puck Passport — badge + single-game-record definitions (Workstream 3).
 *
 * Per the scope doc (§4d): badges are CODE/CONFIG, not a DB table — pure
 * predicates over data the client ALREADY has in memory (game_results facts,
 * last_period_type, game_id digits, and the per-game box score). NO new
 * per-game network fetch is introduced here.
 *
 * FAIL-LOUD contract: moment badges depend on the box score. When a game's box
 * is not hydrated yet, its predicate returns `false` — the badge simply does not
 * fire for that game, rather than being counted wrong from missing data.
 *
 * DEFERRED (need data the client does not currently have — see report):
 *   Season Opener, Road Game, Comeback Win, Biggest-WP-Swing, Milestone
 *   Witnessed, and all Award/HOF badges (explicitly v2).
 */

// ── Structural inputs (satisfied by AttendedTracker's own types) ────────────────

/** Minimal game shape a predicate reads. AttendedGame is a structural superset. */
export interface BadgeGame {
  game_id: string;
  status: string; // 'final' | …
  last_period_type: string | null; // REG | OT | SO | (playoff OT variants)
  home: { score: number };
  away: { score: number };
  venue: string | null;
}

/** One player's box-score line as needed for moment badges + records. */
export interface BadgePlayer {
  id: number;
  name: string;
  team: string;
  goals: number;
  assists: number;
  points: number;
  pim: number;
  sog: number;
}

/** Per-game derived box score. `undefined` ⇒ not hydrated (predicates fail-safe). */
export interface BadgeBox {
  players: BadgePlayer[];
}

export type BadgeFamily = 'game-type' | 'moment';

export interface BadgeDef {
  id: string;
  label: string;
  family: BadgeFamily;
  /** Rough "1 in N games" seed from the scope doc; the UI shows the *computed*
   *  rarity from the user's own set, this is only a fallback hint. */
  rarityHint: string;
  /** Honest caveat surfaced under the chip (e.g. the Gordie-Howe PIM heuristic). */
  note?: string;
  /** Does THIS single game earn the badge? `box` is undefined when un-hydrated. */
  earns: (game: BadgeGame, box: BadgeBox | undefined) => boolean;
}

// ── Small parse helpers ─────────────────────────────────────────────────────────

/** NHL game_id is SSSSTTNNNN — digits 5–6 are the game-type. */
function typeDigits(gameId: string): string {
  return gameId.slice(4, 6);
}

function periodType(g: BadgeGame): string {
  return (g.last_period_type ?? '').toUpperCase();
}

function anyPlayer(box: BadgeBox | undefined, pred: (p: BadgePlayer) => boolean): boolean {
  if (!box) return false; // FAIL-SAFE: un-hydrated box never fires a moment badge.
  return box.players.some(pred);
}

// ── Badge config ────────────────────────────────────────────────────────────────

export const BADGES: BadgeDef[] = [
  // ── Game-type (id-derived, always evaluable — no box needed) ──
  {
    id: 'playoff-game',
    label: 'Playoff Game',
    family: 'game-type',
    rarityHint: '1 in 6',
    earns: (g) => typeDigits(g.game_id) === '03',
  },
  {
    id: 'preseason-game',
    label: 'Preseason Game',
    family: 'game-type',
    rarityHint: '1 in 12',
    earns: (g) => typeDigits(g.game_id) === '01',
  },

  // ── In-game moments (box- / score-derived) ──
  {
    id: 'hat-trick',
    label: 'Hat Trick Seen',
    family: 'moment',
    rarityHint: '1 in 8',
    earns: (_g, box) => anyPlayer(box, (p) => p.goals >= 3),
  },
  {
    id: 'four-goal-game',
    label: '4+ Goal Game',
    family: 'moment',
    rarityHint: '1 in 60',
    earns: (_g, box) => anyPlayer(box, (p) => p.goals >= 4),
  },
  {
    id: 'gordie-howe',
    label: 'Gordie Howe Hat Trick',
    family: 'moment',
    rarityHint: '1 in 40',
    note: 'Estimated — a goal, an assist and 5+ PIM (fight heuristic, imperfect).',
    earns: (_g, box) => anyPlayer(box, (p) => p.goals >= 1 && p.assists >= 1 && p.pim >= 5),
  },
  {
    id: 'three-point-night',
    label: '3-Point Night',
    family: 'moment',
    rarityHint: '1 in 4',
    earns: (_g, box) => anyPlayer(box, (p) => p.points >= 3),
  },
  {
    id: 'shutout',
    label: 'Shutout',
    family: 'moment',
    rarityHint: '1 in 11',
    earns: (g) => g.status === 'final' && (g.home.score === 0 || g.away.score === 0),
  },
  {
    id: 'ot-winner',
    label: 'OT Winner',
    family: 'moment',
    rarityHint: '1 in 5',
    earns: (g) => periodType(g) === 'OT',
  },
  {
    id: 'shootout',
    label: 'Shootout Decided',
    family: 'moment',
    rarityHint: '1 in 9',
    earns: (g) => periodType(g) === 'SO',
  },
];

// ── Earned-badge computation ────────────────────────────────────────────────────

export interface EarnedBadge {
  def: BadgeDef;
  count: number; // attended games satisfying it
  total: number; // total attended games (rarity denominator)
  rarity: string; // computed "1 in N" over the user's own set
}

/** Compute rarity as the share of the user's attended games that qualify —
 *  "1 in N games" per §2b. Honest at the extremes. */
export function formatRarity(count: number, total: number): string {
  if (total <= 0 || count <= 0) return '';
  if (count >= total) return 'every game';
  const ratio = total / count;
  const n = ratio >= 9.5 ? String(Math.round(ratio)) : ratio.toFixed(1).replace(/\.0$/, '');
  return `1 in ${n}`;
}

/** Evaluate every badge over the attended set. Returns only EARNED badges
 *  (count > 0), preserving BADGES config order. */
export function computeEarnedBadges(
  games: BadgeGame[],
  boxByGameId: Record<string, BadgeBox | undefined>,
): EarnedBadge[] {
  const total = games.length;
  const earned: EarnedBadge[] = [];
  for (const def of BADGES) {
    let count = 0;
    for (const g of games) {
      if (def.earns(g, boxByGameId[g.game_id])) count += 1;
    }
    if (count > 0) earned.push({ def, count, total, rarity: formatRarity(count, total) });
  }
  return earned;
}

// ── Single-game records (extremes across the attended set — §2c) ────────────────

export interface GameRecord {
  key: string;
  label: string;
  value: string; // headline extreme (e.g. "9 goals", "4 points")
  sub: string; // context line (matchup + date/score)
  /** Player records carry the id so the component can upgrade the box-score
   *  "F. Last" name to "First Last" via its nameMap (players.json). */
  playerId?: number;
  /** Fallback player name (box-score form) when the id isn't in the nameMap. */
  playerName?: string;
}

/** Periods witnessed: 3 regulation + 1 for OT/SO. Playoff multi-OT undercounts
 *  here — the same caveat as the periods counter (documented, not silent). */
function periodsFor(g: BadgeGame): number {
  const pt = periodType(g);
  return 3 + (pt === 'OT' || pt === 'SO' ? 1 : 0);
}

function matchupLabel(g: { away: { abbrev?: string }; home: { abbrev?: string } }): string {
  return `${g.away.abbrev ?? '?'} @ ${g.home.abbrev ?? '?'}`;
}

/** The record inputs carry a bit more than BadgeGame (team abbrevs + date) so the
 *  "sub" line can name the matchup. Structurally satisfied by AttendedGame. */
export interface RecordGame extends BadgeGame {
  date: string;
  home: { score: number; abbrev: string };
  away: { score: number; abbrev: string };
}

export function computeRecords(
  games: RecordGame[],
  boxByGameId: Record<string, BadgeBox | undefined>,
): GameRecord[] {
  if (games.length === 0) return [];
  const records: GameRecord[] = [];

  // Longest game (most periods) — across all games.
  {
    let best: RecordGame | null = null;
    let bestP = -1;
    for (const g of games) {
      const p = periodsFor(g);
      if (p > bestP) {
        bestP = p;
        best = g;
      }
    }
    if (best) {
      const pt = periodType(best);
      const tag = pt === 'OT' ? ' (OT)' : pt === 'SO' ? ' (SO)' : '';
      records.push({
        key: 'longest',
        label: 'Longest Game',
        value: `${bestP} periods${tag}`,
        sub: `${matchupLabel(best)} · ${best.date}`,
      });
    }
  }

  // Highest / lowest scoring — final games only (a live/scheduled game has no
  // meaningful total yet).
  const finals = games.filter((g) => g.status === 'final');
  if (finals.length > 0) {
    let hi = finals[0];
    let lo = finals[0];
    let hiT = hi.home.score + hi.away.score;
    let loT = lo.home.score + lo.away.score;
    for (const g of finals) {
      const t = g.home.score + g.away.score;
      if (t > hiT) {
        hiT = t;
        hi = g;
      }
      if (t < loT) {
        loT = t;
        lo = g;
      }
    }
    records.push({
      key: 'highest',
      label: 'Highest Scoring',
      value: `${hiT} goals`,
      sub: `${matchupLabel(hi)} ${hi.away.score}–${hi.home.score} · ${hi.date}`,
    });
    records.push({
      key: 'lowest',
      label: 'Lowest Scoring',
      value: `${loT} goals`,
      sub: `${matchupLabel(lo)} ${lo.away.score}–${lo.home.score} · ${lo.date}`,
    });
  }

  // Player extremes — need a hydrated box. Skip cleanly if no box data exists.
  type Best = { value: number; player: BadgePlayer; game: RecordGame } | null;
  let bestGoals: Best = null;
  let bestPoints: Best = null;
  let bestShots: Best = null;
  const consider = (cur: Best, value: number, player: BadgePlayer, game: RecordGame): Best =>
    !cur || value > cur.value ? { value, player, game } : cur;

  for (const g of games) {
    const box = boxByGameId[g.game_id];
    if (!box) continue;
    for (const p of box.players) {
      bestGoals = consider(bestGoals, p.goals, p, g);
      bestPoints = consider(bestPoints, p.points, p, g);
      bestShots = consider(bestShots, p.sog, p, g);
    }
  }

  // Player records carry playerId + the box-score name; the component resolves
  // the id to "First Last" via nameMap and composes the sub as "Name · matchup".
  if (bestGoals && bestGoals.value > 0) {
    records.push({
      key: 'player-goals',
      label: 'Most Goals · Player',
      value: `${bestGoals.value} goals`,
      sub: matchupLabel(bestGoals.game),
      playerId: bestGoals.player.id,
      playerName: bestGoals.player.name,
    });
  }
  if (bestPoints && bestPoints.value > 0) {
    records.push({
      key: 'player-points',
      label: 'Most Points · Player',
      value: `${bestPoints.value} pts`,
      sub: matchupLabel(bestPoints.game),
      playerId: bestPoints.player.id,
      playerName: bestPoints.player.name,
    });
  }
  if (bestShots && bestShots.value > 0) {
    records.push({
      key: 'player-shots',
      label: 'Most Shots · Player',
      value: `${bestShots.value} shots`,
      sub: matchupLabel(bestShots.game),
      playerId: bestShots.player.id,
      playerName: bestShots.player.name,
    });
  }

  return records;
}
