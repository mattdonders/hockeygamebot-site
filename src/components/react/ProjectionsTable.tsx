/**
 * ProjectionsTable — HGBTable wrapper for the Season Projections page.
 *
 * Fetches live projections client-side on mount (the site is output:'static',
 * so this mirrors the scoreboard/slate live-fetch pattern) from
 * `${API_BASE}/v1/projections?season=…`. Until that endpoint ships it 404s, so
 * the island renders graceful loading / unavailable states.
 *
 * Thin wrapper around the canonical HGBTable (per CLAUDE.md "Table System"):
 * HGBTable owns sorting / filtering / CSV+PNG export / toolbar; this wrapper
 * owns the column set, the team cell (canonical light logo + full name), a
 * conference chips filter, and the slate heat shading on the odds columns only.
 *
 * Seed phase (`projected:false`): proj_points + all *_pct are null → rendered
 * "—". The API returns teams already ordered (seed_rank asc, or proj_points
 * desc once live); we PRESERVE that order (no defaultSort) so the null-filled
 * seed view isn't scrambled. Columns stay user-sortable.
 */
import React, { useEffect, useMemo, useState } from 'react';
import HGBTable, { type HGBColumnDef, TEAM_LOGO_STYLE, teamLogoSrc } from './HGBTable';
import { useIsDark } from './FilterPrimitives';
import { API_BASE } from '../../lib/auth-client';

export type ProjRow = {
  team: string;
  conf: 'E' | 'W';
  division: string;
  gp: number;
  current_points: number;
  proj_points: number | null;
  playoff_pct: number | null;
  round2_pct: number | null;
  conf_final_pct: number | null;
  final_pct: number | null;
  cup_pct: number | null;
  presidents_pct: number | null;
};

type ProjResponse = {
  season?: string;
  projected?: boolean;
  teams?: ProjRow[];
};

// Odds columns get heat shading; GP / PTS / xPTS stay unshaded.
const ODDS = [
  { id: 'playoff_pct', header: 'Playoff%' },
  { id: 'round2_pct', header: '2nd Rd%' },
  { id: 'conf_final_pct', header: 'Conf F%' },
  { id: 'final_pct', header: 'Final%' },
  { id: 'cup_pct', header: 'Cup%' },
  { id: 'presidents_pct', header: "Pres'%" },
] as const;

// null / sub-0.05 → em dash (never "NaN"/"null"/"0.0").
function fmtPct(v: number | null): string {
  if (v == null || v <= 0) return '—';
  return v >= 1 ? String(Math.round(v)) : v.toFixed(1);
}

// Full team names shown in the Team column. Hardcoded here; the API returns
// only abbreviations, so this is the display source.
const FULL_NAMES: Record<string, string> = {
  ANA: 'Anaheim Ducks', BOS: 'Boston Bruins', BUF: 'Buffalo Sabres', CGY: 'Calgary Flames',
  CAR: 'Carolina Hurricanes', CHI: 'Chicago Blackhawks', COL: 'Colorado Avalanche', CBJ: 'Columbus Blue Jackets',
  DAL: 'Dallas Stars', DET: 'Detroit Red Wings', EDM: 'Edmonton Oilers', FLA: 'Florida Panthers',
  LAK: 'Los Angeles Kings', MIN: 'Minnesota Wild', MTL: 'Montreal Canadiens', NSH: 'Nashville Predators',
  NJD: 'New Jersey Devils', NYI: 'New York Islanders', NYR: 'New York Rangers', OTT: 'Ottawa Senators',
  PHI: 'Philadelphia Flyers', PIT: 'Pittsburgh Penguins', SJS: 'San Jose Sharks', SEA: 'Seattle Kraken',
  STL: 'St. Louis Blues', TBL: 'Tampa Bay Lightning', TOR: 'Toronto Maple Leafs', UTA: 'Utah Mammoth',
  VAN: 'Vancouver Canucks', VGK: 'Vegas Golden Knights', WSH: 'Washington Capitals', WPG: 'Winnipeg Jets',
};

const INK = '#0d0d14';
const CHIP = 'rgba(13,13,20,0.06)';
const MUTED = 'rgba(13,13,20,0.48)';

type LoadState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; teams: ProjRow[]; projected: boolean };

export default function ProjectionsTable({ season = '20262027' }: { season?: string }) {
  const isDark = useIsDark();
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  // Fetch live on mount (cache:'default' lets the CF edge absorb polls).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${API_BASE}/v1/projections?season=${encodeURIComponent(season)}`, { cache: 'default' });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data: ProjResponse = await r.json();
        if (cancelled) return;
        const teams = Array.isArray(data?.teams) ? data.teams : [];
        setState({ status: 'ready', teams, projected: !!data?.projected });
      } catch {
        if (!cancelled) setState({ status: 'error' });
      }
    })();
    return () => { cancelled = true; };
  }, [season]);

  // Toggle the masthead status badge: hide it ONLY once real projected data is
  // confirmed. Loading / error / seed all keep the "Awaiting…" badge visible.
  useEffect(() => {
    const badge = document.getElementById('proj-badge');
    if (badge) badge.style.display = state.status === 'ready' && state.projected ? 'none' : '';
  }, [state]);

  const rows: ProjRow[] = state.status === 'ready' ? state.teams : [];

  // Per-column max drives the ramp so the leader in each column reads fully
  // saturated. Nulls (seed phase) coerce to 0 and don't affect the max.
  const colMax = useMemo(() => {
    const m: Record<string, number> = {};
    for (const o of ODDS) {
      m[o.id] = Math.max(0.0001, ...rows.map((r) => (r[o.id] as number | null) ?? 0));
    }
    return m;
  }, [rows]);

  const columns: HGBColumnDef<ProjRow>[] = useMemo(() => {
    const heatBg = (v: number | null, id: string) => {
      const pct = Math.max(0, Math.min(100, Math.round(((v ?? 0) / colMax[id]) * 100)));
      // color-mix reads the CSS custom properties → retune the ramp in one place.
      return `color-mix(in srgb, var(--heat-hi, #8FA8C2) ${pct}%, var(--heat-lo, #EEF1F4))`;
    };

    const cols: HGBColumnDef<ProjRow>[] = [
      {
        id: 'team',
        header: 'Team',
        // Full name drives CSV export (which reads accessor), team sort, and the
        // PNG fallback; exportText below makes the PNG explicit. On-page display
        // is the `cell` renderer, unaffected by this.
        accessor: (r) => FULL_NAMES[r.team] ?? r.team,
        align: 'left',
        width: 150,
        sortType: 'string',
        // Full team name @ var(--body) 600 / 14px (matches /stats/skaters).
        // Division stays an inline chip, vertically centered via the flex row.
        cell: (_v, row) => (
          <div className="proj-team" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <img src={teamLogoSrc(row.team, isDark)} width={28} height={28} style={TEAM_LOGO_STYLE} alt="" />
            <span className="proj-team-name" style={{ fontFamily: 'var(--body)', fontWeight: 600, fontSize: 14, color: INK }}>{FULL_NAMES[row.team] ?? row.team}</span>
            <span
              className="proj-div-chip"
              title={row.conf === 'E' ? 'Eastern Conference' : 'Western Conference'}
              style={{
                fontFamily: 'var(--body)', fontWeight: 600, fontSize: 9, letterSpacing: '0.04em',
                textTransform: 'uppercase', color: MUTED, background: CHIP, borderRadius: 4, padding: '2px 5px',
                lineHeight: 1, flexShrink: 0,
              }}
            >
              {row.division}
            </span>
          </div>
        ),
        exportText: (_v, row) => FULL_NAMES[row.team] ?? row.team,
      },
      { id: 'gp', header: 'GP', accessor: (r) => r.gp, align: 'center', width: 54 },
      { id: 'current_points', header: 'PTS', accessor: (r) => r.current_points, align: 'center', width: 62 },
      {
        id: 'proj_points', header: 'xPTS', accessor: (r) => r.proj_points, align: 'center', width: 74,
        cell: (v) => <strong style={{ color: INK }}>{v == null ? '—' : Number(v).toFixed(1)}</strong>,
        exportText: (v) => (v == null ? '—' : Number(v).toFixed(1)),
      },
    ];

    // Intermediate rounds stay visible on-page but are trimmed from export.
    const EXPORT_EXCLUDE = new Set(['round2_pct', 'conf_final_pct', 'final_pct']);
    for (const o of ODDS) {
      cols.push({
        id: o.id,
        header: o.header,
        accessor: (r) => r[o.id] as number | null,
        align: 'center',
        width: 84,
        sortType: 'number',
        exportInclude: !EXPORT_EXCLUDE.has(o.id),
        // Full-bleed shaded cell: negate HGBTable's 10px td padding so the tint
        // fills the whole cell, then re-pad the content.
        cell: (v) => (
          <div style={{ margin: '-10px', padding: '10px', background: heatBg(v as number | null, o.id), color: INK, textAlign: 'center' }}>
            {fmtPct(v as number | null)}
          </div>
        ),
        exportText: (v) => fmtPct(v as number | null),
      });
    }

    return cols;
  }, [isDark, colMax]);

  if (state.status === 'loading') {
    return <div className="proj-state">Loading projections…</div>;
  }
  if (state.status === 'error') {
    return (
      <div className="proj-state">
        Projections aren’t available yet — check back once the {season.slice(0, 4)}-{season.slice(6)} model goes live.
      </div>
    );
  }
  if (!rows.length) {
    return <div className="proj-state">No projections available yet.</div>;
  }

  return (
    <HGBTable
      data={rows}
      columns={columns}
      /* No defaultSort — preserve the API's returned order (seed_rank asc, or
         proj_points desc once live). Columns remain user-sortable. */
      filters={[
        {
          type: 'chips',
          label: 'Conference',
          options: [
            { label: 'East', value: 'E' },
            { label: 'West', value: 'W' },
          ],
          field: (r: ProjRow) => r.conf,
        },
      ]}
      exportFilename="hgb-projections"
      exportTitle="Season Projections"
      exportChips={[state.projected ? '2026-27' : '2026-27 · Seed']}
      showRank
      toolbar={{ rowCount: false }}
      emptyMessage="No teams match the current filter."
    />
  );
}
