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
import HGBTable, { type HGBColumnDef, NAME_FONT_SIZE, CELL_FONT_SIZE, TEAM_LOGO_STYLE, teamLogoSrc } from './HGBTable';
import { pickTeamColor } from '../../lib/team-colors';
import { NHL_TEAMS, NHL_TEAM_NAMES } from '../../lib/nhl-teams';
import { nhlGameType } from '../../lib/nhl-game-type';
import { readPhotoDate, readPhotoGps, type GpsCoord } from '../../lib/exif-date';
import { nearestArena, haversineKm } from '../../lib/arena-match';
import { readGeoPreference, recordGrant, disableGeo, type GeoPrefState } from '../../lib/geo-preference';
import { harvestDates } from '../../lib/import-dates';
import { getMe, getSessionToken, apiFetch } from '../../lib/auth-client';
import PublicPassportPanel from './PublicPassportPanel';
import PassportWhatsNew from './PassportWhatsNew';
import {
  sortCatalog,
  buildLocalCatalog,
  parseOneInN,
  normalizePeriod,
  badgeBlurb,
  type CatalogBadge,
  type TierBadgeView,
  type ArenaRungView,
  arenaMeterLabel,
  type BadgeEarnedGame,
} from './puck-passport-badges';
import { drawPassportCard, drawTicketStub, drawStubGrid, type PassportShareData } from './puck-passport-share';
import { trackEvent } from '../../lib/track';
import { isFeatureEnabled } from '../../lib/feature-flags';
import TonightGameCard from './TonightGameCard';

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
// Whether the featured-stub hero is collapsed (per-browser UI pref, not synced).
const HERO_COLLAPSE_KEY = 'hgb_pp_hero_collapsed';

// Rooting-perspective anchor preference. LOGGED-IN users store the anchor SERVER-side
// (PUT /v1/account/prefs — see writeAnchor); this localStorage key is the LOGGED-OUT
// (anon) persistence only, sent as the `anchor` param on the public summary POST.
// Value is a team_id string (explicit team), ANCHOR_NONE ("no rooting interest"), or
// absent (unset → server infers). v2: was an abbrev in the client-compute prototype.
const ANCHOR_PREF_KEY = 'hgb_puck_passport_anchor_v2';
const ANCHOR_NONE = '__none__';

// A freshly-added or just-merged game is not box-scored server-side yet, so the
// FIRST summary after it lands is transiently box_incomplete (partial shots /
// players). Rather than flash the alarming "couldn't load box scores" banner and
// a confident-but-wrong counter, we do ONE bounded retry after a short delay to
// let the server's lazy backfill finish, then surface the banner ONLY if the set
// is STILL incomplete (a game the NHL genuinely can't box-score stays flagged —
// fail loud). The single pending retry is debounced so rapid multi-add collapses.
const SUMMARY_HEAL_DELAY_MS = 2000;
const MAX_SUMMARY_RETRIES = 1;

// ── Types ─────────────────────────────────────────────────────────────────────

export type TeamSide = { id: number; abbrev: string; name: string; short_name?: string | null; score: number };

/** The persisted shape — enough to render the game LIST (matchup / score / venue
 *  / OT chip) with zero network. Aggregates come from the server summary. */
export type AttendedGame = {
  game_id: string;
  date: string; // YYYY-MM-DD (hockey date)
  home: TeamSide;
  away: TeamSide;
  venue: string | null;
  last_period_type: string | null; // REG | OT | SO | (playoff OT variants)
  status: string;
  added_at: string; // ISO
  // ── Manual games only (games the NHL API can't find: old/preseason/neutral-site
  //    /memory-gap). is_manual marks the row; home_score/away_score carry the RAW
  //    nullable scores so "no score entered" (null) is never rendered as a
  //    fabricated 0. NHL games leave these undefined. ──
  is_manual?: boolean;
  home_score?: number | null;
  away_score?: number | null;
};

/** LOCKED backend contract for a manually-logged game (snake_case). Its id is
 *  always `manual-<random>`; scores are null when the fan didn't enter them. */
type ManualGame = {
  id: string; // "manual-<random>"
  home_team_id: number;
  away_team_id: number;
  date: string; // YYYY-MM-DD
  home_score: number | null;
  away_score: number | null;
  venue: string | null;
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
  is_manual?: number | boolean | null; // 1/true for manually-logged games
  // Server-resolved DISPLAY identity (teamDisplayById) — knows relocated/defunct
  // franchises the client /v1/config (current 32) does not. Optional: absent on an
  // api that predates this, so mapD1Row falls back to config → String(id).
  home_team_abbrev?: string | null;
  home_team_name?: string | null;
  away_team_abbrev?: string | null;
  away_team_name?: string | null;
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

/** One team's W-L-OTL record (server-computed). `otl` folds OT/SO losses. */
type TeamRecord = { abbrev: string; name: string; w: number; l: number; otl: number };

/** The anchored ("your record vs each team") view, server-computed. null when the
 *  user has no rooting anchor (source 'none' or no inferable team). */
type TeamRecordsAnchored = {
  anchor: TeamRecord; // the anchor team's own overall W-L-OTL
  opponents: TeamRecord[]; // record vs each opponent, most-played first
  neutral_games: number; // finals the anchor didn't play in
};

/** The resolved anchor + how it was chosen (drives the banner). null pre-anchor
 *  or when the api hasn't shipped the field yet (graceful fallback → neutral). */
export type SummaryAnchor = {
  team_id: number;
  abbrev: string;
  source: 'explicit' | 'inferred' | 'none';
};

export type AttendedSummary = {
  counters: { games: number; periods: number; goals: number; shots: number; players_seen: number };
  // W-L-OTL neutral ledger (otl added server-side). `otl` may be absent on an
  // older api deploy — the render tolerates it (graceful fallback).
  team_records: TeamRecord[];
  // Perspective-anchored view + the resolved anchor. Both OPTIONAL: an api that
  // predates the rooting-perspective port omits them, and the client falls back
  // to the neutral team_records table (never crashes / shows a broken table).
  team_records_anchored?: TeamRecordsAnchored | null;
  anchor?: SummaryAnchor | null;
  // "Home rinks collected" model: home_rinks = distinct CURRENT teams seen at home
  // (≤ 32, the /32 collection meter); distinct_buildings = every distinct building
  // visited (can EXCEED 32 — relocations, neutral-site games); teams_seen = the
  // current-team ids collected, used to colour the per-team pips.
  arenas: {
    home_rinks: number;
    total: number;
    distinct_buildings: number;
    teams_seen: number[];
    // The /32 ladder's rung, bucketed from home_rinks (2026-08-02). Optional so an
    // older Worker degrades to the bare "N of 32 collected" rather than a wrong rung.
    rung?: number;
    rung_name?: string;
    next_threshold?: number | null;
    next_rung_name?: string | null;
  };
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
    // `games`: the specific earning games, resolved + sorted newest-first server-side.
    // Present ONLY on this authed/owner summary — the PUBLIC passport projection
    // strips it (privacy). Drives the owner-only badge drill-down.
    earned: {
      id: string;
      label: string;
      family: string;
      count: number;
      rarity: string;
      note?: string;
      games?: BadgeEarnedGame[];
    }[];
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
  // Cumulative stat ladders (Games/Goals/Shots/Players/Arenas). Always all 5,
  // locked ones included — server-computed since 2026-08-02 (was client-side).
  tiers: TierBadgeView[];
  milestones: SummaryMilestone[];
  box_incomplete: boolean;
  missing_box_game_ids: string[];
  // Count of manually-logged ("unverified") games in the set. Manual games count
  // toward Games + Arena + Team record, but are EXCLUDED from periods/goals/shots/
  // players/badges/records — this drives the honest "N added manually" footnote.
  unverified_count: number;
};

/** A single-game record normalized for render (from the server summary). The
 *  longest-game row carries `total_time` for the share card's bold-hero clock. */
type ViewRecord = { key: string; label: string; value: string; sub: string; total_time?: string | null };

// Raw shapes from /v1/games/today
export type RawTeam = { id: number; abbrev: string; name: string; short_name?: string | null; score: number };
/** Canonical home-arena identity + coords, added to /v1/games/today alongside
 *  /v1/passport/tonight (see tonight-client.ts's TonightArena) — same shape,
 *  same server-side `arenaForGame()` helper. null for an unrecognised home abbrev. */
export type RawArena = { abbrev: string; name: string; lat: number; lon: number };
export type RawGame = {
  game_id: string;
  date: string;
  home_team: RawTeam;
  away_team: RawTeam;
  venue: string | null;
  last_period_type: string | null;
  status: string;
  arena?: RawArena | null;
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
    arena: g.arena ?? null,
  }));
}

// By-Date range cap. A range fires one /v1/games/today fetch per day, so we bound
// it (14 days is plenty for "which night that week was it?") rather than let a
// fat-fingered range spray dozens of requests.
const MAX_DATE_SPAN_DAYS = 14;

// Import (photos / paste) looks up one date at a time; cap a single batch so a huge
// photo dump or pasted history can't fan out unbounded (do it in a few passes).
const IMPORT_MAX_DATES = 150;
const IMPORT_FETCH_CONCURRENCY = 6;

/** Inclusive list of YYYY-MM-DD from `from` to `to` (UTC, DST-safe). Returns null
 *  if the span is invalid or exceeds MAX_DATE_SPAN_DAYS, so callers fail loud
 *  instead of firing an unbounded fan-out. */
function datesInRange(from: string, to: string): string[] | null {
  const start = new Date(`${from}T00:00:00Z`).getTime();
  const end = new Date(`${to}T00:00:00Z`).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null;
  const out: string[] = [];
  for (let t = start; t <= end; t += 86400000) {
    out.push(new Date(t).toISOString().slice(0, 10));
    if (out.length > MAX_DATE_SPAN_DAYS) return null;
  }
  return out;
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
    if (!Array.isArray(raw)) return [];
    // Sanitize: an old/corrupt persisted row missing a string game_id or date would
    // crash the whole tracker downstream (sorts call .localeCompare on them). Drop
    // any row without both — a malformed row can never be rendered anyway.
    return raw.filter(
      (r): r is AttendedGame =>
        r != null && typeof r.game_id === 'string' && typeof r.date === 'string',
    );
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

const STUB_DATE_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "2017-12-29" → "Dec 29, 2017". Pure string parse (no Date() — avoids a TZ shift
 *  that can render the wrong day). Returns the input unchanged if it isn't YYYY-MM-DD. */
function fmtStubDate(d: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d ?? '');
  if (!m) return d ?? '';
  return `${STUB_DATE_MONTHS[+m[2] - 1]} ${+m[3]}, ${m[1]}`;
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

/** The persisted rooting-anchor preference: a team abbrev, ANCHOR_NONE, or null
 *  (unset → inferred). */
function readAnchorPref(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(ANCHOR_PREF_KEY);
  } catch {
    return null;
  }
}

function writeAnchorPref(v: string | null): void {
  try {
    if (v == null) localStorage.removeItem(ANCHOR_PREF_KEY);
    else localStorage.setItem(ANCHOR_PREF_KEY, v);
  } catch {
    /* private mode / quota — the choice just doesn't persist across reloads */
  }
}

/** Map the stored logged-out pref → the public-summary `anchor` body param: a
 *  team_id (explicit), "none" (no rooting interest), or undefined (omit ⇒ let the
 *  server infer). */
function anchorParamFromPref(pref: string | null): number | 'none' | undefined {
  if (pref == null) return undefined;
  if (pref === ANCHOR_NONE) return 'none';
  const id = Number(pref);
  return Number.isFinite(id) && id > 0 ? id : undefined;
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

/** What THIS log newly unlocked (badges / first-ever arena / crossed milestone),
 *  plus the resulting totals. Only ever populated when `?earned=1` is requested AND
 *  the row was newly created (a retry/double-tap must not re-announce a badge the
 *  user already has). See hgb-api `deriveEarned` — the client never re-derives this. */
export type EarnedDelta = {
  earned: { badges: string[]; new_arena: boolean; milestones: string[] };
  current: { games: number; arenas: number };
};

/** POST /v1/account/attended (upsert). Pass `earned: true` (the Tonight card's one
 *  opt-in log) to also get back what this log newly unlocked — costs the server one
 *  extra summary computation, so it's off by default (bulk add doesn't pay it). */
async function postAttended(
  gameId: string,
  opts: { earned?: boolean } = {},
): Promise<{ ok: boolean; earned?: EarnedDelta }> {
  try {
    const url = new URL(`${API}/v1/account/attended`);
    if (opts.earned) url.searchParams.set('earned', '1');
    const r = await apiFetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game_id: gameId }),
    });
    if (!r.ok) return { ok: false };
    if (!opts.earned) return { ok: true };
    try {
      const data = await r.json();
      return { ok: true, earned: data?.earned && data?.current ? (data as EarnedDelta) : undefined };
    } catch {
      return { ok: true }; // parse failure must not fail the attend — it already landed
    }
  } catch {
    return { ok: false };
  }
}

/** POST /v1/account/attended for a MANUAL game — sends both signals the backend
 *  accepts: `is_manual: true` plus the ManualGame fields (its `manual-` id is a
 *  top-level id too). The authed GET summary folds it in, so no public POST. */
async function postManualAttended(m: ManualGame): Promise<boolean> {
  try {
    const r = await apiFetch(`${API}/v1/account/attended`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_manual: true, ...m }),
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
  const side = (
    id: number | null,
    score: number | null,
    snapSide?: TeamSide,
    // Server-resolved DISPLAY identity (teamDisplayById) — the SOLE source that
    // knows relocated/defunct franchises (ARI 53, ATL 11, HFD 34…). Preferred over
    // /v1/config, which is the current 32 only and would fall through to String(id).
    serverAbbrev?: string | null,
    serverName?: string | null,
  ): TeamSide => {
    const info = id != null ? configMap.get(id) : undefined;
    return {
      id: id ?? snapSide?.id ?? 0,
      abbrev: serverAbbrev ?? info?.abbrev ?? snapSide?.abbrev ?? (id != null ? String(id) : '?'),
      name: serverName ?? info?.name ?? snapSide?.name ?? '',
      // /v1/config carries no short_name — only the local display snapshot does
      // (captured at add-time). Cross-device D1 rows without a snapshot fall back
      // to abbrev in the render helper (never blank).
      short_name: snapSide?.short_name ?? null,
      score: score ?? snapSide?.score ?? 0,
    };
  };
  const isFinal = r.is_final != null ? !!r.is_final : snap?.status === 'final';
  const isManual = r.is_manual != null ? !!r.is_manual : r.game_id.startsWith('manual-');
  return {
    game_id: r.game_id,
    date: r.game_date ?? snap?.date ?? '',
    home: side(r.home_team_id, r.home_score, snap?.home, r.home_team_abbrev, r.home_team_name),
    away: side(r.away_team_id, r.away_score, snap?.away, r.away_team_abbrev, r.away_team_name),
    // Prefer the server's game_results facts (cross-device / after a cache
    // clear the local snapshot is absent); fall back to the local snapshot.
    venue: r.venue ?? snap?.venue ?? null,
    last_period_type: r.last_period_type ?? snap?.last_period_type ?? null,
    status: isFinal ? 'final' : snap?.status ?? 'scheduled',
    added_at: r.created_at ?? snap?.added_at ?? '',
    ...(isManual
      ? { is_manual: true, home_score: r.home_score ?? snap?.home_score ?? null, away_score: r.away_score ?? snap?.away_score ?? null }
      : {}),
  };
}

// ── Manual games (games the NHL API can't find) ─────────────────────────────────

/** Fresh `manual-<random>` id. crypto.randomUUID where available, else a short
 *  base36 token — either way distinct from every 10-digit NHL game_id. */
function genManualId(): string {
  const rand =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `manual-${rand}`;
}

/** Project a stored manual AttendedGame back onto the LOCKED ManualGame wire shape
 *  (the id is already `manual-…`; the raw nullable scores are preserved). */
function toManualGame(g: AttendedGame): ManualGame {
  return {
    id: g.game_id,
    home_team_id: g.home.id,
    away_team_id: g.away.id,
    date: g.date,
    home_score: g.home_score ?? null,
    away_score: g.away_score ?? null,
    venue: g.venue,
  };
}

/** Split the attended list for the PUBLIC summary POST: NHL games → `game_ids`,
 *  manual games → `manual_games`. Dedupes and enforces the COMBINED cap (the
 *  public endpoint caps `game_ids.length + manual_games.length`, see SUMMARY_ID_CAP)
 *  by walking the list in order and stopping once the combined count hits the cap. */
function splitForSummary(games: AttendedGame[]): { gameIds: string[]; manualGames: ManualGame[] } {
  const gameIds: string[] = [];
  const manualGames: ManualGame[] = [];
  const seen = new Set<string>();
  for (const g of games) {
    if (seen.has(g.game_id)) continue;
    seen.add(g.game_id);
    if (g.is_manual) manualGames.push(toManualGame(g));
    else gameIds.push(g.game_id);
    if (gameIds.length + manualGames.length >= SUMMARY_ID_CAP) break;
  }
  return { gameIds, manualGames };
}

// ── Small derivations ───────────────────────────────────────────────────────────

/** Render a game-row matchup team label as BOTH forms: the team SHORT NAME
 *  ("Devils") for wide layouts and the ABBREV ("NJD") for the narrow mobile
 *  layout — CSS (`.pp-team-full` / `.pp-team-abbr`) toggles which shows by
 *  breakpoint. When short_name is missing (old stored games / cross-device
 *  D1 rows), the abbrev fills BOTH spans so it shows at every width, never blank. */
function teamMatchupLabel(
  shortName: string | null | undefined,
  abbrev: string,
  // Full team name fallback ("New York Rangers") for the wide span when short_name is
  // absent — cross-device D1 rows carry no short_name but DO carry the server-resolved
  // name, so the wide layout shows a name, not the abbrev. Abbrev stays last-resort.
  fullName?: string | null,
): React.ReactElement {
  const wide =
    shortName && shortName.trim()
      ? shortName
      : fullName && fullName.trim()
        ? fullName
        : abbrev;
  return (
    <>
      <span className="pp-team-full">{wide}</span>
      <span className="pp-team-abbr">{abbrev}</span>
    </>
  );
}

/** Format a server team record as "W-L-OTL", tolerating an older api deploy that
 *  omits `otl` (renders "W-L" — graceful fallback, never "W-L-undefined"). */
function fmtRec(r: { w: number; l: number; otl?: number }): string {
  return typeof r.otl === 'number' ? `${r.w}-${r.l}-${r.otl}` : `${r.w}-${r.l}`;
}

/** Possessive form of a team name, avoiding "Devils's": names ending in s take a
 *  bare apostrophe ("New Jersey Devils'"), others take "'s" ("Avalanche's"). */
function possessive(name: string): string {
  return /s$/i.test(name) ? `${name}’` : `${name}’s`;
}

function winnerAbbrev(g: AttendedGame): string | null {
  if (g.status !== 'final') return null;
  if (g.home.score > g.away.score) return g.home.abbrev;
  if (g.away.score > g.home.score) return g.away.abbrev;
  return null;
}

/** Parse NHL game_id: SSSSTTNNNN → game-type digit pair. */
/** Chip label for a game's type. Taxonomy lives in ONE place — see nhl-game-type.ts. */
function gameTypeLabel(gameId: string): string {
  return nhlGameType(gameId).chip;
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

const DRILL_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Format an earning-game date human-readably → "Nov 15, 2024". Parses a bare
 *  "YYYY-MM-DD" by hand (no Date TZ-shift that would roll it to the prior day in
 *  western zones); falls back to the raw string if it isn't in that shape. */
function formatDrillDate(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (!m) return date;
  const [, y, mo, d] = m;
  const mon = DRILL_MONTHS[Number(mo) - 1];
  if (!mon) return date;
  return `${mon} ${Number(d)}, ${y}`;
}

/** One DISTINCT game in the drill-down, after grouping the server's rows by
 *  game_id. The 4 player-moment badges send ONE ROW PER QUALIFYING PLAYER, so a
 *  single game can appear multiple times — group them so a game with two 3-point
 *  scorers is one row listing both names, and the row count matches the badge's
 *  per-GAME ×count. */
type DrillGameRow = {
  game_id: string;
  date: string;
  matchup: BadgeEarnedGame['matchup'];
  players: string[]; // qualifying player names for this game (empty for moment badges)
};

/** Group earning games by game_id, preserving first-seen (newest-first) order and
 *  collecting each game's qualifying player names (de-duped by player id). */
function groupDrillGames(games: BadgeEarnedGame[]): DrillGameRow[] {
  const byGame = new Map<string, DrillGameRow>();
  const seenPlayer = new Map<string, Set<number>>();
  for (const g of games) {
    let row = byGame.get(g.game_id);
    if (!row) {
      row = { game_id: g.game_id, date: g.date, matchup: g.matchup, players: [] };
      byGame.set(g.game_id, row);
      seenPlayer.set(g.game_id, new Set());
    }
    if (g.player) {
      const seen = seenPlayer.get(g.game_id)!;
      if (!seen.has(g.player.id)) {
        seen.add(g.player.id);
        row.players.push(g.player.name);
      }
    }
  }
  return [...byGame.values()];
}

/** Count of DISTINCT games behind an earned badge — the number that must match the
 *  badge's per-game ×count (and the "View N games" hint). */
function distinctGameCount(games: BadgeEarnedGame[]): number {
  return new Set(games.map((g) => g.game_id)).size;
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

// ── Add-flow game row ────────────────────────────────────────────────────────────
// One selectable search-result row (teams · score · date/venue · +Attended). Shared
// by the Import review list; mirrors the inline markup By Date/By Team already use.
function GameAddRow({
  g,
  already,
  disabled,
  onToggle,
  matched,
}: {
  g: RawGame;
  already: boolean;
  disabled: boolean;
  onToggle: (g: RawGame, already: boolean) => void;
  matched?: { arena: string; km: number };
}) {
  const awayColor = pickTeamColor(g.away_team.abbrev);
  const homeColor = pickTeamColor(g.home_team.abbrev);
  const dist = matched ? (matched.km < 1 ? `${Math.round(matched.km * 1000)}m` : `${matched.km.toFixed(1)}km`) : '';
  return (
    <div className={matched ? 'att-add-row att-add-row-matched' : 'att-add-row'}>
      <div className="att-add-info">
        {matched ? (
          <span className="att-add-matched">📍 Your photo was here — {matched.arena} · {dist} away</span>
        ) : null}
        <span className="att-add-line">
          <span className="att-add-teams">
            <span style={{ color: awayColor, fontWeight: 700 }}>
              {teamMatchupLabel(g.away_team.short_name, g.away_team.abbrev)}
            </span>
            <span className="att-add-at">@</span>
            <span style={{ color: homeColor, fontWeight: 700 }}>
              {teamMatchupLabel(g.home_team.short_name, g.home_team.abbrev)}
            </span>
          </span>
          <span className="att-add-score">
            {g.status === 'final' ? `${g.away_team.score}–${g.home_team.score}` : g.status}
          </span>
        </span>
        <span className="att-add-meta">
          <span className="att-add-date">{g.date}</span>
          {g.venue ? <span className="att-add-venue">{g.venue}</span> : null}
        </span>
      </div>
      <button
        className={already ? 'att-add-btn added' : 'att-add-btn'}
        onClick={() => onToggle(g, already)}
        disabled={disabled}
        title={already ? 'Remove from your attended games' : undefined}
      >
        {already ? '✓ Added' : '+ Attended'}
      </button>
    </div>
  );
}

// ── Counter card ─────────────────────────────────────────────────────────────────

function prefersReducedMotion(): boolean {
  try {
    return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

// The tallies are the emotional core of the passport ("it adds up"), so they ROLL
// on change — but only when the change is meaningful:
//   • first settled value (page load, box scores resolving) → SNAP, no roll.
//     Animating every visit reads as noise and would fight the async box load.
//   • a later change (you logged / removed a game) → roll the delta.
//   • an explicit replay (clicking the Games tally) → reset to 0 and roll to full.
// Respects prefers-reduced-motion (snaps). `value` may be a string for non-numeric
// tallies; those render verbatim with no animation.
function Counter({
  label,
  value,
  pending,
  warn,
  replayToken = 0,
  onClick,
  hint,
}: {
  label: string;
  value: number | string;
  pending?: boolean;
  warn?: boolean;
  replayToken?: number;
  onClick?: () => void;
  hint?: string;
}) {
  const numeric = typeof value === 'number';
  const [display, setDisplay] = useState<number>(numeric ? (value as number) : 0);
  const displayRef = useRef(display);
  const settledRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const replayRef = useRef(replayToken);

  const setDisp = (v: number) => {
    displayRef.current = v;
    setDisplay(v);
  };
  const cancel = () => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  };
  const animateTo = useCallback((from: number, to: number) => {
    cancel();
    if (from === to) {
      setDisp(to);
      return;
    }
    // Bigger jumps roll a touch longer, capped — a 3-game add shouldn't feel as
    // epic as a from-zero replay of a 200-game passport.
    const dur = Math.min(1400, 450 + Math.abs(to - from) * 14);
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const e = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setDisp(Math.round(from + (to - from) * e));
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
      else {
        setDisp(to);
        rafRef.current = null;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  // Value / pending transitions.
  useEffect(() => {
    if (!numeric) return;
    const target = value as number;
    if (pending) {
      setDisp(target); // still loading → keep synced under the "…", no roll
      return;
    }
    if (!settledRef.current) {
      settledRef.current = true;
      setDisp(target); // first real value → snap (no load animation)
      return;
    }
    if (prefersReducedMotion()) {
      setDisp(target);
      return;
    }
    animateTo(displayRef.current, target); // a real add/remove → roll the delta
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, pending, numeric]);

  // Explicit replay (Games tally clicked): reset to 0 and roll up to the full total.
  useEffect(() => {
    if (replayToken === replayRef.current) return;
    replayRef.current = replayToken;
    if (!numeric || pending) return;
    if (prefersReducedMotion()) {
      setDisp(value as number);
      return;
    }
    animateTo(0, value as number);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replayToken]);

  useEffect(() => cancel, []);

  const shown = numeric ? display : value;
  const clickable = !!onClick;
  return (
    <div
      className={clickable ? 'att-counter att-counter-click' : 'att-counter'}
      onClick={onClick}
      title={hint}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick!();
              }
            }
          : undefined
      }
    >
      <div className="att-counter-num">
        {pending ? <span className="att-counter-pending">…</span> : shown}
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
  // Puck Passport public identity (from /v1/auth/me) — drives the "Your public
  // passport" share panel. handle is non-null for real logins.
  const [passportHandle, setPassportHandle] = useState<string | null>(null);
  const [passportPublic, setPassportPublic] = useState<boolean>(false);
  const [configMap, setConfigMap] = useState<Map<number, TeamInfo>>(new Map());
  const detailsRef = useRef<Record<string, AttendedGame>>({});
  const [detailsVersion, setDetailsVersion] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const [d1Error, setD1Error] = useState(false); // FAIL LOUD: D1 list failed to load
  const [writeError, setWriteError] = useState<string | null>(null); // add/remove/sync failed
  // Owner-only badge drill-down: the earned badge whose earning games are shown in
  // a modal (null = closed). Only ever set from an EARNED chip that carries `games`
  // (present solely on the owner's own summary — see the catalog join above).
  const [drillBadge, setDrillBadge] = useState<CatalogBadge | null>(null);
  // Close the drill-down on Escape while it's open (backdrop + ✕ close via onClick).
  useEffect(() => {
    if (!drillBadge) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrillBadge(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drillBadge]);

  // Server summary — the SOLE source of every aggregate in BOTH auth states.
  // null + summaryError ⇒ FAIL LOUD: an honest banner (no client fallback).
  const [summary, setSummary] = useState<AttendedSummary | null>(null);
  const [summaryError, setSummaryError] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  // True while we're waiting out the bounded retry for a transiently box_incomplete
  // summary (just-added/just-merged game the server hasn't backfilled yet). While
  // healing we suppress the alarming banner and show box-derived counters as pending
  // ("…") rather than a confident partial number.
  const [boxHealing, setBoxHealing] = useState(false);
  // The single pending heal-retry timer. Held in a ref so a fresh cycle (or a rapid
  // multi-add) can DEBOUNCE it — clear the outstanding retry and schedule at most one.
  const healTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Monotonic request counter. Every summary load (authed or public, incl. heal
  // retries) captures the current value; after its await it only writes state if it
  // is still the latest. Prevents an older in-flight response (rapid add A, then A+B)
  // from resolving last and clobbering newer stats with stale data.
  const summaryReqSeqRef = useRef(0);
  // Latest logged-out anchor pref, mirrored into a ref so loadPublicSummary reads it
  // synchronously (the POST body's `anchor` param + cache key) without a stale closure.
  const anchorPrefRef = useRef<string | null>(null);

  /** Whether a summary payload is still missing box scores (transient after an add
   *  until the server backfills; persistent for games the NHL can't box-score). */
  const isBoxIncomplete = (s: AttendedSummary): boolean =>
    s.box_incomplete || (s.missing_box_game_ids?.length ?? 0) > 0;

  /** Debounced one-shot heal retry: cancels any outstanding retry (so rapid adds
   *  collapse to a single pending refetch) and schedules `fn` after a short delay. */
  const scheduleHeal = useCallback((fn: () => void) => {
    setBoxHealing(true);
    if (healTimerRef.current) clearTimeout(healTimerRef.current);
    healTimerRef.current = setTimeout(() => {
      healTimerRef.current = null;
      fn();
    }, SUMMARY_HEAL_DELAY_MS);
  }, []);

  /** End the heal window (summary is complete, retries exhausted, or errored): drop
   *  the pending retry and clear the healing flag so the banner/counters read truth. */
  const finishHeal = useCallback(() => {
    if (healTimerRef.current) {
      clearTimeout(healTimerRef.current);
      healTimerRef.current = null;
    }
    setBoxHealing(false);
  }, []);

  // Cancel any pending heal retry on unmount.
  useEffect(() => () => finishHeal(), [finishHeal]);

  /** Fetch (or refetch) the AUTHED summary (logged-in). FAIL LOUD on any failure:
   *  clears the payload and flags the error so the dashboard surfaces a banner.
   *  `attempt` drives the bounded box_incomplete self-heal (see SUMMARY heal notes);
   *  a fresh (attempt 0) call supersedes any pending retry. */
  const loadSummary = useCallback(
    async (attempt = 0): Promise<void> => {
      if (attempt === 0 && healTimerRef.current) {
        clearTimeout(healTimerRef.current);
        healTimerRef.current = null;
      }
      const seq = ++summaryReqSeqRef.current;
      setSummaryLoading(true);
      try {
        const r = await apiFetch(`${API}/v1/account/attended/summary`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        if (summaryReqSeqRef.current !== seq) return; // superseded by a newer load — discard
        if (!data || data.error || !data.counters || !data.badges) throw new Error('bad summary payload');
        const summaryData = data as AttendedSummary;
        setSummary(summaryData);
        setSummaryError(false);
        if (isBoxIncomplete(summaryData) && attempt < MAX_SUMMARY_RETRIES) {
          // Transient: let the server finish backfilling the just-added game, then
          // refetch once. Banner/partial counters stay suppressed until it settles.
          scheduleHeal(() => loadSummary(attempt + 1));
        } else {
          finishHeal();
        }
      } catch {
        if (summaryReqSeqRef.current !== seq) return; // superseded — don't clobber newer state
        setSummary(null);
        setSummaryError(true);
        finishHeal();
      } finally {
        if (summaryReqSeqRef.current === seq) setSummaryLoading(false);
      }
    },
    [scheduleHeal, finishHeal],
  );

  /** Load the PUBLIC summary (logged-out) via POST { game_ids }. The response is
   *  cached in localStorage keyed by the sorted game-id list, so it is reused until
   *  the list changes (add/remove ⇒ new key ⇒ cache miss ⇒ refetch). Mirrors the
   *  planned iOS userDefaults+cache pattern. FAIL LOUD on error: banner, no blank
   *  fabrication. An empty list clears the summary (the empty-state renders). */
  const loadPublicSummary = useCallback(async (all: AttendedGame[], attempt = 0): Promise<void> => {
    if (attempt === 0 && healTimerRef.current) {
      clearTimeout(healTimerRef.current);
      healTimerRef.current = null;
    }
    const seq = ++summaryReqSeqRef.current;
    // NOTE: zero games is NOT an early return. The empty state still needs the
    // server's zero summary, because that is where the all-locked tier ladders come
    // from (POST accepts an empty game_ids list and answers without touching D1 or
    // the NHL API — the cheapest request the endpoint serves). Returning early here
    // is what previously forced a local copy of the tier thresholds into every
    // client. It still short-circuits the heal window, which only concerns games.
    if (all.length === 0) finishHeal();
    // Split into NHL ids + manual games, enforcing the COMBINED cap (the public
    // endpoint caps game_ids.length + manual_games.length — see SUMMARY_ID_CAP).
    const { gameIds, manualGames } = splitForSummary(all);
    // The logged-out anchor choice is a server-summary INPUT (it changes the
    // computed anchored table + resolved anchor), so it is part of the cache key —
    // changing the anchor misses the cache and refetches with the new param.
    const anchorParam = anchorParamFromPref(anchorPrefRef.current);
    // Cache key over BOTH game kinds (manual ids are stable `manual-<random>`) PLUS
    // the anchor, so adding/removing a game OR changing the anchor refetches.
    const key = `${summaryCacheKey([...gameIds, ...manualGames.map((m) => m.id)])}|a:${anchorParam ?? 'infer'}`;

    const cached = readSummaryCache();
    if (cached && cached.key === key) {
      // A cached summary is only ever written when COMPLETE (see below), so a hit
      // is guaranteed box-complete — end any heal window.
      setSummary(cached.summary);
      setSummaryError(false);
      finishHeal();
      return;
    }

    setSummaryLoading(true);
    try {
      const body: Record<string, unknown> = { game_ids: gameIds };
      if (manualGames.length > 0) body.manual_games = manualGames;
      // Send the anon anchor choice so the server computes the anchored table for
      // the right team. Omitted (undefined) ⇒ server infers.
      if (anchorParam !== undefined) body.anchor = anchorParam;
      const r = await fetch(`${API}/v1/account/attended/summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      if (summaryReqSeqRef.current !== seq) return; // superseded by a newer load — discard
      if (!data || data.error || !data.counters || !data.badges) throw new Error('bad summary payload');
      const summaryData = data as AttendedSummary;
      setSummary(summaryData);
      setSummaryError(false);
      // Only persist a COMPLETE summary. If the server is still backfilling box
      // scores (box_incomplete, or any missing_box_game_ids), we still RENDER the
      // best-effort result but do NOT cache it — the id-set is unchanged, so a
      // cached half-baked summary would be returned forever with no refetch path.
      // Skipping the write leaves no cache entry, so the next load refetches and
      // keeps refetching until the server has fully healed the games.
      if (isBoxIncomplete(summaryData)) {
        if (attempt < MAX_SUMMARY_RETRIES) {
          // Transient after an add — one debounced retry to let the backfill finish
          // before the banner/partial counters ever show.
          scheduleHeal(() => loadPublicSummary(all, attempt + 1));
        } else {
          // Persistently incomplete (NHL can't box-score it): stop retrying, let the
          // banner surface (fail loud). Still not cached, so a list change refetches.
          finishHeal();
        }
      } else {
        writeSummaryCache(key, summaryData);
        finishHeal();
      }
    } catch {
      if (summaryReqSeqRef.current !== seq) return; // superseded — don't clobber newer state
      setSummary(null);
      setSummaryError(true);
      finishHeal();
    } finally {
      if (summaryReqSeqRef.current === seq) setSummaryLoading(false);
    }
  }, [scheduleHeal, finishHeal]);

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

  // Add-games flow — mode toggle: team-first (default, matches fan recall), date,
  // location, or bulk import (photos / pasted list).
  const [addMode, setAddMode] = useState<'team' | 'date' | 'location' | 'import'>('team');

  // Count-up replay: bumping this token re-runs the 0→total roll on every tally.
  // Fired by clicking the Games counter (an opt-in "watch it add up" moment) — the
  // tallies never auto-animate on load, only on add or on this explicit replay.
  const [replayToken, setReplayToken] = useState(0);

  // By-Date sub-flow (the original). searchDate is the FROM bound; searchDateTo is
  // an optional TO bound — when set, the search spans the inclusive range (capped).
  const [searchDate, setSearchDate] = useState<string>('');
  const [searchDateTo, setSearchDateTo] = useState<string>('');
  const [searchResults, setSearchResults] = useState<RawGame[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [matchupFilter, setMatchupFilter] = useState('');

  // By-Location sub-flow. Fully decoupled from Tonight's Game card's geo state
  // machine (geo-preference.ts) — this is an on-demand, ephemeral GPS request
  // with no suppression ladder, always reachable regardless of that card's
  // state. It reads/writes the SAME localStorage preference (single shared
  // on/off toggle), it just never gates ITS OWN prompt on it.
  const todayStr = () => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
  };
  const [geoPrefState, setGeoPrefState] = useState<GeoPrefState>(() => readGeoPreference().state);
  const [locDate, setLocDate] = useState<string>(() => todayStr());
  const [locCoords, setLocCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [locBusy, setLocBusy] = useState(false);
  const [locResults, setLocResults] = useState<RawGame[] | null>(null);
  const [locLoading, setLocLoading] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);

  const fetchGamesForDate = useCallback(async (d: string): Promise<RawGame[]> => {
    const res = await fetch(`${API}/v1/games/today?date=${d}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return toRawGames(await res.json());
  }, []);

  const findByLocation = useCallback(
    async (coords: { lat: number; lon: number }, d: string) => {
      setLocLoading(true);
      setLocError(null);
      try {
        const games = await fetchGamesForDate(d);
        const withDist = games
          .map((g) => ({
            g,
            km: g.arena ? haversineKm(coords.lat, coords.lon, g.arena.lat, g.arena.lon) : null,
          }))
          .sort((a, b) => {
            if (a.km != null && b.km != null) return a.km - b.km;
            if (a.km != null) return -1;
            if (b.km != null) return 1;
            return a.g.date < b.g.date ? -1 : a.g.date > b.g.date ? 1 : 0;
          });
        setLocResults(withDist.map((x) => x.g));
      } catch {
        setLocError('Could not load games for that date. Please try again.');
        setLocResults(null);
      } finally {
        setLocLoading(false);
      }
    },
    [fetchGamesForDate],
  );

  const useMyLocation = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLocError('Location isn’t available in this browser — try By Team or By Date instead.');
      return;
    }
    setLocBusy(true);
    setLocError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocBusy(false);
        const coords = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        setLocCoords(coords);
        if (readGeoPreference().state !== 'enabled') {
          recordGrant();
          setGeoPrefState('enabled');
        }
        findByLocation(coords, locDate);
      },
      (err) => {
        // Denial/timeout/unavailable — transient, no ladder/backoff writes. This
        // is an explicit on-demand ask, not the auto-reacquire Tonight's Game
        // gates behind canPromptNow(); a "no" here means nothing about that.
        setLocBusy(false);
        console.warn('[by-location] getCurrentPosition failed', err.code, err.message);
        if (err.code === err.TIMEOUT) {
          setLocError('Location took too long to respond — try again, or use By Team/By Date instead.');
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          setLocError(
            'Your device could not determine a location — check macOS System Settings → Privacy & Security → Location Services, or try By Team/By Date instead.',
          );
        } else {
          setLocError('Couldn’t get your location — try By Team or By Date instead.');
        }
      },
      { maximumAge: 5 * 60_000, timeout: 8_000 },
    );
  }, [findByLocation, locDate]);

  const toggleLocationDetection = useCallback(() => {
    if (geoPrefState === 'enabled') {
      disableGeo();
      setGeoPrefState('disabled');
    } else {
      useMyLocation();
    }
  }, [geoPrefState, useMyLocation]);

  // Re-run the search for a changed date using the coords already on hand — no
  // new browser permission prompt, since we already have a fix for this visit.
  const refetchByLocationDate = useCallback(() => {
    if (!locCoords) return;
    findByLocation(locCoords, locDate);
  }, [locCoords, locDate, findByLocation]);

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
  // Players Seen renders the top 25 by games (matches iOS); expand to show all.
  const [showAllSeen, setShowAllSeen] = useState(false);

  // The logged-out anchor pref lives entirely in localStorage + anchorPrefRef (it
  // feeds the public-summary POST param); the RENDER is driven by the server's
  // resolved anchor, so no React state is needed for it.

  // ── Manual add sub-flow (games the NHL API can't find) ──────────────────────────
  const [showManual, setShowManual] = useState(false);
  const [manualHome, setManualHome] = useState(''); // abbrev
  const [manualAway, setManualAway] = useState(''); // abbrev
  const [manualDate, setManualDate] = useState('');
  const [manualHomeScore, setManualHomeScore] = useState('');
  const [manualAwayScore, setManualAwayScore] = useState('');
  const [manualError, setManualError] = useState<string | null>(null);

  // ── Hydrate + resolve auth on mount ──────────────────────────────────────────
  // Logged-out: read the localStorage list (Phase 0). Logged-in: merge any local
  // games into D1 (mergeLocalPresets pattern), then load the D1 list as source.
  useEffect(() => {
    detailsRef.current = readDetails();
    anchorPrefRef.current = readAnchorPref(); // sync ref BEFORE the first public summary POST
    // Default the date picker to today (local).
    const t = new Date();
    const today = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
    setSearchDate(today);
    setManualDate(today);

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

      // Public-passport identity (handle + privacy) for the share panel.
      setPassportHandle(me.user.handle);
      setPassportPublic(me.user.is_public);

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
          const ok = g.is_manual ? await postManualAttended(toManualGame(g)) : (await postAttended(g.game_id)).ok;
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

  // ── team_id → abbrev/name (from /v1/config) ─────────────────────────────────
  // Loaded in BOTH auth states: the logged-in D1 list needs it to map id-only
  // rows, and the arenas pip meter needs abbrev↔id in either state to colour the
  // per-team pips from arenas.teams_seen (a list of current-team ids).
  useEffect(() => {
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
  }, []);

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
      loadPublicSummary(games);
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

  // ── Name upgrade: First Last for any name the SERVER left null ────────────────
  // The server summary already resolves player names (players.json + its own cache),
  // so viewSeenPlayers uses `p.name` first and only falls back to this map when the
  // server returned null (rare — historical players). This feed is ~1.5MB gzip /
  // ~10MB parsed, so we DON'T pull it on every load: fetch it once, only when the
  // summary actually contains an unresolved name. For nearly every passport (all
  // names server-resolved) it never fetches at all. Non-fatal on failure.
  useEffect(() => {
    if (nameMap) return; // already loaded once
    if (!summary || !summary.players_seen.some((p) => p.name == null)) return;
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
  }, [summary, nameMap]);

  // ── Mutations ────────────────────────────────────────────────────────────────
  // Logged-in writes go to D1 (optimistic, rolled back on failure); logged-out
  // writes stay in localStorage. A display snapshot is always cached so the
  // logged-in (id-only) source can still render venue/OT on this device.
  // The just-logged game, for the inline "make a stub" log-time prompt. Cleared on
  // dismiss, on share, or when that game is removed. Set by every add path.
  const [justAdded, setJustAdded] = useState<AttendedGame | null>(null);

  const addGame = useCallback(
    (raw: RawGame, opts: { earned?: boolean } = {}): Promise<{ ok: boolean; earned?: EarnedDelta }> => {
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
      // Highest-intent moment: offer a ticket stub the instant a game is logged.
      // (Milestone-aware copy is resolved at render from the now-updated ordinals.)
      setJustAdded(snap);

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
        return postAttended(raw.game_id, opts).then(({ ok, earned }) => {
          if (ok) {
            setWriteError(null);
            loadSummary(); // refetch aggregates from the server (anti-divergence)
            return { ok: true, earned };
          }
          setWriteError('Could not save that game to your account — check your connection and try again.');
          setD1Rows((prev) => (prev ?? []).filter((r) => r.game_id !== raw.game_id));
          return { ok: false };
        });
      }
      setLocalGames((prev) => {
        if (prev.some((g) => g.game_id === raw.game_id)) return prev;
        const next = [...prev, snap];
        writeAttended(next);
        return next;
      });
      return Promise.resolve({ ok: true });
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
        return apiFetch(`${API}/v1/account/attended/${gameId}`, { method: 'DELETE' })
          .then((r) => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            setWriteError(null);
            loadSummary(); // refetch aggregates from the server (anti-divergence)
          })
          .catch(() => {
            setWriteError('Could not remove that game from your account — check your connection and try again.');
            if (removed) setD1Rows((prev) => [removed as D1AttendedRow, ...(prev ?? [])]);
          });
      }
      setLocalGames((prev) => {
        const next = prev.filter((g) => g.game_id !== gameId);
        writeAttended(next);
        return next;
      });
      return Promise.resolve();
    },
    [isLoggedIn, loadSummary],
  );

  // Guarded toggle for the ADD-GAMES search results. A synchronous ref-lock (not
  // state — state is async and two rapid clicks would both read it empty) ignores
  // further clicks on a row while its add/remove is IN FLIGHT, closing the
  // rapid remove→add race that could leave local + D1 desynced (Codex, 2026-07-25).
  // The lock clears when the network settles (add/remove now return their promise).
  const mutatingRef = useRef<Set<string>>(new Set());
  const [mutatingIds, setMutatingIds] = useState<Set<string>>(() => new Set());
  const toggleSearchResult = useCallback(
    (g: RawGame, already: boolean) => {
      const id = g.game_id;
      if (mutatingRef.current.has(id)) return; // synchronous, race-proof
      mutatingRef.current.add(id);
      setMutatingIds(new Set(mutatingRef.current)); // re-render for the disabled state
      const clear = () => {
        mutatingRef.current.delete(id);
        setMutatingIds(new Set(mutatingRef.current));
      };
      Promise.resolve(already ? removeGame(id) : addGame(g)).finally(clear);
    },
    [addGame, removeGame],
  );

  // Add a MANUAL game (NHL API can't find it). Logged-IN → POST to the authed
  // endpoint with is_manual (the authed GET summary folds it in — never a public
  // POST); logged-OUT → store as a manual-shaped entry in the SAME localStorage
  // list, distinguishable by is_manual + a `manual-` id. Both paths refetch the
  // summary so the server-owned aggregates stay the source of truth.
  const addManualGame = useCallback(() => {
    setManualError(null);
    if (!manualHome || !manualAway) {
      setManualError('Pick both teams.');
      return;
    }
    if (manualHome === manualAway) {
      setManualError('Home and away must be different teams.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(manualDate)) {
      setManualError('Pick a valid date.');
      return;
    }
    // Resolve abbrev → team id via /v1/config. FAIL LOUD if config hasn't loaded
    // (the manual game needs numeric team ids for the LOCKED wire contract).
    let homeId: number | undefined;
    let awayId: number | undefined;
    for (const [id, info] of configMap) {
      if (info.abbrev === manualHome) homeId = id;
      if (info.abbrev === manualAway) awayId = id;
    }
    if (homeId == null || awayId == null) {
      setManualError('Team directory is still loading — try again in a moment.');
      return;
    }
    const parseScore = (s: string): number | null => {
      const t = s.trim();
      if (t === '') return null;
      const n = Number(t);
      return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
    };
    const homeScore = parseScore(manualHomeScore);
    const awayScore = parseScore(manualAwayScore);
    const m: ManualGame = {
      id: genManualId(),
      home_team_id: homeId,
      away_team_id: awayId,
      date: manualDate,
      home_score: homeScore,
      away_score: awayScore,
      venue: null,
    };
    // Both scores present & unequal ⇒ a decided (final) game for list rendering.
    const decided = homeScore != null && awayScore != null && homeScore !== awayScore;
    const snap: AttendedGame = {
      game_id: m.id,
      date: m.date,
      home: { id: homeId, abbrev: manualHome, name: NHL_TEAM_NAMES[manualHome] ?? manualHome, score: homeScore ?? 0 },
      away: { id: awayId, abbrev: manualAway, name: NHL_TEAM_NAMES[manualAway] ?? manualAway, score: awayScore ?? 0 },
      venue: null,
      last_period_type: null,
      status: decided ? 'final' : 'scheduled',
      added_at: new Date().toISOString(),
      is_manual: true,
      home_score: homeScore,
      away_score: awayScore,
    };
    commitDetail(snap);
    setJustAdded(snap);

    if (isLoggedIn) {
      setD1Rows((prev) => {
        const rows = prev ?? [];
        const row: D1AttendedRow = {
          game_id: m.id,
          rooted_for: null,
          notes: null,
          source: 'manual',
          created_at: snap.added_at,
          game_date: m.date,
          home_team_id: homeId,
          away_team_id: awayId,
          home_score: homeScore,
          away_score: awayScore,
          is_final: decided ? 1 : 0,
          venue: null,
          last_period_type: null,
          is_manual: 1,
        };
        return [row, ...rows];
      });
      postManualAttended(m).then((ok) => {
        if (ok) {
          setWriteError(null);
          loadSummary(); // refetch aggregates (anti-divergence)
        } else {
          setWriteError('Could not save that game to your account — check your connection and try again.');
          setD1Rows((prev) => (prev ?? []).filter((r) => r.game_id !== m.id));
        }
      });
    } else {
      setLocalGames((prev) => {
        const next = [...prev, snap];
        writeAttended(next);
        return next;
      });
    }

    // Reset the form for the next entry (keep it open — fans log runs of games).
    setManualHome('');
    setManualAway('');
    setManualHomeScore('');
    setManualAwayScore('');
  }, [manualHome, manualAway, manualDate, manualHomeScore, manualAwayScore, configMap, isLoggedIn, commitDetail, loadSummary]);

  const attendedIds = useMemo(() => new Set(games.map((g) => g.game_id)), [games]);

  // ── Search a date ────────────────────────────────────────────────────────────
  const runSearch = useCallback(async () => {
    const from = searchDate;
    const to = searchDateTo;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) {
      setSearchError('Pick a valid date first.');
      return;
    }
    // A second (TO) date turns this into an inclusive range; without it, the
    // original single-day behavior is preserved exactly. Order-independent — a
    // TO earlier than FROM just gets swapped.
    const isRange = /^\d{4}-\d{2}-\d{2}$/.test(to) && to !== from;
    let dates: string[];
    if (isRange) {
      const range = datesInRange(from < to ? from : to, from < to ? to : from);
      if (!range) {
        setSearchError(`Pick a range of ${MAX_DATE_SPAN_DAYS} days or fewer.`);
        return;
      }
      dates = range;
    } else {
      dates = [from];
    }
    setSearchLoading(true);
    setSearchError(null);
    setSearchResults(null);
    try {
      // One fetch per day; fail loud on any day so we never show a silently partial
      // range (the span is capped, so re-running is cheap).
      const payloads = await Promise.all(
        dates.map(async (d) => {
          const res = await fetch(`${API}/v1/games/today?date=${d}`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return toRawGames(await res.json());
        }),
      );
      const seen = new Set<string>();
      const merged: RawGame[] = [];
      for (const list of payloads) {
        for (const g of list) {
          if (seen.has(g.game_id)) continue;
          seen.add(g.game_id);
          merged.push(g);
        }
      }
      merged.sort((a, b) =>
        a.date < b.date ? -1 : a.date > b.date ? 1 : a.game_id < b.game_id ? -1 : 1,
      );
      setSearchResults(merged);
    } catch (err) {
      setSearchError('Could not load games for that range. Please try again.');
    } finally {
      setSearchLoading(false);
    }
  }, [searchDate, searchDateTo]);

  // ── Import: photos (EXIF date) / pasted list → review by date ─────────────────
  // Both inputs reduce to the SAME thing: a set of dates. We look up each date's
  // NHL games and present them grouped, so the user confirms which game they were
  // at (date alone can't disambiguate a doubleheader building). Reuses addGame via
  // toggleSearchResult, so imported adds go through the identical write path.
  // A reviewed date + its games; `match` is set when a photo's GPS pinned the arena
  // (so we can pre-highlight the exact game the user was almost certainly at).
  type ImportGroup = {
    date: string;
    games: RawGame[];
    match?: { gameId: string; arena: string; km: number };
  };
  const [importGroups, setImportGroups] = useState<ImportGroup[] | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importNote, setImportNote] = useState<string | null>(null);
  const [importTab, setImportTab] = useState<'photos' | 'paste'>('photos');
  const [pasteText, setPasteText] = useState('');
  const [photoBusy, setPhotoBusy] = useState(false);
  // Monotonic import-request id. Every import claims one; a reset or a newer import
  // bumps it, and each async continuation gates its state writes on still being the
  // current id — so a slow photo/paste import that finishes after the panel was
  // closed (or superseded) can't clobber fresher state or reappear.
  const importReqRef = useRef(0);

  const resetImport = useCallback(() => {
    importReqRef.current += 1; // supersede any in-flight import
    setImportGroups(null);
    setImportNote(null);
    setImportError(null);
    setImportLoading(false);
    setPhotoBusy(false);
  }, []);

  // Look up each date (bounded concurrency), keeping only dates that HAVE games.
  // `seq` lets a caller (onPhotos) pass its already-claimed request id so the read
  // and lookup phases share one identity; otherwise we claim a fresh one.
  // `dateCoords` (from photo GPS) lets us pin the exact game per date via the arena.
  const runImport = useCallback(
    async (dates: string[], note: string, seq?: number, dateCoords?: Map<string, GpsCoord[]>) => {
      const reqId = seq ?? (importReqRef.current += 1);
      const alive = () => reqId === importReqRef.current;
      if (dates.length === 0) {
        if (alive()) {
          setImportError('No usable dates found.');
          setImportGroups(null);
        }
        return;
      }
      if (dates.length > IMPORT_MAX_DATES) {
        if (alive()) {
          setImportError(
            `That's ${dates.length} dates — import ${IMPORT_MAX_DATES} or fewer at a time (do it in a couple of passes).`,
          );
        }
        return;
      }
      setImportLoading(true);
      setImportError(null);
      setImportGroups(null);
      try {
        const groups: ImportGroup[] = [];
        let cursor = 0;
        const worker = async () => {
          while (cursor < dates.length) {
            if (!alive()) return; // superseded — stop fetching
            const d = dates[cursor++];
            const res = await fetch(`${API}/v1/games/today?date=${d}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const games = toRawGames(await res.json());
            if (!games.length) continue;
            const group: ImportGroup = { date: d, games };
            // Pin the exact game from a photo's GPS: nearest arena → the game whose
            // home team plays there. Try EVERY coord on the date (a dinner photo
            // shouldn't suppress an arena photo), and only pin when EXACTLY ONE game
            // is at that arena (GPS identifies the building, not the game — a same-
            // arena doubleheader stays a manual pick). No coord / no arena → date-only.
            for (const coord of dateCoords?.get(d) ?? []) {
              const hit = nearestArena(coord.lat, coord.lon);
              if (!hit) continue;
              const candidates = games.filter(
                (x) =>
                  x.home_team.abbrev === hit.arena.abbrev ||
                  hit.arena.altAbbrevs?.includes(x.home_team.abbrev),
              );
              if (candidates.length === 1) {
                group.match = { gameId: candidates[0].game_id, arena: hit.arena.arena, km: hit.km };
                break; // first coord that yields a unique arena match wins
              }
            }
            groups.push(group);
          }
        };
        await Promise.all(
          Array.from({ length: Math.min(IMPORT_FETCH_CONCURRENCY, dates.length) }, worker),
        );
        if (!alive()) return; // a newer import/reset landed — drop these results
        groups.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
        setImportGroups(groups);
        const matched = groups.filter((g) => g.match).length;
        setImportNote(
          `${note} · ${groups.length} of ${dates.length} date${dates.length === 1 ? '' : 's'} had NHL games` +
            (matched ? ` · 📍 ${matched} pinned by location` : ''),
        );
      } catch {
        if (alive()) setImportError('Could not load games for those dates. Please try again.');
      } finally {
        if (alive()) setImportLoading(false);
      }
    },
    [],
  );

  // Read each photo's EXIF date + GPS IN THE BROWSER (never uploaded), then look up
  // games. GPS (when present) pins the exact game via the arena; date-only otherwise.
  const onPhotos = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const reqId = (importReqRef.current += 1); // claim this run up front
      const arr = Array.from(files);
      setPhotoBusy(true);
      setImportError(null);
      const dates = new Set<string>();
      const dateCoords = new Map<string, GpsCoord[]>(); // date → all GPS coords seen that day
      let noDate = 0;
      let gpsHits = 0;
      for (const f of arr) {
        if (reqId !== importReqRef.current) {
          setPhotoBusy(false);
          return; // superseded mid-read (reset / newer import) — abandon
        }
        const d = await readPhotoDate(f);
        if (d) dates.add(d);
        else noDate++;
        const gps = await readPhotoGps(f);
        if (gps) {
          gpsHits++;
          if (d) {
            const arr2 = dateCoords.get(d) ?? [];
            arr2.push(gps);
            dateCoords.set(d, arr2);
          }
        }
        if (dates.size > IMPORT_MAX_DATES) break; // early exit — don't drain thousands of files
      }
      setPhotoBusy(false);
      if (reqId !== importReqRef.current) return;
      const list = [...dates].sort();
      const note = `Read ${arr.length} photo${arr.length === 1 ? '' : 's'}${
        noDate ? ` (${noDate} without a readable date)` : ''
      }`;
      if (list.length === 0) {
        setImportGroups(null);
        setImportError(
          `${note} — none had a readable capture date. Screenshots and some downloads have no date; try the paste option instead.`,
        );
        return;
      }
      await runImport(list, note, reqId, gpsHits ? dateCoords : undefined);
    },
    [runImport],
  );

  const onPaste = useCallback(async () => {
    const dates = harvestDates(pasteText);
    await runImport(dates, `Found ${dates.length} date${dates.length === 1 ? '' : 's'}`);
  }, [pasteText, runImport]);

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

  // ── Dismiss search results (§3) — explicit Close, never auto-close on select.
  // Clears the fetched list + all recall filters so the page returns to the
  // pre-search Add Games state. The team/season pickers are left as-is so a
  // re-search is one click away.
  const resetTeamSearch = useCallback(() => {
    setTeamResults(null);
    setTeamQuery(null);
    setSelectedIds(new Set());
    setOppFilter('');
    setHomeAwayFilter('all');
    setScoreFilter('');
    setTeamError(null);
  }, []);

  const resetDateSearch = useCallback(() => {
    setSearchResults(null);
    setMatchupFilter('');
    setSearchError(null);
  }, []);

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
  // Box-derived counters (periods/goals/shots/players) are honestly "still loading"
  // both before the first summary arrives AND while we're healing a transiently
  // box_incomplete summary — show "…" rather than a confident partial number. The
  // "!" warn marker and the box-incomplete banner only appear once healing is done
  // and the set is STILL incomplete (fail loud on a genuinely un-box-scorable game).
  const boxPending = summaryPending || boxHealing;

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

  // Unverified (manually-logged) game count. Server owns the number once the
  // summary lands; before that, fall back to the known local manual count (honest
  // truth, not fabricated) so the footnote appears immediately after a manual add.
  const viewUnverifiedCount = summary
    ? summary.unverified_count ?? 0
    : games.filter((g) => g.is_manual).length;

  // ── Rooting perspective (server-computed — single source of truth) ───────────
  // The server owns BOTH record framings (neutral team_records + anchored) AND the
  // resolved anchor + its source. The client only RENDERS them and WRITES the anchor
  // choice (see writeAnchor). GRACEFUL FALLBACK: an api that predates the port omits
  // team_records_anchored / anchor — those are null and we render the neutral table
  // (never a crash / broken table). team_records may also lack `otl` on an old deploy.
  const neutralTable = summary?.team_records ?? [];
  const anchoredView = summary?.team_records_anchored ?? null;
  const serverAnchor = summary?.anchor ?? null;
  const anchorIsInferred = serverAnchor?.source === 'inferred';
  // Show Table A only when the server resolved a real anchor AND returned its table.
  const showAnchored = !!anchoredView && serverAnchor != null && serverAnchor.source !== 'none';

  // abbrev → NHL team-id (from /v1/config) — needed to WRITE the anchor by team_id.
  const abbrevToTeamId = useMemo(() => {
    const m = new Map<string, number>();
    for (const [id, info] of configMap) m.set(info.abbrev, id);
    return m;
  }, [configMap]);

  // The dropdown selection mirrors the server's resolved anchor: an inferred team is
  // pre-selected by its real name; 'none' → the explicit neutral option; a missing
  // anchor (older api / not yet resolved) → the disabled placeholder.
  const anchorSelectValue = serverAnchor
    ? serverAnchor.source === 'none'
      ? ANCHOR_NONE
      : serverAnchor.abbrev
    : '';

  // Teams for the dropdown — every team seen (from the neutral ledger), by full name.
  const teamsSeenForSelect = useMemo(
    () => [...neutralTable].sort((a, b) => a.name.localeCompare(b.name)),
    [neutralTable],
  );

  // Persist an anchor choice. Param: team_id (explicit) | 0 (no rooting interest) |
  // null (infer/unset). Logged-in → PUT /v1/account/prefs then refetch the summary
  // (server owns the pref, anti-divergence). Logged-out → persist locally + refetch
  // the public summary (which sends the anchor param). FAIL LOUD on a failed PUT.
  const writeAnchor = useCallback(
    async (param: number | null) => {
      if (isLoggedIn) {
        try {
          const r = await apiFetch(`${API}/v1/account/prefs`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ passport_anchor: param }),
          });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          setWriteError(null);
          loadSummary(); // refetch so both tables + the banner reflect the new anchor
        } catch {
          setWriteError('Could not save your rooting perspective — check your connection and try again.');
        }
      } else {
        const pref = param == null ? null : param === 0 ? ANCHOR_NONE : String(param);
        anchorPrefRef.current = pref; // sync the ref so the immediate refetch sends it
        writeAnchorPref(pref);
        loadPublicSummary(games); // resend the public POST with the new anchor param
      }
    },
    [isLoggedIn, loadSummary, loadPublicSummary, games],
  );

  // Dropdown handler: map an abbrev / ANCHOR_NONE selection → the team_id param.
  const chooseAnchorByValue = useCallback(
    (v: string) => {
      if (v === '') return; // disabled placeholder
      if (v === ANCHOR_NONE) {
        writeAnchor(0);
        return;
      }
      const id = abbrevToTeamId.get(v);
      if (id == null) {
        setWriteError('Could not resolve that team just yet — try again in a moment.');
        return;
      }
      writeAnchor(id);
    },
    [writeAnchor, abbrevToTeamId],
  );

  // Banner ✕ — confirm the INFERRED guess as an EXPLICIT choice so the server stops
  // inferring (source flips to 'explicit', the banner never returns).
  const confirmInferredAnchor = useCallback(() => {
    if (serverAnchor?.team_id != null && serverAnchor.team_id > 0) writeAnchor(serverAnchor.team_id);
  }, [writeAnchor, serverAnchor]);

  // Home-rinks collection: home_rinks/32 drives the meter + badge; teams_seen (a
  // set of current-team ids) colours the per-team pips; distinct_buildings is the
  // honest "every building visited" total (can exceed 32).
  // Narrow the wire `arenas` to just the four ladder fields, or undefined when the
  // Worker predates them (never a fabricated rung — the label omits it instead).
  const arenaRungOf = (a: AttendedSummary['arenas']): ArenaRungView | undefined =>
    a.rung == null || a.rung_name == null
      ? undefined
      : {
          rung: a.rung,
          rung_name: a.rung_name,
          next_threshold: a.next_threshold ?? null,
          next_rung_name: a.next_rung_name ?? null,
        };

  const viewArenas = useMemo(
    () =>
      summary
        ? {
            homeRinks: summary.arenas.home_rinks,
            total: summary.arenas.total,
            distinctBuildings: summary.arenas.distinct_buildings,
            teamsSeen: new Set(summary.arenas.teams_seen ?? []),
            rung: arenaRungOf(summary.arenas),
          }
        : { homeRinks: 0, total: 32, distinctBuildings: 0, teamsSeen: new Set<number>(), rung: undefined },
    [summary],
  );
  const viewArenaBadge = summary
    ? {
        homeRinks: summary.arenas.home_rinks,
        total: summary.arenas.total,
        distinctBuildings: summary.arenas.distinct_buildings,
      }
    : { homeRinks: 0, total: 32, distinctBuildings: 0 };

  // The 32 current NHL teams, sorted alphabetically by full name (one pip each),
  // and an abbrev→NHL-team-id map (from /v1/config) so a team's pip lights up when
  // its id is in arenas.teams_seen. Sort is by team NAME for a stable, scannable order.
  const pipTeams = useMemo(() => [...NHL_TEAMS].sort((a, b) => a.name.localeCompare(b.name)), []);

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

  // Top-25 cap (§6, matches iOS). Sort a copy games-desc (then goals) so the
  // slice is deterministic regardless of the server payload order; HGBTable
  // re-sorts by its own defaultSort on top of this.
  const SEEN_CAP = 25;
  const sortedSeenPlayers = useMemo<SeenPlayerRow[]>(
    () => [...viewSeenPlayers].sort((a, b) => b.gamesSeen - a.gamesSeen || b.goals - a.goals),
    [viewSeenPlayers],
  );
  const seenPlayersToShow = showAllSeen ? sortedSeenPlayers : sortedSeenPlayers.slice(0, SEEN_CAP);

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
    // The catalog carries display shape; the earning GAMES live on badges.earned[]
    // (owner summary only — the public projection strips them). Join by id so each
    // earned chip can open its drill-down. Absent on the public passport ⇒ no games
    // ⇒ chip stays non-clickable (see renderCatalogBadge).
    const gamesById = new Map<string, BadgeEarnedGame[]>();
    for (const e of summary.badges.earned) {
      if (e.games && e.games.length) gamesById.set(e.id, e.games);
    }
    return sortCatalog(
      summary.badges.catalog
        .filter((c) => c.id !== 'arenas-visited')
        .map((c) => {
          const cat = mapSummaryCatalog(c);
          const games = gamesById.get(c.id);
          return games ? { ...cat, games } : cat;
        }),
    );
  }, [summary]);
  const earnedCount = useMemo(() => catalog.filter((c) => c.earned).length, [catalog]);

  // Ghost catalog for the EMPTY state — the full badge wall, all locked. Built
  // locally from BADGES (no network; the empty state fires no summary fetch) and
  // shown honestly: nothing is "earned", every chip is a locked chase.
  const ghostCatalog = useMemo<CatalogBadge[]>(() => sortCatalog(buildLocalCatalog([], {})), []);

  // Tiered milestone badges (Games/Goals/Shots/Players/Arenas ladders) — SERVER-
  // computed since 2026-08-02, rendered verbatim. Always 5 entries, locked/ghost
  // when a stat hasn't reached Rung I yet.
  //
  // Empty until the summary lands, INCLUDING for a user with no games: the empty
  // state fetches the zero summary (POST with an empty game_ids list) rather than
  // hand-rolling an all-locked wall from a local threshold table. The section is
  // gated on this being non-empty, so a brief flash of nothing is correct — a
  // fabricated ladder would not be.
  const tierBadges: TierBadgeView[] = summary?.tiers ?? [];

  // Milestones Witnessed — server-provided (same payload in both auth states).
  const milestones = summary ? summary.milestones : [];
  // ── Share card (client-side canvas PNG) ──────────────────────────────────────
  // Draws the SAME in-memory aggregates to a portrait canvas and hands it to the
  // shared HGB_Export modal (download / long-press-to-save), exactly like the
  // player/goalie cards. No new network fetch — everything below is already in
  // memory. Disabled while empty (see render).
  const handleShare = useCallback(async () => {
    // Anonymous telemetry: record the Share action. Fire-and-forget — pass the
    // user's own handle when it's in state (real logins), else omit. Never awaited,
    // never throws (see lib/track.ts). `meta` distinguishes WHICH share unit fired —
    // all three (passport card / ticket stub / 2-up grid) share the one allowlisted
    // `share_click` event, so without it the funnel conflates them.
    trackEvent('share_click', { handle: passportHandle, meta: { unit: 'passport' } });

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
      arenas: {
        homeRinks: viewArenaBadge.homeRinks,
        total: viewArenaBadge.total,
        distinctBuildings: viewArenaBadge.distinctBuildings,
      },
      tiers: tierBadges.map((b) => ({
        label: b.label,
        rungName: b.rung_name,
        earned: b.earned,
        progress: b.progress,
      })),
      badges: rarest,
      records: shareRecords,
      // No accent — every Passport card uses the HGB brand red for brand cohesion.
      boxIncomplete: viewBoxIncomplete,
      unverifiedCount: viewUnverifiedCount,
      // Attribute the card ONLY when public — a private handle's URL wouldn't resolve.
      handle: passportPublic && passportHandle ? passportHandle : undefined,
    };

    // Canvas text silently falls back to a system font if the exact (family, weight)
    // face isn't loaded yet — and fonts.ready only waits for IN-PROGRESS loads, it
    // does NOT initiate loading of a face the page hasn't used yet (e.g. Barlow
    // Condensed 900, used ONLY by the card title). So the FIRST share rendered the
    // title in a fallback font. Explicitly load every face the card draws, THEN draw.
    try {
      const fs = (document as any).fonts;
      if (fs?.load) {
        await Promise.all([
          '900 32px "Barlow Condensed"',
          '800 30px "Barlow Condensed"',
          '700 15px "Barlow Condensed"',
          '600 12px "Barlow"',
          '500 12px "Barlow"',
          '700 10px "JetBrains Mono"',
          '500 9px "JetBrains Mono"',
        ].map((f) => fs.load(f).catch(() => {})));
        await fs.ready;
      }
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
  }, [catalog, viewRecords, viewCounters, viewArenaBadge, viewBoxIncomplete, viewUnverifiedCount, passportHandle, passportPublic]);

  // ── Ticket-stub share (per-game canvas PNG) ──────────────────────────────────
  // Per-game collection ordinals for the stub's holder line ("37TH GAME" / "6TH
  // ARENA ATTENDED"). Chronological: gameOrdinal = this game's 1-based position in
  // the date-sorted collection; arenaOrdinal = the venue's first-visit position
  // among distinct arenas. Derived from the same `games` the table renders — no
  // network — so the stub can never disagree with the dashboard.
  const stubOrdinals = useMemo(() => {
    const sorted = [...games].sort(
      (a, b) =>
        String(a.date ?? '').localeCompare(String(b.date ?? '')) ||
        String(a.game_id ?? '').localeCompare(String(b.game_id ?? '')),
    );
    const gameOrd = new Map<string, number>();
    const arenaOrd = new Map<string, number>();
    const venuePos = new Map<string, number>();
    // The FIRST game logged at each distinct venue — the "new arena" moment. Drives
    // the featured-hero ranking + the log-time milestone copy.
    const firstAtArena = new Set<string>();
    let distinct = 0;
    sorted.forEach((g, i) => {
      gameOrd.set(g.game_id, i + 1);
      const v = g.venue?.trim();
      if (v) {
        const key = v.toLowerCase();
        if (!venuePos.has(key)) {
          venuePos.set(key, ++distinct);
          firstAtArena.add(g.game_id);
        }
        arenaOrd.set(g.game_id, venuePos.get(key)!);
      }
    });
    return { gameOrd, arenaOrd, firstAtArena };
  }, [games]);

  // game_id → earned badge display labels (owner-only; the public projection
  // strips badges.earned[].games, so this map is empty for public/other passports
  // and the stub simply renders no stamps — never a crash).
  const badgesByGame = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const c of catalog) {
      if (!c.earned || !c.games) continue;
      for (const eg of c.games) {
        const arr = m.get(eg.game_id) ?? [];
        arr.push(c.label);
        m.set(eg.game_id, arr);
      }
    }
    return m;
  }, [catalog]);

  // The exact opts a stub render needs, for a given game. Shared by the per-row
  // share action AND the featured-hero preview so the two can never drift.
  const stubOptsFor = useCallback(
    (g: AttendedGame) => ({
      game: g,
      anchor: summary?.anchor ?? null,
      handle: passportPublic && passportHandle ? passportHandle : undefined,
      badges: badgesByGame.get(g.game_id) ?? [],
      gameOrdinal: stubOrdinals.gameOrd.get(g.game_id) ?? null,
      arenaOrdinal: stubOrdinals.arenaOrd.get(g.game_id) ?? null,
      // Default code: 'qr' = the fade-into-cream band (clean, the QR is the obvious
      // thing to scan). Swap to 'qr-boxnoise' (one-big-QR) or 'qr-plain' (white
      // rectangle) here — all three live in drawQrNoiseBand.
      codeStyle: 'qr' as const,
    }),
    [summary, passportHandle, passportPublic, badgesByGame, stubOrdinals],
  );

  // Preload EVERY face+weight drawTicketStub draws (silent-fallback-font guard) so a
  // cold first render never falls back to a system font. Shared by the row action +
  // the hero preview. Barlow Condensed 700 (headers/scores) AND 600 (detail values);
  // Barlow 600 (team city); JetBrains Mono 500 (labels/serial) AND 400 (tagline).
  const primeStubFonts = useCallback(async () => {
    try {
      const fs = (document as any).fonts;
      if (fs?.load) {
        await Promise.all(
          [
            '700 22px "Barlow Condensed"',
            '700 32px "Barlow Condensed"',
            '600 14px "Barlow Condensed"',
            '600 10px "Barlow"',
            '500 8px "JetBrains Mono"',
            '400 9px "JetBrains Mono"',
          ].map((f) => fs.load(f).catch(() => {})),
        );
        await fs.ready;
      }
    } catch {
      /* non-fatal — draw with whatever is loaded */
    }
  }, []);

  const handleStub = useCallback(
    async (r: AttendedGame) => {
      // Reuse the wired `share_click` event — the stub IS a passport share action,
      // and the telemetry endpoint accepts only its known events (an unwired
      // 'stub_click' would be silently dropped server-side). `meta` carries WHICH
      // unit fired so stub shares are separable from passport-card shares.
      trackEvent('share_click', { handle: passportHandle, meta: { unit: 'stub' } });
      await primeStubFonts();
      try {
        const canvas = await drawTicketStub(stubOptsFor(r));
        const exp = (window as any).HGB_Export;
        if (exp?.showCardModal) {
          exp.showCardModal(canvas, `puck-passport-${r.game_id}.png`);
        } else {
          console.error('[PuckPassport] window.HGB_Export.showCardModal unavailable — is /js/table-export.js loaded?');
          setWriteError('Could not open the ticket stub — please reload the page and try again.');
        }
      } catch (e) {
        console.error('[PuckPassport] drawTicketStub failed', e);
        setWriteError('Could not build the ticket stub — please try again.');
      }
    },
    [passportHandle, primeStubFonts, stubOptsFor],
  );

  // X/Twitter share: TWO RANDOM games composited side by side (~1.125:1), so the
  // preview isn't center-cropped in-feed the way a single tall 9:16 stub is. Random
  // (not "top 2") gives variety on repeat clicks. v2: let the user pick the two.
  const handleGridShare = useCallback(
    async () => {
      if (games.length < 2) return;
      const pool = [...games];
      const [a] = pool.splice(Math.floor(Math.random() * pool.length), 1);
      const b = pool[Math.floor(Math.random() * pool.length)];
      const cells = [a, b];
      trackEvent('share_click', { handle: passportHandle, meta: { unit: 'grid' } });
      await primeStubFonts();
      try {
        const canvas = await drawStubGrid(cells.map(stubOptsFor));
        const exp = (window as any).HGB_Export;
        if (exp?.showCardModal) {
          exp.showCardModal(canvas, `puck-passport-2up.png`);
        } else {
          console.error('[PuckPassport] window.HGB_Export.showCardModal unavailable — is /js/table-export.js loaded?');
          setWriteError('Could not open the 2-up graphic — please reload the page and try again.');
        }
      } catch (e) {
        console.error('[PuckPassport] drawStubGrid failed', e);
        setWriteError('Could not build the 2-up graphic — please try again.');
      }
    },
    [games, passportHandle, primeStubFonts, stubOptsFor],
  );

  // ── Featured-stub hero: lead with the OUTPUT, not a buried button ─────────────
  // Rank the collection by shareability so the hero always leads with the most
  // "post-worthy" game: badge-bearing > milestone game # > new arena > most recent.
  // All inputs are local (no network) — the hero can never disagree with the list.
  const STUB_MILESTONES = [10, 25, 50, 100, 150, 200];
  const notableGames = useMemo(() => {
    const milestone = new Set(STUB_MILESTONES);
    // Rooting perspective: prefer featuring a game the user's team WON (a loss is a
    // deflating default showcase — that's what surfaced first before this). Only
    // applies when there's a real anchor; a badge game still outranks it.
    const anchor =
      summary?.anchor && summary.anchor.source !== 'none' ? summary.anchor.abbrev : null;
    const scored = games.map((g) => {
      const nBadges = (badgesByGame.get(g.game_id) ?? []).length;
      const gOrd = stubOrdinals.gameOrd.get(g.game_id) ?? null;
      let score = nBadges * 100;
      if (gOrd && milestone.has(gOrd)) score += 60;
      if (stubOrdinals.firstAtArena.has(g.game_id)) score += 40;
      if (anchor && (g.home.abbrev === anchor || g.away.abbrev === anchor)) {
        const hs = g.home?.score;
        const as = g.away?.score;
        if (Number.isFinite(hs) && Number.isFinite(as) && hs !== as) {
          const anchorWon = (g.home.abbrev === anchor) === (hs > as);
          score += anchorWon ? 50 : -20;
        }
      }
      return { g, score, date: String(g.date ?? '') };
    });
    // Highest score first; the newer game breaks ties (more top-of-mind to share).
    scored.sort((a, b) => b.score - a.score || b.date.localeCompare(a.date));
    return scored.map((s) => s.g);
  }, [games, badgesByGame, stubOrdinals, summary]);

  const [featuredIdx, setFeaturedIdx] = useState(0);
  const featuredGame =
    notableGames.length > 0 ? notableGames[featuredIdx % notableGames.length] : null;

  // Collapsible hero: it leads with the shareable artifact (discovery), but a tall
  // preview eats above-the-fold space for a returning user who's already seen it.
  // Expanded by default (new users get the aha); collapse state persists per-browser.
  const [heroCollapsed, setHeroCollapsed] = useState(false);
  // Tonight's Game leads when it has something to show — the stub hero auto-collapses
  // rather than competing for the same above-the-fold slot (spec: hero precedence).
  const [tonightActive, setTonightActive] = useState(false);
  const tonightEnabled = isFeatureEnabled('tonight');
  useEffect(() => {
    try {
      setHeroCollapsed(localStorage.getItem(HERO_COLLAPSE_KEY) === '1');
    } catch {
      /* non-fatal */
    }
  }, []);
  const toggleHero = () =>
    setHeroCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(HERO_COLLAPSE_KEY, next ? '1' : '0');
      } catch {
        /* non-fatal */
      }
      return next;
    });

  // A one-phrase "why this game is notable" label (drives the log-time prompt copy).
  const milestoneNoteFor = (gameId: string): string | null => {
    const gOrd = stubOrdinals.gameOrd.get(gameId);
    if (gOrd && STUB_MILESTONES.includes(gOrd)) return `your ${gOrd}th game`;
    if (stubOrdinals.firstAtArena.has(gameId)) return 'a new arena';
    const b = badgesByGame.get(gameId);
    if (b && b.length) return b[0];
    return null;
  };

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
              {teamMatchupLabel(t.short_name, t.abbrev, t.name)}
            </span>
          );
          return (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {teamSpan(r.away)}
              <span style={{ color: 'var(--ink-32)', fontSize: 12 }}>@</span>
              {teamSpan(r.home)}
              {chip ? <span className="att-chip">{chip}</span> : null}
              {r.is_manual ? (
                <span className="att-chip att-chip-unverified" title="Added manually — not verified against the NHL API. Counts toward Games, Arena and Team record only.">
                  unverified
                </span>
              ) : null}
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
          // Manual games without both scores entered: never fabricate a 0–0 final.
          if (r.is_manual && (r.home_score == null || r.away_score == null)) {
            return (
              <span style={{ fontFamily: 'var(--mono)', fontSize: CELL_FONT_SIZE, color: 'var(--ink-32)' }}>—</span>
            );
          }
          // NHL game with no final facts yet (older game with no game_results row,
          // or a cross-device row that hasn't hydrated): show an honest "—" rather
          // than a fabricated 0–0 that reads as a real final. mapD1Row leaves such
          // rows non-final, so this only hides genuinely-unknown scores.
          if (!r.is_manual && r.status !== 'final') {
            return (
              <span style={{ fontFamily: 'var(--mono)', fontSize: CELL_FONT_SIZE, color: 'var(--ink-32)' }}>—</span>
            );
          }
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
        id: 'actions',
        header: '',
        accessor: () => '',
        align: 'center',
        exportInclude: false,
        width: 84,
        cell: (_, r) => (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <button
              className="att-stub"
              title="Create a ticket-stub graphic for this game"
              aria-label={`Ticket stub for ${r.away.abbrev} at ${r.home.abbrev}`}
              onClick={(e) => {
                e.stopPropagation();
                handleStub(r);
              }}
            >
              🎟 Stub
            </button>
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
          </div>
        ),
      },
    ],
    [removeGame, handleStub],
  );

  const seenCols = useMemo<HGBColumnDef<SeenPlayerRow>[]>(
    () => [
      {
        id: 'name',
        header: 'Player',
        accessor: (r) => r.name,
        align: 'left',
        sortType: 'string',
        // Name-only (the team logo lives in the TEAM column, matching Skater Stats).
        cell: (_, r) => (
          <span className="att-seen-name" style={{ fontFamily: 'var(--body)', fontWeight: 600, fontSize: NAME_FONT_SIZE }}>{r.name}</span>
        ),
        exportText: (_v, r) => r.name,
      },
      {
        id: 'team',
        header: 'Team',
        accessor: (r) => r.team,
        align: 'center',
        width: 70,
        // Logo + abbrev, matching the Skater Stats team cell. Defunct/relocated
        // teams (e.g. ATL, PHX) have no local logo asset — the onError hides the
        // broken image so the abbrev stands alone (never a broken-image glyph).
        cell: (_v, r) => (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, justifyContent: 'center' }}>
            <img
              className="att-seen-logo"
              src={teamLogoSrc(r.team)}
              width={28}
              height={28}
              style={TEAM_LOGO_STYLE}
              alt=""
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
            <span style={{ fontFamily: 'var(--mono)', fontSize: CELL_FONT_SIZE, fontWeight: 700 }}>{r.team}</span>
          </div>
        ),
        exportText: (_v, r) => r.team,
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

  // ── Shared chip/pip renderers (dashboard + empty-state reuse the SAME markup) ──
  // A single catalog-badge chip: earned or locked ghost. The empty state feeds it
  // ghostCatalog (all locked); the dashboard feeds it the earned+ghost catalog.
  const renderCatalogBadge = (c: CatalogBadge) => {
    // Clickable ONLY when earned AND the chip carries its earning games. `games`
    // is present solely on the owner's own summary (the public projection strips
    // it), so this drill-down affordance can never appear on someone else's
    // passport, and an earned badge with no games stays a plain, static chip.
    const drillable = c.earned && !!c.games && c.games.length > 0;
    return c.earned ? (
      <div
        className={drillable ? 'att-badge att-badge-drill' : 'att-badge'}
        data-family={c.family}
        key={c.id}
        {...(drillable
          ? {
              role: 'button',
              tabIndex: 0,
              'aria-haspopup': 'dialog' as const,
              onClick: () => setDrillBadge(c),
              onKeyDown: (e: React.KeyboardEvent) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setDrillBadge(c);
                }
              },
            }
          : {})}
      >
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
        {drillable ? (
          (() => {
            // DISTINCT-game count (not row count): the 4 player-moment badges send
            // one row per qualifying player, so raw length overcounts. This matches
            // the badge's per-game ×count and the grouped modal row count.
            const n = distinctGameCount(c.games!);
            return (
              <span className="att-badge-drill-hint" aria-hidden="true">
                {n === 1 ? 'View game' : `View ${n} games`} ›
              </span>
            );
          })()
        ) : null}
      </div>
    ) : (
      <div className="att-badge att-badge-ghost" data-family={c.family} key={c.id}>
        <div className="att-badge-top">
          <span className="att-badge-label">{c.label}</span>
          <span className="att-badge-ghost-tag">Locked</span>
        </div>
        <span className="att-badge-rarity">
          {/* LOCKED: the hint is a GENERAL target rarity, not the user's own rate.
              Label it ("rarity ~1 in N") so it can't be misread as an achieved stat. */}
          {c.rarityHint ? `rarity ~${c.rarityHint}` : 'not yet seen'}
          <span className="att-badge-family"> · {c.family === 'game-type' ? 'type' : 'moment'}</span>
        </span>
        {c.blurb ? <span className="att-badge-blurb">{c.blurb}</span> : null}
      </div>
    );
  };

  // One tiered milestone badge — the highest earned rung (or the Rung-I chase
  // when locked), with a progress bar toward the next rung. Mirrors the
  // .att-badge chip shell so the wall reads as one system with the event badges.
  const renderTierBadge = (b: TierBadgeView) => {
    // Fill of the CURRENT rung's span, server-computed (`fraction`). This used to
    // be re-derived here from a local threshold table; the server owns it now so
    // the dashboard, the share card and iOS can't draw three different bars.
    const frac = b.fraction;
    return b.earned ? (
      <div className="att-badge" data-family="tier" key={b.id}>
        <div className="att-badge-top">
          <span className="att-badge-label">{b.label}</span>
          <span className="att-badge-count">{b.value.toLocaleString('en-US')}</span>
        </div>
        <span className="att-tier-rung">{b.rung_name}</span>
        <div className="att-tier-bar">
          <div className="att-tier-bar-fill" style={{ width: `${Math.round(frac * 100)}%` }} />
        </div>
        <span className="att-tier-progress">{b.progress}</span>
      </div>
    ) : (
      <div className="att-badge att-badge-ghost" data-family="tier" key={b.id}>
        <div className="att-badge-top">
          <span className="att-badge-label">{b.label}</span>
          <span className="att-badge-ghost-tag">Locked</span>
        </div>
        <span className="att-tier-rung">{b.rung_name}</span>
        <div className="att-tier-bar">
          <div className="att-tier-bar-fill" style={{ width: `${Math.round(frac * 100)}%` }} />
        </div>
        <span className="att-tier-progress">{b.progress}</span>
      </div>
    );
  };

  // One team's home-rink collection pip. `collected` lights it in the team colour;
  // otherwise it stays neutral grey (the "still to collect" state).
  const renderPip = (t: { abbr: string; name: string }, collected: boolean) => (
    <div
      className={collected ? 'att-rink att-rink-on' : 'att-rink'}
      key={t.abbr}
      title={collected ? `${t.name} — collected` : `${t.name} — not yet`}
    >
      <span className="att-rink-pip" style={{ background: collected ? pickTeamColor(t.abbr) : 'var(--ink-14)' }} />
      <span className="att-rink-abbr">{t.abbr}</span>
    </div>
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
      {viewBoxIncomplete && !boxHealing ? (
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
        <div className="att-banner att-signin-cta">
          <div className="att-signin-cta-text">
            <strong>Save your {games.length} games.</strong> Create a free account to sync them across devices and claim your own shareable passport.
          </div>
          <div className="att-signin-cta-actions">
            <button
              type="button"
              className="att-signin-btn"
              onClick={() => { window.location.href = `${API}/v1/auth/google?from=${encodeURIComponent(window.location.origin)}`; }}
            >
              Continue with Google
            </button>
            <a className="att-signin-alt" href="/account">or use email</a>
          </div>
        </div>
      ) : null}

      {/* Counter row. Clicking the Games tally replays the 0→total roll across all
          five (opt-in — nothing auto-animates on load). */}
      <div className="att-counters">
        <Counter
          label="Games"
          value={viewCounters.games}
          replayToken={replayToken}
          onClick={viewCounters.games > 0 && !summaryPending ? () => setReplayToken((t) => t + 1) : undefined}
          hint={viewCounters.games > 0 ? 'Replay the count' : undefined}
        />
        <Counter label="Periods" value={viewCounters.periods} pending={boxPending} replayToken={replayToken} />
        <Counter label="Goals" value={viewCounters.goals} pending={boxPending} replayToken={replayToken} />
        <Counter
          label="Shots"
          value={viewCounters.shots}
          pending={boxPending}
          warn={viewBoxIncomplete && !boxHealing}
          replayToken={replayToken}
        />
        <Counter
          label="Players Seen"
          value={viewCounters.playersSeen}
          pending={boxPending}
          warn={viewBoxIncomplete && !boxHealing}
          replayToken={replayToken}
        />
      </div>

      {/* Permanent "What's new" entry point — page-level, always visible
          (signed in or logged out, regardless of Public Passport's collapsed
          state). This is the ONE entry point into the changelog history;
          do not add another inside a collapsible/gated panel. */}
      <PassportWhatsNew />

      {/* Honest footnote: manual games count for Games/Arena/Team record only. */}
      {viewUnverifiedCount > 0 ? (
        <div className="att-unverified-note">
          {viewUnverifiedCount} game{viewUnverifiedCount === 1 ? '' : 's'} added manually — counts toward Games,
          Arenas and Team records only; goals, shots, players and badges are limited.
        </div>
      ) : null}

      {tonightEnabled ? (
        <TonightGameCard
          games={games}
          summary={summary}
          isLoggedIn={isLoggedIn}
          anchor={serverAnchor && serverAnchor.source !== 'none' ? serverAnchor.abbrev : null}
          stubOrdinals={stubOrdinals}
          addGame={addGame}
          removeGame={removeGame}
          handleStub={handleStub}
          onActiveChange={setTonightActive}
        />
      ) : null}

      {/* Featured-stub hero — lead with the shareable ARTIFACT. The per-game stub is
          the viral unit (event-tied, others recognize the game); the passport-share
          bar below stays as the whole-collection flex. */}
      {!empty && featuredGame ? (
        <div className={`att-hero${heroCollapsed || tonightActive ? ' att-hero-collapsed' : ''}`}>
          <div className="att-hero-head">
            <div className="att-hero-headings">
              {!heroCollapsed && !tonightActive ? <span className="att-hero-eyebrow">Share where you've been</span> : null}
              <h3 className="att-hero-title">Your ticket stub</h3>
            </div>
            {tonightActive ? null : (
              <button
                className="att-hero-toggle"
                type="button"
                onClick={toggleHero}
                aria-expanded={!heroCollapsed}
                title={heroCollapsed ? 'Show ticket stub' : 'Hide ticket stub'}
              >
                {heroCollapsed ? 'Show ▾' : 'Hide ▴'}
              </button>
            )}
          </div>
          {!heroCollapsed && !tonightActive ? (
            <div className="att-hero-body">
              <p className="att-hero-sub">
                {featuredGame.away.name || featuredGame.away.abbrev} @{' '}
                {featuredGame.home.name || featuredGame.home.abbrev}
                {featuredGame.date ? ` · ${fmtStubDate(featuredGame.date)}` : ''}
              </p>
              <div className="att-hero-actions">
                <button className="att-hero-share" type="button" onClick={() => handleStub(featuredGame)}>
                  🎟 Share this stub
                </button>
                {games.length > 1 ? (
                  <button
                    className="att-hero-grid"
                    type="button"
                    title="Two random games side by side — sized for X/Twitter (no crop)"
                    onClick={handleGridShare}
                  >
                    2 games for X
                  </button>
                ) : null}
                {notableGames.length > 1 ? (
                  <button
                    className="att-hero-cycle"
                    type="button"
                    onClick={() => setFeaturedIdx((i) => (i + 1) % notableGames.length)}
                  >
                    Pick another →
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Log-time / milestone prompt — fires the instant a game is added (highest
          intent). Milestone-aware copy when the new game is a 10th/25th/… or a new
          arena. Dismissible; auto-hides if that game is removed. */}
      {justAdded && games.some((g) => g.game_id === justAdded.game_id) ? (
        <div className="att-logprompt">
          <div className="att-logprompt-text">
            <strong>
              Added {justAdded.away.abbrev} @ {justAdded.home.abbrev}.
            </strong>{' '}
            {(() => {
              const note = milestoneNoteFor(justAdded.game_id);
              return note
                ? `That's ${note} — make a ticket stub to share it.`
                : 'Make a ticket stub to share this game.';
            })()}
            {passportPublic ? (
              // Public Passport Delay disclosure
              // (docs/plans/puck-passport-public-delay-design-2026-08.md §17.1) —
              // only relevant when the account's passport is public; a private
              // passport has nothing here to disclose.
              <div className="att-logprompt-privacy">
                Logged! It’s visible to you now. For privacy, new games appear on your public passport
                after the next morning refresh.
              </div>
            ) : null}
          </div>
          <div className="att-logprompt-actions">
            <button
              className="att-logprompt-share"
              type="button"
              onClick={() => {
                const g = justAdded;
                setJustAdded(null);
                handleStub(g);
              }}
            >
              🎟 Make a stub
            </button>
            <button
              className="att-logprompt-dismiss"
              type="button"
              aria-label="Dismiss"
              onClick={() => setJustAdded(null)}
            >
              ✕
            </button>
          </div>
        </div>
      ) : null}

      {/* Your public passport — share URL + make-public toggle + customize handle.
          Account-level, so it renders whenever logged in (independent of games). */}
      {isLoggedIn ? (
        <PublicPassportPanel
          handle={passportHandle}
          isPublic={passportPublic}
          onHandleChange={setPassportHandle}
          onPublicChange={setPassportPublic}
        />
      ) : null}

      {/* Share your Passport — client-side canvas PNG (hidden until there's data) */}
      {!empty ? (
        <div className="att-share-bar">
          {/* Disabled while the server summary is still loading OR after a fetch
              failure: in both windows viewCounters falls back to zeroed stats, so
              exporting would produce an all-zeros card presented as truth. On error
              a disabled Share is correct fail-loud behavior — the banner above
              already explains why. */}
          <button
            className="att-share-btn"
            onClick={handleShare}
            disabled={boxPending || summaryError}
            title={boxPending ? 'Loading your stats — one moment…' : undefined}
          >
            ↑ Share your Passport
          </button>
          <span className="att-share-note">
            {boxPending
              ? 'Loading your stats…'
              : summaryError
                ? 'Stats unavailable right now — sharing is paused until they load.'
                : 'Generates a shareable card of your stats — download or post it.'}
          </span>
        </div>
      ) : null}

      {/* Add games */}
      <section className="att-section" id="att-add">
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
          <button
            role="tab"
            aria-selected={addMode === 'location'}
            className={addMode === 'location' ? 'att-mode-btn active' : 'att-mode-btn'}
            onClick={() => setAddMode('location')}
          >
            By Location
          </button>
          <button
            role="tab"
            aria-selected={addMode === 'import'}
            className={addMode === 'import' ? 'att-mode-btn active' : 'att-mode-btn'}
            onClick={() => setAddMode('import')}
          >
            Import
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
            <div className="att-add-hint">
              Team search covers full season schedules back to{' '}
              {seasonOptions[seasonOptions.length - 1]?.label ?? '2010-11'}. Attended an older game?{' '}
              <button type="button" className="att-link-btn" onClick={() => setAddMode('date')}>
                Find it by date →
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
                        <div className="att-select-actions">
                          <button
                            className="att-btn att-btn-sm"
                            disabled={addable === 0}
                            onClick={() => addSelected(attendedIds)}
                          >
                            {addable > 0 ? `Add ${addable} game${addable === 1 ? '' : 's'}` : 'Add games'}
                          </button>
                          <button
                            className="att-btn-ghost"
                            onClick={resetTeamSearch}
                            aria-label="Close search results"
                          >
                            Close
                          </button>
                        </div>
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
                            <div className="att-add-info">
                              <span className="att-add-line">
                                <span className="att-add-teams">
                                  <span style={{ color: awayColor, fontWeight: 700 }}>
                                    {teamMatchupLabel(g.away_team.short_name, g.away_team.abbrev)}
                                  </span>
                                  <span className="att-add-at">@</span>
                                  <span style={{ color: homeColor, fontWeight: 700 }}>
                                    {teamMatchupLabel(g.home_team.short_name, g.home_team.abbrev)}
                                  </span>
                                </span>
                                <span className="att-add-score">
                                  {g.status === 'final' ? `${g.away_team.score}–${g.home_team.score}` : g.status}
                                  {(() => {
                                    const np = normalizePeriod(g.last_period_type);
                                    return np.code !== 'REG' ? <span className="att-ot">{np.label}</span> : null;
                                  })()}
                                </span>
                              </span>
                              <span className="att-add-meta">
                                <span className="att-add-date">{g.date}</span>
                                {chip ? <span className="att-add-type"><span className="att-chip">{chip}</span></span> : null}
                                {g.venue ? <span className="att-add-venue">{g.venue}</span> : null}
                              </span>
                            </div>
                            <button
                              className={already ? 'att-add-btn added' : 'att-add-btn'}
                              onClick={() => toggleSearchResult(g, already)}
                              disabled={mutatingIds.has(g.game_id)}
                              title={already ? 'Remove from your attended games' : undefined}
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
        ) : addMode === 'date' ? (
          /* ── BY DATE (original flow) ────────────────────────────────────────── */
          <>
            <div className="att-add-controls">
              <label className="att-date-field">
                <span className="att-date-label">From</span>
                <input
                  type="date"
                  className="att-date"
                  value={searchDate}
                  onChange={(e) => setSearchDate(e.target.value)}
                  aria-label="From date"
                />
              </label>
              <label className="att-date-field">
                <span className="att-date-label">To</span>
                <input
                  type="date"
                  className="att-date"
                  value={searchDateTo}
                  min={searchDate || undefined}
                  onChange={(e) => setSearchDateTo(e.target.value)}
                  aria-label="To date (optional)"
                />
                <span className="att-date-optional">optional</span>
              </label>
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
            <div className="att-add-hint">
              Don't remember the exact night? Add a <strong>To</strong> date to search a range
              (up to {MAX_DATE_SPAN_DAYS} days). Works for any season the NHL has on record.
            </div>

            {searchError ? <div className="att-banner att-banner-warn">{searchError}</div> : null}

            {searchResults != null ? (
              <>
                <div className="att-select-bar">
                  <span className="att-select-count">
                    {(() => {
                      const isRange = /^\d{4}-\d{2}-\d{2}$/.test(searchDateTo) && searchDateTo !== searchDate;
                      const lo = isRange ? (searchDate < searchDateTo ? searchDate : searchDateTo) : searchDate;
                      const hi = isRange ? (searchDate < searchDateTo ? searchDateTo : searchDate) : searchDate;
                      const when = isRange ? `${lo} → ${hi}` : searchDate;
                      if (searchResults.length === 0) return 'No games';
                      return `${searchResults.length} game${searchResults.length === 1 ? '' : 's'} ${isRange ? 'in' : 'on'} ${when}`;
                    })()}
                  </span>
                  <div className="att-select-actions">
                    <button
                      className="att-btn-ghost"
                      onClick={resetDateSearch}
                      aria-label="Close search results"
                    >
                      Close
                    </button>
                  </div>
                </div>
                {searchResults.length === 0 ? (
                  <div className="att-add-empty">
                    No NHL games{' '}
                    {/^\d{4}-\d{2}-\d{2}$/.test(searchDateTo) && searchDateTo !== searchDate
                      ? 'in that range'
                      : `on ${searchDate}`}
                    .
                  </div>
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
                          <div className="att-add-info">
                            <span className="att-add-line">
                              <span className="att-add-teams">
                                <span style={{ color: awayColor, fontWeight: 700 }}>
                                  {teamMatchupLabel(g.away_team.short_name, g.away_team.abbrev)}
                                </span>
                                <span className="att-add-at">@</span>
                                <span style={{ color: homeColor, fontWeight: 700 }}>
                                  {teamMatchupLabel(g.home_team.short_name, g.home_team.abbrev)}
                                </span>
                              </span>
                              <span className="att-add-score">
                                {g.status === 'final' ? `${g.away_team.score}–${g.home_team.score}` : g.status}
                              </span>
                            </span>
                            <span className="att-add-meta">
                              <span className="att-add-date">{g.date}</span>
                              {g.venue ? <span className="att-add-venue">{g.venue}</span> : null}
                            </span>
                          </div>
                          <button
                            className={already ? 'att-add-btn added' : 'att-add-btn'}
                            onClick={() => toggleSearchResult(g, already)}
                            disabled={mutatingIds.has(g.game_id)}
                            title={already ? 'Remove from your attended games' : undefined}
                          >
                            {already ? '✓ Added' : '+ Attended'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            ) : null}
          </>
        ) : addMode === 'location' ? (
          /* ── BY LOCATION — on-demand GPS, always reachable regardless of the
             Tonight's Game card's own suppression/backoff state ──────────────── */
          <>
            <div className="pp-actions att-loc-toggle-row">
              <label className="pp-toggle">
                <input
                  type="checkbox"
                  checked={geoPrefState === 'enabled'}
                  disabled={locBusy}
                  onChange={toggleLocationDetection}
                />
                <span className={geoPrefState === 'enabled' ? 'pp-toggle-track on' : 'pp-toggle-track'}>
                  <span className="pp-toggle-knob" />
                </span>
                <span className="pp-toggle-label">
                  📍 Automatic detection: {geoPrefState === 'enabled' ? 'On' : 'Off'}
                </span>
              </label>
            </div>
            <div className="att-add-controls">
              <label className="att-date-field">
                <span className="att-date-label">Date</span>
                <input
                  type="date"
                  className="att-date"
                  value={locDate}
                  onChange={(e) => {
                    setLocDate(e.target.value);
                  }}
                  aria-label="Date"
                />
              </label>
              {locCoords ? (
                <button className="att-btn" onClick={refetchByLocationDate} disabled={locLoading}>
                  {locLoading ? 'Loading…' : 'Find games'}
                </button>
              ) : (
                <button className="att-btn" onClick={useMyLocation} disabled={locBusy || locLoading}>
                  {locBusy || locLoading ? 'Locating…' : 'Use my location'}
                </button>
              )}
            </div>
            <div className="att-add-hint">
              Uses your device's location to find the game nearest you on the selected date.
              Your coordinates stay on this device.
            </div>

            {locError ? <div className="att-banner att-banner-warn">{locError}</div> : null}

            {locResults != null ? (
              locResults.length === 0 ? (
                <div className="att-add-empty">No NHL games on {locDate}.</div>
              ) : (
                <div className="att-add-results">
                  {locResults.map((g) => {
                    const already = attendedIds.has(g.game_id);
                    const awayColor = pickTeamColor(g.away_team.abbrev);
                    const homeColor = pickTeamColor(g.home_team.abbrev);
                    const km = g.arena && locCoords ? haversineKm(locCoords.lat, locCoords.lon, g.arena.lat, g.arena.lon) : null;
                    return (
                      <div className="att-add-row" key={g.game_id}>
                        <div className="att-add-info">
                          <span className="att-add-line">
                            <span className="att-add-teams">
                              <span style={{ color: awayColor, fontWeight: 700 }}>
                                {teamMatchupLabel(g.away_team.short_name, g.away_team.abbrev)}
                              </span>
                              <span className="att-add-at">@</span>
                              <span style={{ color: homeColor, fontWeight: 700 }}>
                                {teamMatchupLabel(g.home_team.short_name, g.home_team.abbrev)}
                              </span>
                            </span>
                            <span className="att-add-score">
                              {g.status === 'final' ? `${g.away_team.score}–${g.home_team.score}` : g.status}
                            </span>
                          </span>
                          <span className="att-add-meta">
                            <span className="att-add-date">{g.date}</span>
                            {g.venue ? <span className="att-add-venue">{g.venue}</span> : null}
                            {km != null ? (
                              <span className="att-add-dist">{km < 1 ? '<1 km' : `${km.toFixed(1)} km`}</span>
                            ) : null}
                          </span>
                        </div>
                        <button
                          className={already ? 'att-add-btn added' : 'att-add-btn'}
                          onClick={() => toggleSearchResult(g, already)}
                          disabled={mutatingIds.has(g.game_id)}
                          title={already ? 'Remove from your attended games' : undefined}
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
        ) : (
          /* ── IMPORT — photos (EXIF date) or a pasted list → review by date ───── */
          <>
            <div className="att-import-tabs" role="tablist" aria-label="Import from">
              <button
                role="tab"
                aria-selected={importTab === 'photos'}
                className={importTab === 'photos' ? 'att-subtab active' : 'att-subtab'}
                onClick={() => setImportTab('photos')}
              >
                From photos
              </button>
              <button
                role="tab"
                aria-selected={importTab === 'paste'}
                className={importTab === 'paste' ? 'att-subtab active' : 'att-subtab'}
                onClick={() => setImportTab('paste')}
              >
                Paste a list
              </button>
            </div>

            {importTab === 'photos' ? (
              <>
                <div className="att-add-controls">
                  <label className={photoBusy ? 'att-btn att-file-btn disabled' : 'att-btn att-file-btn'}>
                    {photoBusy ? 'Reading photos…' : 'Choose photos'}
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      hidden
                      disabled={photoBusy}
                      onChange={(e) => onPhotos(e.target.files)}
                    />
                  </label>
                </div>
                <div className="att-add-hint">
                  Pick photos from games you went to — we read the <strong>date</strong> and, when it's
                  there, the <strong>location</strong> each was taken, right in your browser
                  (<strong>nothing is uploaded</strong>). Location pins the exact game; otherwise we show
                  every game that day for you to pick.
                </div>
              </>
            ) : (
              <>
                <div className="att-import-paste">
                  <textarea
                    className="att-import-textarea"
                    rows={5}
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                    aria-label="Paste your game dates"
                    placeholder={'Paste dates in any format — one per line or straight from a spreadsheet:\n2006-03-15\n3/18/2006\nMar 22, 2006'}
                  />
                  <button
                    className="att-btn"
                    onClick={onPaste}
                    disabled={importLoading || !pasteText.trim()}
                  >
                    {importLoading ? 'Looking up…' : 'Find games'}
                  </button>
                </div>
                <div className="att-add-hint">
                  Any format works — columns, commas, notes, whatever. We just pull the dates out and
                  match NHL games. No exact-format needed.
                </div>
              </>
            )}

            {importError ? <div className="att-banner att-banner-warn">{importError}</div> : null}
            {importLoading ? <div className="att-add-empty">Looking up games…</div> : null}

            {importGroups != null ? (
              <>
                <div className="att-select-bar">
                  <span className="att-select-count">{importNote}</span>
                  <div className="att-select-actions">
                    <button className="att-btn-ghost" onClick={resetImport} aria-label="Close import results">
                      Close
                    </button>
                  </div>
                </div>
                {importGroups.length === 0 ? (
                  <div className="att-add-empty">
                    None of those dates had NHL games. Double-check them, or add a game manually below.
                  </div>
                ) : (
                  <div className="att-import-groups">
                    {importGroups.map((grp) => {
                      const matchId = grp.match?.gameId;
                      // Pinned game floats to the top of its date group.
                      const games = matchId
                        ? [...grp.games].sort((a, b) =>
                            a.game_id === matchId ? -1 : b.game_id === matchId ? 1 : 0,
                          )
                        : grp.games;
                      return (
                        <div className="att-import-group" key={grp.date}>
                          <div className="att-import-date">
                            {grp.date}
                            {grp.match ? (
                              <span className="att-import-pick"> · 📍 pinned by location — confirm below</span>
                            ) : grp.games.length > 1 ? (
                              <span className="att-import-pick"> · pick the one you were at</span>
                            ) : null}
                          </div>
                          <div className="att-add-results">
                            {games.map((g) => (
                              <GameAddRow
                                key={g.game_id}
                                g={g}
                                already={attendedIds.has(g.game_id)}
                                disabled={mutatingIds.has(g.game_id)}
                                onToggle={toggleSearchResult}
                                matched={
                                  matchId === g.game_id
                                    ? { arena: grp.match!.arena, km: grp.match!.km }
                                    : undefined
                                }
                              />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            ) : null}
          </>
        )}

        {/* ── Manual fallback — a game the NHL API can't find (old / preseason /
            neutral-site / memory-gap). Counts toward Games, Arena and Team record
            only; excluded from periods/goals/shots/players/badges/records. ─── */}
        <div className="att-manual">
          <button
            type="button"
            className="att-manual-toggle"
            aria-expanded={showManual}
            onClick={() => {
              setShowManual((v) => !v);
              setManualError(null);
            }}
          >
            {showManual ? '− Hide manual entry' : "Can't find your game? Add it manually"}
          </button>

          {showManual ? (
            <div className="att-manual-form">
              <div className="att-manual-note">
                Logs a game we can't verify against the NHL API — it counts toward your Games, Arenas and Team
                records, but not goals, shots, players or badges.
              </div>
              <div className="att-manual-grid">
                <select
                  className="att-select"
                  value={manualAway}
                  onChange={(e) => setManualAway(e.target.value)}
                  aria-label="Away team"
                >
                  <option value="">Away team…</option>
                  {NHL_TEAMS.map((t) => (
                    <option key={t.abbr} value={t.abbr}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <span className="att-manual-at">@</span>
                <select
                  className="att-select"
                  value={manualHome}
                  onChange={(e) => setManualHome(e.target.value)}
                  aria-label="Home team"
                >
                  <option value="">Home team…</option>
                  {NHL_TEAMS.map((t) => (
                    <option key={t.abbr} value={t.abbr}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="att-manual-grid">
                <input
                  type="date"
                  className="att-date"
                  value={manualDate}
                  onChange={(e) => setManualDate(e.target.value)}
                  aria-label="Game date"
                />
                <input
                  type="number"
                  min="0"
                  className="att-manual-score"
                  placeholder="Away"
                  value={manualAwayScore}
                  onChange={(e) => setManualAwayScore(e.target.value)}
                  aria-label="Away score (optional)"
                />
                <span className="att-manual-dash">–</span>
                <input
                  type="number"
                  min="0"
                  className="att-manual-score"
                  placeholder="Home"
                  value={manualHomeScore}
                  onChange={(e) => setManualHomeScore(e.target.value)}
                  aria-label="Home score (optional)"
                />
                <button className="att-btn att-btn-sm" onClick={addManualGame}>
                  + Add game
                </button>
              </div>
              <div className="att-manual-hint">Score is optional — leave blank if you don't remember it.</div>
              {manualError ? <div className="att-banner att-banner-warn">{manualError}</div> : null}
            </div>
          ) : null}
        </div>
      </section>

      {empty ? (
        // Honest empty state — the STRUCTURE you'll fill, never fabricated sample
        // data. Full badge wall as locked ghosts + all 32 arena pips grey, so the
        // collection reads as a chase from the first visit.
        <>
          {/* No empty-state hero — the onboarding modal now welcomes + guides new
              users, so the redundant "Start your Puck Passport" box was removed
              (operator, 2026-07-25). The badge-ghost wall below stays as the chase. */}
          {/* Full badge catalog as ghosts — all locked */}
          <section className="att-section">
            <div className="att-section-head">
              <span className="att-section-label">Badges</span>
              {/* +1 for the Home Rinks collection (shown as the meter below), so the
                  empty-state total matches the populated "X of Y" (which also counts it). */}
              <span className="att-section-meta">0 of {ghostCatalog.length + 1}</span>
            </div>
            <div className="att-badges">{ghostCatalog.map(renderCatalogBadge)}</div>
          </section>

          {/* Milestone Tiers — cumulative stat ladders, all locked at zero. Gated on
              the zero summary having landed: these are server-computed, so before it
              arrives there is nothing honest to draw. Unlike the ghost BADGE catalog
              above (still built locally), the ladders are never fabricated here. */}
          {tierBadges.length > 0 && (
            <section className="att-section">
              <div className="att-section-head">
                <span className="att-section-label">Milestone Tiers</span>
                <span className="att-section-meta">
                  {tierBadges.filter((b) => b.earned).length} of {tierBadges.length}
                </span>
              </div>
              <div className="att-badges">{tierBadges.map(renderTierBadge)}</div>
            </section>
          )}

          {/* All 32 arena pips grey — the collection meter at zero */}
          <section className="att-section">
            <div className="att-section-head">
              <span className="att-section-label">NHL Home Arenas — 0 / 32</span>
              <span className="att-section-meta">0 of 32 collected</span>
            </div>
            <div className="att-rinks">{pipTeams.map((t) => renderPip(t, false))}</div>
          </section>
        </>
      ) : (
        <>
          {/* Badges — full catalog: earned (rarest-first) then ghost/unearned (§2) */}
          <section className="att-section">
            <div className="att-section-head">
              <span className="att-section-label">Badges</span>
              <span className="att-section-meta">
                {/* The Home Rinks collection badge is ALWAYS rendered as a collectible, so
                    it always counts toward the total (denominator +1). It counts as earned
                    only once at least one current home rink is collected. (Codex: previously
                    dropped from the total when homeRinks===0 → "0 of 8" instead of "0 of 9".) */}
                {earnedCount + (viewArenaBadge.homeRinks > 0 ? 1 : 0)} of{' '}
                {catalog.length + 1}
                {summaryPending ? ' · loading…' : ''}
              </span>
            </div>
            <div className="att-badges">
              {/* Home-rinks collection badge (distinct current teams seen at home / 32) */}
              {viewArenaBadge.homeRinks > 0 ? (
                <div className="att-badge att-badge-collection" data-family="collection">
                  <div className="att-badge-top">
                    <span className="att-badge-label">NHL Home Arenas</span>
                    <span className="att-badge-count">
                      {viewArenaBadge.homeRinks}/{viewArenaBadge.total}
                    </span>
                  </div>
                  <span className="att-badge-rarity">nhl home arenas · collection</span>
                </div>
              ) : null}

              {catalog.map(renderCatalogBadge)}
            </div>
          </section>

          {/* Milestone Tiers — cumulative stat ladders (Games/Goals/Shots/Players/
              Arenas), one badge per stat showing the highest rung earned + progress
              to the next. Always shows all 5 (locked/ghost below Rung I). */}
          <section className="att-section">
            <div className="att-section-head">
              <span className="att-section-label">Milestone Tiers</span>
              <span className="att-section-meta">
                {tierBadges.filter((b) => b.earned).length} of {tierBadges.length}
                {summaryPending ? ' · loading…' : ''}
              </span>
            </div>
            <div className="att-badges">{tierBadges.map(renderTierBadge)}</div>
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

          {/* Team W-L-OTL (perspective-anchored) + Arenas side by side */}
          <div className="att-two-col">
            <section className="att-section">
              <div className="att-section-head">
                <span className="att-section-label">Team Records</span>
                <span className="att-section-meta">
                  {showAnchored ? 'your record vs each team' : 'every team you’ve seen'}
                </span>
              </div>

              {/* Anchor selector — three states (team / none / inferred pre-select).
                  The server owns the resolved anchor; picking here WRITES it (prefs
                  when logged in, localStorage + public-POST param when logged out). */}
              <div className="pp-anchor-toolbar">
                <label className="pp-anchor-label" htmlFor="pp-anchor-select">
                  Rooting perspective
                </label>
                <select
                  id="pp-anchor-select"
                  className="pp-anchor-select"
                  value={anchorSelectValue}
                  onChange={(e) => chooseAnchorByValue(e.target.value)}
                >
                  <option value="" disabled>
                    Choose your team…
                  </option>
                  {teamsSeenForSelect.map((t) => (
                    <option key={t.abbrev} value={t.abbrev}>
                      {t.name} ({t.abbrev})
                    </option>
                  ))}
                  <option value={ANCHOR_NONE}>No rooting interest</option>
                </select>
              </div>

              {/* Inferred-anchor banner — shown ONLY when the server resolved the
                  anchor by inference. Dismissible: the ✕ confirms the guess as an
                  explicit pref (source flips to 'explicit') so the banner never
                  returns. A soft neutral nudge shows when there's no rooting side. */}
              {anchorIsInferred && anchoredView ? (
                <div className="pp-anchor-note pp-anchor-note-dismissible">
                  <span className="pp-anchor-note-text">
                    Records shown from the {possessive(anchoredView.anchor.name)} side — not your
                    team? Pick it above.
                  </span>
                  <button
                    type="button"
                    className="pp-anchor-dismiss"
                    aria-label="Keep this team as your rooting perspective"
                    title="Keep this team"
                    onClick={confirmInferredAnchor}
                  >
                    ✕
                  </button>
                </div>
              ) : serverAnchor?.source === 'none' ? (
                <div className="pp-anchor-note pp-anchor-note-soft">
                  Neutral view — every team you’ve seen. Set a team for your side.
                </div>
              ) : null}

              {showAnchored && anchoredView ? (
                // ── Table A: your record vs each team (server-computed) ──
                anchoredView.opponents.length === 0 && anchoredView.neutral_games === 0 ? (
                  <div className="att-add-empty">No completed games yet.</div>
                ) : (
                  <div className="att-teams">
                    <div className="att-team-row pp-anchor-row" key="__anchor__">
                      <span className="att-team-dot" style={{ background: pickTeamColor(anchoredView.anchor.abbrev) }} />
                      <span className="att-team-abbr">{anchoredView.anchor.abbrev}</span>
                      <span className="att-team-name">{anchoredView.anchor.name}</span>
                      <span className="pp-overall-tag">Overall</span>
                      <span className="att-team-rec">{fmtRec(anchoredView.anchor)}</span>
                    </div>
                    {anchoredView.opponents.map((o) => (
                      <div className="att-team-row" key={o.abbrev}>
                        <span className="att-team-dot" style={{ background: pickTeamColor(o.abbrev) }} />
                        <span className="att-team-abbr">vs {o.abbrev}</span>
                        <span className="att-team-name">{o.name}</span>
                        <span className="att-team-rec">{fmtRec(o)}</span>
                      </div>
                    ))}
                    {anchoredView.neutral_games > 0 ? (
                      <div className="pp-neutral-line">
                        + {anchoredView.neutral_games} neutral game
                        {anchoredView.neutral_games === 1 ? '' : 's'} (your team didn’t play)
                      </div>
                    ) : null}
                  </div>
                )
              ) : neutralTable.length === 0 ? (
                <div className="att-add-empty">No completed games yet.</div>
              ) : (
                // ── Table B: every team you've seen (neutral, W-L-OTL) ──
                // Also the GRACEFUL FALLBACK when an older api omits the anchored
                // fields — fmtRec tolerates a missing otl.
                <div className="att-teams">
                  {neutralTable.map((t) => (
                    <div className="att-team-row" key={t.abbrev}>
                      <span className="att-team-dot" style={{ background: pickTeamColor(t.abbrev) }} />
                      <span className="att-team-abbr">{t.abbrev}</span>
                      <span className="att-team-name">{t.name}</span>
                      <span className="att-team-rec">{fmtRec(t)}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="att-section">
              <div className="att-section-head">
                <span className="att-section-label">NHL Home Arenas — {viewArenas.homeRinks} / {viewArenas.total}</span>
                {/* Rung name lives here rather than in a sixth badge chip: the chip
                    would restate the very number in the label beside it. */}
                <span className="att-section-meta">
                  {arenaMeterLabel(viewArenas.homeRinks, viewArenas.total, viewArenas.rung)}
                </span>
              </div>
              {/* One pip per current NHL team, alphabetical. Filled in that team's
                  colour when its id is in teams_seen; neutral grey when not. The
                  abbreviation sits under each pip (and in the title) so you can see
                  exactly which teams' home rinks you still need. */}
              <div className="att-rinks">
                {pipTeams.map((t) => {
                  const id = abbrevToTeamId.get(t.abbr);
                  return renderPip(t, id != null && viewArenas.teamsSeen.has(id));
                })}
              </div>
              <div className="att-rinks-substat">{viewArenas.distinctBuildings} total arenas visited</div>
            </section>
          </div>

          {/* Games list — below the records/arenas payoff (management view, not the highlight) */}
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
              <>
                <HGBTable
                  data={seenPlayersToShow}
                  columns={seenCols}
                  defaultSort={{ id: 'gamesSeen', desc: true }}
                  toolbar={{ show: false }}
                  showRank
                />
                {viewSeenPlayers.length > SEEN_CAP ? (
                  <button
                    type="button"
                    className="att-btn-ghost att-seen-toggle"
                    onClick={() => setShowAllSeen((v) => !v)}
                  >
                    {showAllSeen ? `Show top ${SEEN_CAP}` : `Show all (${viewSeenPlayers.length})`}
                  </button>
                ) : null}
              </>
            )}
          </section>
        </>
      )}

      {/* Owner-only badge drill-down modal. Renders ONLY when an earned chip that
          carries its own earning games was clicked (drillBadge). The public
          passport never populates `games`, so this surface cannot leak on a
          shared link. Closeable via ✕ / Escape / backdrop click. */}
      {drillBadge ? (
        <div className="att-drill-backdrop" role="presentation" onClick={() => setDrillBadge(null)}>
          <div
            className="att-drill-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="att-drill-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="att-drill-head">
              <div className="att-drill-heading">
                <span className="att-drill-eyebrow">Earned in</span>
                <h3 className="att-drill-title" id="att-drill-title">
                  {drillBadge.label}
                </h3>
              </div>
              <button
                type="button"
                className="att-drill-close"
                aria-label="Close"
                onClick={() => setDrillBadge(null)}
              >
                ×
              </button>
            </div>
            <ul className="att-drill-list">
              {groupDrillGames(drillBadge.games ?? []).map((g) => {
                const mu = g.matchup;
                // Full names when the api enriched them; fall back to abbrev so an
                // un-enriched response still renders (and desktop shows abbrev too).
                const awayFull = mu.awayName || mu.away;
                const homeFull = mu.homeName || mu.home;
                // Score only when BOTH sides are present — never render "null"/a
                // fabricated 0 for a game whose final score the api didn't supply.
                const hasScore =
                  mu.awayScore != null && mu.homeScore != null;
                return (
                  <li className="att-drill-row" key={g.game_id}>
                    {g.players.length > 0 ? (
                      <>
                        <span className="att-drill-player">{g.players.join(', ')}</span>
                        <span className="att-drill-sep"> · </span>
                      </>
                    ) : null}
                    {/* CSS toggles which span shows by breakpoint (reuses the
                        passport's .pp-team-full/.pp-team-abbr 640px rule): full
                        names on desktop, abbrevs on mobile. No JS width-sniffing. */}
                    <span className="att-drill-matchup">
                      <span className="pp-team-full">
                        {awayFull} @ {homeFull}
                      </span>
                      <span className="pp-team-abbr">
                        {mu.away} @ {mu.home}
                      </span>
                    </span>
                    {hasScore ? (
                      <>
                        <span className="att-drill-sep"> · </span>
                        <span className="att-drill-score">
                          {mu.awayScore}–{mu.homeScore}
                        </span>
                      </>
                    ) : null}
                    <span className="att-drill-sep"> · </span>
                    <span className="att-drill-date">{formatDrillDate(g.date)}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}
