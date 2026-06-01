/**
 * HGBTable — Generic TanStack Table wrapper for HGB design system.
 *
 * Supports: sorting, global search, declarative filters (search/chips/number-min/select),
 * mobile column hiding, column toggles, row-click navigation, CSV export, empty states.
 *
 * NO color scaling — that's a separate concern kept in per-page components.
 */

import React, { useState, useMemo, useEffect, useCallback } from 'react';
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
  sortType?: 'number' | 'string';
  align?: 'left' | 'right' | 'center';
  width?: number;
  mobileHidden?: boolean;
  defaultHidden?: boolean;
};

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
  maxHeight?: number;
  emptyMessage?: string;
};

// ── Style constants ──────────────────────────────────────────────────────────

const MONO: React.CSSProperties = { fontFamily: "'JetBrains Mono', monospace" };
const BODY: React.CSSProperties = { fontFamily: "'Barlow', sans-serif" };
// Standard logo size across all HGB tables. 28px = visible but not dominant.
export const TEAM_LOGO_SIZE = 28;

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

function exportCSV<T>(
  rows: T[],
  columns: HGBColumnDef<T>[],
  filename: string,
) {
  const headers = columns.map(c => c.header).join(',');
  const body = rows.map(row =>
    columns.map(c => {
      const v = c.accessor(row);
      if (v === null || v === undefined) return '';
      const s = String(v);
      return s.includes(',') ? `"${s}"` : s;
    }).join(',')
  ).join('\n');

  const blob = new Blob([`${headers}\n${body}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.csv`;
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
  filters = [],
  rowHref,
  exportFilename,
  maxHeight,
  emptyMessage = 'No results found.',
}: HGBTableProps<T>) {
  const isMobile = useIsMobile();

  // Sorting state
  const [sorting, setSorting] = useState<SortingState>(
    defaultSort ? [{ id: defaultSort.id, desc: defaultSort.desc }] : [],
  );

  // Global search (separate from declarative filters)
  const [globalSearch, setGlobalSearch] = useState('');

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
          : undefined,
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

  const updateFilter = useCallback((key: string, value: string | number) => {
    setFilterState(prev => ({ ...prev, [key]: value }));
  }, []);

  const handleExport = useCallback(() => {
    if (!exportFilename) return;
    exportCSV(filteredData, columnDefs, exportFilename);
  }, [filteredData, columnDefs, exportFilename]);

  const toggleColumn = useCallback((id: string) => {
    setUserVisibility(prev => ({ ...prev, [id]: !(prev[id] ?? true) }));
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ ...BODY, color: INK }}>

      {/* Toolbar */}
      <div
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
            value={globalSearch}
            onChange={setGlobalSearch}
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

        {/* Export button */}
        {exportFilename && !isMobile && (
          <button
            onClick={handleExport}
            style={{
              ...MONO,
              fontSize: 10,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              padding: '5px 10px',
              border: '1px solid rgba(13,13,20,0.2)',
              background: 'transparent',
              color: MUTED,
              cursor: 'pointer',
            }}
          >
            ↓ CSV
          </button>
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
      </div>

      {/* Table */}
      <div
        style={{
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
          ...(maxHeight ? { maxHeight, overflowY: 'auto' } : {}),
        }}
      >
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: 12,
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
                  const align = colDef?.align ?? (h.id === columnDefs[0]?.id ? 'left' : 'right');
                  const isSorted = h.column.getIsSorted();
                  return (
                    <th
                      key={h.id}
                      onClick={h.column.getToggleSortingHandler()}
                      style={{
                        ...MONO,
                        fontSize: 9,
                        letterSpacing: '0.16em',
                        textTransform: 'uppercase',
                        color: isSorted ? INK : MUTED,
                        fontWeight: isSorted ? 700 : 400,
                        padding: isMobile ? '8px 8px' : '8px 10px',
                        textAlign: align,
                        cursor: 'pointer',
                        userSelect: 'none',
                        whiteSpace: 'nowrap',
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
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td
                  colSpan={table.getVisibleLeafColumns().length}
                  style={{
                    ...MONO,
                    fontSize: 11,
                    color: MUTED,
                    textAlign: 'center',
                    padding: '32px 16px',
                  }}
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row, i) => {
                const href = rowHref ? rowHref(row.original) : undefined;
                const rowStyle: React.CSSProperties = {
                  borderBottom: '1px solid rgba(13,13,20,0.05)',
                  background: i % 2 === 0 ? '#fff' : 'rgba(13,13,20,0.02)',
                  cursor: href ? 'pointer' : 'default',
                };

                const cells = row.getVisibleCells().map(cell => {
                  const colDef = columnDefs.find(c => c.id === cell.column.id);
                  const isFirst = cell.column.id === columnDefs[0]?.id;
                  const align = colDef?.align ?? (isFirst ? 'left' : 'right');
                  return (
                    <td
                      key={cell.id}
                      style={{
                        ...MONO,
                        fontSize: isMobile ? 12 : 11,
                        padding: isMobile ? '8px 8px' : '7px 10px',
                        textAlign: align,
                        color: isFirst ? INK : 'rgba(13,13,20,0.72)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  );
                });

                if (href) {
                  return (
                    <tr
                      key={row.id}
                      style={rowStyle}
                      onClick={() => { window.location.href = href; }}
                      onMouseEnter={e => {
                        (e.currentTarget as HTMLElement).style.background = 'rgba(13,13,20,0.04)';
                      }}
                      onMouseLeave={e => {
                        (e.currentTarget as HTMLElement).style.background =
                          i % 2 === 0 ? '#fff' : 'rgba(13,13,20,0.02)';
                      }}
                    >
                      {cells}
                    </tr>
                  );
                }

                return (
                  <tr
                    key={row.id}
                    style={rowStyle}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLElement).style.background = 'rgba(13,13,20,0.04)';
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLElement).style.background =
                        i % 2 === 0 ? '#fff' : 'rgba(13,13,20,0.02)';
                    }}
                  >
                    {cells}
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
