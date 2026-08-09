/**
 * AdminDashboard — the admin-only Puck Passport analytics view.
 *
 * Auth model (see the analytics-dashboard discussion): the session token lives in
 * localStorage and is sent as a Bearer header, which only browser JS can read — so
 * this is a client island, NOT server-rendered. The REAL security boundary is the
 * API's `isAdminUser` gate on /v1/admin/passport/stats (returns 403 for non-admins);
 * this page renders nothing sensitive until that gated call succeeds.
 *
 * Fire-and-poll: fetches on mount, auto-refreshes every 60s (toggleable), and
 * offers a manual refresh — so it can stay open on a phone during a launch.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE, getSessionToken } from '../../lib/auth-client';

// ── Response shape (mirrors admin.js passportStats) ──────────────────────────────
interface RefCount { ref: string; n: number }
interface HourlyRefCount { hr: string; ref: string; n: number }
interface MethodCount { method: string; n: number }
interface TrendRow { hr: string; visits: number; handle_views: number; signups: number }
interface TopPassport { handle: string; views: number }
interface Stats {
  ok: true;
  generated_at: string;
  users: { total: number; with_handle: number; public: number; new_24h: number; new_7d: number };
  funnel: Record<string, number>;
  signups: { last_1h: number; last_24h: number; last_7d: number; all_time: number; by_method: MethodCount[] };
  channels: { visits_by_ref: RefCount[]; handle_views_by_ref: RefCount[]; visits_by_ref_hourly: HourlyRefCount[] };
  trend_hourly: TrendRow[];
  top_passports: TopPassport[];
}

type State =
  | { kind: 'loading' }
  | { kind: 'no-auth' }
  | { kind: 'forbidden' }
  | { kind: 'error'; message: string }
  | { kind: 'ok'; data: Stats };

const REFRESH_MS = 60_000;
const fmt = (n: number | undefined | null) => (n ?? 0).toLocaleString('en-US');

// ── styles (inline: scoped CSS can't reach a client:only island's DOM) ───────────
const C = {
  wrap: { maxWidth: 1040, margin: '0 auto' } as const,
  // Slim controls bar — the page's .admin-mast owns the title now, so this is just
  // the live-refresh affordances, right-aligned above the KPIs.
  head: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, justifyContent: 'flex-end', marginBottom: 16 } as const,
  meta: { fontSize: 13, color: 'var(--ink-60, #6b6b78)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' } as const,
  btn: { fontFamily: 'inherit', fontSize: 13, fontWeight: 600, padding: '5px 12px', borderRadius: 8, border: '1px solid var(--ink-14, #dcdce2)', background: '#fff', cursor: 'pointer', color: 'inherit' } as const,
  section: { marginTop: 26 } as const,
  label: { fontFamily: '"Barlow Semi Condensed", sans-serif', fontWeight: 700, fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-60, #6b6b78)', marginBottom: 10, display: 'block' } as const,
  kpiRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 } as const,
  card: { background: '#fff', border: '1px solid var(--ink-10, #e6e6ec)', borderRadius: 12, padding: '14px 16px' } as const,
  kpiNum: { fontFamily: '"Barlow Condensed", sans-serif', fontWeight: 900, fontSize: 40, lineHeight: 1 } as const,
  kpiSub: { fontSize: 12, color: 'var(--ink-60, #6b6b78)', marginTop: 4 } as const,
  twoCol: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 } as const,
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14 } as const,
  th: { textAlign: 'left', fontWeight: 700, fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-60, #6b6b78)', padding: '6px 8px', borderBottom: '1px solid var(--ink-10, #e6e6ec)' } as const,
  td: { padding: '6px 8px', borderBottom: '1px solid var(--ink-06, #f0f0f4)' } as const,
  tdNum: { padding: '6px 8px', borderBottom: '1px solid var(--ink-06, #f0f0f4)', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 } as const,
  chip: { display: 'inline-block', background: 'var(--ink-06, #f0f0f4)', borderRadius: 999, padding: '4px 10px', fontSize: 13, marginRight: 8, marginBottom: 8 } as const,
  empty: { fontSize: 13, color: 'var(--ink-40, #9a9aa6)', fontStyle: 'italic', padding: '6px 8px' } as const,
  msg: { textAlign: 'center', padding: '60px 20px', color: 'var(--ink-60, #6b6b78)' } as const,
};

function RefTable({ rows, unit }: { rows: RefCount[]; unit: string }) {
  if (!rows.length) return <div style={C.empty}>No {unit} yet.</div>;
  return (
    <table style={C.table}>
      <thead><tr><th style={C.th}>ref</th><th style={{ ...C.th, textAlign: 'right' }}>{unit}</th></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.ref}><td style={C.td}>{r.ref}</td><td style={C.tdNum}>{fmt(r.n)}</td></tr>
        ))}
      </tbody>
    </table>
  );
}

function HourlyRefTable({ rows }: { rows: HourlyRefCount[] }) {
  if (!rows.length) return <div style={C.empty}>No visits in the last 48h.</div>;
  // Rows already arrive grouped by hour (query orders hr DESC, n DESC) — fold
  // consecutive same-hour rows into one chip row per hour.
  const byHour: { hr: string; refs: RefCount[] }[] = [];
  for (const r of rows) {
    const last = byHour[byHour.length - 1];
    if (last && last.hr === r.hr) last.refs.push({ ref: r.ref, n: r.n });
    else byHour.push({ hr: r.hr, refs: [{ ref: r.ref, n: r.n }] });
  }
  return (
    <div>
      {byHour.map((h) => (
        <div key={h.hr} style={{ padding: '6px 8px', borderBottom: '1px solid var(--ink-06, #f0f0f4)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{h.hr}</div>
          {h.refs.map((r) => (
            <span key={r.ref} style={{ ...C.chip, marginRight: 6, marginBottom: 4 }}>
              {r.ref}: <strong>{fmt(r.n)}</strong>
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

export default function AdminDashboard() {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [auto, setAuto] = useState(true);
  const timer = useRef<number | null>(null);

  const load = useCallback(async (soft: boolean) => {
    const token = getSessionToken();
    if (!token) { setState({ kind: 'no-auth' }); return; }
    if (!soft) setState({ kind: 'loading' });
    try {
      // Bearer-only — see Nav.astro: the /v1/admin/* preflight rejects credentialed
      // requests, so apiFetch (credentials:'include') would fail CORS. Token auth
      // needs no cookie anyway.
      const r = await fetch(`${API_BASE}/v1/admin/passport/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (r.status === 401) { setState({ kind: 'no-auth' }); return; }
      if (r.status === 403) { setState({ kind: 'forbidden' }); return; }
      if (!r.ok) { setState({ kind: 'error', message: `HTTP ${r.status}` }); return; }
      const data = (await r.json()) as Stats;
      if (!data?.ok) { setState({ kind: 'error', message: 'stats payload not ok' }); return; }
      setState({ kind: 'ok', data });
    } catch (e) {
      setState({ kind: 'error', message: e instanceof Error ? e.message : 'network error' });
    }
  }, []);

  useEffect(() => { load(false); }, [load]);

  // Auto-refresh loop (soft: don't flash the loading state on each tick).
  useEffect(() => {
    if (!auto) { if (timer.current) window.clearInterval(timer.current); return; }
    timer.current = window.setInterval(() => load(true), REFRESH_MS);
    return () => { if (timer.current) window.clearInterval(timer.current); };
  }, [auto, load]);

  if (state.kind === 'loading') return <div style={C.msg}>Loading analytics…</div>;
  if (state.kind === 'no-auth')
    return (
      <div style={C.msg}>
        <p>You need to be signed in as an admin.</p>
        <p><a style={C.btn} href={`${API_BASE}/v1/auth/google?from=${encodeURIComponent(typeof window !== 'undefined' ? window.location.origin : '')}`}>Continue with Google →</a></p>
      </div>
    );
  if (state.kind === 'forbidden') return <div style={C.msg}>This account isn’t an admin.</div>;
  if (state.kind === 'error')
    return (
      <div style={C.msg}>
        <p>Couldn’t load analytics: {state.message}</p>
        <button style={C.btn} onClick={() => load(false)}>Retry</button>
      </div>
    );

  const d = state.data;
  const when = new Date(d.generated_at).toLocaleTimeString('en-US');
  const funnelOrder = ['visit', 'handle_view', 'signup', 'game_logged', 'made_public', 'share_click', 'card_render'];
  const funnelRows = funnelOrder.filter((k) => k in d.funnel).map((k) => ({ k, n: d.funnel[k] }));

  return (
    <div style={C.wrap}>
      <div style={C.head}>
        <div style={C.meta}>
          <span>as of {when}</span>
          <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> auto (60s)
          </label>
          <button style={C.btn} onClick={() => load(false)}>↻ Refresh</button>
        </div>
      </div>

      {/* KPIs — users are ground truth (the users table, not the events funnel) */}
      <div style={C.kpiRow}>
        <div style={C.card}><div style={C.kpiNum}>{fmt(d.users.total)}</div><div style={C.kpiSub}>total users</div></div>
        <div style={C.card}><div style={C.kpiNum}>+{fmt(d.users.new_24h)}</div><div style={C.kpiSub}>new · last 24h</div></div>
        <div style={C.card}><div style={C.kpiNum}>{fmt(d.users.public)}</div><div style={C.kpiSub}>public passports</div></div>
        <div style={C.card}><div style={C.kpiNum}>{fmt(d.users.with_handle)}</div><div style={C.kpiSub}>claimed a handle</div></div>
      </div>

      {/* Channel attribution — the launch metric */}
      <div style={C.section}>
        <span style={C.label}>Channel attribution (?ref)</span>
        <div style={C.twoCol}>
          <div style={C.card}>
            <div style={{ ...C.kpiSub, marginBottom: 8, fontWeight: 700 }}>Tracker landings — /puck-passport?ref=</div>
            <RefTable rows={d.channels.visits_by_ref} unit="visits" />
          </div>
          <div style={C.card}>
            <div style={{ ...C.kpiSub, marginBottom: 8, fontWeight: 700 }}>Visits by channel — last 48h, hourly</div>
            <HourlyRefTable rows={d.channels.visits_by_ref_hourly} />
          </div>
        </div>
      </div>

      {/* Signups */}
      <div style={C.section}>
        <span style={C.label}>Signups</span>
        <div style={C.kpiRow}>
          <div style={C.card}><div style={C.kpiNum}>{fmt(d.signups.last_1h)}</div><div style={C.kpiSub}>last 1h</div></div>
          <div style={C.card}><div style={C.kpiNum}>{fmt(d.signups.last_24h)}</div><div style={C.kpiSub}>last 24h</div></div>
          <div style={C.card}><div style={C.kpiNum}>{fmt(d.signups.last_7d)}</div><div style={C.kpiSub}>last 7d</div></div>
          <div style={C.card}><div style={C.kpiNum}>{fmt(d.signups.all_time)}</div><div style={C.kpiSub}>tracked all-time*</div></div>
        </div>
        <div style={{ marginTop: 10 }}>
          {d.signups.by_method.length
            ? d.signups.by_method.map((m) => <span key={m.method} style={C.chip}>{m.method}: <strong>{fmt(m.n)}</strong></span>)
            : <span style={C.empty}>No signup events yet.</span>}
        </div>
        <div style={{ ...C.kpiSub, marginTop: 6 }}>*events-table count; the users KPI above is ground truth (older signups predate the events table).</div>
      </div>

      {/* Funnel + top passports FIRST (above the tall hourly table) so the money
          numbers — game_logged etc. — are visible without scrolling, then hourly. */}
      <div style={C.section}>
        <div style={C.twoCol}>
          <div>
            <span style={C.label}>Event funnel (all-time)</span>
            <div style={C.card}>
              <table style={C.table}>
                <tbody>
                  {funnelRows.length
                    ? funnelRows.map((f) => <tr key={f.k}><td style={C.td}>{f.k}</td><td style={C.tdNum}>{fmt(f.n)}</td></tr>)
                    : <tr><td style={C.empty}>No events yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
          <div>
            <span style={C.label}>Most-viewed passports</span>
            <div style={C.card}>
              {d.top_passports.length ? (
                <table style={C.table}>
                  <tbody>
                    {d.top_passports.map((p) => (
                      <tr key={p.handle}>
                        <td style={C.td}><a href={`/puck-passport/@${p.handle}`} style={{ color: 'inherit' }}>@{p.handle}</a></td>
                        <td style={C.tdNum}>{fmt(p.views)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <div style={C.empty}>No public passport views yet.</div>}
            </div>
          </div>
        </div>
      </div>

      <div style={C.section}>
        <span style={C.label}>Last 48h — hourly</span>
        <div style={C.card}>
          {d.trend_hourly.length ? (
            <table style={C.table}>
              <thead><tr>
                <th style={C.th}>hour (UTC)</th>
                <th style={{ ...C.th, textAlign: 'right' }}>visits</th>
                <th style={{ ...C.th, textAlign: 'right' }}>views</th>
                <th style={{ ...C.th, textAlign: 'right' }}>signups</th>
              </tr></thead>
              <tbody>
                {d.trend_hourly.map((t) => (
                  <tr key={t.hr}>
                    <td style={C.td}>{t.hr}</td>
                    <td style={C.tdNum}>{fmt(t.visits)}</td>
                    <td style={C.tdNum}>{fmt(t.handle_views)}</td>
                    <td style={C.tdNum}>{fmt(t.signups)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <div style={C.empty}>No activity in the last 48h.</div>}
        </div>
      </div>
    </div>
  );
}
