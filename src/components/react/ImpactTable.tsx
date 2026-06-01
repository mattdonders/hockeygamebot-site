import React, { useState, useEffect } from 'react';
import HGBTable, { type HGBColumnDef, TEAM_LOGO_SIZE, TEAM_LOGO_STYLE, teamLogoSrc, NAME_FONT_SIZE } from './HGBTable';

export type ImpactRow = {
  id: number; slug: string;
  name: string; first_name?: string; last_name?: string;
  team: string; pos: string; group: 'F' | 'D'; gp: number;
  avg: number; l10: number[]; l10a: number | null;
  best: number; worst: number;
};

type Props = { rows: ImpactRow[]; statsDate: string | null };

const MONO: React.CSSProperties = { fontFamily: "'JetBrains Mono', monospace" };
const POS = '#166534'; const NEG = '#991b1b';

function Sparkline({ values }: { values: number[] }) {
  if (!values.length) return <span style={{ color: 'rgba(13,13,20,0.3)' }}>—</span>;
  const W = 72, H = 24, PAD = 2;
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  const xs = values.map((_, i) => PAD + i * ((W - 2*PAD) / Math.max(values.length - 1, 1)));
  const ys = values.map(v => H - PAD - ((v - min) / range) * (H - 2*PAD));
  const path = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ');
  const last = values[values.length - 1];
  const trend = values.length > 1 ? last - values[values.length - 2] : 0;
  const color = trend > 0 ? POS : trend < 0 ? NEG : 'rgba(13,13,20,0.4)';
  return (
    <svg width={W} height={H} style={{ display: 'block' }}>
      <path d={path} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={xs[xs.length-1].toFixed(1)} cy={ys[ys.length-1].toFixed(1)} r={2.5} fill={color} />
    </svg>
  );
}

export default function ImpactTable({ rows, statsDate }: Props) {
  const [pos,    setPos]    = useState<'all' | 'F' | 'D'>('all');
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const check = () => setIsDark(document.documentElement.dataset.theme === 'dark');
    check();
    const obs = new MutationObserver(check);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);

  const filtered = pos === 'all' ? rows : rows.filter(r => r.group === pos);

  const COLUMNS: HGBColumnDef<ImpactRow>[] = [
    {
      id: 'name', header: 'Player', accessor: r => r.name, align: 'left', width: 200,
      cell: (_v, row) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <img src={teamLogoSrc(row.team, isDark)} width={TEAM_LOGO_SIZE} height={TEAM_LOGO_SIZE}
            style={TEAM_LOGO_STYLE} alt={row.team}
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          <div style={{ fontFamily: "'Barlow', sans-serif", fontWeight: 600, fontSize: NAME_FONT_SIZE }}>
            {row.first_name && row.last_name ? `${row.first_name} ${row.last_name}` : row.name}
          </div>
        </div>
      ),
      sortType: 'string',
    },
    { id: 'team', header: 'Team', accessor: r => r.team, width: 52 },
    { id: 'pos',  header: 'Pos',  accessor: r => r.pos,  width: 44 },
    { id: 'gp',   header: 'GP',   accessor: r => r.gp,   width: 48 },
    {
      id: 'avg', header: 'Avg Impact', accessor: r => r.avg, width: 88,
      cell: v => <strong style={{ color: (v as number) >= 0 ? POS : NEG, fontVariantNumeric: 'tabular-nums' }}>{(v as number) >= 0 ? '+' : ''}{Number(v).toFixed(2)}</strong>,
    },
    { id: 'l10a', header: 'L10 Avg', accessor: r => r.l10a, width: 72,
      cell: v => v != null ? <span style={{ color: (v as number) >= 0 ? POS : NEG, fontVariantNumeric: 'tabular-nums' }}>{(v as number) >= 0 ? '+' : ''}{Number(v).toFixed(2)}</span> : '—' },
    {
      id: 'l10', header: 'L10 Trend', accessor: r => r.avg, width: 84,
      cell: (_v, row) => <Sparkline values={row.l10} />,
      sortType: 'number',
    },
    { id: 'best',  header: 'Best',  accessor: r => r.best,  width: 60, cell: v => `+${Number(v).toFixed(2)}` },
    { id: 'worst', header: 'Worst', accessor: r => r.worst, width: 60, cell: v => Number(v).toFixed(2) },
  ];

  const chip = (active: boolean, label: string, onClick: () => void) => (
    <button onClick={onClick} style={{ ...MONO, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', padding: '5px 12px', border: '1px solid rgba(13,13,20,0.2)', borderRight: 'none', cursor: 'pointer', background: active ? '#0d0d14' : 'transparent', color: active ? '#EFEEE8' : 'rgba(13,13,20,0.48)' }}>
      {label}
    </button>
  );

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <div style={{ display: 'inline-flex', border: '1px solid rgba(13,13,20,0.2)', borderLeft: 'none' }}>
          {chip(pos === 'all', 'All',  () => setPos('all'))}
          {chip(pos === 'F',   'Fwds', () => setPos('F'))}
          {chip(pos === 'D',   'Def',  () => setPos('D'))}
        </div>
        <span style={{ ...MONO, fontSize: 10, color: 'rgba(13,13,20,0.32)', marginLeft: 'auto' }}>
          {filtered.length} skaters{statsDate ? ` · updated ${statsDate}` : ''}
        </span>
      </div>

      <HGBTable
        data={filtered}
        columns={COLUMNS}
        defaultSort={{ id: 'avg', desc: true }}
        globalSearchField={r => `${r.name} ${r.team}`.toLowerCase()}
        searchPlaceholder="Search players or team…"
        rowHref={r => `/stats/player/${r.slug}`}
        exportFilename="hgb-impact.png"
        emptyMessage="No impact data for this selection."
        virtualize
      />
    </div>
  );
}
