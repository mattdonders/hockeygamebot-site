import React, { useState, useEffect } from 'react';

const API = 'https://api.hockeygamebot.com';
const SESSION_KEY = 'hgb_session';

function getToken(): string | null {
  try { return localStorage.getItem(SESSION_KEY); } catch { return null; }
}

async function apiFetch(url: string, token: string) {
  return fetch(url, {
    credentials: 'include',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type TeamSummary = {
  abbrev: string;
  record: string;
  xgf_pct: number;
  gf_pct: number;
};

export type PlayerStub = {
  player_id: number;
  slug: string;
  name: string;
  team_abbrev: string;
  pos: string;
  gp: number;
  goals: number;
  assists: number;
  points: number;
  impact: number | null;
};

type Signal = {
  rule_id: string;
  category: string;
  severity: 'positive' | 'negative' | 'neutral' | 'warning';
  priority: number;
  headline?: string;
  copy: string;
  cta_href?: string;
  entity_type: 'player' | 'team';
  entity_id: string | number;
};

type Prefs = {
  tracked_teams: string[];
  tracked_players: number[];
};

type LoadState = 'init' | 'loading' | 'loggedout' | 'nofollows' | 'ready';

// ── Helpers ───────────────────────────────────────────────────────────────────

const SEV_COLOR: Record<string, string> = {
  positive: '#166534',
  negative: '#991b1b',
  warning:  '#92400e',
  neutral:  'rgba(13,13,20,0.32)',
};

function TeamCard({ abbrev, summary, teamColors }: {
  abbrev: string;
  summary: TeamSummary | undefined;
  teamColors: Record<string, string>;
}) {
  const color = teamColors[abbrev] ?? '#E8002D';
  const logoSrc = `https://assets.nhle.com/logos/nhl/svg/${abbrev}_dark.svg`;

  return (
    <a href={`/teams/${abbrev.toLowerCase()}`} style={{
      display: 'block',
      background: '#fff',
      border: '1px solid rgba(13,13,20,0.14)',
      borderRadius: 2,
      padding: '16px 18px',
      minWidth: 160,
      position: 'relative',
      overflow: 'hidden',
      textDecoration: 'none',
      color: 'inherit',
      flex: '1 1 150px',
    }}>
      {/* accent bar */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: color }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, marginTop: 4 }}>
        <img src={logoSrc} alt={abbrev} style={{ width: 28, height: 28, objectFit: 'contain', flexShrink: 0 }} />
        <div>
          <div style={{ fontFamily: '"Barlow Condensed", sans-serif', fontWeight: 800, fontSize: 20, letterSpacing: '0.06em', lineHeight: 1 }}>{abbrev}</div>
          {summary && <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: 'rgba(13,13,20,0.4)', letterSpacing: '0.06em', marginTop: 2 }}>{summary.record}</div>}
        </div>
      </div>
      {summary ? (
        <div style={{ display: 'flex', gap: 16 }}>
          <div>
            <div style={{ fontFamily: '"Barlow Condensed", sans-serif', fontWeight: 700, fontSize: 22, lineHeight: 1 }}>{summary.xgf_pct.toFixed(1)}%</div>
            <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: 'rgba(13,13,20,0.4)', letterSpacing: '0.06em', marginTop: 2 }}>xGF% 5v5</div>
          </div>
          <div>
            <div style={{ fontFamily: '"Barlow Condensed", sans-serif', fontWeight: 700, fontSize: 22, lineHeight: 1, color: summary.xgf_pct >= 50 ? '#166534' : '#991b1b' }}>
              {summary.xgf_pct >= 50 ? '↑' : '↓'}
            </div>
            <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: 'rgba(13,13,20,0.4)', letterSpacing: '0.06em', marginTop: 2 }}>Process</div>
          </div>
        </div>
      ) : (
        <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: 'rgba(13,13,20,0.3)' }}>—</div>
      )}
    </a>
  );
}

function PlayerRow({ player }: { player: PlayerStub }) {
  const imp = player.impact;
  const impStr = imp == null ? '—' : (imp >= 0 ? '+' : '') + imp.toFixed(2);
  const impColor = imp == null ? 'rgba(13,13,20,0.32)' : imp >= 0 ? '#166534' : '#991b1b';

  return (
    <a href={`/players/${player.slug}`} style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '10px 14px',
      background: '#fff',
      border: '1px solid rgba(13,13,20,0.14)',
      borderRadius: 2,
      textDecoration: 'none', color: 'inherit',
    }}>
      <img
        src={`https://assets.nhle.com/logos/nhl/svg/${player.team_abbrev}_dark.svg`}
        alt={player.team_abbrev}
        style={{ width: 22, height: 22, objectFit: 'contain', flexShrink: 0, opacity: 0.75 }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: '"Barlow Condensed", sans-serif', fontWeight: 700, fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {player.name}
        </div>
        <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: 'rgba(13,13,20,0.4)', letterSpacing: '0.04em', marginTop: 1 }}>
          {player.team_abbrev} · {player.pos} · {player.gp} GP
        </div>
      </div>
      <div style={{ display: 'flex', gap: 18, alignItems: 'baseline', flexShrink: 0 }}>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: '"Barlow Condensed", sans-serif', fontWeight: 700, fontSize: 16 }}>{player.points}P</div>
          <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: 'rgba(13,13,20,0.4)' }}>{player.goals}G {player.assists}A</div>
        </div>
        <div style={{ textAlign: 'right', minWidth: 36 }}>
          <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 12, fontWeight: 600, color: impColor }}>{impStr}</div>
          <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: 'rgba(13,13,20,0.4)' }}>Impact</div>
        </div>
      </div>
    </a>
  );
}

function SignalCard({ signal }: { signal: Signal }) {
  const accentColor = SEV_COLOR[signal.severity] ?? 'rgba(13,13,20,0.32)';
  const headline = signal.copy.split('.')[0] + '.';

  return (
    <a href={signal.cta_href ?? '#'} style={{
      display: 'block',
      flexShrink: 0,
      width: 220,
      background: '#fff',
      border: '1px solid rgba(13,13,20,0.12)',
      borderRadius: 2,
      padding: '12px 14px',
      position: 'relative',
      overflow: 'hidden',
      textDecoration: 'none',
      color: 'inherit',
    }}>
      <div style={{ position: 'absolute', top: 0, left: 0, width: 3, height: '100%', background: accentColor }} />
      <div style={{
        fontFamily: '"JetBrains Mono", monospace', fontSize: 8, fontWeight: 600,
        letterSpacing: '0.14em', textTransform: 'uppercase',
        color: 'rgba(13,13,20,0.35)', marginBottom: 5, paddingLeft: 8,
      }}>
        {signal.category}
      </div>
      <div style={{
        fontFamily: '"Barlow Condensed", sans-serif', fontWeight: 700, fontSize: 14,
        lineHeight: 1.15, marginBottom: 5, paddingLeft: 8, color: 'rgba(13,13,20,0.9)',
      }}>
        {headline}
      </div>
      <div style={{
        fontFamily: '"Barlow", sans-serif', fontSize: 11, lineHeight: 1.45,
        color: 'rgba(13,13,20,0.55)', paddingLeft: 8,
      }}>
        {signal.copy.slice(headline.length).trim()}
      </div>
    </a>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

type Props = {
  teamStats: Record<string, TeamSummary>;
  players: PlayerStub[];
  teamColors: Record<string, string>;
};

export default function StatsPersonalized({ teamStats, players, teamColors }: Props) {
  const [state, setState] = useState<LoadState>('init');
  const [prefs, setPrefs] = useState<Prefs>({ tracked_teams: [], tracked_players: [] });
  const [signals, setSignals] = useState<Signal[]>([]);
  const [signalsMissing, setSignalsMissing] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token) { setState('loggedout'); return; }

    setState('loading');
    apiFetch(`${API}/v1/account/prefs`, token)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) { setState('loggedout'); return; }
        const teams: string[] = (data.tracked_teams || []).map((t: any) => typeof t === 'string' ? t : t?.abbrev).filter(Boolean);
        const playerIds: number[] = (data.tracked_players || []).map(Number).filter(Boolean);
        setPrefs({ tracked_teams: teams, tracked_players: playerIds });
        if (teams.length === 0 && playerIds.length === 0) { setState('nofollows'); return; }
        setState('ready');
        // Fetch signals (non-blocking, graceful on 404)
        const sigParams = [
          teams.length > 0 ? `teams=${teams.join(',')}` : '',
          playerIds.length > 0 ? `players=${playerIds.join(',')}` : '',
        ].filter(Boolean).join('&');
        fetch(`${API}/v1/stats/signals?${sigParams}`)
          .then(r => r.ok ? r.json() : null)
          .then(d => {
            if (!d || !Array.isArray(d.signals) || d.signals.length === 0) { setSignalsMissing(true); return; }
            setSignals(d.signals.slice(0, 6));
          })
          .catch(() => setSignalsMissing(true));
      })
      .catch(() => setState('loggedout'));
  }, []);

  if (state === 'init' || state === 'loading') {
    return (
      <div style={{ padding: '24px 0 8px', display: 'flex', gap: 10 }}>
        {[180, 160, 200].map(w => (
          <div key={w} style={{ width: w, height: 56, background: 'rgba(13,13,20,0.05)', borderRadius: 2 }} />
        ))}
      </div>
    );
  }

  if (state === 'loggedout') {
    return (
      <div style={{
        margin: '24px 0 8px',
        padding: '18px 24px',
        background: '#fff',
        border: '1px solid rgba(13,13,20,0.14)',
        borderRadius: 2,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 20,
        flexWrap: 'wrap',
      }}>
        <div>
          <div style={{ fontFamily: '"Barlow Condensed", sans-serif', fontWeight: 700, fontSize: 17, marginBottom: 3 }}>
            Personalize your dashboard
          </div>
          <div style={{ fontFamily: '"Barlow", sans-serif', fontSize: 13, color: 'rgba(13,13,20,0.55)', lineHeight: 1.4 }}>
            Sign in to track teams and players — model signals, Impact deltas, and process stats for what you follow.
          </div>
        </div>
        <a href="/account" style={{
          fontFamily: '"JetBrains Mono", monospace', fontSize: 10, fontWeight: 600,
          letterSpacing: '0.14em', textTransform: 'uppercase',
          padding: '9px 20px', background: 'rgba(13,13,20,1)', color: '#EFEEE8',
          textDecoration: 'none', borderRadius: 2, flexShrink: 0, whiteSpace: 'nowrap',
        }}>
          Sign in →
        </a>
      </div>
    );
  }

  if (state === 'nofollows') {
    return (
      <div style={{
        margin: '24px 0 8px', padding: '18px 24px',
        background: '#fff', border: '1px solid rgba(13,13,20,0.14)', borderRadius: 2,
      }}>
        <div style={{ fontFamily: '"Barlow Condensed", sans-serif', fontWeight: 700, fontSize: 17, marginBottom: 3 }}>
          No teams or players followed yet
        </div>
        <div style={{ fontFamily: '"Barlow", sans-serif', fontSize: 13, color: 'rgba(13,13,20,0.55)' }}>
          <a href="/account" style={{ color: '#E8002D' }}>Add them in your account</a> to see personalized signals and stats here.
        </div>
      </div>
    );
  }

  // ── Ready: personalized view ──────────────────────────────────────────────

  const followedPlayerData = prefs.tracked_players
    .map(id => players.find(p => p.player_id === id))
    .filter(Boolean) as PlayerStub[];

  const label = (txt: string) => (
    <div style={{
      fontFamily: '"JetBrains Mono", monospace', fontSize: 9, fontWeight: 600,
      letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(13,13,20,0.35)',
      marginBottom: 10,
    }}>{txt}</div>
  );

  return (
    <div style={{ padding: '24px 0 8px' }}>

      {/* Model Signals */}
      {(signals.length > 0 || signalsMissing) && (
        <div style={{ marginBottom: 28 }}>
          {label('Model Signals')}
          {signals.length > 0 ? (
            <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 }}>
              {signals.map(s => <SignalCard key={s.rule_id} signal={s} />)}
            </div>
          ) : (
            <div style={{
              padding: '12px 16px',
              background: '#fff', border: '1px solid rgba(13,13,20,0.10)',
              fontFamily: '"JetBrains Mono", monospace', fontSize: 10,
              color: 'rgba(13,13,20,0.35)', letterSpacing: '0.06em', borderRadius: 2,
            }}>
              Signal pipeline running — check back tomorrow
            </div>
          )}
        </div>
      )}

      {/* Your Teams */}
      {prefs.tracked_teams.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          {label('Your Teams')}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {prefs.tracked_teams.map(abbrev => (
              <TeamCard key={abbrev} abbrev={abbrev} summary={teamStats[abbrev]} teamColors={teamColors} />
            ))}
          </div>
        </div>
      )}

      {/* Your Players */}
      {followedPlayerData.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          {label('Your Players')}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {followedPlayerData.slice(0, 10).map(p => (
              <PlayerRow key={p.player_id} player={p} />
            ))}
          </div>
          {followedPlayerData.length > 10 && (
            <div style={{ padding: '10px 14px', fontFamily: '"JetBrains Mono", monospace', fontSize: 9, color: 'rgba(13,13,20,0.35)', letterSpacing: '0.08em' }}>
              + {followedPlayerData.length - 10} more — <a href="/account" style={{ color: '#E8002D' }}>manage follows</a>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
