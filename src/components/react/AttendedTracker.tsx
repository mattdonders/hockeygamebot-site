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
import { readPhotoDate, readPhotoGps, type GpsCoord } from '../../lib/exif-date';
import { nearestArena } from '../../lib/arena-match';
import { harvestDates } from '../../lib/import-dates';
import { getMe, getSessionToken, apiFetch } from '../../lib/auth-client';
import PublicPassportPanel from './PublicPassportPanel';
import {
  sortCatalog,
  buildLocalCatalog,
  parseOneInN,
  normalizePeriod,
  badgeBlurb,
  computeTierBadges,
  TIER_STATS,
  type CatalogBadge,
  type TierBadgeView,
} from './puck-passport-badges';
import { drawPassportCard, type PassportShareData } from './puck-passport-share';
import { trackEvent } from '../../lib/track';
import {
  neutralRecords,
  anchoredRecords,
  inferAnchor,
  type TeamRecordGame,
} from '../../lib/team-records';

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

// Rooting-perspective anchor preference (Phase-1 prototype; localStorage only — the
// production flag lands server-side per the spec). Value is a team abbrev (explicit
// team), ANCHOR_NONE (explicit "no rooting interest"), or absent (unset → infer).
const ANCHOR_PREF_KEY = 'hgb_puck_passport_anchor_v1';
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

type TeamSide = { id: number; abbrev: string; name: string; short_name?: string | null; score: number };

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
  // "Home rinks collected" model: home_rinks = distinct CURRENT teams seen at home
  // (≤ 32, the /32 collection meter); distinct_buildings = every distinct building
  // visited (can EXCEED 32 — relocations, neutral-site games); teams_seen = the
  // current-team ids collected, used to colour the per-team pips.
  arenas: { home_rinks: number; total: number; distinct_buildings: number; teams_seen: number[] };
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
  // Count of manually-logged ("unverified") games in the set. Manual games count
  // toward Games + Arena + Team record, but are EXCLUDED from periods/goals/shots/
  // players/badges/records — this drives the honest "N added manually" footnote.
  unverified_count: number;
};

/** A single-game record normalized for render (from the server summary). The
 *  longest-game row carries `total_time` for the share card's bold-hero clock. */
type ViewRecord = { key: string; label: string; value: string; sub: string; total_time?: string | null };

// Raw shapes from /v1/games/today
type RawTeam = { id: number; abbrev: string; name: string; short_name?: string | null; score: number };
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

/** Project a rendered AttendedGame onto the pure TeamRecordGame the perspective
 *  helpers consume. Manual games carry their raw nullable scores (a missing score
 *  ⇒ no result credited); NHL games use the final box score. `isFinal` gates every
 *  fold, so scheduled games contribute nothing (and are never counted "neutral"). */
function toRecordGame(g: AttendedGame): TeamRecordGame {
  const isManual = !!g.is_manual;
  return {
    homeAbbrev: g.home.abbrev,
    homeName: g.home.name || g.home.short_name || g.home.abbrev,
    homeScore: isManual ? g.home_score ?? null : g.home.score,
    awayAbbrev: g.away.abbrev,
    awayName: g.away.name || g.away.short_name || g.away.abbrev,
    awayScore: isManual ? g.away_score ?? null : g.away.score,
    isFinal: g.status === 'final' || isManual,
    lastPeriodType: g.last_period_type,
    isManual,
  };
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
  const side = (id: number | null, score: number | null, snapSide?: TeamSide): TeamSide => {
    const info = id != null ? configMap.get(id) : undefined;
    return {
      id: id ?? snapSide?.id ?? 0,
      abbrev: info?.abbrev ?? snapSide?.abbrev ?? (id != null ? String(id) : '?'),
      name: info?.name ?? snapSide?.name ?? '',
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
    home: side(r.home_team_id, r.home_score, snap?.home),
    away: side(r.away_team_id, r.away_score, snap?.away),
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
function teamMatchupLabel(shortName: string | null | undefined, abbrev: string): React.ReactElement {
  const full = shortName && shortName.trim() ? shortName : abbrev;
  return (
    <>
      <span className="pp-team-full">{full}</span>
      <span className="pp-team-abbr">{abbrev}</span>
    </>
  );
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
    if (all.length === 0) {
      setSummary(null);
      setSummaryError(false);
      finishHeal();
      return;
    }
    // Split into NHL ids + manual games, enforcing the COMBINED cap (the public
    // endpoint caps game_ids.length + manual_games.length — see SUMMARY_ID_CAP).
    const { gameIds, manualGames } = splitForSummary(all);
    // Cache key over BOTH kinds (manual ids are stable `manual-<random>`), so
    // adding/removing either kind misses the cache and refetches.
    const key = summaryCacheKey([...gameIds, ...manualGames.map((m) => m.id)]);

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
      const r = await fetch(`${API}/v1/account/attended/summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          manualGames.length > 0 ? { game_ids: gameIds, manual_games: manualGames } : { game_ids: gameIds },
        ),
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

  // Add-games flow — mode toggle: team-first (default, matches fan recall), date, or
  // bulk import (photos / pasted list).
  const [addMode, setAddMode] = useState<'team' | 'date' | 'import'>('team');

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

  // Rooting-perspective anchor preference (see ANCHOR_PREF_KEY): team abbrev,
  // ANCHOR_NONE, or null (unset → inferred). Hydrated from localStorage on mount.
  const [anchorPref, setAnchorPref] = useState<string | null>(null);

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
    setAnchorPref(readAnchorPref());
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
          const ok = g.is_manual ? await postManualAttended(toManualGame(g)) : await postAttended(g.game_id);
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
        return postAttended(raw.game_id).then((ok) => {
          if (ok) {
            setWriteError(null);
            loadSummary(); // refetch aggregates from the server (anti-divergence)
          } else {
            setWriteError('Could not save that game to your account — check your connection and try again.');
            setD1Rows((prev) => (prev ?? []).filter((r) => r.game_id !== raw.game_id));
          }
        });
      }
      setLocalGames((prev) => {
        if (prev.some((g) => g.game_id === raw.game_id)) return prev;
        const next = [...prev, snap];
        writeAttended(next);
        return next;
      });
      return Promise.resolve();
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

  // Server-computed neutral W-L (fallback only — see the perspective block below).
  const viewTeamRecords = summary ? summary.team_records : [];

  // ── Rooting perspective (Phase-1, 100% client-side) ─────────────────────────
  // Recompute BOTH record framings from the per-game facts the browser already
  // holds — zero dependency on the frozen attended_summary endpoint. See
  // src/lib/team-records.ts for the pure logic (unit-tested).
  const recordGames = useMemo<TeamRecordGame[]>(() => games.map(toRecordGame), [games]);
  const neutralTable = useMemo(() => neutralRecords(recordGames), [recordGames]);
  const inferred = useMemo(() => inferAnchor(recordGames), [recordGames]);

  // Precedence: explicit team > explicit "no rooting interest" > inferred > neutral.
  const explicitTeam = anchorPref && anchorPref !== ANCHOR_NONE ? anchorPref : null;
  const explicitNone = anchorPref === ANCHOR_NONE;
  const effectiveAnchor = explicitTeam ?? (explicitNone ? null : inferred.anchor);
  const anchorIsInferred = !explicitTeam && !explicitNone && !!inferred.anchor;
  const noDominantTeam = !explicitTeam && !explicitNone && !inferred.anchor;

  const anchoredTable = useMemo(
    () => (effectiveAnchor ? anchoredRecords(recordGames, effectiveAnchor) : null),
    [recordGames, effectiveAnchor],
  );

  // Data-availability check (FAIL LOUD, honestly): the server saw these finals; if
  // the browser holds fewer decided games (a cross-device D1 row with no game_results
  // facts on THIS device), we note the shortfall rather than silently under-counting.
  const clientDecided = useMemo(
    () => neutralTable.reduce((n, r) => n + r.w + r.l + r.otl, 0) / 2,
    [neutralTable],
  );
  const serverDecided = summary ? summary.team_records.reduce((n, r) => n + r.w + r.l, 0) / 2 : 0;
  const unresolvedFinals = Math.max(0, Math.round(serverDecided - clientDecided));

  // Fall back to the server's neutral ledger ONLY when the client can compute
  // nothing (no per-game facts) but the server has records — never a blank.
  const useServerFallback = clientDecided === 0 && viewTeamRecords.length > 0;

  // Teams seen (for the anchor selector), by full name.
  const teamsSeenForSelect = useMemo(
    () => [...neutralTable].sort((a, b) => a.name.localeCompare(b.name)),
    [neutralTable],
  );

  const chooseAnchor = useCallback((v: string | null) => {
    setAnchorPref(v);
    writeAnchorPref(v);
  }, []);

  // Home-rinks collection: home_rinks/32 drives the meter + badge; teams_seen (a
  // set of current-team ids) colours the per-team pips; distinct_buildings is the
  // honest "every building visited" total (can exceed 32).
  const viewArenas = useMemo(
    () =>
      summary
        ? {
            homeRinks: summary.arenas.home_rinks,
            total: summary.arenas.total,
            distinctBuildings: summary.arenas.distinct_buildings,
            teamsSeen: new Set(summary.arenas.teams_seen ?? []),
          }
        : { homeRinks: 0, total: 32, distinctBuildings: 0, teamsSeen: new Set<number>() },
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
  const abbrevToTeamId = useMemo(() => {
    const m = new Map<string, number>();
    for (const [id, info] of configMap) m.set(info.abbrev, id);
    return m;
  }, [configMap]);

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
    return sortCatalog(summary.badges.catalog.filter((c) => c.id !== 'arenas-visited').map(mapSummaryCatalog));
  }, [summary]);
  const earnedCount = useMemo(() => catalog.filter((c) => c.earned).length, [catalog]);

  // Ghost catalog for the EMPTY state — the full badge wall, all locked. Built
  // locally from BADGES (no network; the empty state fires no summary fetch) and
  // shown honestly: nothing is "earned", every chip is a locked chase.
  const ghostCatalog = useMemo<CatalogBadge[]>(() => sortCatalog(buildLocalCatalog([], {})), []);

  // Tiered milestone badges (Games/Goals/Shots/Players/Arenas ladders) — a pure
  // client-side bucketing of the counters the summary already delivers (see the
  // ownership note in puck-passport-badges.ts). Always 5 entries, locked/ghost
  // when a stat hasn't reached Rung I yet; zeros before the summary lands / in
  // the empty state so the wall renders as an honest all-locked chase.
  const tierBadges = useMemo<TierBadgeView[]>(
    () =>
      computeTierBadges(
        summary
          ? {
              games: summary.counters.games,
              goals: summary.counters.goals,
              shots: summary.counters.shots,
              players_seen: summary.counters.players_seen,
            }
          : { games: 0, goals: 0, shots: 0, players_seen: 0 },
        summary ? summary.arenas.home_rinks : 0,
      ),
    [summary],
  );

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
    // never throws (see lib/track.ts).
    trackEvent('share_click', { handle: passportHandle });

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
        rungName: b.rungName,
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
              {teamMatchupLabel(t.short_name, t.abbrev)}
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
  const renderCatalogBadge = (c: CatalogBadge) =>
    c.earned ? (
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

  // Rung thresholds by stat id — for the progress-bar's "start of range" edge
  // (thresholds[rung-1], or 0 below Rung I). TIER_STATS is static config.
  const tierThresholdsById = useMemo(() => new Map(TIER_STATS.map((d) => [d.id, d.thresholds])), []);

  // One tiered milestone badge — the highest earned rung (or the Rung-I chase
  // when locked), with a progress bar toward the next rung. Mirrors the
  // .att-badge chip shell so the wall reads as one system with the event badges.
  const renderTierBadge = (b: TierBadgeView) => {
    // Progress fraction toward the NEXT rung (or a full bar when maxed) — the
    // "how close am I" read at a glance, on top of the mono progress line.
    const thresholds = tierThresholdsById.get(b.id);
    const prevThreshold = b.rung > 0 && thresholds ? thresholds[b.rung - 1] : 0;
    const frac = b.maxed
      ? 1
      : b.nextThreshold
        ? Math.max(0, Math.min(1, (b.value - prevThreshold) / (b.nextThreshold - prevThreshold)))
        : 0;
    return b.earned ? (
      <div className="att-badge" data-family="tier" key={b.id}>
        <div className="att-badge-top">
          <span className="att-badge-label">{b.label}</span>
          <span className="att-badge-count">{b.value.toLocaleString('en-US')}</span>
        </div>
        <span className="att-tier-rung">{b.rungName}</span>
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
        <span className="att-tier-rung">{b.rungName}</span>
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

      {/* Honest footnote: manual games count for Games/Arena/Team record only. */}
      {viewUnverifiedCount > 0 ? (
        <div className="att-unverified-note">
          {viewUnverifiedCount} game{viewUnverifiedCount === 1 ? '' : 's'} added manually — counts toward Games,
          Arenas and Team records only; goals, shots, players and badges are limited.
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

          {/* Milestone Tiers — cumulative stat ladders, all locked at zero */}
          <section className="att-section">
            <div className="att-section-head">
              <span className="att-section-label">Milestone Tiers</span>
              <span className="att-section-meta">0 of {tierBadges.length}</span>
            </div>
            <div className="att-badges">{tierBadges.map(renderTierBadge)}</div>
          </section>

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

          {/* Team W-L-OTL (perspective-anchored) + Arenas side by side */}
          <div className="att-two-col">
            <section className="att-section">
              <div className="att-section-head">
                <span className="att-section-label">Team Records</span>
                <span className="att-section-meta">
                  {effectiveAnchor ? 'your record vs each team' : 'every team you’ve seen'}
                </span>
              </div>

              {/* Anchor selector — three states (team / none / auto-inferred). */}
              <div className="pp-anchor-toolbar">
                <label className="pp-anchor-label" htmlFor="pp-anchor-select">
                  Rooting perspective
                </label>
                <select
                  id="pp-anchor-select"
                  className="pp-anchor-select"
                  value={anchorPref ?? ''}
                  onChange={(e) => chooseAnchor(e.target.value === '' ? null : e.target.value)}
                >
                  <option value="">
                    Auto{inferred.anchor ? ` — ${inferred.anchor}` : ' — neutral'}
                  </option>
                  {teamsSeenForSelect.map((t) => (
                    <option key={t.abbrev} value={t.abbrev}>
                      {t.name} ({t.abbrev})
                    </option>
                  ))}
                  <option value={ANCHOR_NONE}>No rooting interest</option>
                </select>
              </div>

              {/* Inferred-anchor label + soft nudges (spec §6). */}
              {anchorIsInferred && effectiveAnchor ? (
                <div className="pp-anchor-note">
                  Records shown from <strong>{effectiveAnchor}</strong>’s side — not your team?{' '}
                  <button type="button" className="pp-anchor-link" onClick={() => chooseAnchor('')}>
                    Set your team
                  </button>
                </div>
              ) : noDominantTeam ? (
                <div className="pp-anchor-note pp-anchor-note-soft">
                  No clear rooting team from your games — showing every team you’ve seen. Set your
                  team to see <em>your</em> record vs each opponent.
                </div>
              ) : explicitNone ? (
                <div className="pp-anchor-note pp-anchor-note-soft">
                  Neutral view — every team you’ve seen. Set a team for your side.
                </div>
              ) : null}

              {useServerFallback ? (
                // Client held no per-game facts — fall back to the server's neutral
                // ledger (W-L only) rather than render a blank. Honest about the gap.
                <>
                  <div className="pp-anchor-note pp-anchor-note-soft">
                    Showing the server’s neutral record — per-game details for the anchored view
                    aren’t on this device.
                  </div>
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
                </>
              ) : anchoredTable ? (
                // ── Table A: your record vs each team ──
                anchoredTable.opponents.length === 0 && anchoredTable.neutralGames === 0 ? (
                  <div className="att-add-empty">No completed games yet.</div>
                ) : (
                  <div className="att-teams">
                    <div className="att-team-row pp-anchor-row" key="__anchor__">
                      <span className="att-team-dot" style={{ background: pickTeamColor(anchoredTable.anchor) }} />
                      <span className="att-team-abbr">{anchoredTable.anchor}</span>
                      <span className="att-team-name">{anchoredTable.anchorName} — overall</span>
                      <span className="att-team-rec">
                        {anchoredTable.overall.w}-{anchoredTable.overall.l}-{anchoredTable.overall.otl}
                      </span>
                    </div>
                    {anchoredTable.opponents.map((o) => (
                      <div className="att-team-row" key={o.abbrev}>
                        <span className="att-team-dot" style={{ background: pickTeamColor(o.abbrev) }} />
                        <span className="att-team-abbr">vs {o.abbrev}</span>
                        <span className="att-team-name">{o.name}</span>
                        <span className="att-team-rec">
                          {o.w}-{o.l}-{o.otl}
                        </span>
                      </div>
                    ))}
                    {anchoredTable.neutralGames > 0 ? (
                      <div className="pp-neutral-line">
                        + {anchoredTable.neutralGames} neutral game
                        {anchoredTable.neutralGames === 1 ? '' : 's'} (your team didn’t play)
                      </div>
                    ) : null}
                  </div>
                )
              ) : neutralTable.length === 0 ? (
                <div className="att-add-empty">No completed games yet.</div>
              ) : (
                // ── Table B: every team you've seen (neutral, W-L-OTL) ──
                <div className="att-teams">
                  {neutralTable.map((t) => (
                    <div className="att-team-row" key={t.abbrev}>
                      <span className="att-team-dot" style={{ background: pickTeamColor(t.abbrev) }} />
                      <span className="att-team-abbr">{t.abbrev}</span>
                      <span className="att-team-name">{t.name}</span>
                      <span className="att-team-rec">
                        {t.w}-{t.l}-{t.otl}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {unresolvedFinals > 0 && !useServerFallback ? (
                <div className="pp-anchor-note pp-anchor-note-soft">
                  {unresolvedFinals} attended final{unresolvedFinals === 1 ? '' : 's'} couldn’t be
                  scored on this device (logged on another device) — not included above.
                </div>
              ) : null}
            </section>

            <section className="att-section">
              <div className="att-section-head">
                <span className="att-section-label">NHL Home Arenas — {viewArenas.homeRinks} / {viewArenas.total}</span>
                <span className="att-section-meta">
                  {viewArenas.homeRinks} of {viewArenas.total} collected
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
    </div>
  );
}
