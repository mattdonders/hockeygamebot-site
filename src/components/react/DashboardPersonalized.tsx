/**
 * DashboardPersonalized — self-fetching components for the logged-in stats dashboard.
 *
 *   DashboardTeamCards  — Your Teams section (real stats + playoff odds)
 *   DashboardTrending   — Trending section (tracked players by L7 impact delta)
 *
 * Both fetch prefs + relevant stats on mount. No SSR props needed.
 */

import React, { useState, useEffect } from 'react';

const API = 'https://api.hockeygamebot.com';

const TEAM_COLORS: Record<string, string> = {
  ANA:'#FC4C02', BOS:'#FFB81C', BUF:'#003087', CGY:'#C8102E', CAR:'#CC0000',
  CHI:'#CF0A2C', COL:'#6F263D', CBJ:'#002654', DAL:'#006847', DET:'#CE1126',
  EDM:'#FF4C00', FLA:'#C8102E', LAK:'#A2AAAD', MIN:'#154734', MTL:'#AF1E2D',
  NSH:'#FFB81C', NJD:'#CE1126', NYI:'#F47D30', NYR:'#0038A8', OTT:'#C8102E',
  PHI:'#F74902', PIT:'#FCB514', SJS:'#006D75', SEA:'#99D9D9', STL:'#002F87',
  TBL:'#002868', TOR:'#00205B', UTA:'#6CACE4', VAN:'#00843D', VGK:'#B4975A',
  WSH:'#C8102E', WPG:'#004C97', ARI:'#8C2633',
};

const TEAM_NAMES: Record<string, string> = {
  ANA:'Ducks', BOS:'Bruins', BUF:'Sabres', CGY:'Flames', CAR:'Hurricanes',
  CHI:'Blackhawks', COL:'Avalanche', CBJ:'Blue Jackets', DAL:'Stars', DET:'Red Wings',
  EDM:'Oilers', FLA:'Panthers', LAK:'Kings', MIN:'Wild', MTL:'Canadiens',
  NSH:'Predators', NJD:'Devils', NYI:'Islanders', NYR:'Rangers', OTT:'Senators',
  PHI:'Flyers', PIT:'Penguins', SJS:'Sharks', SEA:'Kraken', STL:'Blues',
  TBL:'Lightning', TOR:'Maple Leafs', UTA:'Utah HC', VAN:'Canucks', VGK:'Golden Knights',
  WSH:'Capitals', WPG:'Jets', ARI:'Coyotes',
};

function tc(a: string) { return TEAM_COLORS[a] ?? '#E8002D'; }
function ordinal(n: number) { return n + (n===1?'st':n===2?'nd':n===3?'rd':'th'); }

function teamLabel(rank: number | null): { text: string; color: string } {
  if (!rank) return { text: '—', color: 'rgba(13,13,20,0.40)' };
  if (rank <= 8)  return { text: 'Contender Profile', color: '#166534' };
  if (rank <= 16) return { text: 'Playoff Fringe',    color: '#92400e' };
  if (rank <= 24) return { text: 'Rebuild Watch',     color: 'rgba(13,13,20,0.40)' };
  return              { text: 'Full Rebuild',         color: 'rgba(13,13,20,0.40)' };
}

async function getToken(): Promise<string | null> {
  try { return localStorage.getItem('hgb_session'); } catch { return null; }
}

async function fetchPrefs(): Promise<{ tracked_teams: string[]; tracked_players: number[] }> {
  const token = await getToken();
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  const r = await fetch(`${API}/v1/account/prefs`, { headers, credentials: 'include' });
  return r.ok ? r.json() : { tracked_teams: [], tracked_players: [] };
}

// ── Team Cards ────────────────────────────────────────────────────────────────

interface TeamCardData {
  abbrev: string;
  name: string;
  record: string;
  xgf: string;
  gf: string;
  rank: number | null;
  label: { text: string; color: string };
  color: string;
  isActive: boolean;
  odds: number | null;
}

async function fetchTeamCardData(teams: string[]): Promise<TeamCardData[]> {
  const [teamsRes, playoffRes] = await Promise.all([
    fetch(`${API}/v1/stats/teams`),
    fetch(`${API}/v1/playoffs/status`),
  ]);
  const teamsData: any = teamsRes.ok ? await teamsRes.json() : {};
  const playoff: any = playoffRes.ok ? await playoffRes.json() : {};

  const regular: any[] = teamsData.regular ?? [];
  const current = regular.filter(t => t.season === '2025-26');
  const sorted = [...current].sort((a, b) => b.xgf_pct_5v5 - a.xgf_pct_5v5);
  const activeTeams: string[] = playoff.active_teams ?? ['VGK', 'CAR'];
  const odds: Record<string, number> = playoff.playoff_odds ?? {};

  return teams.map(abbrev => {
    const s = current.find(t => t.team_abbrev === abbrev);
    const rank = s ? sorted.findIndex(t => t.team_abbrev === abbrev) + 1 : null;
    return {
      abbrev,
      name: `${abbrev} ${TEAM_NAMES[abbrev] ?? ''}`,
      record: s ? `${s.wins}-${s.losses}-${s.ot_losses}` : '—',
      xgf: s ? `${(s.xgf_pct_5v5 * 100).toFixed(1)}%` : '—',
      gf:  s ? `${(s.gf_pct_5v5  * 100).toFixed(1)}%` : '—',
      rank,
      label: teamLabel(rank),
      color: tc(abbrev),
      isActive: activeTeams.includes(abbrev),
      odds: odds[abbrev] != null ? Math.round(odds[abbrev] * 100) : null,
    };
  });
}

export function DashboardTeamCards() {
  const [cards, setCards] = useState<TeamCardData[] | null>(null);

  useEffect(() => {
    fetchPrefs()
      .then(prefs => fetchTeamCardData(prefs.tracked_teams))
      .then(setCards)
      .catch(() => setCards([]));
  }, []);

  if (cards === null) {
    return <div style={{ padding: '12px 0', color: 'rgba(13,13,20,0.32)', fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '0.06em' }}>Loading…</div>;
  }
  if (!cards.length) {
    return <div style={{ color: 'rgba(13,13,20,0.48)', fontSize: 13, padding: '12px 0' }}>No teams followed. <a href="/account">Add teams →</a></div>;
  }

  return (
    <div className="team-cards">
      {cards.map(c => (
        <div key={c.abbrev} className="team-card" data-color style={{ '--team-color': c.color } as React.CSSProperties}>
          {c.isActive && c.odds != null
            ? <span className={`odds-badge ${c.odds > 50 ? 'high' : 'low'}`}>PO: {c.odds}%</span>
            : <span className="odds-badge eliminated">ELIM</span>
          }
          <div className="team-editorial-label" style={{ color: c.label.color, marginBottom: 8 }}>{c.label.text}</div>
          <div className="team-card-head">
            <img src={`https://assets.nhle.com/logos/nhl/svg/${c.abbrev}_light.svg`} alt={c.abbrev} className="team-logo" style={{ width: 52, height: 52 }} />
            <div>
              <div className="team-abbrev">{c.name}</div>
              <div className="team-record">{c.record}</div>
            </div>
          </div>
          <div className="team-card-stats">
            <div className="team-stat"><div className="team-stat-k">xGF% 5v5</div><div className="team-stat-v">{c.xgf}</div></div>
            <div className="team-stat"><div className="team-stat-k">GF%</div><div className="team-stat-v">{c.gf}</div></div>
            <div className="team-stat"><div className="team-stat-k">Impact Rank</div><div className="team-stat-v">{c.rank ? ordinal(c.rank) : '—'}</div></div>
          </div>
          <div className="team-card-links">
            <a href={`/teams/${c.abbrev.toLowerCase()}`} className="team-card-link">Team Page</a>
            <a href="/stats/skaters" className="team-card-link">Players</a>
            <a href="/stats/lines" className="team-card-link">Lines</a>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Trending ──────────────────────────────────────────────────────────────────

interface TrendRow {
  name: string;
  slug: string;
  team: string;
  delta: string;
  dir: 'up' | 'down';
}

async function fetchTrendingData(playerIds: number[]): Promise<TrendRow[]> {
  if (!playerIds.length) return [];
  const r = await fetch(`${API}/v1/stats/players`);
  if (!r.ok) return [];
  const raw = await r.json();
  const all: any[] = Array.isArray(raw) ? raw : (raw.players ?? []);

  const idSet = new Set(playerIds);
  const tracked = all.filter(p => idSet.has(p.player_id));

  return tracked
    .map(p => {
      const delta = (p.l7_avg ?? 0) - (p.avg_gs_centered ?? 0);
      return {
        name:  `${p.first_name} ${p.last_name}`,
        slug:  p.slug ?? '',
        team:  p.team_abbrev ?? '',
        delta: (delta >= 0 ? '+' : '') + delta.toFixed(2),
        dir:   delta >= 0 ? 'up' as const : 'down' as const,
        _abs:  Math.abs(delta),
      };
    })
    .sort((a, b) => (b as any)._abs - (a as any)._abs)
    .slice(0, 5)
    .map(({ _abs, ...rest }: any) => rest);
}

export function DashboardTrending() {
  const [rows, setRows] = useState<TrendRow[] | null>(null);

  useEffect(() => {
    fetchPrefs()
      .then(prefs => fetchTrendingData(prefs.tracked_players))
      .then(setRows)
      .catch(() => setRows([]));
  }, []);

  if (rows === null) {
    return <div className="trending-card" style={{ padding: '16px 14px', color: 'rgba(13,13,20,0.32)', fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '0.06em' }}>Loading…</div>;
  }
  if (!rows.length) {
    return <div className="trending-card" style={{ padding: '16px 14px', color: 'rgba(13,13,20,0.48)', fontSize: 13 }}>No players followed. <a href="/account">Add players →</a></div>;
  }

  return (
    <div className="trending-card">
      {rows.map((t, i) => (
        <a key={i} href={`/stats/player/${t.slug}`} className="trending-item" style={{ display: 'flex', alignItems: 'center' }}>
          <img src={`https://assets.nhle.com/logos/nhl/svg/${t.team}_light.svg`} alt={t.team} style={{ width: 28, height: 28, objectFit: 'contain', flexShrink: 0, marginRight: 6 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="trend-name">{t.name}</div>
            <div className="trend-label" style={{ color: 'rgba(13,13,20,0.40)' }}>{t.team} · {t.pos ?? ''}</div>
          </div>
          <div className={`trend-delta ${t.dir === 'up' ? 'delta-up' : 'delta-down'}`}>
            {t.dir === 'up' ? '↑' : '↓'} {t.delta}
          </div>
        </a>
      ))}
    </div>
  );
}
