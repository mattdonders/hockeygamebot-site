/**
 * AttendedTracker — "Games I've Attended" tracker (Puck Passport).
 *
 * ONE data source, ONE renderer, in BOTH auth states (anti-divergence). Every
 * dashboard aggregate (counters, team records, arenas, players-seen, records,
 * badges, milestones) comes from the SAME server summary payload — the server
 * owns the numbers so web + iOS + share card can never disagree:
 *
 *   Logged OUT — the attended LIST lives in localStorage. Its game ids are POSTed
 *   to the PUBLIC summary endpoint, which returns the identical payload shape:
 *     - List lookup / add flow  →  GET  /v1/games/today | /v1/games/by-team
 *     - Aggregates              →  POST /v1/account/attended/summary { game_ids }
 *   The response is cached in localStorage keyed by the sorted game-id list, so it
 *   is reused until the list changes (mirrors the iOS userDefaults+cache pattern).
 *
 *   Logged IN — the list comes from D1 (GET /v1/account/attended); the aggregates
 *   come from the AUTHED summary (GET /v1/account/attended/summary). The summary
 *   also carries the Milestones-Witnessed feed.
 *
 * The per-game LIST ("Your Games") still renders from the local/D1 list; only the
 * aggregates come from the summary. NHL box scores are no longer fetched client
 * side — the server summary supplies Shots + Players-Seen + records + badges.
 *
 * Badges (§2) render the FULL catalog either way: earned first (rarest-first)
 * then unearned "ghost" chips as the collection/chase tease.
 *
 * House rule — FAIL LOUD: a summary fetch failure is surfaced in an honest banner
 * (never a silent blank); the dashboard shows the known game count with the rest
 * pending/zeroed rather than fabricating aggregates.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import HGBTable, { type HGBColumnDef, NAME_FONT_SIZE, CELL_FONT_SIZE } from './HGBTable';
import { pickTeamColor } from '../../lib/team-colors';
import { NHL_TEAMS, NHL_TEAM_NAMES } from '../../lib/nhl-teams';
import { getMe, getSessionToken, apiFetch } from '../../lib/auth-client';
import {
  sortCatalog,
  parseOneInN,
  normalizePeriod,
  badgeBlurb,
  type CatalogBadge,
} from './puck-passport-badges';
import { drawPassportCard, type PassportShareData } from './puck-passport-share';

const API = 'https://api.hockeygamebot.com';
const STORAGE_KEY = 'hgb_puck_passport_games';
// Logged-out summary cache: the POST /v1/account/attended/summary response keyed
// by the sorted attended game-id list (see summaryCacheKey). Reused until the list
// changes — a add/remove yields a new key, missing the cache and refetching.
const SUMMARY_CACHE_KEY = 'hgb_puck_passport_summary_v1';
// Public summary endpoint caps the game-id list (anonymous callers can trigger
// backfill fetches). Logged-out lists beyond this compute stats on the first
// SUMMARY_ID_CAP only — surfaced loudly (never silently truncated). A softer
// "log in to sync" nudge fires well before then (SUMMARY_NUDGE_AT).
const SUMMARY_ID_CAP = 60;
const SUMMARY_NUDGE_AT = 10;
// Display snapshot cache (venue, period type, team abbrev/name/score) keyed by
// game_id. This is what lets the logged-in D1 list — which carries only team
// *ids* and no venue — still render arenas + OT/SO chips on the device that
// logged the game. Cross-device games fall back to /v1/config + game_results.
const DETAILS_KEY = 'hgb_puck_passport_details_v1';

// ── Types ─────────────────────────────────────────────────────────────────────

type TeamSide = { id: number; abbrev: string; name: string; score: number };

/** The persisted shape — enough to render the game LIST (matchup / score / venue
 *  / OT chip) with zero network. Aggregates come from the server summary. */
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
 *  pre-resolved server-side (no client "F. Last" upgrade needed). The longest-game
 *  record additionally carries the elapsed clock (`total_time` "92:56" +
 *  `total_time_seconds`) which the share card renders as its bold hero. */
type SummaryRecord = {
  label: string;
  value: string;
  sub: string;
  game_id?: string;
  player_id?: number;
  name?: string;
  total_time?: string | null;
  total_time_seconds?: number | null;
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

/** A single-game record normalized for render (from the server summary). The
 *  longest-game row carries `total_time` for the share card's bold-hero clock. */
type ViewRecord = { key: string; label: string; value: string; sub: string; total_time?: string | null };

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

/** Stable cache key for a set of attended games: the sorted, de-duped game-id
 *  list. Order-independent, so re-adding the same games hits the cache; adding or
 *  removing one yields a new key (cache miss → refetch). */
function summaryCacheKey(gameIds: string[]): string {
  return Array.from(new Set(gameIds)).sort().join(',');
}

/** The cached logged-out summary, or null. Returned with its key so the caller can
 *  confirm it still matches the current attended list before using it. */
function readSummaryCache(): { key: string; summary: AttendedSummary } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = JSON.parse(localStorage.getItem(SUMMARY_CACHE_KEY) ?? 'null');
    if (raw && typeof raw === 'object' && typeof raw.key === 'string' && raw.summary) {
      return raw as { key: string; summary: AttendedSummary };
    }
  } catch {
    /* ignore */
  }
  return null;
}

function writeSummaryCache(key: string, summary: AttendedSummary): void {
  try {
    localStorage.setItem(SUMMARY_CACHE_KEY, JSON.stringify({ key, summary }));
  } catch {
    /* private mode / quota — the next load just refetches */
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
    out.push({
      key,
      label: r.label,
      value: r.value,
      sub: r.name ? `${r.name} · ${r.sub}` : r.sub,
      total_time: r.total_time ?? null,
    });
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

  // Server summary — the SOLE source of every aggregate in BOTH auth states.
  // null + summaryError ⇒ FAIL LOUD: an honest banner (no client fallback).
  const [summary, setSummary] = useState<AttendedSummary | null>(null);
  const [summaryError, setSummaryError] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);

  /** Fetch (or refetch) the AUTHED summary (logged-in). FAIL LOUD on any failure:
   *  clears the payload and flags the error so the dashboard surfaces a banner. */
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

  /** Load the PUBLIC summary (logged-out) via POST { game_ids }. The response is
   *  cached in localStorage keyed by the sorted game-id list, so it is reused until
   *  the list changes (add/remove ⇒ new key ⇒ cache miss ⇒ refetch). Mirrors the
   *  planned iOS userDefaults+cache pattern. FAIL LOUD on error: banner, no blank
   *  fabrication. An empty list clears the summary (the empty-state renders). */
  const loadPublicSummary = useCallback(async (gameIds: string[]) => {
    if (gameIds.length === 0) {
      setSummary(null);
      setSummaryError(false);
      return;
    }
    // The endpoint caps the id list per request (see SUMMARY_ID_CAP).
    const ids = Array.from(new Set(gameIds)).slice(0, SUMMARY_ID_CAP);
    const key = summaryCacheKey(ids);

    const cached = readSummaryCache();
    if (cached && cached.key === key) {
      setSummary(cached.summary);
      setSummaryError(false);
      return;
    }

    setSummaryLoading(true);
    try {
      const r = await fetch(`${API}/v1/account/attended/summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game_ids: ids }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      if (!data || data.error || !data.counters || !data.badges) throw new Error('bad summary payload');
      setSummary(data as AttendedSummary);
      setSummaryError(false);
      writeSummaryCache(key, data as AttendedSummary);
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

  // Sorted attended game-id list — the identity/cache key for the public summary.
  // Recomputing only when the id SET changes keeps the logged-out summary effect
  // from refiring on unrelated re-renders.
  const gameIdKey = useMemo(() => summaryCacheKey(games.map((g) => g.game_id)), [games]);

  // Display-name upgrade only: the server may leave a players_seen name null for
  // historical players; players.json backfills a properly-cased name. Non-fatal.
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

  // ── Load the server summary (source of truth for aggregates, both auth states) ─
  //   Logged IN  → authed GET (once, on login).
  //   Logged OUT → public POST { game_ids }, refetched whenever the attended id SET
  //                changes (keyed by gameIdKey; the loader's localStorage cache
  //                short-circuits a no-op re-fire).
  useEffect(() => {
    if (!hydrated) return;
    if (isLoggedIn) {
      loadSummary();
    } else {
      loadPublicSummary(games.map((g) => g.game_id));
    }
    // games is read but intentionally keyed via gameIdKey so the effect fires only
    // on a real list change (not on every unrelated re-render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, isLoggedIn, gameIdKey, loadSummary, loadPublicSummary]);

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

  // ── View layer — the server summary is the SOLE source (both auth states) ────
  // Every aggregate below reads from the summary payload; when it hasn't arrived
  // (loading) or FAILED, we render the known game count with the rest zeroed and
  // surface a banner (FAIL LOUD) rather than fabricating figures client-side.
  const summaryPending = summary == null && !summaryError && games.length > 0;

  const viewCounters = useMemo(() => {
    if (summary) {
      const c = summary.counters;
      return { games: c.games, periods: c.periods, goals: c.goals, shots: c.shots, playersSeen: c.players_seen };
    }
    // No summary yet (loading / error / empty): the game count is always known
    // from the list; the rest await the summary.
    return { games: games.length, periods: 0, goals: 0, shots: 0, playersSeen: 0 };
  }, [summary, games.length]);

  const viewBoxIncomplete = summary ? summary.box_incomplete : false;
  const viewMissingBoxCount = summary ? summary.missing_box_game_ids?.length ?? 0 : 0;

  const viewTeamRecords = summary ? summary.team_records : [];

  const viewArenas = useMemo(
    () => (summary ? { list: summary.arenas.list, unknown: summary.arenas.unknown } : { list: [], unknown: 0 }),
    [summary],
  );
  const viewArenaBadge = summary
    ? { visited: summary.arenas.visited, total: summary.arenas.total }
    : { visited: 0, total: 32 };

  const viewSeenPlayers = useMemo<SeenPlayerRow[]>(() => {
    if (!summary) return [];
    return summary.players_seen.map((p) => ({
      player_id: p.player_id,
      name: p.name ?? nameMap?.get(p.player_id) ?? `#${p.player_id}`,
      team: p.team,
      pos: p.pos,
      gamesSeen: p.games,
      goals: p.goals,
    }));
  }, [summary, nameMap]);

  const viewRecords = useMemo<ViewRecord[]>(
    () => (summary ? summaryRecordsToView(summary.records) : []),
    [summary],
  );

  // Full badge catalog (§2): earned first (rarest-first) then ghost/unearned.
  const catalog = useMemo<CatalogBadge[]>(() => {
    if (!summary) return [];
    // Drop `arenas-visited`: the server catalog carries it, but a dedicated
    // "Arenas Visited" collection badge is rendered separately below. Without
    // this filter the view shows two Arenas badges and double-counts it in the
    // earned tally.
    return sortCatalog(summary.badges.catalog.filter((c) => c.id !== 'arenas-visited').map(mapSummaryCatalog));
  }, [summary]);
  const earnedCount = useMemo(() => catalog.filter((c) => c.earned).length, [catalog]);

  // Milestones Witnessed — server-provided (same payload in both auth states).
  const milestones = summary ? summary.milestones : [];
  // ── Share card (client-side canvas PNG) ──────────────────────────────────────
  // Draws the SAME in-memory aggregates to a portrait canvas and hands it to the
  // shared HGB_Export modal (download / long-press-to-save), exactly like the
  // player/goalie cards. No new network fetch — everything below is already in
  // memory. Disabled while empty (see render).
  const handleShare = useCallback(async () => {
    // Everything below reads from the VIEW aggregates — the same server-summary
    // source the page renders from — so the card is correct in BOTH auth states.

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
      // Longest-game elapsed clock ("92:56") when the summary supplies it; the
      // card renders it as the bold hero and falls back to "N periods" otherwise.
      total_time: r.total_time ?? null,
    }));

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
      // No accent — every Passport card uses the HGB brand red for brand cohesion.
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
  }, [catalog, viewRecords, viewCounters, viewArenaBadge, viewBoxIncomplete]);

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
          Couldn't load your Passport stats right now — your games are still saved. Reload to retry.
        </div>
      ) : null}
      {viewBoxIncomplete ? (
        <div className="att-banner att-banner-warn">
          Couldn't load box scores for {viewMissingBoxCount} game{viewMissingBoxCount === 1 ? '' : 's'} — Shots and
          Players Seen may be incomplete. Reload to retry.
        </div>
      ) : null}

      {/* Logged-out escalation: a soft "sync" nudge well before the cap, and a
          LOUD truncation notice once the list exceeds what the anonymous summary
          can cover — never silently under-report. */}
      {!isLoggedIn && games.length > SUMMARY_ID_CAP ? (
        <div className="att-banner att-banner-warn">
          Stats cover your first {SUMMARY_ID_CAP} games — log in to sync all {games.length} and keep your Passport accurate.
        </div>
      ) : !isLoggedIn && games.length >= SUMMARY_NUDGE_AT ? (
        <div className="att-banner">
          Log in to sync your games across devices and keep your stats accurate.
        </div>
      ) : null}

      {/* Counter row */}
      <div className="att-counters">
        <Counter label="Games" value={viewCounters.games} />
        <Counter label="Periods" value={viewCounters.periods} />
        <Counter label="Goals" value={viewCounters.goals} />
        <Counter label="Shots" value={viewCounters.shots} pending={summaryPending} warn={viewBoxIncomplete} />
        <Counter
          label="Players Seen"
          value={viewCounters.playersSeen}
          pending={summaryPending}
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
                {summaryPending ? ' · loading…' : ''}
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
              data={[...games].sort((a, b) => b.date.localeCompare(a.date))}
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
