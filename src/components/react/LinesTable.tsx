import React, { useState, useMemo } from 'react';
import HGBTable, { type HGBColumnDef } from './HGBTable';
import { toLineSlug } from '../../lib/line-slug';
import type { LineData } from '../../lib/stats-loader';

export type LineRow = LineData;

type Props = { rows: LineRow[]; statsDate: string | null };

const MONO: React.CSSProperties = { fontFamily: "'JetBrains Mono', monospace" };
const POS = '#166534'; const NEG = '#991b1b';

function fmtPct(v: number | null) { return v != null ? `${Number(v).toFixed(1)}%` : '—'; }
function fmt1(v: number | null)   { return v != null ? Number(v).toFixed(1) : '—'; }
function fmt2(v: number | null)   { return v != null ? Number(v).toFixed(2) : '—'; }
function toMMSS(min: number) { const m = Math.floor(min), s = Math.round((min - m) * 60); return `${m}:${String(s).padStart(2, '0')}`; }

function lastNames(players: string | undefined): string {
  if (!players) return '';
  return players.split(' – ').map(p => p.replace(/^[A-Z]\.\s+/, '').trim()).join(' – ');
}

const COLUMNS: HGBColumnDef<LineRow>[] = [
  {
    id: 'players', header: 'Line / Pair', accessor: r => r.players ?? '', align: 'left', width: 220,
    cell: (_v, row) => {
      const slug = toLineSlug(row);
      return (
        <a href={`/stats/lines/${slug}`}
           title={row.players}
           style={{ fontFamily: "'Barlow', sans-serif", fontWeight: 600, fontSize: 13, color: 'inherit', textDecoration: 'none', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>
          {lastNames(row.players)}
        </a>
      );
    },
    sortType: 'string',
  },
  { id: 'type',   header: 'Type',    accessor: r => r.type,   width: 48,  cell: v => <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, border: '1px solid rgba(13,13,20,0.2)', padding: '1px 5px' }}>{v as string}</span> },
  { id: 'team',   header: 'Team',    accessor: r => r.team,   width: 52 },
  { id: 'season', header: 'Season',  accessor: r => r.season, width: 64,  cell: v => v ? (v as string).slice(2) : '—' },
  { id: 'games',  header: 'GP',      accessor: r => r.games,  width: 48 },
  { id: 'toi',    header: 'TOI',     accessor: r => r.toi_min, width: 68, cell: v => toMMSS(v as number) },
  {
    id: 'xgf_pct', header: 'xGF%', accessor: r => r.xgf_pct, width: 72,
    cell: v => {
      const n = v as number | null;
      const col = n != null ? (n >= 55 ? POS : n <= 45 ? NEG : undefined) : undefined;
      return <strong style={{ color: col, fontVariantNumeric: 'tabular-nums' }}>{fmtPct(n)}</strong>;
    },
  },
  { id: 'xgf',    header: 'xGF',    accessor: r => r.xgf,    width: 60,  cell: v => fmt2(v as any) },
  { id: 'xga',    header: 'xGA',    accessor: r => r.xga,    width: 60,  cell: v => fmt2(v as any) },
  { id: 'xgf_60', header: 'xGF/60', accessor: r => r.xgf_60, width: 72,  cell: v => fmt2(v as any), mobileHidden: true },
  { id: 'xga_60', header: 'xGA/60', accessor: r => r.xga_60, width: 72,  cell: v => fmt2(v as any), mobileHidden: true },
  { id: 'gf',     header: 'GF',     accessor: r => r.gf,     width: 48,  mobileHidden: true },
  { id: 'ga',     header: 'GA',     accessor: r => r.ga,     width: 48,  mobileHidden: true },
];

const MAX_TEAMS = 3;

export default function LinesTable({ rows, statsDate }: Props) {
  const [gameType,      setGameType]      = useState<'2' | '3'>('2');
  const [lineType,      setLineType]      = useState<'all' | 'F' | 'D'>('all');
  const [season,        setSeason]        = useState<string>(() => {
    const seasons = [...new Set(rows.map(r => r.season))].sort().reverse();
    return seasons[0] ?? 'all';
  });
  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);
  const [minToi,        setMinToi]        = useState(150);

  // Derived lists
  const allTeams   = useMemo(() => [...new Set(rows.map(r => r.team))].sort(), [rows]);
  const allSeasons = useMemo(() => ['all', ...[...new Set(rows.map(r => r.season))].sort().reverse()], [rows]);

  const filtered = useMemo(() => rows.filter(r =>
    String(r.game_type) === gameType &&
    (lineType === 'all' || r.type === lineType) &&
    (season === 'all' || r.season === season) &&
    (selectedTeams.length === 0 || selectedTeams.includes(r.team)) &&
    r.toi_min >= minToi
  ), [rows, gameType, lineType, season, selectedTeams, minToi]);

  const addTeam = (t: string) => { if (t && !selectedTeams.includes(t) && selectedTeams.length < MAX_TEAMS) setSelectedTeams(p => [...p, t]); };
  const removeTeam = (t: string) => setSelectedTeams(p => p.filter(x => x !== t));

  const chip = (active: boolean, label: string, onClick: () => void) => (
    <button onClick={onClick} style={{ ...MONO, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', padding: '5px 12px', border: '1px solid rgba(13,13,20,0.2)', borderRight: 'none', cursor: 'pointer', background: active ? '#0d0d14' : 'transparent', color: active ? '#EFEEE8' : 'rgba(13,13,20,0.48)' }}>
      {label}
    </button>
  );
  const group = (children: React.ReactNode) => (
    <div style={{ display: 'inline-flex', border: '1px solid rgba(13,13,20,0.2)', borderLeft: 'none' }}>{children}</div>
  );
  const sel = (value: string, onChange: (v: string) => void, opts: { label: string; value: string }[]) => (
    <select value={value} onChange={e => onChange(e.target.value)}
      style={{ ...MONO, fontSize: 11, padding: '5px 8px', border: '1px solid rgba(13,13,20,0.2)', background: 'transparent', color: '#0d0d14', cursor: 'pointer' }}>
      {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );

  return (
    <div>
      {/* Row 1: primary filters */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
        {group(<>
          {chip(gameType === '2', 'Reg Season', () => setGameType('2'))}
          {chip(gameType === '3', 'Playoffs',   () => setGameType('3'))}
        </>)}
        {group(<>
          {chip(lineType === 'all', 'All',  () => setLineType('all'))}
          {chip(lineType === 'F',   'Fwds', () => setLineType('F'))}
          {chip(lineType === 'D',   'Def',  () => setLineType('D'))}
        </>)}
        {sel(season, setSeason, allSeasons.map(s => ({ value: s, label: s === 'all' ? 'All Seasons' : s.slice(2) })))}
        <span style={{ ...MONO, fontSize: 10, color: 'rgba(13,13,20,0.32)', marginLeft: 'auto', alignSelf: 'center' }}>
          {filtered.length} lines{statsDate ? ` · updated ${statsDate}` : ''}
        </span>
      </div>

      {/* Row 2: team filter + min TOI */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        {selectedTeams.length < MAX_TEAMS && (
          <select value="" onChange={e => { addTeam(e.target.value); e.target.value = ''; }}
            style={{ ...MONO, fontSize: 11, padding: '5px 8px', border: '1px solid rgba(13,13,20,0.2)', background: 'transparent', color: '#0d0d14', cursor: 'pointer' }}>
            <option value="">Add team…</option>
            {allTeams.filter(t => !selectedTeams.includes(t)).map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
        {selectedTeams.map(t => (
          <button key={t} onClick={() => removeTeam(t)}
            style={{ ...MONO, fontSize: 10, letterSpacing: '0.10em', textTransform: 'uppercase', padding: '4px 10px', border: '1px solid rgba(13,13,20,0.3)', background: '#0d0d14', color: '#EFEEE8', cursor: 'pointer' }}>
            {t} ×
          </button>
        ))}
        <label style={{ ...MONO, fontSize: 10, color: 'rgba(13,13,20,0.48)', display: 'flex', alignItems: 'center', gap: 6 }}>
          Min TOI
          <input type="range" min={20} max={400} step={10} value={minToi} onChange={e => setMinToi(Number(e.target.value))}
            style={{ width: 100, accentColor: '#E8002D' }} />
          <span style={{ minWidth: 32 }}>{minToi}m</span>
        </label>
      </div>

      <HGBTable
        data={filtered}
        columns={COLUMNS}
        defaultSort={{ id: 'xgf_pct', desc: true }}
        globalSearchField={r => `${r.players} ${r.team}`.toLowerCase()}
        searchPlaceholder="Search lines or team…"
        rowHref={r => `/stats/lines/${toLineSlug(r)}`}
        exportFilename="hgb-lines.png"
        emptyMessage="No lines match the current filters. Try lowering the Min TOI."
        virtualize
      />
    </div>
  );
}
