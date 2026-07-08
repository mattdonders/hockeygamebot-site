/**
 * ProjectionsTable — HGBTable wrapper for the Season Projections mock.
 *
 * Thin wrapper around the canonical HGBTable (per CLAUDE.md "Table System"):
 * HGBTable owns sorting / filtering / CSV+PNG export / toolbar; this wrapper
 * owns the column set, the team cell (canonical light logo via teamLogoSrc at
 * 28px), a conference chips filter, and the per-column heat shading on the
 * odds columns only.
 *
 * Heat ramp: a single-hue NEUTRAL warm-taupe sequential ramp (light → mid),
 * NOT red. Endpoints are the CSS custom properties `--heat-lo` / `--heat-hi`
 * (defined on :root in projections.astro) so the ramp is a one-line retune.
 * The darkest endpoint keeps ~9:1 contrast with ink, so cell text never flips
 * to white (MoneyPuck-style, stays dark-on-light throughout).
 */
import React, { useMemo } from 'react';
import HGBTable, { type HGBColumnDef, TEAM_LOGO_STYLE, teamLogoSrc } from './HGBTable';
import { useIsDark } from './FilterPrimitives';

export type ProjRow = {
  team: string;
  conf: 'E' | 'W';
  division: string;
  gp: number;
  current_points: number;
  proj_points: number;
  playoff_pct: number;
  round2_pct: number;
  conf_final_pct: number;
  final_pct: number;
  cup_pct: number;
  presidents_pct: number;
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

function fmtPct(v: number): string {
  if (v == null || v <= 0) return '—';
  return v >= 1 ? String(Math.round(v)) : v.toFixed(1);
}

// Full team names shown in the Team column. Hardcoded for this mock; source
// from the teams feed if this table ever ships for real.
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

export default function ProjectionsTable({ rows }: { rows: ProjRow[] }) {
  const isDark = useIsDark();

  // Per-column max drives the ramp so the leader in each column reads fully
  // saturated (MoneyPuck-style column normalization).
  const colMax = useMemo(() => {
    const m: Record<string, number> = {};
    for (const o of ODDS) m[o.id] = Math.max(...rows.map((r) => r[o.id] as number), 0.0001);
    return m;
  }, [rows]);

  const columns: HGBColumnDef<ProjRow>[] = useMemo(() => {
    const heatBg = (v: number, id: string) => {
      const pct = Math.max(0, Math.min(100, Math.round((v / colMax[id]) * 100)));
      // color-mix reads the CSS custom properties → retune the ramp in one place.
      return `color-mix(in srgb, var(--heat-hi, #C2B08A) ${pct}%, var(--heat-lo, #F4F1E9))`;
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
        // Full team name (locked). Font matches the /stats/skaters name cell:
        // var(--body) 600 / 14px. Division stays an inline chip, vertically
        // centered via the flex row (align-items: center).
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
        cell: (v) => <strong style={{ color: INK }}>{Number(v).toFixed(1)}</strong>,
        exportText: (v) => Number(v).toFixed(1),
      },
    ];

    // Intermediate rounds stay visible on-page but are trimmed from export.
    const EXPORT_EXCLUDE = new Set(['round2_pct', 'conf_final_pct', 'final_pct']);
    for (const o of ODDS) {
      cols.push({
        id: o.id,
        header: o.header,
        accessor: (r) => r[o.id] as number,
        align: 'center',
        width: 84,
        sortType: 'number',
        exportInclude: !EXPORT_EXCLUDE.has(o.id),
        // Full-bleed shaded cell: negate HGBTable's 10px td padding so the tint
        // fills the whole cell, then re-pad the content.
        cell: (v) => (
          <div style={{ margin: '-10px', padding: '10px', background: heatBg(Number(v), o.id), color: INK, textAlign: 'center' }}>
            {fmtPct(Number(v))}
          </div>
        ),
        exportText: (v) => fmtPct(Number(v)),
      });
    }

    return cols;
  }, [isDark, colMax]);

  return (
    <HGBTable
      data={rows}
      columns={columns}
      defaultSort={{ id: 'proj_points', desc: true }}
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
      exportChips={['2026-27', 'Mock']}
      showRank
      toolbar={{ rowCount: false }}
      emptyMessage="No teams match the current filter."
    />
  );
}
