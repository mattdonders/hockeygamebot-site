/**
 * ChartsPOC.tsx — Self-contained demo component for the charts-poc page.
 *
 * Fetches /flow data from the API and renders both chart components.
 * Designed for client:only rendering in the Astro POC page.
 */

import React, { useEffect, useState } from 'react';
import WPChart from './WPChart';
import XGChart from './XGChart';

// Team primary color lookup (same palette as games/index.astro)
const TEAM_COLORS: Record<string, [string, string]> = {
  ANA: ['#F47A38','#B9975B'], ARI: ['#8C2633','#E2D6B5'], BOS: ['#FFB81C','#000000'],
  BUF: ['#003087','#FCB514'], CAR: ['#CC0000','#000000'], CBJ: ['#002654','#CE1126'],
  CGY: ['#C8102E','#F1BE48'], CHI: ['#CF0A2C','#FF671B'], COL: ['#6F263D','#236192'],
  DAL: ['#006847','#8F8F8C'], DET: ['#CE1126','#FFFFFF'], EDM: ['#041E42','#FF4C00'],
  FLA: ['#C8102E','#041E42'], LAK: ['#A2AAAD','#111111'], MIN: ['#154734','#A6192E'],
  MTL: ['#AF1E2D','#192168'], NJD: ['#CE1126','#000000'], NSH: ['#FFB81C','#041E42'],
  NYI: ['#00539B','#F47D30'], NYR: ['#0038A8','#CE1126'], OTT: ['#C52032','#C69214'],
  PHI: ['#F74902','#000000'], PIT: ['#CFC493','#000000'], SEA: ['#001628','#99D9D9'],
  SJS: ['#006D75','#EA7200'], STL: ['#002F87','#FCB514'], TBL: ['#002868','#FFFFFF'],
  TOR: ['#003E7E','#FFFFFF'], UTA: ['#71AFE5','#010101'], VAN: ['#00205B','#00843D'],
  VGK: ['#B4975A','#333F48'], WSH: ['#C8102E','#041E42'], WPG: ['#004C97','#041E42'],
};

function pickColor(abbr: string): string {
  const c = TEAM_COLORS[abbr];
  if (!c) return '#888';
  const hex = c[0].replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return L < 15 ? c[1] : c[0];
}

type FlowPoint = {
  t: number;
  wp: number | null;
  xg_home: number | null;
  xg_away: number | null;
  event_type?: string;
};

type FlowGoal = {
  t: number;
  is_home: boolean;
  scorer: string | null;
  score: string;
  strength?: string;
  overturned?: boolean;
};

type FlowData = {
  points: FlowPoint[];
  goals: FlowGoal[];
  home_abbr?: string;
  away_abbr?: string;
};

type Status = 'loading' | 'error' | 'ready';

const GAME_ID = '2025030315';
const FLOW_URL = `https://api.hockeygamebot.com/v1/games/${GAME_ID}/flow`;

const mono: React.CSSProperties = { fontFamily: 'var(--mono)' };

export default function ChartsPOC() {
  const [status, setStatus] = useState<Status>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [flow, setFlow] = useState<FlowData | null>(null);

  useEffect(() => {
    fetch(FLOW_URL, { cache: 'no-store' })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((data: FlowData) => { setFlow(data); setStatus('ready'); })
      .catch((e: unknown) => { setErrorMsg(String(e)); setStatus('error'); });
  }, []);

  if (status === 'loading') {
    return (
      <div style={{ textAlign: 'center', padding: '64px 32px', ...mono, fontSize: 12, color: 'rgba(13,13,20,0.48)', letterSpacing: '0.10em', textTransform: 'uppercase' }}>
        Loading flow data…
      </div>
    );
  }
  if (status === 'error' || !flow) {
    return (
      <div style={{ textAlign: 'center', padding: '64px 32px', ...mono, fontSize: 12, color: '#E8002D' }}>
        Failed to load: {errorMsg}
      </div>
    );
  }

  const { points, goals } = flow;
  const validGoals = goals.filter(g => !g.overturned);

  // Infer team abbrs from flow metadata or goals
  const homeAbbr = flow.home_abbr ?? (validGoals.find(g => g.is_home)?.score?.split('-')[1] ? '' : 'HOME');
  const awayAbbr = flow.away_abbr ?? 'AWAY';
  const homeColor = pickColor(homeAbbr);
  const awayColor = pickColor(awayAbbr);

  const homeScore = validGoals.filter(g => g.is_home).length;
  const awayScore = validGoals.filter(g => !g.is_home).length;

  const wpPoints = points.filter(p => p.wp != null);
  const xgPoints = points.filter(p => p.xg_home != null || p.xg_away != null);

  return (
    <div>
      {/* Game header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 24, marginBottom: 24, padding: 16,
        background: '#fff', border: '1px solid rgba(13,13,20,0.14)',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 28, color: awayColor }}>
            {awayAbbr}
          </span>
          <span style={{ ...mono, fontSize: 22, fontWeight: 700 }}>{awayScore}</span>
        </div>
        <div style={{ ...mono, fontSize: 12, color: 'rgba(13,13,20,0.32)', textAlign: 'center', letterSpacing: '0.06em' }}>
          <div>GAME {GAME_ID}</div>
          <div style={{ fontSize: 10, marginTop: 2 }}>FINAL</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 28, color: homeColor }}>
            {homeAbbr}
          </span>
          <span style={{ ...mono, fontSize: 22, fontWeight: 700 }}>{homeScore}</span>
        </div>
      </div>

      {/* WP Chart */}
      <div style={{ background: '#fff', border: '1px solid rgba(13,13,20,0.14)', overflow: 'hidden', marginBottom: 16 }}>
        <div style={{ padding: '10px 14px 6px', borderBottom: '1px solid rgba(13,13,20,0.06)', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#E8002D' }}>
            Win Probability
          </span>
          <span style={{ ...mono, fontSize: 10, color: 'rgba(13,13,20,0.32)', letterSpacing: '0.06em' }}>
            {wpPoints.length} pts · {validGoals.length} goals
          </span>
        </div>
        <div style={{ padding: '8px 0 4px' }}>
          <WPChart
            points={wpPoints}
            goals={validGoals}
            homeColor={homeColor}
            awayColor={awayColor}
            homeAbbr={homeAbbr}
            awayAbbr={awayAbbr}
            height={220}
          />
        </div>
      </div>

      {/* xG Chart */}
      <div style={{ background: '#fff', border: '1px solid rgba(13,13,20,0.14)', overflow: 'hidden' }}>
        <div style={{ padding: '10px 14px 6px', borderBottom: '1px solid rgba(13,13,20,0.06)', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#E8002D' }}>
            5v5 Expected Goals
          </span>
          <span style={{ ...mono, fontSize: 10, color: 'rgba(13,13,20,0.32)', letterSpacing: '0.06em' }}>
            {xgPoints.length} events
          </span>
        </div>
        <div style={{ padding: '8px 0 4px' }}>
          <XGChart
            points={xgPoints}
            goals={validGoals}
            homeColor={homeColor}
            awayColor={awayColor}
            homeAbbr={homeAbbr}
            awayAbbr={awayAbbr}
            height={180}
          />
        </div>
      </div>
    </div>
  );
}
