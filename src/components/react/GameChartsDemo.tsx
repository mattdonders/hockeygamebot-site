import React, { useState, useEffect } from 'react';
import WPChart from './WPChart';
import XGChart from './XGChart';

const GAMES = [
  { id: '2025030315', away: 'MTL', home: 'CAR', awayColor: '#AF1E2D', homeColor: '#CC0000', label: 'MTL @ CAR · ECF G5' },
  { id: '2025030311', away: 'MTL', home: 'CAR', awayColor: '#AF1E2D', homeColor: '#CC0000', label: 'MTL @ CAR · ECF G1' },
  { id: '2025030214', away: 'BUF', home: 'MTL', awayColor: '#003087', homeColor: '#AF1E2D', label: 'BUF @ MTL · R2 G7' },
];

type FlowPoint = { t: number; wp: number | null; xg_home: number | null; xg_away: number | null };
type Goal      = { t: number; is_home: boolean; scorer: string | null; score: string };

const API = 'https://api.hockeygamebot.com';
const mono = { fontFamily: 'var(--mono)' } as const;
const disp = { fontFamily: "'Barlow Condensed', sans-serif" } as const;

export default function GameChartsDemo() {
  const [selected, setSelected] = useState(GAMES[0]);
  const [points,   setPoints]   = useState<FlowPoint[]>([]);
  const [goals,    setGoals]    = useState<Goal[]>([]);
  const [score,    setScore]    = useState('');
  const [status,   setStatus]   = useState('');
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setPoints([]); setGoals([]);

    Promise.all([
      fetch(`${API}/v1/games/${selected.id}/flow`).then(r => r.ok ? r.json() : null),
      fetch(`${API}/v1/games/${selected.id}/boxscore`).then(r => r.ok ? r.json() : null),
    ]).then(([flow, box]) => {
      if (cancelled) return;
      if (box) {
        setScore(`${box.awayTeam?.score ?? '?'}–${box.homeTeam?.score ?? '?'}`);
        const st = box.gameState;
        setStatus(st === 'OFF' || st === 'FINAL' ? 'FINAL' : st ?? '');
      }
      if (flow) {
        setPoints(flow.points ?? []);
        setGoals(flow.goals   ?? []);
      }
      setLoading(false);
    }).catch(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [selected.id]);

  return (
    <div>
      {/* Game selector */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        {GAMES.map(g => (
          <button key={g.id} onClick={() => setSelected(g)}
            style={{ ...mono, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '6px 14px', border: '1px solid rgba(13,13,20,0.2)', cursor: 'pointer', background: selected.id === g.id ? '#0d0d14' : 'transparent', color: selected.id === g.id ? '#EFEEE8' : 'rgba(13,13,20,0.48)' }}>
            {g.label}
          </button>
        ))}
      </div>

      {/* Score header */}
      <div style={{ background: '#fff', border: '1px solid rgba(13,13,20,0.14)', padding: '18px 24px', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ ...disp, fontWeight: 800, fontSize: 44, textTransform: 'uppercase', color: selected.awayColor }}>{selected.away}</div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ ...disp, fontWeight: 800, fontSize: 52 }}>{score || '–'}</div>
          <div style={{ ...mono, fontSize: 10, color: 'rgba(13,13,20,0.48)' }}>{status}</div>
        </div>
        <div style={{ ...disp, fontWeight: 800, fontSize: 44, textTransform: 'uppercase', color: selected.homeColor }}>{selected.home}</div>
      </div>

      {/* WP Chart */}
      <div style={{ background: '#fff', border: '1px solid rgba(13,13,20,0.14)', padding: '18px 20px 12px', marginBottom: 12 }}>
        <div style={{ ...mono, fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#E8002D', marginBottom: 12 }}>Win Probability</div>
        {loading
          ? <div style={{ ...mono, fontSize: 11, color: 'rgba(13,13,20,0.32)', padding: '60px 0', textAlign: 'center' }}>Loading…</div>
          : <WPChart points={points} goals={goals} homeColor={selected.homeColor} awayColor={selected.awayColor} homeAbbr={selected.home} awayAbbr={selected.away} height={220} />
        }
      </div>

      {/* xG Chart */}
      <div style={{ background: '#fff', border: '1px solid rgba(13,13,20,0.14)', padding: '18px 20px 12px' }}>
        <div style={{ ...mono, fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#E8002D', marginBottom: 12 }}>5v5 Expected Goals</div>
        {loading
          ? <div style={{ ...mono, fontSize: 11, color: 'rgba(13,13,20,0.32)', padding: '60px 0', textAlign: 'center' }}>Loading…</div>
          : <XGChart points={points} goals={goals} homeColor={selected.homeColor} awayColor={selected.awayColor} homeAbbr={selected.home} awayAbbr={selected.away} height={180} />
        }
      </div>
    </div>
  );
}
