/**
 * AttendedTracker — "Games I've Attended" tracker (Puck Passport).
 *
 * Two data sources, ONE set of UI components (anti-divergence):
 *
 *   Logged OUT — the attended LIST lives in localStorage, and every aggregate
 *   (counters, team records, arenas, players-seen, records, badges) is COMPUTED
 *   client-side from public data:
 *     - Game lookup / add flow  →  GET /v1/games/today?date=YYYY-MM-DD
 *     - Per-game player stats    →  GET /v1/games/{id}/boxscore  (NHL API proxy)
 *
 *   Logged IN — the list still comes from D1 (GET /v1/account/attended), but the
 *   dashboard aggregates render FROM the server summary
 *   (GET /v1/account/attended/summary) rather than recomputing client-side. The
 *   server owns the numbers so web + iOS + share card can never disagree. The
 *   summary also carries the Milestones-Witnessed feed the web now surfaces.
 *   Box scores are NOT fetched in this state (the summary already has Shots +
 *   Players-Seen) unless the summary fetch FAILS, in which case we fall back to
 *   the client compute so the dashboard is never blanked.
 *
 * Badges (§2) render the FULL catalog either way: earned first (rarest-first)
 * then unearned "ghost" chips as the collection/chase tease.
 *
 * House rule — FAIL LOUD: summary / box-score / stats fetch failures are surfaced
 * in an honest banner and per-counter warning markers, never silently shown as 0.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import HGBTable, { type HGBColumnDef, NAME_FONT_SIZE, CELL_FONT_SIZE } from './HGBTable';
import { pickTeamColor } from '../../lib/team-colors';
import { NHL_TEAMS, NHL_TEAM_NAMES } from '../../lib/nhl-teams';
import { getMe, getSessionToken, apiFetch } from '../../lib/auth-client';
import {
  computeRecords,
  buildLocalCatalog,
  sortCatalog,
  parseOneInN,
  normalizePeriod,
  badgeBlurb,
  type BadgeBox,
  type CatalogBadge,
  type GameRecord,
} from './puck-passport-badges';
import { drawPassportCard, type PassportShareData } from './puck-passport-share';

const API = 'https://api.hockeygamebot.com';
const STORAGE_KEY = 'hgb_puck_passport_games';
// v4: box cache now also carries the canonical `periodType` folded from
// gameOutcome.otPeriods (so a logged-out 2OT/3OT game counts its true periods —
// the lookup endpoint only gives a bare "OT"). Bumping the key forces cached v3
// entries (which lack periodType) to re-derive rather than undercount (FAIL LOUD).
const BOX_CACHE_KEY = 'hgb_puck_passport_boxcache_v4';
// Display snapshot cache (venue, period type, team abbrev/name/score) keyed by
// game_id. This is what lets the logged-in D1 list — which carries only team
// *ids* and no venue — still render arenas + OT/SO chips on the device that
// logged the game. Cross-device games fall back to /v1/config + game_results.
const DETAILS_KEY = 'hgb_puck_passport_details_v1';

// ── Types ─────────────────────────────────────────────────────────────────────

type TeamSide = { id: number; abbrev: string; name: string; score: number };

/** The persisted shape — enough to render list/counters/team-WL/arenas with zero
 *  network. Shots + Players Seen still need the box score (fetched + cached). */
type AttendedGame = {
  game_id: string;
  date: string; // YYYY-MM-DD (hockey date)
  home: TeamSide;
  away: TeamSide;
  venue: string | null;
  last_period_type: string | null; // REG | OT | SO | (playoff OT variants)
  status: string;
  added_at: string; // ISO
};

/** A single player as seen in one game's box score. Carries the full stat line
 *  the moment-badges + player records read (assists/points/pim/sog), not just
 *  goals. */
type BoxPlayer = {
  id: number;
  name: string;
  pos: string;
  team: string;
  goals: number;
  assists: number;
  points: number;
  pim: number;
  sog: number;
};

/** Derived-from-boxscore, cached per (final) game_id — finals are immutable.
 *  `periodType` is the canonical stored form ("REG"|"OT"|"2OT"|"3OT"|"SO") folded
 *  from gameOutcome (incl. the multi-OT count the lookup endpoint omits); null for
 *  non-final games, which have no meaningful outcome yet. */
type BoxDerived = { shots: number; players: BoxPlayer[]; periodType: string | null };

/** One row from the (now hydrated) GET /v1/account/attended — the attendance
 *  record LEFT JOINed to game_results. Game facts are null for games with no
 *  game_results row yet (e.g. older seasons). */
type D1AttendedRow = {
  game_id: string;
  rooted_for: number | null;
  notes: string | null;
  source: string;
  created_at: string;
  game_date: string | null;
  home_team_id: number | null;
  away_team_id: number | null;
  home_score: number | null;
  away_score: number | null;
  is_final: number | null;
  venue: string | null;
  last_period_type: string | null; // REG | OT | SO | (playoff OT variants)
};

/** team_id → abbrev/name, from GET /v1/config. */
type TeamInfo = { abbrev: string; name: string };

// ── Server summary (logged-in source of truth) ──────────────────────────────────
// GET /v1/account/attended/summary. When logged in the whole dashboard renders
// FROM this payload rather than recomputing client-side (anti-divergence): the
// server owns the aggregates so the web + iOS + share card can never disagree.

/** One server-computed single-game record. `sub` is the context line; `name` is
 *  pre-resolved server-side (no client "F. Last" upgrade needed). */
type SummaryRecord = {
  label: string;
  value: string;
  sub: string;
  game_id?: string;
  player_id?: number;
  name?: string;
} | null;

type SummaryMilestone = {
  game_id: string;
  game_date: string;
  player_id: number;
  player_name: string;
  team_id: number;
  team_abbrev: string;
  stat: string;
  target_value: number;
  label: string;
  achieved_at: string;
};

type AttendedSummary = {
  counters: { games: number; periods: number; goals: number; shots: number; players_seen: number };
  team_records: { abbrev: string; name: string; w: number; l: number }[];
  arenas: { visited: number; total: number; list: { venue: string; count: number }[]; unknown: number };
  players_seen: {
    player_id: number;
    name: string | null;
    team: string;
    pos: string;
    games: number;
    goals: number;
  }[];
  records: {
    longest_game?: SummaryRecord;
    highest_scoring?: SummaryRecord;
    lowest_scoring?: SummaryRecord;
    most_goals?: SummaryRecord;
    most_points?: SummaryRecord;
    most_shots?: SummaryRecord;
  };
  badges: {
    earned: { id: string; label: string; family: string; count: number; rarity: string; note?: string }[];
    catalog: {
      id: string;
      label: string;
      family: string;
      earned: boolean;
      count: number;
      rarity: string;
      rarity_hint: string;
      note?: string;
      total?: number;
    }[];
  };
  milestones: SummaryMilestone[];
  box_incomplete: boolean;
  missing_box_game_ids: string[];
};

/** A single-game record normalized for render — the same shape whether it came
 *  from the server summary or the client `computeRecords` path. */
type ViewRecord = { key: string; label: string; value: string; sub: string };

// Raw shapes from /v1/games/today
type RawTeam = { id: number; abbrev: string; name: string; score: number };
type RawGame = {
  game_id: string;
  date: string;
  home_team: RawTeam;
  away_team: RawTeam;
  venue: string | null;
  last_period_type: string | null;
  status: string;
};

// ── Add-flow shared helpers ─────────────────────────────────────────────────────

/** Map a raw `{ games: [...] }` payload (from /v1/games/today OR /v1/games/by-team,
 *  which share a shape) into the RawGame list the add pipeline consumes. */
function toRawGames(data: any): RawGame[] {
  return (Array.isArray(data?.games) ? data.games : []).map((g: any) => ({
    game_id: g.game_id,
    date: g.date,
    home_team: g.home_team,
    away_team: g.away_team,
    venue: g.venue ?? null,
    last_period_type: g.last_period_type ?? null,
    status: g.status,
  }));
}

type SeasonOption = { value: string; label: string };

/** Recent NHL seasons, newest first, back to 2010-11. The current season is the
 *  one whose October start has passed (offseason ⇒ the most recently played). */
function buildSeasonOptions(): SeasonOption[] {
  const now = new Date();
  // NHL seasons open in October (month index 9). Before then, "current" is prior.
  const startYear = now.getMonth() >= 9 ? now.getFullYear() : now.getFullYear() - 1;
  const out: SeasonOption[] = [];
  for (let y = startYear; y >= 2010; y--) {
    out.push({ value: `${y}${y + 1}`, label: `${y}-${String(y + 1).slice(2)}` });
  }
  return out;
}

/** Does a game's final score match a loose "5-4" style filter? Order-independent
 *  (fans don't recall which side); a single number matches either team's score.
 *  Only finals carry a meaningful score, so non-finals never match a score query. */
function scoreMatches(g: RawGame, raw: string): boolean {
  const nums = raw.match(/\d+/g);
  if (!nums || nums.length === 0) return true; // empty filter = pass-through
  if (g.status !== 'final') return false;
  const want = nums.map(Number);
  const have = [g.away_team.score, g.home_team.score];
  if (want.length === 1) return have.includes(want[0]);
  const [a, b] = want;
  return (have[0] === a && have[1] === b) || (have[0] === b && have[1] === a);
}

// ── localStorage helpers ────────────────────────────────────────────────────────

function readAttended(): AttendedGame[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function writeAttended(games: AttendedGame[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(games));
  } catch {
    /* private mode / quota — nothing we can do; UI still reflects in-memory state */
  }
}

function readBoxCache(): Record<string, BoxDerived> {
  try {
    const raw = JSON.parse(localStorage.getItem(BOX_CACHE_KEY) ?? '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

function writeBoxCache(cache: Record<string, BoxDerived>): void {
  try {
    localStorage.setItem(BOX_CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* ignore */
  }
}

function readDetails(): Record<string, AttendedGame> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = JSON.parse(localStorage.getItem(DETAILS_KEY) ?? '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

function writeDetails(cache: Record<string, AttendedGame>): void {
  try {
    localStorage.setItem(DETAILS_KEY, JSON.stringify(cache));
  } catch {
    /* ignore */
  }
}

// ── D1 (logged-in) source ─────────────────────────────────────────────────────

/** GET /v1/account/attended → hydrated rows, or null on any failure (FAIL LOUD:
 *  the caller surfaces a banner rather than rendering an empty list as truth). */
async function fetchD1Attended(): Promise<D1AttendedRow[] | null> {
  try {
    const r = await apiFetch(`${API}/v1/account/attended`);
    if (!r.ok) return null;
    const data = await r.json();
    if (!data || data.error || !Array.isArray(data.attended)) return null;
    return data.attended as D1AttendedRow[];
  } catch {
    return null;
  }
}

/** POST /v1/account/attended (upsert). Returns true on success. */
async function postAttended(gameId: string): Promise<boolean> {
  try {
    const r = await apiFetch(`${API}/v1/account/attended`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game_id: gameId }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

/** Map a hydrated D1 row → the render shape. Prefers fresh game_results facts,
 *  falling back to the local display snapshot (venue, OT/SO, or older games with
 *  no game_results row) and finally /v1/config for team abbrev/name. */
function mapD1Row(
  r: D1AttendedRow,
  configMap: Map<number, TeamInfo>,
  details: Record<string, AttendedGame>,
): AttendedGame {
  const snap = details[r.game_id];
  const side = (id: number | null, score: number | null, snapSide?: TeamSide): TeamSide => {
    const info = id != null ? configMap.get(id) : undefined;
    return {
      id: id ?? snapSide?.id ?? 0,
      abbrev: info?.abbrev ?? snapSide?.abbrev ?? (id != null ? String(id) : '?'),
      name: info?.name ?? snapSide?.name ?? '',
      score: score ?? snapSide?.score ?? 0,
    };
  };
  const isFinal = r.is_final != null ? !!r.is_final : snap?.status === 'final';
  return {
    game_id: r.game_id,
    date: r.game_date ?? snap?.date ?? '',
    home: side(r.home_team_id, r.home_score, snap?.home),
    away: side(r.away_team_id, r.away_score, snap?.away),
    // Prefer the server's game_results facts (cross-device / after a cache
    // clear the local snapshot is absent); fall back to the local snapshot.
    venue: r.venue ?? snap?.venue ?? null,
    last_period_type: r.last_period_type ?? snap?.last_period_type ?? null,
    status: isFinal ? 'final' : snap?.status ?? 'scheduled',
    added_at: r.created_at ?? snap?.added_at ?? '',
  };
}

// ── Small derivations ───────────────────────────────────────────────────────────

/** Periods witnessed: 3 regulation + `otCount` (REG→0, OT/SO→1, 2OT→2, 3OT→3).
 *  normalizePeriod (shared with the badge module + backend) owns the parsing. */
function periodsFor(g: AttendedGame): number {
  return 3 + normalizePeriod(g.last_period_type).otCount;
}

function winnerAbbrev(g: AttendedGame): string | null {
  if (g.status !== 'final') return null;
  if (g.home.score > g.away.score) return g.home.abbrev;
  if (g.away.score > g.home.score) return g.away.abbrev;
  return null;
}

/** Parse NHL game_id: SSSSTTNNNN → game-type digit pair. */
function gameTypeLabel(gameId: string): string {
  const tt = gameId.slice(4, 6);
  if (tt === '01') return 'PRE';
  if (tt === '03') return 'PLAYOFF';
  return ''; // 02 regular — no chip
}

// ── Box-score fetch → derived {shots, players[]} ─────────────────────────────────

/** NHL box-score player names come as `{ name: { default: "Jack Hughes" } }`, but
 *  older shapes carry firstName/lastName objects — cover both. */
function playerName(p: any): string {
  const nm = p?.name?.default ?? (typeof p?.name === 'string' ? p.name : null);
  if (nm) return nm;
  const first = p?.firstName?.default ?? p?.firstName ?? '';
  const last = p?.lastName?.default ?? p?.lastName ?? '';
  const joined = `${first} ${last}`.trim();
  return joined || `#${p?.playerId ?? '?'}`;
}

/** Fold a boxscore's `gameOutcome` into the canonical stored period type
 *  ("REG"|"OT"|"2OT"|"3OT"|"SO") that normalizePeriod expects. The game-lookup
 *  endpoint only carries a bare "OT" (no overtime count), so a multi-OT game's
 *  true period total is ONLY recoverable here, from `gameOutcome.otPeriods`
 *  (verified: 2019030415 → lastPeriodType "OT", otPeriods 2). Only final games
 *  carry a meaningful outcome; non-final ⇒ null (don't fabricate). normalizePeriod
 *  stays the single source of the code/label logic — this only picks the count. */
function canonicalPeriodFromBox(box: any): string | null {
  const state = String(box?.gameState ?? '').toUpperCase();
  const isFinal = state === 'OFF' || state === 'FINAL' || state === 'OVER';
  if (!isFinal) return null;
  const outcome = box?.gameOutcome ?? {};
  const np = normalizePeriod(outcome.lastPeriodType);
  if (np.code === 'SO') return 'SO';
  if (np.code === 'REG') return 'REG';
  // OT: fold the count from otPeriods (1 ⇒ "OT", 2 ⇒ "2OT", 3 ⇒ "3OT", …).
  const ot = typeof outcome.otPeriods === 'number' ? outcome.otPeriods : 1;
  return ot >= 2 ? `${ot}OT` : 'OT';
}

function deriveFromBoxscore(box: any): BoxDerived {
  const players: BoxPlayer[] = [];
  let shots = 0;
  const pbg = box?.playerByGameStats ?? {};
  const abbrevFor: Record<string, string> = {
    homeTeam: box?.homeTeam?.abbrev ?? '',
    awayTeam: box?.awayTeam?.abbrev ?? '',
  };
  for (const sideKey of ['homeTeam', 'awayTeam']) {
    const side = pbg[sideKey] ?? {};
    for (const groupKey of ['forwards', 'defense', 'goalies']) {
      const group = Array.isArray(side[groupKey]) ? side[groupKey] : [];
      for (const p of group) {
        if (typeof p?.playerId !== 'number') continue;
        const goals = typeof p?.goals === 'number' ? p.goals : 0;
        const assists = typeof p?.assists === 'number' ? p.assists : 0;
        const sog = typeof p?.sog === 'number' ? p.sog : 0; // goalies have no sog
        players.push({
          id: p.playerId,
          name: playerName(p),
          pos: p?.position ?? '',
          team: abbrevFor[sideKey],
          goals,
          assists,
          points: typeof p?.points === 'number' ? p.points : goals + assists,
          pim: typeof p?.pim === 'number' ? p.pim : 0,
          sog,
        });
        shots += sog;
      }
    }
  }
  return { shots, players, periodType: canonicalPeriodFromBox(box) };
}

// ── Players-seen aggregate row (games seen + goals) ──────────────────────────────

type SeenPlayerRow = {
  player_id: number;
  name: string;
  team: string;
  pos: string;
  gamesSeen: number;
  goals: number;
};

// ── Summary → render-shape mappers (logged-in path) ─────────────────────────────

/** Map a server catalog entry → the shared CatalogBadge shape (§2). */
function mapSummaryCatalog(c: AttendedSummary['badges']['catalog'][number]): CatalogBadge {
  const ratio =
    c.earned && c.count > 0 && c.total ? c.total / c.count : parseOneInN(c.rarity_hint);
  return {
    id: c.id,
    label: c.label,
    family: c.family,
    earned: !!c.earned,
    count: c.count ?? 0,
    rarity: c.rarity ?? '',
    rarityHint: c.rarity_hint ?? '',
    // Blurbs are code/config, not carried over the wire — reuse the same
    // one-liners the local catalog uses so both auth states read identically.
    blurb: badgeBlurb(c.id),
    note: c.note,
    total: c.total,
    rarityRatio: ratio,
  };
}

/** Fixed display order for the summary's keyed records, mapped to the same record
 *  keys the client path + share card use (so downstream logic is source-agnostic). */
const SUMMARY_RECORD_ORDER: { field: keyof AttendedSummary['records']; key: string }[] = [
  { field: 'longest_game', key: 'longest' },
  { field: 'highest_scoring', key: 'highest' },
  { field: 'lowest_scoring', key: 'lowest' },
  { field: 'most_goals', key: 'player-goals' },
  { field: 'most_points', key: 'player-points' },
  { field: 'most_shots', key: 'player-shots' },
];

/** Normalize the summary's keyed records object → an ordered ViewRecord[] (nulls
 *  dropped). Player records prefix the pre-resolved name onto the context line,
 *  matching the client path's "Name · matchup" composition. */
function summaryRecordsToView(recs: AttendedSummary['records']): ViewRecord[] {
  const out: ViewRecord[] = [];
  for (const { field, key } of SUMMARY_RECORD_ORDER) {
    const r = recs[field];
    if (!r) continue;
    out.push({ key, label: r.label, value: r.value, sub: r.name ? `${r.name} · ${r.sub}` : r.sub });
  }
  return out;
}

// ── Counter card ─────────────────────────────────────────────────────────────────

function Counter({
  label,
  value,
  pending,
  warn,
}: {
  label: string;
  value: number | string;
  pending?: boolean;
  warn?: boolean;
}) {
  return (
    <div className="att-counter">
      <div className="att-counter-num">
        {pending ? <span className="att-counter-pending">…</span> : value}
        {warn && !pending ? (
          <span className="att-counter-warn" title="Some box scores could not be loaded — this figure may be incomplete.">
            !
          </span>
        ) : null}
      </div>
      <div className="att-counter-label">{label}</div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────────

export default function AttendedTracker() {
  // Source of the attended LIST depends on auth:
  //   logged-OUT → localGames (localStorage, Phase 0 behavior).
  //   logged-IN  → d1Rows (GET /v1/account/attended), mapped via config + details.
  // The derived `games` below is the single render source either way.
  const [localGames, setLocalGames] = useState<AttendedGame[]>([]);
  const [d1Rows, setD1Rows] = useState<D1AttendedRow[] | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [configMap, setConfigMap] = useState<Map<number, TeamInfo>>(new Map());
  const detailsRef = useRef<Record<string, AttendedGame>>({});
  const [detailsVersion, setDetailsVersion] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const [d1Error, setD1Error] = useState(false); // FAIL LOUD: D1 list failed to load
  const [writeError, setWriteError] = useState<string | null>(null); // add/remove/sync failed

  // Server summary (logged-in source of truth). null + summaryError ⇒ FAIL LOUD:
  // banner + client-side fallback compute so the dashboard is never blanked.
  const [summary, setSummary] = useState<AttendedSummary | null>(null);
  const [summaryError, setSummaryError] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);

  /** Fetch (or refetch) the authed summary. FAIL LOUD on any failure: clears the
   *  payload and flags the error so the render falls back to client compute. */
  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const r = await apiFetch(`${API}/v1/account/attended/summary`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      if (!data || data.error || !data.counters || !data.badges) throw new Error('bad summary payload');
      setSummary(data as AttendedSummary);
      setSummaryError(false);
    } catch {
      setSummary(null);
      setSummaryError(true);
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  const commitDetail = useCallback((g: AttendedGame) => {
    detailsRef.current[g.game_id] = g;
    writeDetails(detailsRef.current);
    setDetailsVersion((v) => v + 1);
  }, []);

  // Single render source: mapped D1 rows when logged in, else localStorage list.
  const games = useMemo<AttendedGame[]>(() => {
    if (isLoggedIn) return (d1Rows ?? []).map((r) => mapD1Row(r, configMap, detailsRef.current));
    return localGames;
    // detailsVersion forces a recompute when a display snapshot is written.
  }, [isLoggedIn, d1Rows, localGames, configMap, detailsVersion]);

  // Box-score derived counters
  const boxCacheRef = useRef<Record<string, BoxDerived>>({});
  const [boxDerived, setBoxDerived] = useState<Record<string, BoxDerived>>({});
  const [boxLoading, setBoxLoading] = useState(false);
  const [boxErrors, setBoxErrors] = useState<string[]>([]); // game_ids that failed
  // Display-name upgrade only: box scores carry "F. Last"; players.json has the
  // correctly-cased first/last for current-season players. Non-fatal.
  const [nameMap, setNameMap] = useState<Map<number, string> | null>(null);

  // Add-games flow — mode toggle: team-first (default, matches fan recall) or date.
  const [addMode, setAddMode] = useState<'team' | 'date'>('team');

  // By-Date sub-flow (the original)
  const [searchDate, setSearchDate] = useState<string>('');
  const [searchResults, setSearchResults] = useState<RawGame[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [matchupFilter, setMatchupFilter] = useState('');

  // By-Team sub-flow
  const seasonOptions = useMemo(() => buildSeasonOptions(), []);
  const [teamSel, setTeamSel] = useState<string>(''); // abbrev
  const [seasonSel, setSeasonSel] = useState<string>(seasonOptions[0]?.value ?? '');
  const [teamResults, setTeamResults] = useState<RawGame[] | null>(null);
  const [teamQuery, setTeamQuery] = useState<{ team: string; season: string } | null>(null); // what's shown
  const [teamLoading, setTeamLoading] = useState(false);
  const [teamError, setTeamError] = useState<string | null>(null);
  // Client-side recall filters over the fetched season
  const [oppFilter, setOppFilter] = useState<string>(''); // opponent abbrev, '' = any
  const [homeAwayFilter, setHomeAwayFilter] = useState<'all' | 'home' | 'away'>('all');
  const [scoreFilter, setScoreFilter] = useState('');
  // Multi-select "add many at once"
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // ── Hydrate + resolve auth on mount ──────────────────────────────────────────
  // Logged-out: read the localStorage list (Phase 0). Logged-in: merge any local
  // games into D1 (mergeLocalPresets pattern), then load the D1 list as source.
  useEffect(() => {
    detailsRef.current = readDetails();
    boxCacheRef.current = readBoxCache();
    setBoxDerived({ ...boxCacheRef.current });
    // Default the date picker to today (local).
    const t = new Date();
    setSearchDate(
      `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`,
    );

    let cancelled = false;
    (async () => {
      const token = getSessionToken();
      const me = token ? await getMe() : null;
      if (cancelled) return;

      if (!me) {
        setLocalGames(readAttended());
        setIsLoggedIn(false);
        setHydrated(true);
        return;
      }

      // ── Merge-on-login (mirrors auth-client mergeLocalPresets) ──────────────
      const local = readAttended();
      if (local.length > 0) {
        // Preserve each local game's display snapshot so venue/OT survive the
        // switch to the (id-only) D1 source on this device.
        for (const g of local) detailsRef.current[g.game_id] = g;
        writeDetails(detailsRef.current);
        // Upsert each into D1; server dedupes on (user_id, game_id).
        let allOk = true;
        for (const g of local) {
          const ok = await postAttended(g.game_id);
          if (!ok) allOk = false;
        }
        if (cancelled) return;
        // Only clear the local LIST once every game is safely in D1 (FAIL LOUD:
        // never drop local data on a partial sync). Box + details caches stay.
        if (allOk) writeAttended([]);
        else
          setWriteError(
            'Some games saved in this browser could not be synced to your account — they are still on this device. Reload to retry.',
          );
      }

      const rows = await fetchD1Attended();
      if (cancelled) return;
      if (rows) {
        setD1Rows(rows);
        setD1Error(false);
      } else {
        setD1Rows([]);
        setD1Error(true);
      }
      setDetailsVersion((v) => v + 1);
      setIsLoggedIn(true);
      setHydrated(true);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // ── team_id → abbrev/name (only needed for the logged-in D1 list) ────────────
  useEffect(() => {
    if (!isLoggedIn) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${API}/v1/config`);
        if (!r.ok) return;
        const data = await r.json();
        const m = new Map<number, TeamInfo>();
        for (const team of data.teams ?? []) {
          if (typeof team.id === 'number') m.set(team.id, { abbrev: team.abbrev, name: team.name });
        }
        if (!cancelled) setConfigMap(m);
      } catch {
        /* non-fatal: mapD1Row falls back to the local snapshot / numeric id */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn]);

  // ── Load the server summary once logged in (source of truth for aggregates) ──
  useEffect(() => {
    if (!isLoggedIn) return;
    loadSummary();
  }, [isLoggedIn, loadSummary]);

  // ── Reflect sync state in the masthead note (rendered in the Astro page) ─────
  useEffect(() => {
    if (!hydrated || typeof document === 'undefined') return;
    const el = document.getElementById('att-mast-note');
    if (el)
      el.textContent = isLoggedIn
        ? '// Synced to your account — your games follow you across devices.'
        : '// Saved in this browser only. Sign in to sync across devices.';
  }, [hydrated, isLoggedIn]);

  // ── Name upgrade: First Last from players.json (HGB never shows "F. Last") ────
  // Box scores only carry the abbreviated `name.default` ("F. Last"). players.json
  // has first/last for current-season players; historical players gracefully keep
  // the box-score name. Non-fatal — a failure just leaves names as-is.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API}/v1/stats/players`);
        if (!res.ok) return;
        const data = await res.json();
        const list = Array.isArray(data) ? data : (data.players ?? data.data ?? []);
        const m = new Map<number, string>();
        for (const p of list) {
          if (typeof p.player_id === 'number' && p.first_name && p.last_name) {
            m.set(p.player_id, `${p.first_name} ${p.last_name}`);
          }
        }
        if (!cancelled) setNameMap(m);
      } catch {
        /* non-fatal: names stay as the box-score form */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Fetch box scores for any attended game not yet derived ───────────────────
  // Logged IN, the server summary already carries Shots + Players Seen + moment
  // badges, so we skip the NHL-proxy fan-out entirely — UNLESS the summary failed
  // to load, in which case we fetch boxes to power the client-side fallback.
  useEffect(() => {
    if (!hydrated || games.length === 0) return;
    if (isLoggedIn && !summaryError) return;
    const missing = games.filter((g) => !boxCacheRef.current[g.game_id]);
    if (missing.length === 0) return;

    let cancelled = false;
    setBoxLoading(true);

    (async () => {
      const failed: string[] = [];
      // Modest concurrency to avoid hammering the NHL proxy.
      const queue = [...missing];
      const workers = Array.from({ length: Math.min(4, queue.length) }, async () => {
        while (queue.length && !cancelled) {
          const g = queue.shift()!;
          try {
            const res = await fetch(`${API}/v1/games/${g.game_id}/boxscore`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const box = await res.json();
            const derived = deriveFromBoxscore(box);
            boxCacheRef.current[g.game_id] = derived;
            // Persist only immutable finals so the cache never traps a live score.
            if (g.status === 'final') {
              writeBoxCache(boxCacheRef.current);
            }
          } catch {
            failed.push(g.game_id);
          }
        }
      });
      await Promise.all(workers);
      if (cancelled) return;
      setBoxDerived({ ...boxCacheRef.current });
      setBoxErrors((prev) => Array.from(new Set([...prev, ...failed])));
      setBoxLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [games, hydrated, isLoggedIn, summaryError]);

  // ── Mutations ────────────────────────────────────────────────────────────────
  // Logged-in writes go to D1 (optimistic, rolled back on failure); logged-out
  // writes stay in localStorage. A display snapshot is always cached so the
  // logged-in (id-only) source can still render venue/OT on this device.
  const addGame = useCallback(
    (raw: RawGame) => {
      const snap: AttendedGame = {
        game_id: raw.game_id,
        date: raw.date,
        home: raw.home_team,
        away: raw.away_team,
        venue: raw.venue ?? null,
        last_period_type: raw.last_period_type ?? null,
        status: raw.status,
        added_at: new Date().toISOString(),
      };
      commitDetail(snap);

      if (isLoggedIn) {
        setD1Rows((prev) => {
          const rows = prev ?? [];
          if (rows.some((r) => r.game_id === raw.game_id)) return rows;
          const row: D1AttendedRow = {
            game_id: raw.game_id,
            rooted_for: null,
            notes: null,
            source: 'manual',
            created_at: snap.added_at,
            game_date: raw.date,
            home_team_id: raw.home_team.id,
            away_team_id: raw.away_team.id,
            home_score: raw.home_team.score,
            away_score: raw.away_team.score,
            is_final: raw.status === 'final' ? 1 : 0,
            venue: raw.venue ?? null,
            last_period_type: raw.last_period_type ?? null,
          };
          return [row, ...rows];
        });
        postAttended(raw.game_id).then((ok) => {
          if (ok) {
            setWriteError(null);
            loadSummary(); // refetch aggregates from the server (anti-divergence)
          } else {
            setWriteError('Could not save that game to your account — check your connection and try again.');
            setD1Rows((prev) => (prev ?? []).filter((r) => r.game_id !== raw.game_id));
          }
        });
      } else {
        setLocalGames((prev) => {
          if (prev.some((g) => g.game_id === raw.game_id)) return prev;
          const next = [...prev, snap];
          writeAttended(next);
          return next;
        });
      }
    },
    [isLoggedIn, commitDetail, loadSummary],
  );

  const removeGame = useCallback(
    (gameId: string) => {
      if (isLoggedIn) {
        let removed: D1AttendedRow | undefined;
        setD1Rows((prev) => {
          const rows = prev ?? [];
          removed = rows.find((r) => r.game_id === gameId);
          return rows.filter((r) => r.game_id !== gameId);
        });
        apiFetch(`${API}/v1/account/attended/${gameId}`, { method: 'DELETE' })
          .then((r) => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            setWriteError(null);
            loadSummary(); // refetch aggregates from the server (anti-divergence)
          })
          .catch(() => {
            setWriteError('Could not remove that game from your account — check your connection and try again.');
            if (removed) setD1Rows((prev) => [removed as D1AttendedRow, ...(prev ?? [])]);
          });
      } else {
        setLocalGames((prev) => {
          const next = prev.filter((g) => g.game_id !== gameId);
          writeAttended(next);
          return next;
        });
      }
    },
    [isLoggedIn, loadSummary],
  );

  const attendedIds = useMemo(() => new Set(games.map((g) => g.game_id)), [games]);

  // ── Search a date ────────────────────────────────────────────────────────────
  const runSearch = useCallback(async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(searchDate)) {
      setSearchError('Pick a valid date first.');
      return;
    }
    setSearchLoading(true);
    setSearchError(null);
    setSearchResults(null);
    try {
      const res = await fetch(`${API}/v1/games/today?date=${searchDate}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSearchResults(toRawGames(data));
    } catch (err) {
      setSearchError('Could not load games for that date. Please try again.');
    } finally {
      setSearchLoading(false);
    }
  }, [searchDate]);

  // ── Search a team's season ───────────────────────────────────────────────────
  // Hits the new GET /v1/games/by-team endpoint (same game shape as /today), then
  // lets the client-side recall filters below narrow the ~82-game season.
  const runTeamSearch = useCallback(async () => {
    if (!teamSel) {
      setTeamError('Pick a team first.');
      return;
    }
    if (!/^\d{8}$/.test(seasonSel)) {
      setTeamError('Pick a season first.');
      return;
    }
    setTeamLoading(true);
    setTeamError(null);
    setTeamResults(null);
    setSelectedIds(new Set());
    // Reset the recall filters so stale opponent/score choices don't hide a fresh
    // season's results.
    setOppFilter('');
    setHomeAwayFilter('all');
    setScoreFilter('');
    try {
      const url = `${API}/v1/games/by-team?team=${encodeURIComponent(teamSel)}&season=${seasonSel}&type=all`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setTeamResults(toRawGames(data));
      setTeamQuery({ team: teamSel, season: seasonSel });
    } catch (err) {
      setTeamError('Could not load games for that team and season. Please try again.');
    } finally {
      setTeamLoading(false);
    }
  }, [teamSel, seasonSel]);

  // The team the results are anchored to (from the query that produced them, so
  // home/away chips stay correct even if the picker is changed before re-search).
  const anchorTeam = teamQuery?.team ?? '';

  // Opponents present in the fetched season → populate the opponent dropdown.
  const opponentOptions = useMemo(() => {
    if (!teamResults || !anchorTeam) return [] as string[];
    const set = new Set<string>();
    for (const g of teamResults) {
      const opp = g.home_team.abbrev === anchorTeam ? g.away_team.abbrev : g.home_team.abbrev;
      if (opp) set.add(opp);
    }
    return Array.from(set).sort();
  }, [teamResults, anchorTeam]);

  // Apply the client-side recall filters (opponent + home/away + score).
  const filteredTeamResults = useMemo(() => {
    if (!teamResults) return null;
    return teamResults.filter((g) => {
      const isHome = g.home_team.abbrev === anchorTeam;
      const opp = isHome ? g.away_team.abbrev : g.home_team.abbrev;
      if (oppFilter && opp !== oppFilter) return false;
      if (homeAwayFilter === 'home' && !isHome) return false;
      if (homeAwayFilter === 'away' && isHome) return false;
      if (!scoreMatches(g, scoreFilter)) return false;
      return true;
    });
  }, [teamResults, anchorTeam, oppFilter, homeAwayFilter, scoreFilter]);

  const toggleSelected = useCallback((gameId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(gameId)) next.delete(gameId);
      else next.add(gameId);
      return next;
    });
  }, []);

  // "Add N games" — fan out the existing single-game add pipeline (localStorage
  // when logged out, optimistic D1 upsert when logged in) over the selection,
  // skipping any game already attended. Reuses addGame wholesale (its own
  // FAIL-LOUD rollback per game stands); we just drive it in a loop.
  const addSelected = useCallback(
    (attended: Set<string>) => {
      if (!teamResults) return;
      const byId = new Map(teamResults.map((g) => [g.game_id, g]));
      for (const id of selectedIds) {
        if (attended.has(id)) continue;
        const g = byId.get(id);
        if (g) addGame(g);
      }
      setSelectedIds(new Set());
    },
    [teamResults, selectedIds, addGame],
  );

  // ── Derived aggregates ───────────────────────────────────────────────────────
  // Overlay the box-derived canonical period type (which folds the multi-OT count
  // from gameOutcome.otPeriods) onto each game's last_period_type. The game-lookup
  // endpoint only carries a bare "OT" with no overtime count, so without this a
  // logged-out 2OT/3OT game undercounts periods AND mislabels the Longest Game
  // record. Logged-in games already carry the canonical stored form from
  // game_results (and boxes aren't fetched), so this is a no-op there — the periods
  // counter + records still render from the server summary (anti-divergence).
  const effectiveGames = useMemo<AttendedGame[]>(() => {
    return games.map((g) => {
      const pt = boxDerived[g.game_id]?.periodType;
      return pt ? { ...g, last_period_type: pt } : g;
    });
  }, [games, boxDerived]);

  const finalGames = useMemo(() => effectiveGames.filter((g) => g.status === 'final'), [effectiveGames]);

  const totals = useMemo(() => {
    // Periods + goals count FINAL games only — a scheduled/live game logged before
    // it ends has no meaningful score and would otherwise add a phantom 3 periods +
    // 0 goals (mirrors the backend counters + how team records already filter).
    let goals = 0;
    let periods = 0;
    for (const g of finalGames) {
      goals += (g.home.score ?? 0) + (g.away.score ?? 0);
      periods += periodsFor(g);
    }
    // Shots + distinct players from whatever box scores we have (finals only —
    // finals are the only games with a persisted box).
    let shots = 0;
    const seen = new Set<number>();
    let missingBox = false;
    for (const g of finalGames) {
      const d = boxDerived[g.game_id];
      if (!d) {
        missingBox = true;
        continue;
      }
      shots += d.shots;
      for (const p of d.players) seen.add(p.id);
    }
    return { goals, periods, shots, playersSeen: seen.size, seen, missingBox };
  }, [finalGames, boxDerived]);

  // Team W-L across attended (final) games.
  const teamRecords = useMemo(() => {
    const map = new Map<string, { abbrev: string; name: string; w: number; l: number }>();
    for (const g of finalGames) {
      const win = winnerAbbrev(g);
      for (const side of [g.home, g.away]) {
        const rec = map.get(side.abbrev) ?? { abbrev: side.abbrev, name: side.name, w: 0, l: 0 };
        if (win === side.abbrev) rec.w += 1;
        else if (win) rec.l += 1;
        map.set(side.abbrev, rec);
      }
    }
    return Array.from(map.values()).sort(
      (a, b) => b.w + b.l - (a.w + a.l) || b.w - a.w || a.abbrev.localeCompare(b.abbrev),
    );
  }, [finalGames]);

  // Arenas visited (venue only present in schedule data).
  const arenas = useMemo(() => {
    const known = new Map<string, number>();
    let unknown = 0;
    for (const g of games) {
      const v = (g.venue ?? '').trim();
      if (v) known.set(v, (known.get(v) ?? 0) + 1);
      else unknown += 1;
    }
    return {
      list: Array.from(known.entries())
        .map(([venue, count]) => ({ venue, count }))
        .sort((a, b) => b.count - a.count || a.venue.localeCompare(b.venue)),
      unknown,
    };
  }, [games]);

  // Players seen ranked by games-seen, then goals — aggregated straight from the
  // box scores (works for any era, no players.json/WAR dependency).
  const seenPlayers = useMemo<SeenPlayerRow[]>(() => {
    const agg = new Map<number, SeenPlayerRow>();
    for (const g of games) {
      const d = boxDerived[g.game_id];
      if (!d) continue;
      for (const p of d.players) {
        const row = agg.get(p.id);
        if (row) {
          row.gamesSeen += 1;
          row.goals += p.goals;
          // Keep the latest non-empty name/team/pos we've seen.
          if (p.name && !p.name.startsWith('#')) row.name = p.name;
          if (p.team) row.team = p.team;
          if (p.pos) row.pos = p.pos;
        } else {
          agg.set(p.id, {
            player_id: p.id,
            name: p.name,
            team: p.team,
            pos: p.pos,
            gamesSeen: 1,
            goals: p.goals,
          });
        }
      }
    }
    return Array.from(agg.values())
      .map((r) => ({ ...r, name: nameMap?.get(r.player_id) ?? r.name }))
      .sort(
        (a, b) => b.gamesSeen - a.gamesSeen || b.goals - a.goals || a.name.localeCompare(b.name),
      );
  }, [games, boxDerived, nameMap]);

  // ── Single-game records (§2c), client path ──────────────────────────────────
  // Computed from data already in memory (game_results facts, last_period_type,
  // game_id digits, cached box scores). Moment records that need a box simply
  // don't fire for un-hydrated games (FAIL-LOUD, not a silent 0).
  const records = useMemo<GameRecord[]>(
    () => computeRecords(effectiveGames, boxDerived as Record<string, BadgeBox | undefined>),
    [effectiveGames, boxDerived],
  );

  // Arenas-Visited N/32 is a collection badge (distinct known venues), computed
  // separately from the per-game predicates. Only games with a known venue count.
  const clientArenaBadge = useMemo(
    () => ({ visited: arenas.list.length, total: 32 }),
    [arenas.list.length],
  );

  // ── Unified view layer (anti-divergence) ─────────────────────────────────────
  // When logged IN and the summary loaded, EVERY aggregate below renders from the
  // server payload (the source of truth). Logged OUT — or logged-in with a failed
  // summary — falls back to the client-side compute above. Both feed identical UI.
  const useSummary = isLoggedIn && summary != null && !summaryError;
  // Logged-in but the summary hasn't arrived yet (and hasn't failed): box scores
  // aren't fetched in this state, so box-derived figures show a pending marker
  // rather than a misleading 0.
  const summaryPending = isLoggedIn && summary == null && !summaryError;

  const viewCounters = useMemo(() => {
    if (useSummary && summary) {
      const c = summary.counters;
      return { games: c.games, periods: c.periods, goals: c.goals, shots: c.shots, playersSeen: c.players_seen };
    }
    return {
      games: games.length,
      periods: totals.periods,
      goals: totals.goals,
      shots: totals.shots,
      playersSeen: totals.playersSeen,
    };
  }, [useSummary, summary, games.length, totals]);

  const viewBoxIncomplete = useSummary && summary ? summary.box_incomplete : boxErrors.length > 0;
  const viewMissingBoxCount =
    useSummary && summary ? summary.missing_box_game_ids?.length ?? 0 : boxErrors.length;

  const viewTeamRecords = useSummary && summary ? summary.team_records : teamRecords;

  const viewArenas = useMemo(
    () => (useSummary && summary ? { list: summary.arenas.list, unknown: summary.arenas.unknown } : arenas),
    [useSummary, summary, arenas],
  );
  const viewArenaBadge =
    useSummary && summary
      ? { visited: summary.arenas.visited, total: summary.arenas.total }
      : clientArenaBadge;

  const viewSeenPlayers = useMemo<SeenPlayerRow[]>(() => {
    if (useSummary && summary) {
      return summary.players_seen.map((p) => ({
        player_id: p.player_id,
        name: p.name ?? nameMap?.get(p.player_id) ?? `#${p.player_id}`,
        team: p.team,
        pos: p.pos,
        gamesSeen: p.games,
        goals: p.goals,
      }));
    }
    return seenPlayers;
  }, [useSummary, summary, seenPlayers, nameMap]);

  const viewRecords = useMemo<ViewRecord[]>(() => {
    if (useSummary && summary) return summaryRecordsToView(summary.records);
    // Client path: resolve player "F. Last" → "First Last" and compose the sub.
    return records.map((r) => {
      const name = r.playerId != null ? nameMap?.get(r.playerId) ?? r.playerName : null;
      return { key: r.key, label: r.label, value: r.value, sub: name ? `${name} · ${r.sub}` : r.sub };
    });
  }, [useSummary, summary, records, nameMap]);

  // Full badge catalog (§2): earned first (rarest-first) then ghost/unearned.
  const catalog = useMemo<CatalogBadge[]>(() => {
    // Drop `arenas-visited`: the server catalog carries it, but a dedicated
    // "Arenas Visited" collection badge is rendered separately below. Without
    // this filter the logged-in view shows two Arenas badges and double-counts
    // it in the earned tally (the logged-out local catalog never includes it).
    if (useSummary && summary)
      return sortCatalog(
        summary.badges.catalog.filter((c) => c.id !== 'arenas-visited').map(mapSummaryCatalog),
      );
    return sortCatalog(buildLocalCatalog(effectiveGames, boxDerived as Record<string, BadgeBox | undefined>));
  }, [useSummary, summary, effectiveGames, boxDerived]);
  const earnedCount = useMemo(() => catalog.filter((c) => c.earned).length, [catalog]);

  // Milestones Witnessed — server-provided; logged-out has no account, so none.
  const milestones = useSummary && summary ? summary.milestones : [];
  // ── Share card (client-side canvas PNG) ──────────────────────────────────────
  // Draws the SAME in-memory aggregates to a portrait canvas and hands it to the
  // shared HGB_Export modal (download / long-press-to-save), exactly like the
  // player/goalie cards. No new network fetch — everything below is already in
  // memory. Disabled while empty (see render).
  const handleShare = useCallback(async () => {
    // Everything below reads from the VIEW aggregates (the same source the page
    // renders from) — NOT the client-only compute — so the card is correct in
    // BOTH auth states. When logged in, B2 skips the client box fetch, leaving
    // the raw client aggregates empty; the view layer is the source of truth.

    // Rarest earned badges first: `catalog` is already sorted rarest-first, so
    // the first three earned entries ARE the rarest three.
    const rarest: PassportShareData['badges'] = catalog
      .filter((c) => c.earned)
      .slice(0, 3)
      .map((c) => ({
        label: c.label,
        rarity: c.rarity ? `${c.rarity} games` : c.rarityHint,
        blurb: c.blurb,
      }));

    // Marquee moments: prefer the crowd-pleasers, then fill from the rest.
    // viewRecords is already name-resolved ({key,label,value,sub}) either way.
    const byKey = new Map(viewRecords.map((r) => [r.key, r]));
    const preferred = ['highest', 'longest', 'player-goals', 'player-points'];
    const chosen: ViewRecord[] = [];
    for (const k of preferred) {
      const r = byKey.get(k);
      if (r) chosen.push(r);
      if (chosen.length === 3) break;
    }
    if (chosen.length < 3) {
      for (const r of viewRecords) {
        if (chosen.length === 3) break;
        if (!chosen.includes(r)) chosen.push(r);
      }
    }
    const shareRecords: PassportShareData['records'] = chosen.map((r) => ({
      key: r.key,
      label: r.label,
      value: r.value,
      sub: r.sub,
      // total_time isn't in the view aggregates yet; the card falls back to
      // "N periods" for the longest game until the backend supplies it.
    }));

    // Accent = the colour of the team the user has seen most (falls back to red).
    const accent = viewTeamRecords.length > 0 ? pickTeamColor(viewTeamRecords[0].abbrev) : null;

    const data: PassportShareData = {
      counters: {
        games: viewCounters.games,
        periods: viewCounters.periods,
        goals: viewCounters.goals,
        shots: viewCounters.shots,
        playersSeen: viewCounters.playersSeen,
      },
      arenas: { visited: viewArenaBadge.visited, total: viewArenaBadge.total },
      badges: rarest,
      records: shareRecords,
      accent,
      boxIncomplete: viewBoxIncomplete,
    };

    // Ensure the Barlow / mono webfonts are ready so measureText + fills are
    // correct (canvas text silently falls back to a system font otherwise).
    try {
      await (document as any).fonts?.ready;
    } catch {
      /* non-fatal — draw with whatever is loaded */
    }
    const canvas = drawPassportCard(data);
    const exp = (window as any).HGB_Export;
    if (exp?.showCardModal) {
      exp.showCardModal(canvas, 'hgb-puck-passport.png');
    } else {
      // FAIL LOUD: the export surface script wasn't on the page.
      console.error('[PuckPassport] window.HGB_Export.showCardModal unavailable — is /js/table-export.js loaded?');
      setWriteError('Could not open the share card — please reload the page and try again.');
    }
  }, [catalog, viewRecords, viewTeamRecords, viewCounters, viewArenaBadge, viewBoxIncomplete]);

  // ── Column defs ──────────────────────────────────────────────────────────────
  const gameCols = useMemo<HGBColumnDef<AttendedGame>[]>(
    () => [
      {
        id: 'date',
        header: 'Date',
        accessor: (r) => r.date,
        align: 'left',
        cell: (v) => (
          <span style={{ fontFamily: 'var(--mono)', fontSize: CELL_FONT_SIZE, color: 'var(--ink-72)' }}>{v}</span>
        ),
      },
      {
        id: 'matchup',
        header: 'Matchup',
        accessor: (r) => `${r.away.abbrev} @ ${r.home.abbrev}`,
        align: 'left',
        cell: (_, r) => {
          const win = winnerAbbrev(r);
          const chip = gameTypeLabel(r.game_id);
          const teamSpan = (t: TeamSide) => (
            <span
              style={{
                fontFamily: 'var(--body)',
                fontSize: NAME_FONT_SIZE,
                fontWeight: win === t.abbrev ? 700 : 500,
                color: win === t.abbrev ? 'var(--ink)' : 'var(--ink-56)',
              }}
            >
              {t.abbrev}
            </span>
          );
          return (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {teamSpan(r.away)}
              <span style={{ color: 'var(--ink-32)', fontSize: 12 }}>@</span>
              {teamSpan(r.home)}
              {chip ? <span className="att-chip">{chip}</span> : null}
            </span>
          );
        },
      },
      {
        id: 'score',
        header: 'Final',
        accessor: (r) => `${r.away.score}-${r.home.score}`,
        align: 'center',
        cell: (_, r) => {
          const np = normalizePeriod(r.last_period_type);
          return (
            <span style={{ fontFamily: 'var(--mono)', fontSize: CELL_FONT_SIZE, fontWeight: 700 }}>
              {r.away.score}–{r.home.score}
              {np.code !== 'REG' ? (
                <span style={{ marginLeft: 5, color: 'var(--red)', fontSize: 10, fontWeight: 700 }}>
                  {np.label}
                </span>
              ) : null}
            </span>
          );
        },
      },
      {
        id: 'venue',
        header: 'Arena',
        accessor: (r) => r.venue ?? '',
        align: 'left',
        mobileHidden: true,
        cell: (v) =>
          v ? (
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-48)' }}>{v}</span>
          ) : (
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-32)', fontStyle: 'italic' }}>
              venue unknown
            </span>
          ),
      },
      {
        id: 'remove',
        header: '',
        accessor: () => '',
        align: 'center',
        exportInclude: false,
        width: 44,
        cell: (_, r) => (
          <button
            className="att-remove"
            title="Remove from attended"
            aria-label={`Remove ${r.away.abbrev} at ${r.home.abbrev}`}
            onClick={(e) => {
              e.stopPropagation();
              removeGame(r.game_id);
            }}
          >
            ✕
          </button>
        ),
      },
    ],
    [removeGame],
  );

  const seenCols = useMemo<HGBColumnDef<SeenPlayerRow>[]>(
    () => [
      {
        id: 'name',
        header: 'Player',
        accessor: (r) => r.name,
        align: 'left',
        cell: (_, r) => (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <img
              src={`https://assets.nhle.com/logos/nhl/svg/${r.team}_light.svg`}
              alt={r.team}
              width={28}
              height={28}
              style={{ flexShrink: 0, objectFit: 'contain' }}
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
            <span style={{ fontFamily: 'var(--body)', fontWeight: 600, fontSize: NAME_FONT_SIZE }}>{r.name}</span>
          </div>
        ),
      },
      {
        id: 'team',
        header: 'Tm',
        accessor: (r) => r.team,
        align: 'center',
        mobileHidden: true,
        cell: (v) => (
          <span style={{ fontFamily: 'var(--mono)', fontSize: CELL_FONT_SIZE, fontWeight: 700, color: 'var(--ink-48)' }}>
            {v}
          </span>
        ),
      },
      {
        id: 'pos',
        header: 'Pos',
        accessor: (r) => r.pos,
        align: 'center',
        mobileHidden: true,
        cell: (v) => <span style={{ fontFamily: 'var(--mono)', fontSize: CELL_FONT_SIZE, color: 'var(--ink-32)' }}>{v}</span>,
      },
      {
        id: 'gamesSeen',
        header: 'Games',
        accessor: (r) => r.gamesSeen,
        sortType: 'number',
        align: 'center',
        cell: (v) => (
          <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: CELL_FONT_SIZE }}>
            {v}
          </span>
        ),
      },
      {
        id: 'goals',
        header: 'Goals',
        accessor: (r) => r.goals,
        sortType: 'number',
        align: 'center',
        cell: (v) => (
          <span style={{ fontFamily: 'var(--mono)', fontSize: CELL_FONT_SIZE, color: 'var(--ink-72)' }}>
            {v}
          </span>
        ),
      },
    ],
    [],
  );

  // ── Render ───────────────────────────────────────────────────────────────────
  if (!hydrated) {
    return <div className="att-loading">Loading your games…</div>;
  }

  const empty = games.length === 0;

  return (
    <div className="att-root">
      {/* FAIL-LOUD banners */}
      {d1Error ? (
        <div className="att-banner att-banner-warn">
          Couldn't load your saved games from your account — this list may be incomplete. Reload to try again.
        </div>
      ) : null}
      {writeError ? <div className="att-banner att-banner-warn">{writeError}</div> : null}
      {summaryError ? (
        <div className="att-banner att-banner-warn">
          Couldn't load your Passport summary from your account — showing figures computed in this browser instead.
          Reload to retry.
        </div>
      ) : null}
      {viewBoxIncomplete ? (
        <div className="att-banner att-banner-warn">
          Couldn't load box scores for {viewMissingBoxCount} game{viewMissingBoxCount === 1 ? '' : 's'} — Shots and
          Players Seen may be incomplete. Reload to retry.
        </div>
      ) : null}

      {/* Counter row */}
      <div className="att-counters">
        <Counter label="Games" value={viewCounters.games} />
        <Counter label="Periods" value={viewCounters.periods} />
        <Counter label="Goals" value={viewCounters.goals} />
        <Counter
          label="Shots"
          value={viewCounters.shots}
          pending={summaryPending || (boxLoading && totals.missingBox)}
          warn={viewBoxIncomplete}
        />
        <Counter
          label="Players Seen"
          value={viewCounters.playersSeen}
          pending={summaryPending || (boxLoading && totals.missingBox)}
          warn={viewBoxIncomplete}
        />
      </div>

      {/* Share your Passport — client-side canvas PNG (hidden until there's data) */}
      {!empty ? (
        <div className="att-share-bar">
          {/* Disabled while the server summary is still loading: box scores aren't
              fetched in that window, so the aggregates would export as zeros. */}
          <button
            className="att-share-btn"
            onClick={handleShare}
            disabled={summaryPending}
            title={summaryPending ? 'Loading your stats — one moment…' : undefined}
          >
            ↑ Share your Passport
          </button>
          <span className="att-share-note">
            {summaryPending
              ? 'Loading your stats…'
              : 'Generates a shareable card of your stats — download or post it.'}
          </span>
        </div>
      ) : null}

      {/* Add games */}
      <section className="att-section">
        <div className="att-section-head">
          <span className="att-section-label">Add Games</span>
          <span className="att-section-meta">
            {addMode === 'team'
              ? 'Pick a team and season — you remember the matchup, not the date.'
              : 'Pick a date, then mark the games you were at.'}
          </span>
        </div>

        {/* Mode toggle — By Team is the default (matches how fans recall games) */}
        <div className="att-mode-toggle" role="tablist" aria-label="Add games by">
          <button
            role="tab"
            aria-selected={addMode === 'team'}
            className={addMode === 'team' ? 'att-mode-btn active' : 'att-mode-btn'}
            onClick={() => setAddMode('team')}
          >
            By Team
          </button>
          <button
            role="tab"
            aria-selected={addMode === 'date'}
            className={addMode === 'date' ? 'att-mode-btn active' : 'att-mode-btn'}
            onClick={() => setAddMode('date')}
          >
            By Date
          </button>
        </div>

        {/* ── BY TEAM ─────────────────────────────────────────────────────────── */}
        {addMode === 'team' ? (
          <>
            <div className="att-add-controls">
              <select
                className="att-select"
                value={teamSel}
                onChange={(e) => setTeamSel(e.target.value)}
                aria-label="Team"
              >
                <option value="">Select team…</option>
                {NHL_TEAMS.map((t) => (
                  <option key={t.abbr} value={t.abbr}>
                    {t.name}
                  </option>
                ))}
              </select>
              <select
                className="att-select"
                value={seasonSel}
                onChange={(e) => setSeasonSel(e.target.value)}
                aria-label="Season"
              >
                {seasonOptions.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
              <button className="att-btn" onClick={runTeamSearch} disabled={teamLoading}>
                {teamLoading ? 'Loading…' : 'Find games'}
              </button>
            </div>

            {teamError ? <div className="att-banner att-banner-warn">{teamError}</div> : null}

            {teamResults != null ? (
              teamResults.length === 0 ? (
                <div className="att-add-empty">
                  No games found for {NHL_TEAM_NAMES[anchorTeam] ?? anchorTeam} in{' '}
                  {seasonOptions.find((s) => s.value === teamQuery?.season)?.label ?? teamQuery?.season}.
                </div>
              ) : (
                <>
                  {/* Recall filters over the fetched season */}
                  <div className="att-filters">
                    <select
                      className="att-select att-filter-opp"
                      value={oppFilter}
                      onChange={(e) => setOppFilter(e.target.value)}
                      aria-label="Filter by opponent"
                    >
                      <option value="">All opponents</option>
                      {opponentOptions.map((opp) => (
                        <option key={opp} value={opp}>
                          {NHL_TEAM_NAMES[opp] ?? opp}
                        </option>
                      ))}
                    </select>
                    <div className="att-chips" role="group" aria-label="Home or away">
                      {(['all', 'home', 'away'] as const).map((v) => (
                        <button
                          key={v}
                          className={homeAwayFilter === v ? 'att-chip-btn active' : 'att-chip-btn'}
                          aria-pressed={homeAwayFilter === v}
                          onClick={() => setHomeAwayFilter(v)}
                        >
                          {v === 'all' ? 'All' : v === 'home' ? 'Home' : 'Away'}
                        </button>
                      ))}
                    </div>
                    <input
                      type="search"
                      className="att-matchup"
                      placeholder='Score e.g. "5-4"…'
                      value={scoreFilter}
                      onChange={(e) => setScoreFilter(e.target.value)}
                      aria-label="Filter by score"
                    />
                  </div>

                  {/* Multi-select action bar */}
                  {(() => {
                    const addable = Array.from(selectedIds).filter((id) => !attendedIds.has(id)).length;
                    return (
                      <div className="att-select-bar">
                        <span className="att-select-count">
                          {selectedIds.size === 0
                            ? `${filteredTeamResults?.length ?? 0} games`
                            : `${selectedIds.size} selected`}
                        </span>
                        <button
                          className="att-btn att-btn-sm"
                          disabled={addable === 0}
                          onClick={() => addSelected(attendedIds)}
                        >
                          {addable > 0 ? `Add ${addable} game${addable === 1 ? '' : 's'}` : 'Add games'}
                        </button>
                      </div>
                    );
                  })()}

                  {filteredTeamResults && filteredTeamResults.length === 0 ? (
                    <div className="att-add-empty">No games match those filters.</div>
                  ) : (
                    <div className="att-add-results">
                      {filteredTeamResults!.map((g) => {
                        const already = attendedIds.has(g.game_id);
                        const checked = selectedIds.has(g.game_id);
                        const awayColor = pickTeamColor(g.away_team.abbrev);
                        const homeColor = pickTeamColor(g.home_team.abbrev);
                        const chip = gameTypeLabel(g.game_id);
                        return (
                          <div className="att-add-row att-add-row-team" key={g.game_id}>
                            <input
                              type="checkbox"
                              className="att-check"
                              checked={checked}
                              disabled={already}
                              onChange={() => toggleSelected(g.game_id)}
                              aria-label={`Select ${g.away_team.abbrev} at ${g.home_team.abbrev} on ${g.date}`}
                            />
                            <span className="att-add-date">{g.date}</span>
                            <span className="att-add-teams">
                              <span style={{ color: awayColor, fontWeight: 700 }}>{g.away_team.abbrev}</span>
                              <span className="att-add-at">@</span>
                              <span style={{ color: homeColor, fontWeight: 700 }}>{g.home_team.abbrev}</span>
                            </span>
                            <span className="att-add-type">
                              {chip ? <span className="att-chip">{chip}</span> : null}
                            </span>
                            <span className="att-add-score">
                              {g.status === 'final' ? `${g.away_team.score}–${g.home_team.score}` : g.status}
                              {(() => {
                                const np = normalizePeriod(g.last_period_type);
                                return np.code !== 'REG' ? <span className="att-ot">{np.label}</span> : null;
                              })()}
                            </span>
                            <span className="att-add-venue">{g.venue ?? 'venue unknown'}</span>
                            <button
                              className={already ? 'att-add-btn added' : 'att-add-btn'}
                              disabled={already}
                              onClick={() => addGame(g)}
                            >
                              {already ? '✓ Added' : '+ Attended'}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )
            ) : null}
          </>
        ) : (
          /* ── BY DATE (original flow) ────────────────────────────────────────── */
          <>
            <div className="att-add-controls">
              <input
                type="date"
                className="att-date"
                value={searchDate}
                onChange={(e) => setSearchDate(e.target.value)}
                aria-label="Game date"
              />
              <button className="att-btn" onClick={runSearch} disabled={searchLoading}>
                {searchLoading ? 'Loading…' : 'Find games'}
              </button>
              {searchResults && searchResults.length > 3 ? (
                <input
                  type="search"
                  className="att-matchup"
                  placeholder="Filter by team…"
                  value={matchupFilter}
                  onChange={(e) => setMatchupFilter(e.target.value)}
                  aria-label="Filter results by team"
                />
              ) : null}
            </div>

            {searchError ? <div className="att-banner att-banner-warn">{searchError}</div> : null}

            {searchResults != null ? (
              searchResults.length === 0 ? (
                <div className="att-add-empty">No NHL games on {searchDate}.</div>
              ) : (
                <div className="att-add-results">
                  {searchResults
                    .filter((g) => {
                      const q = matchupFilter.trim().toLowerCase();
                      if (!q) return true;
                      return (
                        g.home_team.abbrev.toLowerCase().includes(q) ||
                        g.away_team.abbrev.toLowerCase().includes(q) ||
                        g.home_team.name.toLowerCase().includes(q) ||
                        g.away_team.name.toLowerCase().includes(q)
                      );
                    })
                    .map((g) => {
                      const already = attendedIds.has(g.game_id);
                      const awayColor = pickTeamColor(g.away_team.abbrev);
                      const homeColor = pickTeamColor(g.home_team.abbrev);
                      return (
                        <div className="att-add-row" key={g.game_id}>
                          <span className="att-add-teams">
                            <span style={{ color: awayColor, fontWeight: 700 }}>{g.away_team.abbrev}</span>
                            <span className="att-add-at">@</span>
                            <span style={{ color: homeColor, fontWeight: 700 }}>{g.home_team.abbrev}</span>
                          </span>
                          <span className="att-add-score">
                            {g.status === 'final' ? `${g.away_team.score}–${g.home_team.score}` : g.status}
                          </span>
                          <span className="att-add-venue">{g.venue ?? 'venue unknown'}</span>
                          <button
                            className={already ? 'att-add-btn added' : 'att-add-btn'}
                            disabled={already}
                            onClick={() => addGame(g)}
                          >
                            {already ? '✓ Added' : '+ Attended'}
                          </button>
                        </div>
                      );
                    })}
                </div>
              )
            ) : null}
          </>
        )}
      </section>

      {empty ? (
        <div className="att-empty">
          <div className="att-empty-title">No games yet</div>
          <div className="att-empty-sub">
            Use "Add Games" above to log the first game you attended.{' '}
            {isLoggedIn ? 'Your list is synced to your account.' : 'Your list is saved in this browser.'}
          </div>
        </div>
      ) : (
        <>
          {/* Badges — full catalog: earned (rarest-first) then ghost/unearned (§2) */}
          <section className="att-section">
            <div className="att-section-head">
              <span className="att-section-label">Badges</span>
              <span className="att-section-meta">
                {earnedCount + (viewArenaBadge.visited > 0 ? 1 : 0)} earned · {catalog.length} to collect
                {(summaryPending || (boxLoading && totals.missingBox)) ? ' · scanning box scores…' : ''}
              </span>
            </div>
            <div className="att-badges">
              {/* Arenas-visited collection badge (distinct known venues / 32) */}
              {viewArenaBadge.visited > 0 ? (
                <div className="att-badge att-badge-collection" data-family="collection">
                  <div className="att-badge-top">
                    <span className="att-badge-label">Arenas Visited</span>
                    <span className="att-badge-count">
                      {viewArenaBadge.visited}/{viewArenaBadge.total}
                    </span>
                  </div>
                  <span className="att-badge-rarity">distinct arenas · collection</span>
                </div>
              ) : null}

              {catalog.map((c) =>
                c.earned ? (
                  // Earned chip
                  <div className="att-badge" data-family={c.family} key={c.id}>
                    <div className="att-badge-top">
                      <span className="att-badge-label">{c.label}</span>
                      <span className="att-badge-count">×{c.count}</span>
                    </div>
                    <span className="att-badge-rarity">
                      {c.rarity ? `${c.rarity} games` : c.rarityHint}
                      <span className="att-badge-family"> · {c.family === 'game-type' ? 'type' : 'moment'}</span>
                    </span>
                    {c.blurb ? <span className="att-badge-blurb">{c.blurb}</span> : null}
                    {c.note ? <span className="att-badge-note">{c.note}</span> : null}
                  </div>
                ) : (
                  // Ghost chip — dimmed/locked; the "1 in N" hint is the chase tease
                  <div className="att-badge att-badge-ghost" data-family={c.family} key={c.id}>
                    <div className="att-badge-top">
                      <span className="att-badge-label">{c.label}</span>
                      <span className="att-badge-ghost-tag">Locked</span>
                    </div>
                    <span className="att-badge-rarity">
                      {c.rarityHint || 'not yet seen'}
                      <span className="att-badge-family"> · {c.family === 'game-type' ? 'type' : 'moment'}</span>
                    </span>
                    {c.blurb ? <span className="att-badge-blurb">{c.blurb}</span> : null}
                  </div>
                ),
              )}
            </div>
          </section>

          {/* Single-game records — extremes across the attended set (§2c) */}
          {viewRecords.length > 0 ? (
            <section className="att-section">
              <div className="att-section-head">
                <span className="att-section-label">Single-Game Records</span>
                <span className="att-section-meta">your personal extremes</span>
              </div>
              <div className="att-records">
                {viewRecords.map((r) => (
                  <div className="att-record" key={r.key}>
                    <div className="att-record-label">{r.label}</div>
                    <div className="att-record-value">{r.value}</div>
                    <div className="att-record-sub">{r.sub}</div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {/* Milestones Witnessed — league milestones reached in a game you were at
              (server-provided; logged-out has no account, so this stays hidden). */}
          {milestones.length > 0 ? (
            <section className="att-section">
              <div className="att-section-head">
                <span className="att-section-label">Milestones Witnessed</span>
                <span className="att-section-meta">{milestones.length} in person</span>
              </div>
              <div className="att-milestones">
                {milestones.map((m) => (
                  <div className="att-milestone" key={`${m.game_id}-${m.player_id}-${m.stat}`}>
                    <span className="att-milestone-dot" style={{ background: pickTeamColor(m.team_abbrev) }} />
                    <div className="att-milestone-main">
                      <span className="att-milestone-label">{m.label}</span>
                      <span className="att-milestone-sub">
                        {m.player_name} · {m.team_abbrev} · {m.game_date}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {/* Games list */}
          <section className="att-section">
            <div className="att-section-head">
              <span className="att-section-label">Your Games</span>
              <span className="att-section-meta">{games.length} logged</span>
            </div>
            <HGBTable
              data={[...effectiveGames].sort((a, b) => b.date.localeCompare(a.date))}
              columns={gameCols}
              defaultSort={{ id: 'date', desc: true }}
              toolbar={{ show: false }}
            />
          </section>

          {/* Team W-L + Arenas side by side */}
          <div className="att-two-col">
            <section className="att-section">
              <div className="att-section-head">
                <span className="att-section-label">Team Records</span>
                <span className="att-section-meta">every team you've seen</span>
              </div>
              {viewTeamRecords.length === 0 ? (
                <div className="att-add-empty">No completed games yet.</div>
              ) : (
                <div className="att-teams">
                  {viewTeamRecords.map((t) => (
                    <div className="att-team-row" key={t.abbrev}>
                      <span className="att-team-dot" style={{ background: pickTeamColor(t.abbrev) }} />
                      <span className="att-team-abbr">{t.abbrev}</span>
                      <span className="att-team-name">{t.name}</span>
                      <span className="att-team-rec">
                        {t.w}-{t.l}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="att-section">
              <div className="att-section-head">
                <span className="att-section-label">Arenas Visited</span>
                <span className="att-section-meta">{viewArenas.list.length} known</span>
              </div>
              {viewArenas.list.length === 0 && viewArenas.unknown === 0 ? (
                <div className="att-add-empty">No games yet.</div>
              ) : (
                <div className="att-arenas">
                  {viewArenas.list.map((a) => (
                    <div className="att-arena-row" key={a.venue}>
                      <span className="att-arena-name">{a.venue}</span>
                      <span className="att-arena-count">{a.count}</span>
                    </div>
                  ))}
                  {viewArenas.unknown > 0 ? (
                    <div className="att-arena-row att-arena-unknown">
                      <span className="att-arena-name">Venue unknown</span>
                      <span className="att-arena-count">{viewArenas.unknown}</span>
                    </div>
                  ) : null}
                </div>
              )}
            </section>
          </div>

          {/* Players seen ranked by games seen, then goals */}
          <section className="att-section">
            <div className="att-section-head">
              <span className="att-section-label">Players Seen</span>
              <span className="att-section-meta">{viewSeenPlayers.length} logged</span>
            </div>
            {viewSeenPlayers.length === 0 ? (
              <div className="att-add-empty">
                No players yet — box scores may still be loading.
              </div>
            ) : (
              <HGBTable
                data={viewSeenPlayers}
                columns={seenCols}
                defaultSort={{ id: 'gamesSeen', desc: true }}
                toolbar={{ show: false }}
                showRank
              />
            )}
          </section>
        </>
      )}
    </div>
  );
}
