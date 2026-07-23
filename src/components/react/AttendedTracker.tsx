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

const API = 'https://api.hockeygamebot.com';
const STORAGE_KEY = 'hgb_attended_games';
const BOX_CACHE_KEY = 'hgb_attended_boxcache_v2';

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

/** A single player as seen in one game's box score. */
type BoxPlayer = { id: number; name: string; pos: string; team: string; goals: number };

/** Derived-from-boxscore, cached per (final) game_id — finals are immutable. */
type BoxDerived = { shots: number; players: BoxPlayer[] };

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
        players.push({
          id: p.playerId,
          name: playerName(p),
          pos: p?.position ?? '',
          team: abbrevFor[sideKey],
          goals: typeof p?.goals === 'number' ? p.goals : 0,
        });
        if (typeof p?.sog === 'number') shots += p.sog; // goalies have no sog
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
  const [games, setGames] = useState<AttendedGame[]>([]);
  const [hydrated, setHydrated] = useState(false);

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

  // ── Hydrate from localStorage on mount ──────────────────────────────────────
  useEffect(() => {
    setGames(readAttended());
    boxCacheRef.current = readBoxCache();
    setBoxDerived({ ...boxCacheRef.current });
    setHydrated(true);
    // Default the date picker to today (local).
    const t = new Date();
    setSearchDate(
      `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`,
    );
  }, []);

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
  const addGame = useCallback((raw: RawGame) => {
    setGames((prev) => {
      if (prev.some((g) => g.game_id === raw.game_id)) return prev;
      const next: AttendedGame[] = [
        ...prev,
        {
          game_id: raw.game_id,
          date: raw.date,
          home: raw.home_team,
          away: raw.away_team,
          venue: raw.venue ?? null,
          last_period_type: raw.last_period_type ?? null,
          status: raw.status,
          added_at: new Date().toISOString(),
        },
      ];
      writeAttended(next);
      return next;
    });
  }, []);

  const removeGame = useCallback((gameId: string) => {
    setGames((prev) => {
      const next = prev.filter((g) => g.game_id !== gameId);
      writeAttended(next);
      return next;
    });
  }, []);

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
        align: 'right',
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
        align: 'right',
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
            Use "Add Games" above to log the first game you attended. Your list is saved in this browser.
          </div>
        </div>
      ) : (
        <>
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
