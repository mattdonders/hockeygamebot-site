/* ─────────────────────────────────────────────────────────────────────────
   edge-panel.ts — shared logic for the NHL Edge panel
   ---------------------------------------------------------------------------
   WHY: Both the single-player Edge panel (EdgePanel.astro) and the Edge Compare
   tool (EdgeCompare.tsx) must render IDENTICAL values, colors, and labels. This
   module is the single source of truth for:
     - the percentile → tier color ramp (matches the original inline logic)
     - the four speed/distance stat rows
     - the three shot-danger columns
     - ordinal suffixes ("100th percentile")
   It deliberately holds NO markup — markup is duplicated structurally in the
   two renderers (Astro can't render client-side; React can't be embedded in a
   static Astro card), but every label/number/color flows from here so the two
   can never disagree.
   ───────────────────────────────────────────────────────────────────────── */

export type EdgeData = Record<string, number | null | undefined>;

/** Percentile → tier color. Mirrors edgeTierColor in the legacy player page:
 *  >=75 deep green, >=50 green, >=25 neutral gray, else HGB red. */
export function edgeTierColor(pct: number | null | undefined): string {
  const p = pct ?? 0;
  if (p >= 75) return '#137333';
  if (p >= 50) return '#34a853';
  if (p >= 25) return 'rgba(13,13,20,0.32)';
  return '#E8002D';
}

export function ordinalSuffix(n: number): string {
  const abs = Math.round(n);
  const m10 = abs % 10, m100 = abs % 100;
  if (m100 >= 11 && m100 <= 13) return `${abs}th`;
  if (m10 === 1) return `${abs}st`;
  if (m10 === 2) return `${abs}nd`;
  if (m10 === 3) return `${abs}rd`;
  return `${abs}th`;
}

export type EdgeStatRow = {
  key: string;          // stable id, used for who-wins comparison
  lbl: string;
  val: number | null | undefined;
  unit: string;
  pct: number | null | undefined;
  avg: number | null | undefined;
  avgUnit: string;
  /** Higher value wins the head-to-head. (All current rows: bigger is better.) */
  higherWins: boolean;
};

export function edgeStatRows(e: EdgeData): EdgeStatRow[] {
  return [
    { key: 'speed',    lbl: 'Top Speed',       val: e.speed_max_mph,      unit: 'mph', pct: e.speed_max_pct,      avg: e.speed_max_league_avg_mph,      avgUnit: 'mph', higherWins: true },
    { key: 'distance', lbl: 'Miles Skated',    val: e.distance_mi,        unit: 'mi',  pct: e.distance_pct,        avg: e.distance_league_avg_mi,        avgUnit: 'mi',  higherWins: true },
    { key: 'bursts',   lbl: 'Bursts > 20 mph', val: e.bursts_over_20,     unit: '',    pct: e.bursts_over_20_pct,  avg: e.bursts_over_20_league_avg,     avgUnit: '',    higherWins: true },
    { key: 'shot',     lbl: 'Hardest Shot',    val: e.shot_speed_max_mph, unit: 'mph', pct: e.shot_speed_max_pct,  avg: e.shot_speed_max_league_avg_mph, avgUnit: 'mph', higherWins: true },
  ];
}

export type EdgeShotCol = {
  key: string;
  lbl: string;
  n: number | null | undefined;
  np: number | null | undefined;   // attempts percentile
  sh: number | null | undefined;   // shooting %
  shp: number | null | undefined;  // shooting % percentile
  accent: boolean;
};

export function edgeShotCols(e: EdgeData): EdgeShotCol[] {
  return [
    { key: 'high', lbl: 'High Danger', n: e.shots_high, np: e.shots_high_pct, sh: e.shooting_pct_high, shp: e.shooting_pct_high_pct, accent: true },
    { key: 'mid',  lbl: 'Mid Range',   n: e.shots_mid,  np: e.shots_mid_pct,  sh: e.shooting_pct_mid,  shp: e.shooting_pct_mid_pct,  accent: false },
    { key: 'long', lbl: 'Long Range',  n: e.shots_long, np: e.shots_long_pct, sh: e.shooting_pct_long, shp: e.shooting_pct_long_pct, accent: false },
  ];
}

/** Clamp a raw percentile (0–100) into a CSS bar width. */
export function barWidth(pct: number | null | undefined): number {
  return Math.max(0, Math.min(100, pct ?? 0));
}

/** Zone-time triple, normalized to percentages that sum to 100. */
export function edgeZones(e: EdgeData): { oz: number; nz: number; dz: number; total: number } {
  const oz = e.oz_pct ?? 0, nz = e.nz_pct ?? 0, dz = e.dz_pct ?? 0;
  const total = oz + nz + dz || 1;
  return { oz, nz, dz, total };
}

/** True when there is no usable Edge tracking data at all. */
export function isEdgeEmpty(e: EdgeData | null | undefined): boolean {
  if (!e) return true;
  return edgeStatRows(e).every(r => r.val == null)
    && edgeShotCols(e).every(c => c.n == null)
    && (e.oz_pct == null && e.nz_pct == null && e.dz_pct == null);
}
