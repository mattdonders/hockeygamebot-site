/**
 * DashboardPersonalized — self-fetching components for the logged-in stats dashboard.
 *
 *   DashboardTeamCards    — Your Teams section (real stats + playoff odds)
 *   DashboardTrending     — Trending section (tracked players by L7 impact delta)
 *   DashboardModelSignals — Model Signals section (real rule-based signals from pipeline)
 *
 * All fetch prefs + relevant stats on mount. No SSR props needed.
 */

import React, { useState, useEffect } from 'react';
import { getPrefs } from '../../lib/auth-client';

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
  ANA:'Anaheim Ducks', BOS:'Boston Bruins', BUF:'Buffalo Sabres', CGY:'Calgary Flames', CAR:'Carolina Hurricanes',
  CHI:'Chicago Blackhawks', COL:'Colorado Avalanche', CBJ:'Columbus Blue Jackets', DAL:'Dallas Stars', DET:'Detroit Red Wings',
  EDM:'Edmonton Oilers', FLA:'Florida Panthers', LAK:'Los Angeles Kings', MIN:'Minnesota Wild', MTL:'Montréal Canadiens',
  NSH:'Nashville Predators', NJD:'New Jersey Devils', NYI:'New York Islanders', NYR:'New York Rangers', OTT:'Ottawa Senators',
  PHI:'Philadelphia Flyers', PIT:'Pittsburgh Penguins', SJS:'San Jose Sharks', SEA:'Seattle Kraken', STL:'St. Louis Blues',
  TBL:'Tampa Bay Lightning', TOR:'Toronto Maple Leafs', UTA:'Utah Hockey Club', VAN:'Vancouver Canucks', VGK:'Vegas Golden Knights',
  WSH:'Washington Capitals', WPG:'Winnipeg Jets', ARI:'Arizona Coyotes',
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

export async function fetchPrefs(): Promise<{ tracked_teams: string[]; tracked_players: number[] }> {
  const prefs = await getPrefs();
  return {
    tracked_teams: prefs?.tracked_teams ?? [],
    tracked_players: prefs?.tracked_players ?? [],
  };
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
  if (!teams.length) return [];
  const safe = (p: Promise<Response>) => p.then(r => r.ok ? r.json() : {}).catch(() => ({}));
  const [teamsData, playoff]: [any, any] = await Promise.all([
    safe(fetch(`${API}/v1/stats/teams`)),
    safe(fetch(`${API}/v1/playoffs/status`)),
  ]);

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
      name: TEAM_NAMES[abbrev] ?? abbrev,
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
  pos: string;
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
        pos:   p.pos ?? '',
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

// ── Entity Signals (player page / team page) ──────────────────────────────────

interface EntitySignalsProps {
  entityId: string;   // player_id as string OR team abbrev
  entityType: 'player' | 'team';
  limit?: number;
}

export function EntitySignals({ entityId, entityType, limit = 3 }: EntitySignalsProps) {
  const [signals, setSignals] = useState<Signal[] | null>(null);

  useEffect(() => {
    loadAllSignals().then(all => {
      const filtered = all
        .filter(s => s.entity_type === entityType && s.entity_id === entityId)
        .sort((a, b) => b.priority - a.priority)
        .slice(0, limit);
      setSignals(filtered);
    });
  }, [entityId, entityType, limit]);

  if (signals === null || !signals.length) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
      {signals.map((s, i) => (
        <div key={i} style={{
          background: 'var(--surface, #fff)',
          border: '1px solid rgba(13,13,20,0.10)',
          borderLeft: `3px solid ${SEVERITY_BORDER[s.severity] ?? '#C8102E'}`,
          padding: '10px 14px',
        }}>
          <div style={{ fontFamily: 'var(--mono, monospace)', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(13,13,20,0.48)', marginBottom: 6 }}>
            {s.category}
          </div>
          <div style={{ fontFamily: 'var(--body, sans-serif)', fontWeight: 700, fontSize: 13.5, lineHeight: 1.55, color: 'rgba(13,13,20,0.80)' }}>
            {s.copy}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Model Signals (dashboard) ─────────────────────────────────────────────────

export interface Signal {
  entity_type: string;
  entity_id: string;
  rule_id: string;
  category: string;
  severity: string;
  priority: number;
  copy: string;
  cta_href: string | null;
}

export const SEVERITY_BORDER: Record<string, string> = {
  positive: '#166534',
  warning:  '#991b1b',
  negative: '#991b1b',
};

// Shared signals fetch — memoized so every consumer (each EntitySignals instance
// + DashboardModelSignals + CommandCenterSignals) reuses a single network request
// for the payload.
let _signalsPromise: Promise<Signal[]> | null = null;
export function loadAllSignals(): Promise<Signal[]> {
  if (!_signalsPromise) {
    _signalsPromise = fetch(`${API}/v1/stats/signals`)
      .then(r => (r.ok ? r.json() : {}))
      .catch(() => ({}))
      .then((data: any) => (data.signals ?? (Array.isArray(data) ? data : [])) as Signal[]);
  }
  return _signalsPromise;
}

export function formatRuleHeader(s: Signal): string {
  const type = s.entity_type === 'team' ? 'TEAM' : s.entity_type === 'player' ? 'PLAYER' : s.entity_type.toUpperCase();
  return `${type} SIGNAL · ${s.category.toUpperCase()}`;
}

// Team/player relevance filter, shared by fetchSignals (below, deduped+capped
// for display) and any consumer needing the true relevant count before that
// cap — e.g. CommandCenterSignals' "N of M" total.
export function filterRelevantSignals(all: Signal[], prefs: { tracked_teams: string[]; tracked_players: number[] }): Signal[] {
  const teamSet = new Set(prefs.tracked_teams);
  const playerSet = new Set(prefs.tracked_players.map(String));

  return all
    // Milestones included per owner decision 2026-07-22 (matches iOS) — the
    // per-category dedupe in fetchSignals keeps them from dominating the top 3.
    .filter(s => s.entity_type === 'team' ? teamSet.has(s.entity_id) : playerSet.has(s.entity_id))
    .sort((a, b) => b.priority - a.priority);
}

export async function fetchSignals(prefs: { tracked_teams: string[]; tracked_players: number[] }): Promise<Signal[]> {
  const all = await loadAllSignals();
  const relevant = filterRelevantSignals(all, prefs);

  // Max 1 signal per category for variety
  const seen = new Set<string>();
  const deduped: Signal[] = [];
  for (const s of relevant) {
    if (!seen.has(s.category)) { seen.add(s.category); deduped.push(s); }
    if (deduped.length >= 5) break;
  }
  return deduped;
}

export function DashboardModelSignals() {
  const [signals, setSignals] = useState<Signal[] | null>(null);

  useEffect(() => {
    fetchPrefs()
      .then(fetchSignals)
      .then(setSignals)
      .catch(() => setSignals([]));
  }, []);

  if (signals === null) {
    return <div style={{ padding: '12px 0', color: 'rgba(13,13,20,0.32)', fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '0.06em' }}>Loading…</div>;
  }
  if (!signals.length) {
    return <div style={{ color: 'rgba(13,13,20,0.48)', fontSize: 13, padding: '12px 0' }}>No signals for your followed teams and players.</div>;
  }

  return (
    <div className="model-notes">
      {signals.map((s, i) => (
        <a key={i} href={s.cta_href ?? '#'} className="model-note" style={{ display: 'block', borderLeftColor: SEVERITY_BORDER[s.severity] ?? 'var(--red)' }}>
          <div className="note-rule">{formatRuleHeader(s)}</div>
          <div className="note-body">{s.copy}</div>
        </a>
      ))}
    </div>
  );
}
