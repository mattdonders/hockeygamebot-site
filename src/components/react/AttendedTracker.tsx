/**
 * AttendedTracker — "Games I've Attended" tracker, Phase 0 (stateless).
 *
 * Everything the user "owns" (which games they attended) lives in localStorage
 * under `hgb_attended_games`. There is NO auth and NO server write in Phase 0;
 * this mirrors the logged-out filter-presets pattern (auth-client.ts
 * `mergeLocalPresets`) so a future Phase 1 can merge the local set into D1 on
 * login without a rewrite.
 *
 * Everything else on the page is DERIVED from public data:
 *   - Game lookup / add flow  →  GET /v1/games/today?date=YYYY-MM-DD
 *   - Per-game player stats    →  GET /v1/games/{id}/boxscore  (NHL API proxy)
 *   - Players seen (games-seen + goals) → derived from the same box scores
 *
 * House rule — FAIL LOUD: box-score / stats fetch failures are surfaced in an
 * honest banner and per-counter warning markers, never silently shown as 0.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import HGBTable, { type HGBColumnDef, NAME_FONT_SIZE, CELL_FONT_SIZE } from './HGBTable';
import { pickTeamColor } from '../../lib/team-colors';
import { getMe, getSessionToken, apiFetch } from '../../lib/auth-client';
import {
  computeEarnedBadges,
  computeRecords,
  type BadgeBox,
  type EarnedBadge,
  type GameRecord,
} from './puck-passport-badges';

const API = 'https://api.hockeygamebot.com';
const STORAGE_KEY = 'hgb_puck_passport_games';
// v3: box cache now carries per-player assists/points/pim/sog (needed for the
// moment badges + player records). Bumping the key forces a clean re-derive so
// no badge under-fires off a v2 entry missing the new fields (FAIL LOUD).
const BOX_CACHE_KEY = 'hgb_puck_passport_boxcache_v3';
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

/** Derived-from-boxscore, cached per (final) game_id — finals are immutable. */
type BoxDerived = { shots: number; players: BoxPlayer[] };

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
};

/** team_id → abbrev/name, from GET /v1/config. */
type TeamInfo = { abbrev: string; name: string };

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
    venue: snap?.venue ?? null,
    last_period_type: snap?.last_period_type ?? null,
    status: isFinal ? 'final' : snap?.status ?? 'scheduled',
    added_at: r.created_at ?? snap?.added_at ?? '',
  };
}

// ── Small derivations ───────────────────────────────────────────────────────────

/** Periods witnessed: 3 regulation + 1 if the game reached OT or a shootout.
 *  (Playoff multi-OT undercounts here — acceptable for a Phase-0 counter.) */
function periodsFor(g: AttendedGame): number {
  const pt = (g.last_period_type ?? '').toUpperCase();
  return 3 + (pt === 'OT' || pt === 'SO' ? 1 : 0);
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
  return { shots, players };
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

  // Add-games flow
  const [searchDate, setSearchDate] = useState<string>('');
  const [searchResults, setSearchResults] = useState<RawGame[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [matchupFilter, setMatchupFilter] = useState('');

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
  useEffect(() => {
    if (!hydrated || games.length === 0) return;
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
  }, [games, hydrated]);

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
          };
          return [row, ...rows];
        });
        postAttended(raw.game_id).then((ok) => {
          if (ok) setWriteError(null);
          else {
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
    [isLoggedIn, commitDetail],
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
    [isLoggedIn],
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
      const list: RawGame[] = (data.games ?? []).map((g: any) => ({
        game_id: g.game_id,
        date: g.date,
        home_team: g.home_team,
        away_team: g.away_team,
        venue: g.venue ?? null,
        last_period_type: g.last_period_type ?? null,
        status: g.status,
      }));
      setSearchResults(list);
    } catch (err) {
      setSearchError('Could not load games for that date. Please try again.');
    } finally {
      setSearchLoading(false);
    }
  }, [searchDate]);

  // ── Derived aggregates ───────────────────────────────────────────────────────
  const finalGames = useMemo(() => games.filter((g) => g.status === 'final'), [games]);

  const totals = useMemo(() => {
    let goals = 0;
    let periods = 0;
    for (const g of games) {
      goals += (g.home.score ?? 0) + (g.away.score ?? 0);
      periods += periodsFor(g);
    }
    // Shots + distinct players from whatever box scores we have.
    let shots = 0;
    const seen = new Set<number>();
    let missingBox = false;
    for (const g of games) {
      const d = boxDerived[g.game_id];
      if (!d) {
        missingBox = true;
        continue;
      }
      shots += d.shots;
      for (const p of d.players) seen.add(p.id);
    }
    return { goals, periods, shots, playersSeen: seen.size, seen, missingBox };
  }, [games, boxDerived]);

  const boxIncomplete = boxErrors.length > 0;

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

  // ── Badges (§2b) + single-game records (§2c) ────────────────────────────────
  // All computed from data already in memory: game_results facts,
  // last_period_type, game_id digits, and the cached box scores. Moment badges
  // that need a box simply don't fire for un-hydrated games (FAIL-LOUD, not a
  // silent 0). `boxDerived` (shots + players[]) is structurally a BadgeBox.
  const earnedBadges = useMemo<EarnedBadge[]>(
    () => computeEarnedBadges(games, boxDerived as Record<string, BadgeBox | undefined>),
    [games, boxDerived],
  );

  const records = useMemo<GameRecord[]>(
    () => computeRecords(games, boxDerived as Record<string, BadgeBox | undefined>),
    [games, boxDerived],
  );

  // Arenas-Visited N/32 is a collection badge (distinct known venues), computed
  // separately from the per-game predicates. Only games with a known venue count.
  const arenaBadge = useMemo(
    () => ({ visited: arenas.list.length, total: 32 }),
    [arenas.list.length],
  );

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
        cell: (_, r) => (
          <span style={{ fontFamily: 'var(--mono)', fontSize: CELL_FONT_SIZE, fontWeight: 700 }}>
            {r.away.score}–{r.home.score}
            {r.last_period_type && r.last_period_type.toUpperCase() !== 'REG' ? (
              <span style={{ marginLeft: 5, color: 'var(--red)', fontSize: 10, fontWeight: 700 }}>
                {r.last_period_type.toUpperCase()}
              </span>
            ) : null}
          </span>
        ),
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
      {boxIncomplete ? (
        <div className="att-banner att-banner-warn">
          Couldn't load box scores for {boxErrors.length} game{boxErrors.length === 1 ? '' : 's'} — Shots and Players
          Seen may be incomplete. Reload to retry.
        </div>
      ) : null}

      {/* Counter row */}
      <div className="att-counters">
        <Counter label="Games" value={games.length} />
        <Counter label="Periods" value={totals.periods} />
        <Counter label="Goals" value={totals.goals} />
        <Counter label="Shots" value={totals.shots} pending={boxLoading && totals.missingBox} warn={boxIncomplete} />
        <Counter
          label="Players Seen"
          value={totals.playersSeen}
          pending={boxLoading && totals.missingBox}
          warn={boxIncomplete}
        />
      </div>

      {/* Add games */}
      <section className="att-section">
        <div className="att-section-head">
          <span className="att-section-label">Add Games</span>
          <span className="att-section-meta">Pick a date, then mark the games you were at.</span>
        </div>
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
          {/* Badges — earned across the attended set (§2b) */}
          <section className="att-section">
            <div className="att-section-head">
              <span className="att-section-label">Badges</span>
              <span className="att-section-meta">
                {earnedBadges.length + (arenaBadge.visited > 0 ? 1 : 0)} earned
                {boxLoading && totals.missingBox ? ' · scanning box scores…' : ''}
              </span>
            </div>
            <div className="att-badges">
              {/* Arenas-visited collection badge (distinct known venues / 32) */}
              {arenaBadge.visited > 0 ? (
                <div className="att-badge att-badge-collection" data-family="collection">
                  <div className="att-badge-top">
                    <span className="att-badge-label">Arenas Visited</span>
                    <span className="att-badge-count">
                      {arenaBadge.visited}/{arenaBadge.total}
                    </span>
                  </div>
                  <span className="att-badge-rarity">distinct arenas · collection</span>
                </div>
              ) : null}

              {earnedBadges.map((b) => (
                <div className="att-badge" data-family={b.def.family} key={b.def.id}>
                  <div className="att-badge-top">
                    <span className="att-badge-label">{b.def.label}</span>
                    <span className="att-badge-count">×{b.count}</span>
                  </div>
                  <span className="att-badge-rarity">
                    {b.rarity ? `${b.rarity} games` : b.def.rarityHint}
                    <span className="att-badge-family"> · {b.def.family === 'game-type' ? 'type' : 'moment'}</span>
                  </span>
                  {b.def.note ? <span className="att-badge-note">{b.def.note}</span> : null}
                </div>
              ))}

              {earnedBadges.length === 0 && arenaBadge.visited === 0 ? (
                <div className="att-add-empty">
                  No badges yet
                  {boxLoading && totals.missingBox ? ' — box scores still loading.' : '.'}
                </div>
              ) : null}
            </div>
          </section>

          {/* Single-game records — extremes across the attended set (§2c) */}
          {records.length > 0 ? (
            <section className="att-section">
              <div className="att-section-head">
                <span className="att-section-label">Single-Game Records</span>
                <span className="att-section-meta">your personal extremes</span>
              </div>
              <div className="att-records">
                {records.map((r) => {
                  // Upgrade box-score "F. Last" → "First Last" for player records
                  // (same nameMap + graceful fallback as the Players Seen table).
                  const name =
                    r.playerId != null ? nameMap?.get(r.playerId) ?? r.playerName : null;
                  const sub = name ? `${name} · ${r.sub}` : r.sub;
                  return (
                    <div className="att-record" key={r.key}>
                      <div className="att-record-label">{r.label}</div>
                      <div className="att-record-value">{r.value}</div>
                      <div className="att-record-sub">{sub}</div>
                    </div>
                  );
                })}
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
              {teamRecords.length === 0 ? (
                <div className="att-add-empty">No completed games yet.</div>
              ) : (
                <div className="att-teams">
                  {teamRecords.map((t) => (
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
                <span className="att-section-meta">{arenas.list.length} known</span>
              </div>
              {arenas.list.length === 0 && arenas.unknown === 0 ? (
                <div className="att-add-empty">No games yet.</div>
              ) : (
                <div className="att-arenas">
                  {arenas.list.map((a) => (
                    <div className="att-arena-row" key={a.venue}>
                      <span className="att-arena-name">{a.venue}</span>
                      <span className="att-arena-count">{a.count}</span>
                    </div>
                  ))}
                  {arenas.unknown > 0 ? (
                    <div className="att-arena-row att-arena-unknown">
                      <span className="att-arena-name">Venue unknown</span>
                      <span className="att-arena-count">{arenas.unknown}</span>
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
              <span className="att-section-meta">{seenPlayers.length} logged</span>
            </div>
            {seenPlayers.length === 0 ? (
              <div className="att-add-empty">
                No players yet — box scores may still be loading.
              </div>
            ) : (
              <HGBTable
                data={seenPlayers}
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
