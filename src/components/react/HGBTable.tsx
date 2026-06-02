/**
 * HGBTable — Generic TanStack Table wrapper for HGB design system.
 *
 * Supports: sorting, global search, declarative filters (search/chips/number-min/select),
 * mobile column hiding, column toggles, row-click navigation, CSV export, empty states.
 *
 * NO color scaling — that's a separate concern kept in per-page components.
 */

import React, { useState, useMemo, useEffect, useCallback, useRef, useDeferredValue } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type SortingState,
  type VisibilityState,
  type ColumnDef,
} from '@tanstack/react-table';

// ── Types ────────────────────────────────────────────────────────────────────

export type HGBColumnDef<T> = {
  id: string;
  header: string;
  accessor: (row: T) => string | number | null;
  cell?: (value: string | number | null, row: T) => React.ReactNode;
  /** Plain-text renderer for PNG canvas export. Falls back to String(accessor(row)). */
  exportText?: (value: string | number | null, row: T) => string;
  sortType?: 'number' | 'string';
  align?: 'left' | 'right' | 'center';
  width?: number;
  mobileHidden?: boolean;
  defaultHidden?: boolean;
};

// Stable empty array so `filters = []` default doesn't create a new ref every render
const _EMPTY_FILTERS: HGBFilter[] = [];

export type HGBFilter =
  | { type: 'search'; placeholder?: string; field: (row: any) => string }
  | { type: 'chips'; label: string; options: { label: string; value: string }[]; field: (row: any) => string; defaultValue?: string }
  | { type: 'number-min'; label: string; field: (row: any) => number; defaultValue?: number; max?: number }
  | { type: 'select'; label: string; options: { label: string; value: string }[]; field: (row: any) => string };

export type HGBTableProps<T> = {
  data: T[];
  columns: HGBColumnDef<T>[];
  defaultSort?: { id: string; desc: boolean };
  globalSearchField?: (row: T) => string;
  searchPlaceholder?: string;
  filters?: HGBFilter[];
  rowHref?: (row: T) => string;
  exportFilename?: string;
  maxHeight?: number | string;
  emptyMessage?: string;
  /** Enables TanStack Virtual row rendering. Requires a fixed-height scroll container.
   *  With maxHeight: uses that height. Without: defaults to calc(100vh - 300px). */
  virtualize?: boolean;
  /** Hides the built-in toolbar (search, row count, exports). Use when the parent renders its own toolbar. */
  hideToolbar?: boolean;
  /** Big Barlow title shown in the PNG export header. If omitted, PNG button is hidden. */
  exportTitle?: string;
  /** Active filter labels shown as chips in PNG export (e.g. ["REG SEASON", "FORWARDS"]). */
  exportChips?: string[];
};

// ── Style constants ──────────────────────────────────────────────────────────

const MONO: React.CSSProperties = { fontFamily: "'JetBrains Mono', monospace" };
const BODY: React.CSSProperties = { fontFamily: "'Barlow', sans-serif" };
export const TEAM_LOGO_SIZE = 32;
/** Returns the local logo path for a team, respecting current color scheme. */
export function teamLogoSrc(abbr: string, isDark = false): string {
  return `/logos/nhl/${abbr}_${isDark ? 'dark' : 'light'}.svg`;
}
export const TEAM_LOGO_STYLE: React.CSSProperties = {
  flexShrink: 0,
  objectFit: 'contain',
  filter: 'drop-shadow(rgba(0,0,0,0.25) 0px 1px 2px)',
};
// Table typography — change here to update all tables at once
export const CELL_FONT_SIZE     = 12;  // JetBrains Mono data cells
export const NAME_FONT_SIZE     = 14;  // Barlow player/goalie names
export const SUBLINE_FONT_SIZE  = 11;  // Mono sub-line (team abbrev etc)

const INK = '#0d0d14';
const BG = '#EFEEE8';
const BORDER = '1px solid rgba(13,13,20,0.14)';
const MUTED = 'rgba(13,13,20,0.48)';

// ── Mobile hook ──────────────────────────────────────────────────────────────

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

// ── Filter state helpers ─────────────────────────────────────────────────────

type FilterState = Record<string, string | number>;

function buildInitialFilterState(filters: HGBFilter[]): FilterState {
  const state: FilterState = {};
  filters.forEach((f, i) => {
    const key = `filter_${i}`;
    if (f.type === 'chips') state[key] = f.defaultValue ?? 'all';
    else if (f.type === 'number-min') state[key] = f.defaultValue ?? 0;
    else if (f.type === 'select') state[key] = 'all';
    else if (f.type === 'search') state[key] = '';
  });
  return state;
}

function applyFilters<T>(rows: T[], filters: HGBFilter[], filterState: FilterState): T[] {
  return filters.reduce((acc, f, i) => {
    const key = `filter_${i}`;
    const val = filterState[key];

    if (f.type === 'search') {
      if (!val) return acc;
      const q = String(val).toLowerCase();
      return acc.filter(row => f.field(row).toLowerCase().includes(q));
    }
    if (f.type === 'chips' || f.type === 'select') {
      if (val === 'all' || val === '') return acc;
      return acc.filter(row => f.field(row) === String(val));
    }
    if (f.type === 'number-min') {
      const min = Number(val);
      if (!min) return acc;
      return acc.filter(row => f.field(row) >= min);
    }
    return acc;
  }, rows);
}

// ── CSV export ───────────────────────────────────────────────────────────────

function csvCell(v: unknown): string {
  if (v == null) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

function exportCSV<T>(
  rows: T[],
  columns: HGBColumnDef<T>[],
  filename: string,
) {
  const base = filename.replace(/\.[^.]+$/, ''); // strip any extension
  const headers = columns.map(c => csvCell(c.header)).join(',');
  const body = rows.map(row =>
    columns.map(c => csvCell(c.accessor(row))).join(',')
  ).join('\n');

  const blob = new Blob([`${headers}\n${body}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${base}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Filter bar sub-components ────────────────────────────────────────────────

function SearchInput({
  value,
  onChange,
  placeholder,
  isMobile,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  isMobile: boolean;
}) {
  return (
    <input
      type="search"
      placeholder={placeholder ?? (isMobile ? 'Search…' : 'Search…')}
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        ...MONO,
        fontSize: 11,
        padding: '5px 10px',
        border: BORDER,
        background: '#fff',
        outline: 'none',
        color: INK,
        width: isMobile ? 130 : 180,
      }}
    />
  );
}

function ChipGroup({
  options,
  value,
  onChange,
  label: _label,
}: {
  options: { label: string; value: string }[];
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  const allOptions = [{ label: 'All', value: 'all' }, ...options];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      {allOptions.map(opt => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          style={{
            ...MONO,
            fontSize: 10,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            padding: '5px 10px',
            border: '1px solid rgba(13,13,20,0.2)',
            background: value === opt.value ? INK : 'transparent',
            color: value === opt.value ? BG : MUTED,
            cursor: 'pointer',
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function NumberMinInput({
  value,
  onChange,
  label,
  max,
}: {
  value: number;
  onChange: (v: number) => void;
  label: string;
  max?: number;
}) {
  return (
    <label style={{ ...MONO, fontSize: 10, color: MUTED, display: 'flex', alignItems: 'center', gap: 6 }}>
      {label}
      <input
        type="number"
        value={value}
        min={0}
        max={max}
        onChange={e => onChange(Number(e.target.value))}
        style={{
          ...MONO,
          fontSize: 11,
          width: 44,
          padding: '4px 6px',
          border: BORDER,
          background: '#fff',
          color: INK,
          outline: 'none',
        }}
      />
    </label>
  );
}

function SelectFilter({
  value,
  onChange,
  label,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  options: { label: string; value: string }[];
}) {
  return (
    <label style={{ ...MONO, fontSize: 10, color: MUTED, display: 'flex', alignItems: 'center', gap: 6 }}>
      {label}
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          ...MONO,
          fontSize: 11,
          padding: '4px 6px',
          border: BORDER,
          background: '#fff',
          color: INK,
          outline: 'none',
          cursor: 'pointer',
        }}
      >
        <option value="all">All</option>
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export default function HGBTable<T extends object>({
  data,
  columns: columnDefs,
  defaultSort,
  globalSearchField,
  searchPlaceholder,
  filters = _EMPTY_FILTERS,
  rowHref,
  exportFilename,
  maxHeight,
  emptyMessage = 'No results found.',
  virtualize = false,
  hideToolbar = false,
  exportTitle,
  exportChips = [],
}: HGBTableProps<T>) {
  const isMobile = useIsMobile();

  // Sorting state — reactive: reset when defaultSort changes (e.g. tab switches in SkatersTable)
  const [sorting, setSorting] = useState<SortingState>(
    defaultSort ? [{ id: defaultSort.id, desc: defaultSort.desc }] : [],
  );
  useEffect(() => {
    if (!defaultSort) return;
    if (!columnDefs.some(c => c.id === defaultSort.id)) return;
    setSorting([{ id: defaultSort.id, desc: defaultSort.desc }]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultSort?.id, defaultSort?.desc]);

  // Global search: input updates immediately (high priority), filtering defers (low priority).
  // useDeferredValue lets React interrupt expensive re-renders when new keystrokes arrive.
  const [searchInput, setSearchInput] = useState('');
  const globalSearch = useDeferredValue(searchInput);

  // Virtualizer ref — single scroll container for all virtual tables
  const scrollRef = useRef<HTMLDivElement>(null);

  // Declarative filter state
  const [filterState, setFilterState] = useState<FilterState>(() =>
    buildInitialFilterState(filters),
  );

  // Column visibility: user-toggled overrides + mobile auto-hides
  const [userVisibility, setUserVisibility] = useState<VisibilityState>(() => {
    const initial: VisibilityState = {};
    columnDefs.forEach(c => {
      if (c.defaultHidden) initial[c.id] = false;
    });
    return initial;
  });

  // Columns with defaultHidden that the user can toggle
  const toggleableColumns = useMemo(
    () => columnDefs.filter(c => c.defaultHidden),
    [columnDefs],
  );

  // Effective visibility: merge user overrides with mobile auto-hides
  const effectiveVisibility = useMemo<VisibilityState>(() => {
    const mobileHides: VisibilityState = {};
    if (isMobile) {
      columnDefs.forEach(c => {
        if (c.mobileHidden) mobileHides[c.id] = false;
      });
    }
    // Mobile hides take precedence over user toggles on mobile
    return { ...userVisibility, ...mobileHides };
  }, [userVisibility, isMobile, columnDefs]);

  // Apply declarative filters + global search to data
  const filteredData = useMemo(() => {
    let rows = applyFilters(data, filters, filterState);
    if (globalSearchField && globalSearch) {
      const q = globalSearch.toLowerCase();
      rows = rows.filter(row => globalSearchField(row).toLowerCase().includes(q));
    }
    return rows;
  }, [data, filters, filterState, globalSearch, globalSearchField]);

  // Build TanStack column definitions from our HGBColumnDef
  const tanstackColumns = useMemo<ColumnDef<T>[]>(
    () =>
      columnDefs.map(col => ({
        id: col.id,
        header: col.header,
        accessorFn: (row: T) => col.accessor(row),
        size: col.width,
        cell: col.cell
          ? (info: any) => col.cell!(info.getValue(), info.row.original)
          : (info: any) => { const v = info.getValue(); return v != null ? String(v) : '—'; },
        sortingFn: col.sortType === 'string' ? 'alphanumeric' : 'basic',
      })),
    [columnDefs],
  );

  const table = useReactTable({
    data: filteredData,
    columns: tanstackColumns,
    state: { sorting, columnVisibility: effectiveVisibility },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setUserVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const tableRows = table.getRowModel().rows;

  // Single virtualizer — always uses a fixed-height scroll container.
  // No maxHeight + virtualize=true → defaults to calc(100vh - 300px).
  const virt = useVirtualizer({
    count: virtualize ? tableRows.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 44,
    overscan: 8,
  });

  // Padding-spacer approach: two sentinel <tr> rows bookend the virtual items.
  // This keeps <tbody> as a normal table-row-group (no display:block/flex tricks)
  // so the browser layout engine never loops measuring unstable heights.
  const virtItems = virtualize ? virt.getVirtualItems() : null;
  const virtTotalSize = virtualize ? virt.getTotalSize() : 0;
  const paddingTop = virtItems && virtItems.length > 0 ? virtItems[0].start : 0;
  const paddingBottom =
    virtItems && virtItems.length > 0
      ? virtTotalSize - virtItems[virtItems.length - 1].end
      : 0;
  const visibleColCount = table.getVisibleLeafColumns().length;


  const updateFilter = useCallback((key: string, value: string | number) => {
    setFilterState(prev => ({ ...prev, [key]: value }));
  }, []);

  const handleExport = useCallback(() => {
    if (!exportFilename) return;
    exportCSV(tableRows.map(r => r.original), columnDefs, exportFilename);
  }, [tableRows, columnDefs, exportFilename]);

  const handleExportPng = useCallback(() => {
    if (!exportTitle) return;
    const HGB = (window as any).HGB_Export;
    if (!HGB?.downloadTablePng) {
      console.warn('HGB_Export not loaded — add <script src="/js/table-export.js"> to the page.');
      return;
    }
    const visibleCols = table.getVisibleLeafColumns();
    // Pre-format rows as plain string objects keyed by column id
    const rows = tableRows.map(row =>
      Object.fromEntries(
        visibleCols.map(col => {
          const def = columnDefs.find(c => c.id === col.id);
          if (!def) return [col.id, ''];
          const val = def.accessor(row.original);
          const text = def.exportText
            ? def.exportText(val, row.original)
            : val != null ? String(val) : '—';
          return [def.id, text];
        })
      )
    );
    const columns = visibleCols.map(col => {
      const def = columnDefs.find(c => c.id === col.id);
      if (!def) return null;
      const isFirst = def.id === columnDefs[0]?.id;
      return {
        label: def.header,
        key: def.id,
        width: def.width ?? 80,
        align: def.align ?? (isFirst ? 'left' : 'center'),
        fontFamily: isFirst ? 'body' : 'mono',
      };
    }).filter(Boolean);

    HGB.downloadTablePng({
      title: exportTitle,
      filterChips: exportChips,
      rows,
      columns,
      filename: (exportFilename ?? exportTitle).replace(/\.[^.]+$/, '').replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '.png',
    });
  }, [table, tableRows, columnDefs, exportTitle, exportChips, exportFilename]);

  const toggleColumn = useCallback((id: string) => {
    setUserVisibility(prev => ({ ...prev, [id]: !(prev[id] ?? true) }));
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ ...BODY, color: INK }}>

      {/* Toolbar */}
      {!hideToolbar && <div
        style={{
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
          alignItems: 'center',
          marginBottom: 12,
          padding: '10px 0',
          borderBottom: '1px solid rgba(13,13,20,0.1)',
        }}
      >
        {/* Global search */}
        {globalSearchField && (
          <SearchInput
            value={searchInput}
            onChange={setSearchInput}
            placeholder={searchPlaceholder}
            isMobile={isMobile}
          />
        )}

        {/* Declarative filters */}
        {filters.map((f, i) => {
          const key = `filter_${i}`;
          if (f.type === 'search') {
            return (
              <SearchInput
                key={key}
                value={String(filterState[key] ?? '')}
                onChange={v => updateFilter(key, v)}
                placeholder={f.placeholder}
                isMobile={isMobile}
              />
            );
          }
          if (f.type === 'chips') {
            return (
              <ChipGroup
                key={key}
                label={f.label}
                options={f.options}
                value={String(filterState[key] ?? 'all')}
                onChange={v => updateFilter(key, v)}
              />
            );
          }
          if (f.type === 'number-min' && !isMobile) {
            return (
              <NumberMinInput
                key={key}
                label={f.label}
                value={Number(filterState[key] ?? 0)}
                onChange={v => updateFilter(key, v)}
                max={f.max}
              />
            );
          }
          if (f.type === 'select') {
            return (
              <SelectFilter
                key={key}
                label={f.label}
                options={f.options}
                value={String(filterState[key] ?? 'all')}
                onChange={v => updateFilter(key, v)}
              />
            );
          }
          return null;
        })}

        {/* Column toggles for defaultHidden columns */}
        {!isMobile && toggleableColumns.length > 0 && (
          <div style={{ display: 'flex', gap: 4 }}>
            {toggleableColumns.map(col => {
              const visible = effectiveVisibility[col.id] !== false;
              return (
                <button
                  key={col.id}
                  onClick={() => toggleColumn(col.id)}
                  title={visible ? `Hide ${col.header}` : `Show ${col.header}`}
                  style={{
                    ...MONO,
                    fontSize: 10,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    padding: '5px 8px',
                    border: '1px solid rgba(13,13,20,0.2)',
                    background: visible ? 'rgba(13,13,20,0.08)' : 'transparent',
                    color: visible ? INK : MUTED,
                    cursor: 'pointer',
                  }}
                >
                  {col.header}
                </button>
              );
            })}
          </div>
        )}

        {/* Export buttons */}
        {!isMobile && (exportFilename || exportTitle) && (
          <div style={{ display: 'flex', gap: 4 }}>
            {exportFilename && (
              <button onClick={handleExport} style={{ ...MONO, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '5px 10px', border: '1px solid rgba(13,13,20,0.2)', background: 'transparent', color: MUTED, cursor: 'pointer' }}>
                ↓ CSV
              </button>
            )}
            {exportTitle && (
              <button onClick={handleExportPng} style={{ ...MONO, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '5px 10px', border: '1px solid rgba(13,13,20,0.2)', background: 'transparent', color: MUTED, cursor: 'pointer' }}>
                ↓ PNG
              </button>
            )}
          </div>
        )}

        {/* Row count */}
        <span
          style={{
            ...MONO,
            fontSize: 10,
            color: 'rgba(13,13,20,0.32)',
            marginLeft: 'auto',
          }}
        >
          {filteredData.length} rows{!isMobile ? ' · click header to sort' : ''}
        </span>
      </div>}

      {/* Table */}
      <div
        ref={virtualize ? scrollRef : undefined}
        style={{
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
          ...(virtualize
            ? { height: maxHeight ?? 'calc(100vh - 300px)', overflowY: 'auto' }
            : maxHeight
              ? { maxHeight, overflowY: 'auto' }
              : {}),
        }}
      >
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: CELL_FONT_SIZE,
            background: '#fff',
            border: BORDER,
            minWidth: isMobile ? 'unset' : 600,
          }}
        >
          <thead>
            {table.getHeaderGroups().map(hg => (
              <tr
                key={hg.id}
                style={{ borderBottom: '1px solid rgba(13,13,20,0.14)', background: BG }}
              >
                {hg.headers.map(h => {
                  const colDef = columnDefs.find(c => c.id === h.id);
                  const align = colDef?.align ?? (h.id === columnDefs[0]?.id ? 'left' : 'center');
                  const isSorted = h.column.getIsSorted();
                  return (
                    <th
                      key={h.id}
                      aria-sort={isSorted === 'asc' ? 'ascending' : isSorted === 'desc' ? 'descending' : 'none'}
                      onClick={h.column.getToggleSortingHandler()}
                      style={{
                        ...MONO,
                        fontSize: 11,
                        letterSpacing: '0.12em',
                        textTransform: 'uppercase',
                        color: isSorted ? INK : MUTED,
                        fontWeight: isSorted ? 700 : 500,
                        padding: isMobile ? '8px 8px' : '8px 10px',
                        textAlign: align,
                        cursor: 'pointer',
                        userSelect: 'none',
                        whiteSpace: 'nowrap',
                        position: 'sticky',
                        top: 0,
                        background: BG,
                        zIndex: 2,
                        ...(colDef?.width ? { width: colDef.width } : {}),
                      }}
                    >
                      {flexRender(h.column.columnDef.header, h.getContext())}
                      {isSorted === 'asc' ? ' ↑' : isSorted === 'desc' ? ' ↓' : ''}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {tableRows.length === 0 ? (
              <tr>
                <td
                  colSpan={visibleColCount}
                  style={{ ...MONO, fontSize: 11, color: MUTED, textAlign: 'center', padding: '32px 16px' }}
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : virtItems ? (
              // ── Virtual rows — padding-spacer approach.
              // <tbody> stays as a normal table-row-group (no display:block/flex).
              // Two sentinel <tr> elements create space above and below the visible window.
              // This avoids the measurement loop that occurs when tbody height changes
              // cause scroll events which re-trigger the virtualizer.
              <>
                {paddingTop > 0 && (
                  <tr aria-hidden="true">
                    <td colSpan={visibleColCount} style={{ height: paddingTop, padding: 0, border: 'none' }} />
                  </tr>
                )}
                {virtItems.map(vr => {
                  const row = tableRows[vr.index];
                  const href = rowHref ? rowHref(row.original) : undefined;
                  const bg = vr.index % 2 === 0 ? '#fff' : 'rgba(13,13,20,0.02)';
                  return (
                    <tr
                      key={row.id}
                      style={{
                        height: vr.size,
                        borderBottom: '1px solid rgba(13,13,20,0.05)',
                        background: bg,
                        cursor: href ? 'pointer' : 'default',
                      }}
                      role={href ? 'link' : undefined}
                      tabIndex={href ? 0 : undefined}
                      onClick={href ? () => { window.location.href = href; } : undefined}
                      onKeyDown={href ? e => { if (e.key === 'Enter' || e.key === ' ') window.location.href = href; } : undefined}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(13,13,20,0.04)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = bg; }}
                    >
                      {row.getVisibleCells().map(cell => {
                        const colDef = columnDefs.find(c => c.id === cell.column.id);
                        const isFirst = cell.column.id === columnDefs[0]?.id;
                        const align = colDef?.align ?? (isFirst ? 'left' : 'center');
                        return (
                          <td key={cell.id} style={{ ...MONO, fontSize: isMobile ? CELL_FONT_SIZE + 1 : CELL_FONT_SIZE, padding: isMobile ? '10px 8px' : '10px 10px', textAlign: align, color: isFirst ? INK : 'rgba(13,13,20,0.72)', whiteSpace: 'nowrap', borderRight: '1px solid rgba(13,13,20,0.03)' }}>
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
                {paddingBottom > 0 && (
                  <tr aria-hidden="true">
                    <td colSpan={visibleColCount} style={{ height: paddingBottom, padding: 0, border: 'none' }} />
                  </tr>
                )}
              </>
            ) : (
              // ── Normal rows ────────────────────────────────────────────────
              tableRows.map((row, i) => {
                const href = rowHref ? rowHref(row.original) : undefined;
                const bg = i % 2 === 0 ? '#fff' : 'rgba(13,13,20,0.02)';
                const rowStyle: React.CSSProperties = {
                  borderBottom: '1px solid rgba(13,13,20,0.05)',
                  background: bg,
                  cursor: href ? 'pointer' : 'default',
                };
                return (
                  <tr
                    key={row.id}
                    style={rowStyle}
                    role={href ? 'link' : undefined}
                    tabIndex={href ? 0 : undefined}
                    onClick={href ? () => { window.location.href = href; } : undefined}
                    onKeyDown={href ? e => { if (e.key === 'Enter' || e.key === ' ') window.location.href = href; } : undefined}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(13,13,20,0.04)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = bg; }}
                  >
                    {row.getVisibleCells().map(cell => {
                      const colDef = columnDefs.find(c => c.id === cell.column.id);
                      const isFirst = cell.column.id === columnDefs[0]?.id;
                      const align = colDef?.align ?? (isFirst ? 'left' : 'center');
                      return (
                        <td key={cell.id} style={{ ...MONO, fontSize: isMobile ? CELL_FONT_SIZE + 1 : CELL_FONT_SIZE, padding: isMobile ? '10px 8px' : '10px 10px', textAlign: align, color: isFirst ? INK : 'rgba(13,13,20,0.72)', whiteSpace: 'nowrap', borderRight: '1px solid rgba(13,13,20,0.03)' }}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile hint */}
      {isMobile && (
        <p
          style={{
            ...MONO,
            fontSize: 9,
            color: 'rgba(13,13,20,0.32)',
            marginTop: 6,
            letterSpacing: '0.06em',
          }}
        >
          Tap a column header to sort · swipe to scroll
        </p>
      )}
    </div>
  );
}
