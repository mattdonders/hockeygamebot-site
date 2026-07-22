/**
 * CommandCenter — Concept C ("Minimal Cockpit") sections for /stats.
 *
 *   CommandCenterTonight — TONIGHT strip: followed-team games (personal) or
 *                           the top of the real slate (public), win probability +
 *                           live/final state. Renders an honest idle line when
 *                           there is nothing to show — never fabricated games.
 *   CommandCenterPlayers — dense 5-row player table (P / WAR% / IMP%).
 *   CommandCenterSignals — top 3 model signals + "N of M" count.
 *
 * All personal variants self-fetch prefs + live data on mount — no build-time
 * fetch for anything personalized or time-sensitive (kills the double-fetch
 * staleness bug the previous /stats page had for draft-picks + playoffs/status).
 */

import React, { useState, useEffect } from 'react';
import { fetchPrefs, loadAllSignals, fetchSignals, formatRuleHeader, SEVERITY_BORDER, type Signal } from './DashboardPersonalized';
import type { TopImpactRow } from './DashboardPlayersTable';

const API = 'https://api.hockeygamebot.com';

// ── Tonight ───────────────────────────────────────────────────────────────────

type TonightGame = {
  gameId: string;
  away: string;
  home: string;
  startTimeUTC: string | null;
  awayWp: number | null;
  homeWp: number | null;
  state: 'pre' | 'live' | 'final';
  awayScore: number | null;
  homeScore: number | null;
};

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function safeJson(p: Promise<Response>): Promise<any> {
  return p.then(r => (r.ok ? r.json() : null)).catch(() => null);
}

async function fetchTonightSlate(): Promise<TonightGame[]> {
  const date = todayISO();
  const [predRes, gamesRes]: [any, any] = await Promise.all([
    safeJson(fetch(`${API}/v1/predictions?date=${date}`)),
    safeJson(fetch(`${API}/v1/games/today?date=${date}`)),
  ]);

  const liveGames: any[] = gamesRes?.games ?? [];
  const liveByAbbr = new Map<string, any>();
  for (const g of liveGames) {
    const h = g.homeTeam?.abbrev, a = g.awayTeam?.abbrev;
    if (h) liveByAbbr.set(h, g);
    if (a) liveByAbbr.set(a, g);
  }

  function liveState(g: any): { state: TonightGame['state']; awayScore: number | null; homeScore: number | null } {
    if (!g) return { state: 'pre', awayScore: null, homeScore: null };
    const gs = g.gameState;
    const state: TonightGame['state'] = gs === 'LIVE' || gs === 'CRIT' ? 'live' : gs === 'FINAL' || gs === 'OFF' ? 'final' : 'pre';
    return { state, awayScore: g.awayTeam?.score ?? null, homeScore: g.homeTeam?.score ?? null };
  }

  const predGames: any[] = predRes && predRes.ok !== false ? (predRes.games ?? []) : [];

  if (predGames.length) {
    return predGames.map((p): TonightGame => {
      const live = liveByAbbr.get(p.home) ?? liveByAbbr.get(p.away);
      const ls = liveState(live);
      return {
        gameId: String(p.game_id ?? `${p.away}-${p.home}`),
        away: p.away,
        home: p.home,
        startTimeUTC: p.start_time_utc ?? null,
        awayWp: p.away_win_prob ?? null,
        homeWp: p.home_win_prob ?? null,
        state: ls.state,
        awayScore: ls.awayScore,
        homeScore: ls.homeScore,
      };
    });
  }

  // No predictions published (e.g. offseason) — fall back to the live slate,
  // win probability simply absent rather than fabricated.
  return liveGames.map((g): TonightGame => {
    const ls = liveState(g);
    return {
      gameId: String(g.id ?? `${g.awayTeam?.abbrev}-${g.homeTeam?.abbrev}`),
      away: g.awayTeam?.abbrev ?? '—',
      home: g.homeTeam?.abbrev ?? '—',
      startTimeUTC: g.startTimeUTC ?? null,
      awayWp: null,
      homeWp: null,
      state: ls.state,
      awayScore: ls.awayScore,
      homeScore: ls.homeScore,
    };
  });
}

function fmtTime(utc: string | null): string {
  if (!utc) return '—';
  try {
    return new Date(utc).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  } catch {
    return '—';
  }
}

function TonightPill({ g }: { g: TonightGame }) {
  const isLive = g.state === 'live';
  const isFinal = g.state === 'final';
  const showWp = !isLive && !isFinal && g.awayWp != null && g.homeWp != null;
  return (
    <a href={`/teams/${g.home.toLowerCase()}`} className="cc-pill">
      <div className="cc-pill-matchup">{g.away} @ {g.home}</div>
      {isLive && (
        <div className="cc-pill-meta"><span className="cc-live-dot" /> {g.awayScore ?? 0}–{g.homeScore ?? 0}</div>
      )}
      {isFinal && (
        <div className="cc-pill-meta">FINAL {g.awayScore ?? 0}–{g.homeScore ?? 0}</div>
      )}
      {!isLive && !isFinal && (
        <div className="cc-pill-meta">{fmtTime(g.startTimeUTC)}{showWp ? ` · ${g.home} ${Math.round((g.homeWp ?? 0) * 100)}%` : ''}</div>
      )}
      {showWp && (
        <div className="cc-pill-bar">
          <div style={{ width: `${Math.round((g.awayWp ?? 0) * 100)}%`, background: 'var(--ink-32)' }} />
          <div style={{ flex: 1, background: 'var(--red)' }} />
        </div>
      )}
    </a>
  );
}

export function CommandCenterTonight({ mode }: { mode: 'personal' | 'public' }) {
  const [games, setGames] = useState<TonightGame[] | null>(null);
  const [teams, setTeams] = useState<string[]>([]);

  useEffect(() => {
    const slate = fetchTonightSlate();
    if (mode === 'personal') {
      Promise.all([fetchPrefs(), slate]).then(([prefs, g]) => {
        setTeams(prefs.tracked_teams);
        setGames(g);
      }).catch(() => setGames([]));
    } else {
      slate.then(setGames).catch(() => setGames([]));
    }
  }, [mode]);

  if (games === null) {
    return <div className="cc-idle">Loading tonight's games…</div>;
  }

  const shown = mode === 'personal'
    ? games.filter(g => teams.includes(g.away) || teams.includes(g.home)).slice(0, 2)
    : games.slice(0, 3);

  if (!shown.length) {
    const label = mode === 'personal'
      ? (teams.length ? 'No games tonight for your teams.' : <>No teams followed. <a href="/account">Add teams →</a></>)
      : 'No games tonight.';
    return <div className="cc-idle">{label}</div>;
  }

  return (
    <div className="cc-rail">
      {shown.map(g => <TonightPill key={g.gameId} g={g} />)}
    </div>
  );
}

// ── Players ───────────────────────────────────────────────────────────────────

type DenseRow = { name: string; slug: string; team: string; p: number; warP: number | null; impP: number | null };

function computeWarPct(all: any[], player: any): number | null {
  const grp = player.pos_group;
  const peers = all.filter(p => p.pos_group === grp && p.war != null).sort((a, b) => a.war - b.war);
  const idx = peers.findIndex(p => p.player_id === player.player_id);
  if (idx < 0 || peers.length < 2) return null;
  return Math.round((idx / (peers.length - 1)) * 100);
}

async function fetchTrackedPlayerRows(): Promise<DenseRow[]> {
  const [prefs, playersRes] = await Promise.all([fetchPrefs(), fetch(`${API}/v1/stats/players`)]);
  const raw = playersRes.ok ? await playersRes.json() : [];
  const all: any[] = Array.isArray(raw) ? raw : (raw.players ?? []);
  const trackedIds = new Set(prefs.tracked_players);
  const tracked = all.filter(p => trackedIds.has(p.player_id));
  return tracked
    .map((p): DenseRow => ({
      name: `${p.first_name} ${p.last_name}`,
      slug: p.slug ?? '',
      team: p.team_abbrev ?? '',
      p: (p.goals ?? 0) + (p.assists ?? 0),
      warP: computeWarPct(all, p),
      impP: p.gs_pct != null ? Math.round(p.gs_pct) : null,
    }))
    .sort((a, b) => (b.impP ?? -1) - (a.impP ?? -1))
    .slice(0, 5);
}

function pctColor(v: number | null): string {
  if (v == null) return 'var(--ink-32)';
  if (v >= 75) return 'var(--stats-pos)';
  if (v <= 35) return 'var(--stats-neg)';
  return 'var(--ink-72)';
}

function DenseTable({ rows }: { rows: DenseRow[] }) {
  if (!rows.length) {
    return <div className="cc-idle">No players followed. <a href="/account">Add players →</a></div>;
  }
  return (
    <div className="cc-ptable-wrap">
      <table className="cc-ptable">
        <thead>
          <tr><th>Player</th><th>P</th><th>WAR%</th><th>IMP%</th></tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.slug || r.name} onClick={() => { if (r.slug) window.location.href = `/stats/player/${r.slug}`; }}>
              <td className="cc-name-cell">
                <a href={r.slug ? `/stats/player/${r.slug}` : '#'}>{r.name}<span className="cc-tm">{r.team}</span></a>
              </td>
              <td>{r.p}</td>
              <td style={{ color: pctColor(r.warP) }}>{r.warP ?? '—'}</td>
              <td style={{ color: pctColor(r.impP), fontWeight: 700 }}>{r.impP ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CommandCenterPlayers() {
  const [rows, setRows] = useState<DenseRow[] | null>(null);
  useEffect(() => { fetchTrackedPlayerRows().then(setRows).catch(() => setRows([])); }, []);
  if (rows === null) return <div className="cc-idle">Loading…</div>;
  return <DenseTable rows={rows} />;
}

export function CommandCenterTopImpact({ players }: { players: TopImpactRow[] }) {
  const rows: DenseRow[] = players.slice(0, 5).map(p => ({
    name: p.display_name, slug: p.slug, team: p.team_abbrev, p: p.gp, warP: null, impP: Math.round(p.value * 10),
  }));
  // Public leaderboard has no WAR%/GP-percentile context — swap the header meaning
  // via a dedicated column set instead of reusing the tracked-player table verbatim.
  if (!rows.length) return <div className="cc-idle">No leaderboard data.</div>;
  return (
    <div className="cc-ptable-wrap">
      <table className="cc-ptable">
        <thead><tr><th>Player</th><th>GP</th><th>Impact</th></tr></thead>
        <tbody>
          {players.slice(0, 5).map(p => (
            <tr key={p.slug} onClick={() => { window.location.href = `/stats/player/${p.slug}`; }}>
              <td className="cc-name-cell"><a href={`/stats/player/${p.slug}`}>{p.display_name}<span className="cc-tm">{p.team_abbrev}</span></a></td>
              <td>{p.gp}</td>
              <td style={{ fontWeight: 700 }}>{p.value >= 0 ? '+' : ''}{p.value.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Signals ───────────────────────────────────────────────────────────────────

export function CommandCenterSignals() {
  const [signals, setSignals] = useState<Signal[] | null>(null);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    fetchPrefs().then(async prefs => {
      const relevant = await fetchSignals(prefs);
      setTotal(relevant.length);
      setSignals(relevant.slice(0, 3));
    }).catch(() => setSignals([]));
  }, []);

  if (signals === null) return <div className="cc-idle">Loading…</div>;
  if (!signals.length) return <div className="cc-idle">No signals for your followed teams and players.</div>;

  return (
    <>
      <div className="cc-signal-stack">
        {signals.map((s, i) => (
          <a key={i} href={s.cta_href ?? '#'} className="cc-signal" style={{ borderLeftColor: SEVERITY_BORDER[s.severity] ?? 'var(--red)' }}>
            <div className="cc-signal-cat">{formatRuleHeader(s)}</div>
            <div className="cc-signal-body">{s.copy}</div>
          </a>
        ))}
      </div>
      {total > signals.length && (
        <div className="cc-signal-count">{signals.length} of {total}</div>
      )}
    </>
  );
}

export function CommandCenterSignalsPreview() {
  return (
    <div className="cc-signal-stack">
      <div className="cc-signal cc-signal--locked">
        <div className="cc-signal-cat">Player Signal · Shot Creation</div>
        <div className="cc-signal-body">Sign in to see model signals for your followed players and teams.</div>
      </div>
    </div>
  );
}

// Re-export the memoized loader so the count-of-relevant computation shares
// the single in-flight signals request with DashboardModelSignals if both
// happen to mount in the same session.
export { loadAllSignals };
