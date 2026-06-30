import React, { useEffect, useState } from 'react';
import ShotMapKDE, { type RawShot } from './ShotMapKDE';

const API = 'https://api.hockeygamebot.com';
const mono: React.CSSProperties = { fontFamily: 'var(--mono)' };

const SERIES = [
  { id: 'car-mtl', teamFor: 'CAR', teamAgainst: 'MTL', label: 'CAR vs MTL · ECF' },
  { id: 'car-phi', teamFor: 'CAR', teamAgainst: 'PHI', label: 'CAR vs PHI · R2' },
  { id: 'col-vgk', teamFor: 'COL', teamAgainst: 'VGK', label: 'COL vs VGK · WCF' },
];

export default function ShotMapDemo() {
  const [selected, setSelected] = useState(SERIES[0]);
  const [shots, setShots]       = useState<RawShot[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(''); setShots([]);
    fetch(`${API}/v1/series/${selected.id}/shots`)
      .then(r => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`))
      .then(d => { if (!cancelled) { setShots(d.shots ?? []); setLoading(false); } })
      .catch(e => { if (!cancelled) { setError(String(e)); setLoading(false); } });
    return () => { cancelled = true; };
  }, [selected.id]);

  return (
    <div>
      {/* Series selector */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {SERIES.map(s => (
          <button key={s.id} onClick={() => setSelected(s)}
            style={{ ...mono, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '6px 14px', border: '1px solid rgba(13,13,20,0.2)', cursor: 'pointer', background: selected.id === s.id ? '#0d0d14' : 'transparent', color: selected.id === s.id ? '#EFEEE8' : 'rgba(13,13,20,0.48)' }}>
            {s.label}
          </button>
        ))}
      </div>

      {loading && <div style={{ ...mono, fontSize: 11, color: 'rgba(13,13,20,0.32)', padding: '60px 0', textAlign: 'center' }}>Loading shots…</div>}
      {error   && <div style={{ ...mono, fontSize: 11, color: '#E8002D', padding: '40px 0', textAlign: 'center' }}>Error: {error}</div>}
      {!loading && !error && (
        <ShotMapKDE
          shots={shots}
          teamFor={selected.teamFor}
          teamAgainst={selected.teamAgainst}
          title={selected.label}
        />
      )}
    </div>
  );
}
