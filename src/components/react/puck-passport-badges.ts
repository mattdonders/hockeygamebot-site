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
  special_event?: string | null; // event name (Stadium Series/Winter Classic/…) or null
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
  /** One-line plain-language description of what earns this badge. Rendered as a
   *  mono gray sub-line under the badge name on both the card and the web list.
   *  MUST match the `earns` predicate below (write it from the criteria). */
  blurb: string;
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

/** Canonical period code + a clean display label. `otCount` drives the periods
 *  math (REG→0, OT/SO→1, 2OT→2, 3OT→3), so `periods = 3 + otCount`. This MUST
 *  stay byte-for-byte in sync with the backend's normalizePeriod (attended
 *  summary) — the server owns the logged-in numbers, this owns the logged-out
 *  ones, and the two can never disagree. */
export type PeriodCode = 'REG' | 'OT' | 'SO';
export interface NormalizedPeriod {
  code: PeriodCode;
  otCount: number;
  /** Human display: 'REG' | 'OT' | '2OT' | '3OT' | 'SO' — never a raw "20T". */
  label: string;
}

/** Normalize a raw last_period_type into {code, otCount, label}. Tolerant of the
 *  numbered playoff-OT forms ("2OT", "OT2", "3OT") and canonicalizes anything
 *  unexpected to REG so the UI never renders a raw period string verbatim. */
export function normalizePeriod(raw: string | null | undefined): NormalizedPeriod {
  const s = (raw ?? '').toUpperCase().trim();
  if (!s || s === 'REG' || s === 'REGULATION') return { code: 'REG', otCount: 0, label: 'REG' };
  if (s.includes('SO') || s === 'SHOOTOUT') return { code: 'SO', otCount: 1, label: 'SO' };
  if (s.includes('OT') || s.includes('OVERTIME')) {
    const m = s.match(/(\d+)/);
    let n = m ? parseInt(m[1], 10) : 1;
    if (!Number.isFinite(n) || n < 1) n = 1;
    return { code: 'OT', otCount: n, label: n > 1 ? `${n}OT` : 'OT' };
  }
  return { code: 'REG', otCount: 0, label: 'REG' };
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
    blurb: 'You watched Stanley Cup Playoff hockey, live.',
    rarityHint: '1 in 6',
    earns: (g) => typeDigits(g.game_id) === '03',
  },
  {
    id: 'preseason-game',
    label: 'Preseason Game',
    family: 'game-type',
    blurb: 'You watched hockey before the games counted.',
    rarityHint: '1 in 12',
    earns: (g) => typeDigits(g.game_id) === '01',
  },
  {
    // Mirror of the server 'special-event' badge (fires on box.specialEvent).
    // Local predicate is for the ghost-catalog empty state only — the server
    // owns the real computation (client games don't carry special_event).
    id: 'special-event',
    label: 'Special Event',
    family: 'game-type',
    blurb: 'You watched a special event — an outdoor game or Stadium Series.',
    rarityHint: '1 in 200',
    earns: (g) => g.special_event != null,
  },

  // ── In-game moments (box- / score-derived) ──
  {
    id: 'hat-trick',
    label: 'Hat Trick Seen',
    family: 'moment',
    blurb: 'You watched a player score a hat trick.',
    rarityHint: '1 in 8',
    earns: (_g, box) => anyPlayer(box, (p) => p.goals >= 3),
  },
  {
    id: 'four-goal-game',
    label: '4+ Goal Game',
    family: 'moment',
    blurb: 'You watched a player score four goals.',
    rarityHint: '1 in 60',
    earns: (_g, box) => anyPlayer(box, (p) => p.goals >= 4),
  },
  {
    id: 'gordie-howe',
    label: 'Gordie Howe Hat Trick',
    family: 'moment',
    blurb: 'You watched a player get a goal, an assist, and (likely) a fight.',
    rarityHint: '1 in 40',
    note: 'Estimated — a goal, an assist and 5+ PIM (fight heuristic, imperfect).',
    earns: (_g, box) => anyPlayer(box, (p) => p.goals >= 1 && p.assists >= 1 && p.pim >= 5),
  },
  {
    id: 'three-point-night',
    label: '3-Point Night',
    family: 'moment',
    blurb: 'You watched a player put up three points.',
    rarityHint: '1 in 4',
    earns: (_g, box) => anyPlayer(box, (p) => p.points >= 3),
  },
  {
    id: 'shutout',
    label: 'Shutout',
    family: 'moment',
    blurb: 'You watched a goalie post a shutout.',
    rarityHint: '1 in 11',
    earns: (g) => g.status === 'final' && (g.home.score === 0 || g.away.score === 0),
  },
  {
    id: 'ot-winner',
    label: 'OT Winner',
    family: 'moment',
    blurb: 'You watched a game decided in overtime.',
    rarityHint: '1 in 5',
    earns: (g) => normalizePeriod(g.last_period_type).code === 'OT',
  },
  {
    id: 'shootout',
    label: 'Shootout Decided',
    family: 'moment',
    blurb: 'You watched a game decided in a shootout.',
    rarityHint: '1 in 9',
    earns: (g) => normalizePeriod(g.last_period_type).code === 'SO',
  },
];

/** Blurb lookup by badge id — lets the server-summary catalog path (which does
 *  not carry blurbs over the wire) reuse the same one-liners as the local path,
 *  so both auth states render identical descriptions. */
const BLURB_BY_ID: Record<string, string> = Object.fromEntries(BADGES.map((b) => [b.id, b.blurb]));

export function badgeBlurb(id: string): string | undefined {
  return BLURB_BY_ID[id];
}

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

// ── Full catalog: earned + ghost (unearned) badges (Workstream B2, §2) ───────────

/** One entry in the FULL badge catalog — earned or not. Shared render shape for
 *  both the logged-in (server summary) and logged-out (client-computed) paths so
 *  the two states render identical chips (anti-divergence). */
export interface CatalogBadge {
  id: string;
  label: string;
  family: string; // 'game-type' | 'moment' (string: tolerant of server families)
  earned: boolean;
  count: number; // attended games satisfying it (0 when unearned)
  /** Computed "1 in N" over the user's own set (earned only; '' when unearned). */
  rarity: string;
  /** Static "1 in N" seed from config — the tease shown on ghost chips. */
  rarityHint: string;
  /** One-line description of the badge's criteria (mono gray sub-line). */
  blurb?: string;
  note?: string;
  total?: number; // rarity denominator (attended count), when known
  /** Numeric rarity for sorting: earned = total/count (higher ⇒ rarer); unearned
   *  = the hint's N. Populated by the builders below. */
  rarityRatio: number;
  /** Drill-down: the attended game(s) that earned this badge (newest-first from the
   *  server), with the qualifying player for the 4 player-moment badges. Present only
   *  on the logged-in/summary path for earned game/moment badges; absent for locked,
   *  tier and collection badges (a game is meaningless there). Drives the "which game
   *  earned this?" modal. */
  games?: {
    game_id: string;
    date: string;
    matchup: { away: string; home: string };
    player?: { id: number; name: string | null };
  }[];
}

/** Parse a "1 in N" rarity string → N (a bare number). Falls back to 1 for
 *  "every game"/empty so it never sorts a real badge to infinity. */
export function parseOneInN(s: string | undefined | null): number {
  if (!s) return 1;
  const m = s.match(/1\s*in\s*([\d.]+)/i);
  if (m) return Number(m[1]) || 1;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/** Build the FULL catalog (earned + unearned) client-side from BADGES — the
 *  logged-OUT path. Mirrors the server summary's `badges.catalog` shape so the
 *  UI is source-agnostic. Rarity is computed over the user's own attended set. */
export function buildLocalCatalog(
  games: BadgeGame[],
  boxByGameId: Record<string, BadgeBox | undefined>,
): CatalogBadge[] {
  const total = games.length;
  return BADGES.map((def) => {
    let count = 0;
    for (const g of games) {
      if (def.earns(g, boxByGameId[g.game_id])) count += 1;
    }
    const earned = count > 0;
    return {
      id: def.id,
      label: def.label,
      family: def.family,
      earned,
      count,
      rarity: earned ? formatRarity(count, total) : '',
      rarityHint: def.rarityHint,
      blurb: def.blurb,
      note: def.note,
      total,
      rarityRatio: earned && count > 0 ? total / count : parseOneInN(def.rarityHint),
    };
  });
}

/** Sort a catalog for display: EARNED first (rarest ⇒ highest ratio first), then
 *  UNEARNED ghost chips (most attainable ⇒ lowest hint-N first, as the chase). */
export function sortCatalog(cat: CatalogBadge[]): CatalogBadge[] {
  return [...cat].sort((a, b) => {
    if (a.earned !== b.earned) return a.earned ? -1 : 1;
    if (a.earned) return b.rarityRatio - a.rarityRatio; // rarest earned first
    return a.rarityRatio - b.rarityRatio; // attainable ghosts first
  });
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

/** Periods witnessed: 3 regulation + `otCount` (REG→0, OT/SO→1, 2OT→2, 3OT→3).
 *  normalizePeriod owns the parsing so multi-OT is counted, not undercounted. */
function periodsFor(g: BadgeGame): number {
  return 3 + normalizePeriod(g.last_period_type).otCount;
}

function matchupLabel(g: { away: { abbrev?: string }; home: { abbrev?: string } }): string {
  return `${g.away.abbrev ?? '?'} @ ${g.home.abbrev ?? '?'}`;
}

// ── Tiered milestone badges (cumulative stat ladders — Workstream: tiered badges) ─
//
// Spec: hgb-docs/docs/plans/puck-passport-tiered-badges-2026-07.md (approved
// 2026-07-24). Five CUMULATIVE stats, each with 5 rungs (thresholds below),
// sharing the naming ladder Rookie → Veteran → All-Star → Legend → Hall of Fame.
// Home rinks' top rung gets its own name ("The 32 Club") instead of Hall of
// Fame — a deliberately different flex (travel breadth, not volume).
//
// Ownership note (anti-divergence): UNLIKE the event badges above (which are
// per-game predicates), these are a pure bucketing of counters the summary
// ALREADY delivers as server-truth (`summary.counters` + `summary.arenas.
// home_rinks`). No new fact is computed here — only which of 5 static
// thresholds an already-server-owned number has crossed. Same category of
// client-side derivation as formatRarity() bucketing count/total above, which
// is why this stays client-side with no server change (see build report).

export type TierStatId = 'tier-games' | 'tier-goals' | 'tier-shots' | 'tier-players' | 'tier-arenas';

/** Rung I → V naming ladder, reused across the volume stats (Games/Goals/Shots/
 *  Players). Home rinks overrides Rung V with its own name (see TIER_STATS). */
const TIER_LADDER = ['Rookie', 'Veteran', 'All-Star', 'Legend', 'Hall of Fame'] as const;

export interface TierStatDef {
  id: TierStatId;
  label: string; // e.g. 'Games' — shown as the chip's top label
  /** The 5 rung thresholds, Rung I..V (value >= thresholds[i] ⇒ rung i+1 earned). */
  thresholds: readonly [number, number, number, number, number];
  /** Rung names, Rung I..V. Volume stats reuse TIER_LADDER; arenas overrides Rung V. */
  rungNames: readonly [string, string, string, string, string];
}

/** Thresholds calibrated to observed per-game rates (scope doc): Games/Goals/
 *  Shots/Players share the same games-equivalents (10/25/50/100/250) so a user
 *  levels up coherently across them; Arenas is a deliberately separate axis
 *  (travel breadth) capped at the real /32 collection. */
export const TIER_STATS: TierStatDef[] = [
  { id: 'tier-games', label: 'Games', thresholds: [10, 25, 50, 100, 250], rungNames: TIER_LADDER },
  { id: 'tier-goals', label: 'Goals', thresholds: [50, 150, 300, 600, 1500], rungNames: TIER_LADDER },
  { id: 'tier-shots', label: 'Shots', thresholds: [500, 1500, 3000, 6000, 15000], rungNames: TIER_LADDER },
  { id: 'tier-players', label: 'Players', thresholds: [100, 300, 600, 1000, 2000], rungNames: TIER_LADDER },
  {
    id: 'tier-arenas',
    label: 'Arenas',
    thresholds: [5, 10, 16, 24, 32],
    // Rung V (32/32) is its own name — "The 32 Club" — never "Hall of Fame".
    rungNames: ['Rookie', 'Veteran', 'All-Star', 'Legend', 'The 32 Club'],
  },
];

/** One tiered badge's render-ready view: the HIGHEST earned rung (one badge per
 *  stat, not five — per spec behavior), plus progress-to-next copy. */
export interface TierBadgeView {
  id: TierStatId;
  label: string;
  family: 'tier';
  earned: boolean; // rung >= 1 (Rung I reached)
  maxed: boolean; // rung 5 (top rung) reached — no "next" to chase
  rung: number; // 0..5 (0 = below Rung I, locked)
  /** Current rung's name (earned), or the Rung-I name as the chase target (locked). */
  rungName: string;
  value: number; // the raw counter value this badge is bucketed from
  nextThreshold: number | null; // null when maxed
  nextRungName: string | null; // null when maxed
  /** Ready-to-render second line, e.g. "312 / 600 to Legend" (earned), "7 / 10 to
   *  Rookie" (locked), or "1,500 goals" (maxed). The rung name is rendered separately
   *  on the chip, so it is NOT repeated here (kept short so narrow share-card rows
   *  don't truncate). */
  progress: string;
}

function formatCount(n: number): string {
  return n.toLocaleString('en-US');
}

/** Compute one tiered badge's view from a raw counter value. Pure + deterministic
 *  (see ownership note above) — no new fact is computed, only bucketing. */
export function computeTierBadge(def: TierStatDef, rawValue: number): TierBadgeView {
  const value = Math.max(0, Math.floor(rawValue || 0));
  let rung = 0;
  for (let i = 0; i < def.thresholds.length; i++) {
    if (value >= def.thresholds[i]) rung = i + 1;
  }
  const earned = rung > 0;
  const maxed = rung >= def.thresholds.length;
  // Locked (rung 0): the "chase" target is Rung I's name/threshold.
  const rungName = earned ? def.rungNames[rung - 1] : def.rungNames[0];
  const nextThreshold = maxed ? null : def.thresholds[rung]; // thresholds[rung] = next rung's bar
  const nextRungName = maxed ? null : def.rungNames[rung];

  // The rung name shows separately on the chip — do NOT repeat it here (it made the
  // earned/maxed line long enough to truncate on narrow share-card rows).
  let progress: string;
  if (maxed) {
    progress = `${formatCount(value)} ${def.label.toLowerCase()}`;
  } else if (earned) {
    progress = `${formatCount(value)} / ${formatCount(nextThreshold as number)} to ${nextRungName}`;
  } else {
    progress = `${formatCount(value)} / ${formatCount(nextThreshold as number)} to ${rungName}`;
  }

  return { id: def.id, label: def.label, family: 'tier', earned, maxed, rung, rungName, value, nextThreshold, nextRungName, progress };
}

/** Build all 5 tiered badges from the summary's counters + home rinks — ALWAYS
 *  one entry per stat (locked/ghost when rung 0), matching "one badge per stat"
 *  (never five per stat). Takes plain numbers so both the server-summary path
 *  and the empty/logged-out path (zeros) share this one builder. */
export function computeTierBadges(
  counters: { games: number; goals: number; shots: number; players_seen: number },
  homeRinks: number,
): TierBadgeView[] {
  const valueById: Record<TierStatId, number> = {
    'tier-games': counters.games,
    'tier-goals': counters.goals,
    'tier-shots': counters.shots,
    'tier-players': counters.players_seen,
    'tier-arenas': homeRinks,
  };
  return TIER_STATS.map((def) => computeTierBadge(def, valueById[def.id]));
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
      const np = normalizePeriod(best.last_period_type);
      const tag = np.code === 'REG' ? '' : ` (${np.label})`;
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
