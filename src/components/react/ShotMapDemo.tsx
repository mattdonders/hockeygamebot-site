/**
 * ShotMapDemo.tsx — Client-side wrapper for the shot map POC page.
 *
 * Fetches series shot data from api.hockeygamebot.com and renders the
 * ShotMap component. Handles loading / error states inline.
 */

import React, { useEffect, useState } from 'react';
import ShotMap, { type Shot } from './ShotMap';

const API = 'https://api.hockeygamebot.com';

const mono: React.CSSProperties = {
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: 12,
  color: 'rgba(13,13,20,0.40)',
  letterSpacing: '0.08em',
  textAlign: 'center',
  padding: '48px 0',
};

const SERIES_OPTIONS = [
  { id: 'car-mtl', teamA: 'CAR', teamB: 'MTL', colorA: '#CC0000',    colorB: 'rgba(20,100,200,0.90)', label: 'CAR vs MTL · ECF' },
  { id: 'car-nyr', teamA: 'CAR', teamB: 'NYR', colorA: '#CC0000',    colorB: 'rgba(0,56,168,0.90)',   label: 'CAR vs NYR' },
  { id: 'fla-tor', teamA: 'FLA', teamB: 'TOR', colorA: '#C8102E',    colorB: 'rgba(0,32,91,0.90)',    label: 'FLA vs TOR' },
];

export default function ShotMapDemo() {
  const [series,  setSeries]  = useState(SERIES_OPTIONS[0]);
  const [shots,   setShots]   = useState<Shot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setShots([]);

    fetch(`${API}/v1/series/${series.id}/shots`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(data => {
        if (cancelled) return;
        const raw: Shot[] = data.shots ?? [];
        setShots(raw);
        setLoading(false);
      })
      .catch(err => {
        if (cancelled) return;
        setError(String(err));
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [series.id]);

  return (
    <div>
      {/* Series picker */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 24, border: '1px solid rgba(13,13,20,0.18)', width: 'fit-content' }}>
        {SERIES_OPTIONS.map(opt => {
          const active = opt.id === series.id;
          return (
            <button
              key={opt.id}
              onClick={() => setSeries(opt)}
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 10,
                letterSpacing: '0.12em',
                textTransform: 'uppercase' as const,
                padding: '5px 14px',
                border: 'none',
                borderRight: '1px solid rgba(13,13,20,0.18)',
                cursor: 'pointer',
                background: active ? '#0d0d14' : 'transparent',
                color: active ? '#EFEEE8' : 'rgba(13,13,20,0.48)',
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* Map card */}
      <div style={{
        background: '#fff',
        border: '1px solid rgba(13,13,20,0.14)',
        padding: '20px 20px 16px',
      }}>
        {loading && (
          <div style={mono}>Loading shots…</div>
        )}
        {!loading && error && (
          <div style={{ ...mono, color: '#E8002D' }}>
            Failed to load shots: {error}
          </div>
        )}
        {!loading && !error && (
          <ShotMap
            shots={shots}
            teamA={series.teamA}
            teamB={series.teamB}
            colorA={series.colorA}
            colorB={series.colorB}
            title={`${series.label} · All 5v5 Shots`}
          />
        )}
      </div>

      {/* Notes */}
      <div style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 10,
        color: 'rgba(13,13,20,0.36)',
        letterSpacing: '0.06em',
        marginTop: 12,
        lineHeight: 1.7,
      }}>
        <div>Source: api.hockeygamebot.com/v1/series/{series.id}/shots</div>
        <div>Density: Gaussian kernel σ=1.5 cells · 15×12 grid per half · goals overlaid</div>
        <div>PNG export: SVG serialized → canvas 3× scale → download</div>
      </div>
    </div>
  );
}
