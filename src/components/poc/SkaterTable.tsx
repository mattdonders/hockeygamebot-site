import React, { useState, useMemo, useEffect } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table';

type Skater = {
  display_name: string;
  team_abbrev:  string;
  pos:          string;
  gp:           number;
  goals:        number;
  assists:      number;
  points:       number;
  toi_avg_sec:  number;
  hgb_war:      number | null;
  hgb_rating_percentile: number | null;
  rates_per_60: { ixg: number; shots: number; goals: number };
  percentiles_vs_pos: { ev_offence: number; ev_defence: number };
  slug: string;
};

// ── Color scale helpers ──────────────────────────────────────────────────────
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

// Red → neutral → green, clamped 0–1
function heatColor(pct: number): string {
  const t = Math.max(0, Math.min(1, pct));
  if (t < 0.5) {
    const r = Math.round(lerp(220, 248, t * 2));
    const g = Math.round(lerp(50,  248, t * 2));
    const b = Math.round(lerp(50,  240, t * 2));
    return `rgb(${r},${g},${b})`;
  }
  const r = Math.round(lerp(248, 22,  (t - 0.5) * 2));
  const g = Math.round(lerp(248, 160, (t - 0.5) * 2));
  const b = Math.round(lerp(240, 70,  (t - 0.5) * 2));
  return `rgb(${r},${g},${b})`;
}

// Compute column min/max for scaling
function colScale(data: Skater[], fn: (r: Skater) => number) {
  const vals = data.map(fn);
  const min = Math.min(...vals), max = Math.max(...vals);
  return (v: number) => max === min ? 0.5 : (v - min) / (max - min);
}

const col = createColumnHelper<Skater>();

// ── Responsive hook ──────────────────────────────────────────────────────────
function useIsMobile() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)');
    setMobile(mq.matches);
    const fn = (e: MediaQueryListEvent) => setMobile(e.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);
  return mobile;
}

export default function SkaterTable({ data }: { data: Skater[] }) {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'points', desc: true }]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [posFilter, setPosFilter] = useState<'all' | 'F' | 'D'>('all');
  const [minGP, setMinGP] = useState(20);
  const [colorScale, setColorScale] = useState(false);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const isMobile = useIsMobile();

  // Mobile auto-hides dense columns
  const mobileHidden: VisibilityState = isMobile
    ? { goals: false, assists: false, toi: false, shots60: false, hgb_war: false, hgb_rating_percentile: false }
    : {};
  const effectiveVisibility = { ...columnVisibility, ...mobileHidden };

  const filtered = useMemo(() => {
    let rows = data.filter(r => r.gp >= minGP);
    if (posFilter !== 'all') rows = rows.filter(r =>
      posFilter === 'F' ? ['C','LW','RW'].includes(r.pos) : r.pos === 'D'
    );
    if (globalFilter) {
      const q = globalFilter.toLowerCase();
      rows = rows.filter(r =>
        r.display_name.toLowerCase().includes(q) ||
        r.team_abbrev.toLowerCase().includes(q)
      );
    }
    return rows;
  }, [data, minGP, posFilter, globalFilter]);

  // Pre-compute scales from current filtered set
  const scales = useMemo(() => ({
    points:  colScale(filtered, r => r.points),
    ixg60:   colScale(filtered, r => r.rates_per_60.ixg),
    shots60: colScale(filtered, r => r.rates_per_60.shots),
    toi:     colScale(filtered, r => r.toi_avg_sec),
    war:     colScale(filtered, r => r.hgb_war ?? 0),
    rating:  colScale(filtered, r => r.hgb_rating_percentile ?? 0),
  }), [filtered]);

  // Colored cell helper: bg + slightly larger font for top values
  function heat(val: number, scaleFn: (v: number) => number, fmt: string) {
    if (!colorScale) return <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt}</span>;
    const t = scaleFn(val);
    const bg = heatColor(t);
    const fs = 10 + Math.round(t * 4); // 10–14px
    const fw = t > 0.75 ? 700 : t < 0.25 ? 400 : 600;
    return (
      <span style={{ display: 'inline-block', background: bg, padding: '1px 6px', borderRadius: 2, fontVariantNumeric: 'tabular-nums', fontSize: fs, fontWeight: fw, color: t > 0.45 && t < 0.72 ? '#555' : t > 0.72 ? '#fff' : '#fff' }}>
        {fmt}
      </span>
    );
  }

  const COLUMNS = useMemo(() => [
    col.accessor('display_name', {
      header: 'Player',
      cell: i => (
        <a href={`/stats/player/${i.row.original.slug}`}
           style={{ color: 'inherit', textDecoration: 'none', fontWeight: 600, fontFamily: "'Barlow', sans-serif" }}>
          {i.getValue()}
        </a>
      ),
      size: 160,
    }),
    col.accessor('team_abbrev', { header: 'Team', size: 56 }),
    col.accessor('pos',          { header: 'Pos',  size: 46 }),
    col.accessor('gp',           { header: 'GP',   size: 46 }),
    col.accessor('goals',        {
      header: 'G', size: 46,
      cell: i => heat(i.getValue(), scales.points, String(i.getValue())),
    }),
    col.accessor('assists',      { header: 'A', size: 46 }),
    col.accessor('points',       {
      header: 'P', size: 52,
      cell: i => heat(i.getValue(), scales.points, String(i.getValue())),
    }),
    col.accessor(r => r.toi_avg_sec / 60, {
      id: 'toi', header: 'TOI/G', size: 64,
      cell: i => heat(i.getValue<number>(), scales.toi, i.getValue<number>().toFixed(1)),
    }),
    col.accessor(r => r.rates_per_60.ixg, {
      id: 'ixg60', header: 'iXG/60', size: 72,
      cell: i => heat(i.getValue<number>(), scales.ixg60, i.getValue<number>().toFixed(2)),
    }),
    col.accessor(r => r.rates_per_60.shots, {
      id: 'shots60', header: 'S/60', size: 64,
      cell: i => heat(i.getValue<number>(), scales.shots60, i.getValue<number>().toFixed(1)),
    }),
    col.accessor('hgb_war', {
      header: 'WAR', size: 64,
      cell: i => i.getValue() != null
        ? heat(i.getValue()!, scales.war, (i.getValue()! >= 0 ? '+' : '') + i.getValue()!.toFixed(2))
        : <span style={{ color: 'rgba(13,13,20,0.3)' }}>—</span>,
    }),
    col.accessor('hgb_rating_percentile', {
      header: 'Rating', size: 64,
      cell: i => i.getValue() != null
        ? heat(i.getValue()!, scales.rating, i.getValue() + '%')
        : <span style={{ color: 'rgba(13,13,20,0.3)' }}>—</span>,
    }),
  ], [colorScale, scales]);

  const table = useReactTable({
    data: filtered,
    columns: COLUMNS,
    state: { sorting, columnVisibility: effectiveVisibility },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const mono = { fontFamily: "'JetBrains Mono', monospace" };

  return (
    <div style={{ fontFamily: "'Barlow', sans-serif", color: '#0d0d14' }}>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12, padding: '10px 0', borderBottom: '1px solid rgba(13,13,20,0.1)' }}>
        <input
          placeholder={isMobile ? 'Search…' : 'Search players or team…'}
          value={globalFilter}
          onChange={e => setGlobalFilter(e.target.value)}
          style={{ ...mono, fontSize: 11, padding: '5px 10px', border: '1px solid rgba(13,13,20,0.14)', background: '#fff', outline: 'none', width: isMobile ? 130 : 180 }}
        />
        {(['all','F','D'] as const).map(p => (
          <button key={p} onClick={() => setPosFilter(p)}
            style={{ ...mono, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', padding: '5px 10px', border: '1px solid rgba(13,13,20,0.2)', background: posFilter === p ? '#0d0d14' : 'transparent', color: posFilter === p ? '#EFEEE8' : 'rgba(13,13,20,0.48)', cursor: 'pointer' }}>
            {p === 'all' ? 'All' : p === 'F' ? 'Fwds' : 'Def'}
          </button>
        ))}
        {!isMobile && (
          <label style={{ ...mono, fontSize: 10, color: 'rgba(13,13,20,0.48)', display: 'flex', alignItems: 'center', gap: 6 }}>
            Min GP
            <input type="number" value={minGP} min={0} max={82}
              onChange={e => setMinGP(Number(e.target.value))}
              style={{ ...mono, fontSize: 11, width: 44, padding: '4px 6px', border: '1px solid rgba(13,13,20,0.14)', background: '#fff' }} />
          </label>
        )}
        {/* Color scale toggle */}
        <button onClick={() => setColorScale(c => !c)}
          style={{ ...mono, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '5px 12px', border: '1px solid rgba(13,13,20,0.2)', background: colorScale ? '#E8002D' : 'transparent', color: colorScale ? '#fff' : 'rgba(13,13,20,0.48)', cursor: 'pointer' }}>
          {colorScale ? '● Color On' : '○ Color Off'}
        </button>
        <span style={{ ...mono, fontSize: 10, color: 'rgba(13,13,20,0.32)', marginLeft: 'auto' }}>
          {filtered.length} skaters{isMobile ? '' : ' · click header to sort'}
        </span>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, background: '#fff', border: '1px solid rgba(13,13,20,0.14)', minWidth: isMobile ? 'unset' : 700 }}>
          <thead>
            {table.getHeaderGroups().map(hg => (
              <tr key={hg.id} style={{ borderBottom: '1px solid rgba(13,13,20,0.14)', background: '#EFEEE8' }}>
                {hg.headers.map(h => (
                  <th key={h.id}
                    onClick={h.column.getToggleSortingHandler()}
                    style={{ ...mono, fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(13,13,20,0.48)', padding: isMobile ? '8px 8px' : '8px 10px', textAlign: h.id === 'display_name' ? 'left' : 'right', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
                    {flexRender(h.column.columnDef.header, h.getContext())}
                    {h.column.getIsSorted() === 'asc' ? ' ↑' : h.column.getIsSorted() === 'desc' ? ' ↓' : ''}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row, i) => (
              <tr key={row.id}
                style={{ borderBottom: '1px solid rgba(13,13,20,0.05)', background: i % 2 === 0 ? '#fff' : 'rgba(13,13,20,0.018)' }}
                onMouseEnter={e => { if (!isMobile) (e.currentTarget as HTMLElement).style.background = 'rgba(13,13,20,0.04)'; }}
                onMouseLeave={e => { if (!isMobile) (e.currentTarget as HTMLElement).style.background = i % 2 === 0 ? '#fff' : 'rgba(13,13,20,0.018)'; }}>
                {row.getVisibleCells().map(cell => (
                  <td key={cell.id}
                    style={{ ...mono, fontSize: isMobile ? 12 : 11, padding: isMobile ? '8px 8px' : '7px 10px', textAlign: cell.column.id === 'display_name' ? 'left' : 'right', color: cell.column.id === 'display_name' ? '#0d0d14' : 'rgba(13,13,20,0.72)', whiteSpace: 'nowrap' }}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isMobile && (
        <p style={{ ...mono, fontSize: 9, color: 'rgba(13,13,20,0.32)', marginTop: 6, letterSpacing: '0.06em' }}>
          Showing Player · Team · Pos · GP · iXG/60 on mobile · tap header to sort
        </p>
      )}
    </div>
  );
}
