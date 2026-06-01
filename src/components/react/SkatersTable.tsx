import React, { useState, useEffect, useMemo } from 'react';
import HGBTable, { type HGBColumnDef, TEAM_LOGO_SIZE, TEAM_LOGO_STYLE, teamLogoSrc, NAME_FONT_SIZE } from './HGBTable';
import { fmtSeasonShort } from '../../lib/format-season';

// ── Row type (mirrors skaters.astro tableRows) ────────────────────────────────
export type SkaterRow = {
  slug: string; name: string; first_name: string; last_name: string; searchText: string; team: string; season?: string;
  pos: string; group: 'F' | 'D'; gp: number;
  // Counting
  goals: number; assists: number; points: number; sog: number; ixg: number; toi_pg: number;
  // Rates
  g60: number; a60: number; p60: number; x60: number; sog60: number;
  // Advanced
  war: number | null; war_p: number; fin: number; fin_p: number; imp: number; imp_p: number; rapm: number | null;
  // On-ice 5v5
  xgf_pct: number; xgf60: number; xga60: number; sc60: number; hdc60: number;
  // Strength splits
  goals_ev: number; goals_pp: number; goals_sh: number;
  a_ev: number; a_pp: number; a_pk: number;
  shots_ev: number; shots_pp: number; shots_pk: number;
  ixg_ev: number; ixg_pp: number; ixg_pk: number;
  toi_ev_sec: number; toi_pp_sec: number; toi_pk_sec: number;
  // Playoff
  po_gp: number | null; po_goals: number | null; po_assists: number | null;
  po_points: number | null; po_sog: number | null; po_ixg: number | null; po_toi_pg: number | null;
};

type Tab      = 'counting' | 'rates' | 'advanced' | 'onice';
type GameType = 'regular'  | 'playoffs';
type Pos      = 'all' | 'F' | 'D';
type Strength = 'all' | '5v5' | 'pp' | 'pk';
type Display  = 'totals'   | 'per60';

type Props = { rows: SkaterRow[]; statsDate: string | null; currentSeason: string; isPlayoffSeason?: boolean };

const MONO: React.CSSProperties = { fontFamily: "'JetBrains Mono', monospace" };
const POS  = '#166534'; const NEG = '#991b1b';
const sgn = (v: number) => v >= 0 ? '+' : '';
const f2  = (v: number | null) => v != null ? Number(v).toFixed(2) : '—';
const f3  = (v: number | null) => v != null ? Number(v).toFixed(3) : '—';

function getStrengthStats(r: SkaterRow, mode: Strength) {
  if (mode === 'all') return { g: r.goals, a: r.assists, sog: r.sog, ixg: r.ixg, toi_pg: r.toi_pg, toi_sec: 0 };
  const gp = r.gp || 1;
  if (mode === '5v5') return { g: r.goals_ev, a: r.a_ev,  sog: r.shots_ev, ixg: r.ixg_ev, toi_pg: r.toi_ev_sec / gp / 60, toi_sec: r.toi_ev_sec };
  if (mode === 'pp')  return { g: r.goals_pp, a: r.a_pp,  sog: r.shots_pp, ixg: r.ixg_pp, toi_pg: r.toi_pp_sec / gp / 60, toi_sec: r.toi_pp_sec };
  return                     { g: r.goals_sh, a: r.a_pk,  sog: r.shots_pk, ixg: r.ixg_pk, toi_pg: r.toi_pk_sec / gp / 60, toi_sec: r.toi_pk_sec };
}

function getStrengthValue(r: SkaterRow, key: string, st: ReturnType<typeof getStrengthStats>, hr: number) {
  switch (key) {
    case 'goals':  return st.g;
    case 'assists': return st.a;
    case 'points':  return st.g + st.a;
    case 'sog':     return st.sog;
    case 'ixg':     return st.ixg;
    case 'toi_pg':  return st.toi_pg;
    case 'g60':     return hr > 0 ? st.g   / hr : 0;
    case 'a60':     return hr > 0 ? st.a   / hr : 0;
    case 'p60':     return hr > 0 ? (st.g + st.a) / hr : 0;
    case 'sog60':   return hr > 0 ? st.sog / hr : 0;
    case 'x60':     return hr > 0 ? st.ixg / hr : 0;
    default:        return (r as any)[key];
  }
}

function buildColumns(
  tab: Tab, gameType: GameType, strength: Strength, display: Display, isDark: boolean, currentSeason: string
): HGBColumnDef<SkaterRow>[] {
  const isPlayoff = gameType === 'playoffs';
  const isPer60   = display === 'per60';
  const prefix    = strength === '5v5' ? 'EV ' : strength === 'pp' ? 'PP ' : strength === 'pk' ? 'SH ' : '';

  // Fixed columns
  const fixed: HGBColumnDef<SkaterRow>[] = [
    {
      id: 'name', header: 'Player', accessor: r => r.name, align: 'left', width: 190,
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
      exportText: (_v, row) => row.first_name && row.last_name ? `${row.first_name} ${row.last_name}` : row.name,
      sortType: 'string',
    },
    { id: 'season', header: 'Season', accessor: r => r.season ?? currentSeason, width: 68, mobileHidden: true,
      cell: v => fmtSeasonShort(v as string), exportText: v => fmtSeasonShort(String(v ?? '')) },
    { id: 'team', header: 'Team', accessor: r => r.team, width: 52 },
    { id: 'pos',  header: 'Pos',  accessor: r => r.pos,  width: 44 },
    { id: 'gp', header: isPlayoff ? 'PO GP' : 'GP', accessor: r => isPlayoff ? r.po_gp : r.gp, width: 48, cell: v => v != null ? String(v) : '—' },
  ];

  // Tab-specific columns
  let tabCols: HGBColumnDef<SkaterRow>[] = [];

  if (tab === 'counting') {
    const countingKeys = isPer60 && !isPlayoff
      ? [
          { key: 'g60',   label: prefix + 'G/60',   fmt: f2 },
          { key: 'a60',   label: prefix + 'A/60',   fmt: f2 },
          { key: 'p60',   label: prefix + 'P/60',   fmt: f2, bold: true },
          { key: 'sog60', label: prefix + 'SOG/60', fmt: f2 },
          { key: 'x60',   label: prefix + 'ixG/60', fmt: f2 },
          { key: 'toi_pg',label: 'TOI/G',            fmt: f2 },
        ]
      : [
          { key: 'goals',   label: prefix + (isPlayoff ? 'PO G'   : 'G'),   fmt: (v: any) => String(v ?? '—') },
          { key: 'assists', label: prefix + (isPlayoff ? 'PO A'   : 'A'),   fmt: (v: any) => String(v ?? '—') },
          { key: 'points',  label: prefix + (isPlayoff ? 'PO P'   : 'P'),   fmt: (v: any) => String(v ?? '—'), bold: true },
          { key: 'sog',     label: prefix + (isPlayoff ? 'PO SOG' : 'SOG'), fmt: (v: any) => String(v ?? '—') },
          { key: 'ixg',     label: prefix + (isPlayoff ? 'PO ixG' : 'ixG'), fmt: f2 },
          { key: 'toi_pg',  label: 'TOI/G',                                  fmt: (v: any) => v != null ? Number(v).toFixed(1) : '—' },
        ];

    tabCols = countingKeys.map(({ key, label, fmt, bold }) => ({
      id: key,
      header: label,
      width: 60,
      exportText: (v: any) => v != null ? fmt(v) : '—',
      accessor: (r: SkaterRow) => {
        const poMap: Record<string, keyof SkaterRow> = { goals: 'po_goals', assists: 'po_assists', points: 'po_points', sog: 'po_sog', ixg: 'po_ixg', toi_pg: 'po_toi_pg' };
        if (isPlayoff && poMap[key]) return (r as any)[poMap[key]] ?? null;
        if (strength !== 'all' && !isPer60) {
          const st = getStrengthStats(r, strength);
          return getStrengthValue(r, key, st, st.toi_sec / 3600);
        }
        if (strength !== 'all' && isPer60) {
          const st = getStrengthStats(r, strength);
          const hr = st.toi_sec / 3600;
          return getStrengthValue(r, key, st, hr);
        }
        return (r as any)[key];
      },
      cell: (v: any) => bold
        ? <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{v != null ? fmt(v) : '—'}</strong>
        : <span style={{ fontVariantNumeric: 'tabular-nums' }}>{v != null ? fmt(v) : '—'}</span>,
    }));
  }

  else if (tab === 'rates') {
    tabCols = [
      { id: 'g60',  header: 'G/60',   accessor: r => r.g60,  width: 64, cell: v => f2(v as any), exportText: v => f2(v as any) },
      { id: 'a60',  header: 'A/60',   accessor: r => r.a60,  width: 64, cell: v => f2(v as any), exportText: v => f2(v as any) },
      { id: 'p60',  header: 'P/60',   accessor: r => r.p60,  width: 64, cell: v => <strong>{f2(v as any)}</strong>, exportText: v => f2(v as any) },
      { id: 'x60',  header: 'ixG/60', accessor: r => r.x60,  width: 64, cell: v => f2(v as any), exportText: v => f2(v as any) },
      { id: 'toi_pg', header: 'TOI/G', accessor: r => r.toi_pg, width: 60, cell: v => v != null ? Number(v).toFixed(1) : '—', exportText: v => v != null ? Number(v).toFixed(1) : '—' },
    ];
  }

  else if (tab === 'advanced') {
    tabCols = [
      {
        id: 'imp', header: 'Impact', accessor: r => r.imp, width: 80,
        cell: (v, r) => (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.2 }}>
            <strong style={{ color: (v as number) >= 0 ? POS : NEG }}>{sgn(v as number)}{f2(v as any)}</strong>
            <span style={{ ...MONO, fontSize: 9, color: 'rgba(13,13,20,0.4)' }}>{r.imp_p}th</span>
          </div>
        ),
        exportText: v => v != null ? `${sgn(v as number)}${f2(v as any)}` : '—',
      },
      {
        id: 'war', header: 'WAR', accessor: r => r.war, width: 80,
        cell: (v, r) => v != null
          ? <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.2 }}>
              <strong style={{ color: (v as number) >= 0 ? POS : NEG }}>{sgn(v as number)}{f2(v as any)}</strong>
              <span style={{ ...MONO, fontSize: 9, color: 'rgba(13,13,20,0.4)' }}>{r.war_p}th</span>
            </div>
          : <span style={{ color: 'rgba(13,13,20,0.3)' }}>—</span>,
        exportText: v => v != null ? `${sgn(v as number)}${f2(v as any)}` : '—',
      },
      {
        id: 'fin', header: 'Finishing', accessor: r => r.fin, width: 80,
        cell: (v, r) => (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.2 }}>
            <span style={{ color: (v as number) >= 0 ? POS : NEG }}>{sgn(v as number)}{f2(v as any)}</span>
            <span style={{ ...MONO, fontSize: 9, color: 'rgba(13,13,20,0.4)' }}>{r.fin_p}th</span>
          </div>
        ),
        exportText: v => v != null ? `${sgn(v as number)}${f2(v as any)}` : '—',
      },
      { id: 'rapm', header: 'RAPM/60', accessor: r => r.rapm, width: 80,
        cell: v => v != null ? <span style={{ color: (v as number) >= 0 ? POS : NEG }}>{sgn(v as number)}{f3(v as any)}</span> : '—',
        exportText: v => v != null ? `${sgn(v as number)}${f3(v as any)}` : '—' },
    ];
  }

  else if (tab === 'onice') {
    tabCols = [
      {
        id: 'xgf_pct', header: 'xGF%', accessor: r => r.xgf_pct, width: 72,
        cell: v => {
          const n = v as number;
          const col = n >= 55 ? POS : n <= 45 ? NEG : undefined;
          return <strong style={{ color: col }}>{n.toFixed(1)}%</strong>;
        },
        exportText: v => v != null ? `${(v as number).toFixed(1)}%` : '—',
      },
      { id: 'xgf60', header: 'xGF/60', accessor: r => r.xgf60, width: 72, cell: v => f2(v as any), exportText: v => f2(v as any) },
      { id: 'xga60', header: 'xGA/60', accessor: r => r.xga60, width: 72, cell: v => f2(v as any), exportText: v => f2(v as any) },
      { id: 'sc60',  header: 'SC/60',  accessor: r => r.sc60,  width: 68, cell: v => f2(v as any), exportText: v => f2(v as any), mobileHidden: true },
      { id: 'hdc60', header: 'HDC/60', accessor: r => r.hdc60, width: 68, cell: v => f2(v as any), exportText: v => f2(v as any), mobileHidden: true },
    ];
  }

  return [...fixed, ...tabCols];
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function SkatersTable({ rows, statsDate, currentSeason, isPlayoffSeason = false }: Props) {
  const [tab,      setTab]      = useState<Tab>('counting');
  const [gameType, setGameType] = useState<GameType>(isPlayoffSeason ? 'playoffs' : 'regular');
  const [pos,      setPos]      = useState<Pos>('all');
  const [strength, setStrength] = useState<Strength>('all');
  const [display,  setDisplay]  = useState<Display>('totals');
  const [topN,     setTopN]     = useState<number | null>(null);
  const [minGP,    setMinGP]    = useState(isPlayoffSeason ? 1 : 20);

  // Reset minGP when switching game types
  useEffect(() => {
    setMinGP(gameType === 'playoffs' ? 1 : 20);
  }, [gameType]);
  const [isDark,   setIsDark]   = useState(false);

  useEffect(() => {
    const check = () => setIsDark(document.documentElement.dataset.theme === 'dark');
    check();
    const obs = new MutationObserver(check);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);

  // Derived data
  const defaultSort = useMemo(() => {
    const sortMap: Record<Tab, string> = { counting: gameType === 'playoffs' ? 'po_points' : display === 'per60' ? 'p60' : 'points', rates: 'p60', advanced: 'imp', onice: 'xgf_pct' };
    return { id: sortMap[tab], desc: true };
  }, [tab, gameType, display]);

  const filtered = useMemo(() => {
    const gpField = gameType === 'playoffs' ? 'po_gp' : 'gp';
    let r = rows.filter(x => (x[gpField] ?? 0) >= minGP);
    if (pos !== 'all') r = r.filter(x => x.group === pos);
    if (gameType === 'playoffs') r = r.filter(x => x.po_gp != null && x.po_gp > 0);
    // topN applied after HGBTable sorting via a post-sort slice — but since we
    // can't hook into HGBTable's sort, sort here by the defaultSort column first
    if (topN) {
      const sortId = defaultSort.id;
      r = [...r].sort((a, b) => {
        const av = (a as any)[sortId] ?? -Infinity;
        const bv = (b as any)[sortId] ?? -Infinity;
        return bv - av; // desc
      }).slice(0, topN);
    }
    return r;
  }, [rows, minGP, pos, gameType, topN, defaultSort.id]);

  const columns = useMemo(
    () => buildColumns(tab, gameType, strength, display, isDark, currentSeason),
    [tab, gameType, strength, display, isDark, currentSeason],
  );

  const tabDisabled = (t: Tab) => gameType === 'playoffs' && (t === 'rates' || t === 'advanced' || t === 'onice');
  const strDisabled = (s: Strength) => tab === 'advanced' || tab === 'onice';

  const chip = (active: boolean, label: string, onClick: () => void, disabled = false) => (
    <button onClick={disabled ? undefined : onClick} style={{ ...MONO, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', padding: '5px 12px', border: '1px solid rgba(13,13,20,0.2)', borderRight: 'none', cursor: disabled ? 'not-allowed' : 'pointer', background: active ? '#0d0d14' : 'transparent', color: active ? '#EFEEE8' : disabled ? 'rgba(13,13,20,0.2)' : 'rgba(13,13,20,0.48)', opacity: disabled ? 0.5 : 1 }}>
      {label}
    </button>
  );
  const group = (children: React.ReactNode) => (
    <div style={{ display: 'inline-flex', border: '1px solid rgba(13,13,20,0.2)', borderLeft: 'none' }}>{children}</div>
  );

  return (
    <div>
      {/* Toolbar — Row 1: view tabs + game type */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
        {group(<>
          {(['counting','rates','advanced','onice'] as Tab[]).map(t =>
            chip(tab === t, { counting: 'Counting', rates: 'Rates', advanced: 'Advanced', onice: 'On-Ice 5v5' }[t], () => { setTab(t); }, tabDisabled(t))
          )}
        </>)}
        {group(<>
          {chip(gameType === 'regular',  'Reg Season', () => setGameType('regular'))}
          {chip(gameType === 'playoffs', 'Playoffs',   () => { setGameType('playoffs'); if (tab !== 'counting') setTab('counting'); })}
        </>)}
        <span style={{ ...MONO, fontSize: 10, color: 'rgba(13,13,20,0.32)', marginLeft: 'auto', alignSelf: 'center' }}>
          {filtered.length} skaters{statsDate ? ` · updated ${statsDate}` : ''}
        </span>
      </div>
      {/* Toolbar — Row 2: position, strength, display, min GP, top-N */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        {group(<>
          {chip(pos === 'all', 'All',  () => setPos('all'))}
          {chip(pos === 'F',   'Fwds', () => setPos('F'))}
          {chip(pos === 'D',   'Def',  () => setPos('D'))}
        </>)}
        {group(<>
          {(['all','5v5','pp','pk'] as Strength[]).map(s =>
            chip(strength === s, { all: 'All', '5v5': '5v5', pp: 'PP', pk: 'PK' }[s], () => setStrength(s), strDisabled(s))
          )}
        </>)}
        {group(<>
          {chip(display === 'totals', 'Totals', () => setDisplay('totals'))}
          {chip(display === 'per60',  'Per 60', () => setDisplay('per60'), gameType === 'playoffs')}
        </>)}
        <label style={{ ...MONO, fontSize: 10, color: 'rgba(13,13,20,0.48)', display: 'flex', alignItems: 'center', gap: 6 }}>
          Min GP
          <input type="number" value={minGP} min={0} max={82} onChange={e => setMinGP(Number(e.target.value))}
            style={{ ...MONO, fontSize: 11, width: 44, padding: '4px 6px', border: '1px solid rgba(13,13,20,0.14)', background: 'transparent' }} />
        </label>
        {group(<>
          {([null,10,20,50] as (number|null)[]).map(n =>
            chip(topN === n, n ? `Top ${n}` : 'All', () => setTopN(n))
          )}
        </>)}
      </div>

      <HGBTable
        data={filtered}
        columns={columns}
        defaultSort={defaultSort}
        globalSearchField={r => r.searchText}
        searchPlaceholder="Search players or team…"
        rowHref={r => `/stats/player/${r.slug}`}
        exportFilename="hgb-skaters"
        exportTitle="Skaters"
        exportChips={[
          gameType === 'regular' ? 'Reg Season' : 'Playoffs',
          tab.charAt(0).toUpperCase() + tab.slice(1),
          pos !== 'all' ? (pos === 'F' ? 'Forwards' : 'Defense') : 'All Positions',
          strength !== 'all' ? strength.toUpperCase() : 'All Strengths',
          `Min ${minGP} GP`,
          ...(topN ? [`Top ${topN}`] : []),
        ]}
        emptyMessage="No skaters match the current filters."
        virtualize
      />
    </div>
  );
}
