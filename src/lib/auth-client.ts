/**
 * auth-client — shared session + account-prefs client for HGB React islands.
 *
 * Centralizes the auth/fetch layer that was previously copy-pasted across
 * SkatersTable, DashboardPersonalized, and DashboardPlayersTable.
 *
 * Auth model:
 *   - Session token stored in localStorage under `hgb_session`.
 *   - Sent as a Bearer header (Safari ITP compat) AND `credentials: 'include'`
 *     (cookie fallback). Either is sufficient server-side.
 */

export const SESSION_KEY = 'hgb_session';
export const API_BASE = 'https://api.hockeygamebot.com';

const LOCAL_PRESETS_KEY = 'hgb_filter_presets';

// ── Prefs shape ───────────────────────────────────────────────────────────────

export type FilterSnapshot = {
  tab: string;
  fromSeason: string;
  toSeason: string;
  gameType: string;
  pos: string;
  display: string;
  strength: string;
  minGP: number;
  minToi: number;
};

export type FilterPreset = { name: string; filters: FilterSnapshot };

export type Prefs = {
  tracked_teams: string[];
  tracked_players: number[];
  filter_presets: FilterPreset[];
};

// ── Session token ─────────────────────────────────────────────────────────────

export function getSessionToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

export function setSessionToken(token: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SESSION_KEY, token);
  } catch {
    /* localStorage unavailable (private mode, etc.) — ignore */
  }
}

export function clearSessionToken(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

// ── Fetch wrapper ─────────────────────────────────────────────────────────────

/**
 * Wraps fetch with the Bearer Authorization header (when a session token is
 * present) and `credentials: 'include'`. Caller-supplied headers/opts win.
 */
export function apiFetch(url: string, opts: RequestInit = {}): Promise<Response> {
  const token = getSessionToken();
  const headers = new Headers(opts.headers ?? {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(url, { ...opts, headers, credentials: 'include' });
}

// ── Account endpoints ─────────────────────────────────────────────────────────

/** GET /v1/auth/me — returns the user object, or null on 401/error. */
export async function getMe(): Promise<{ id: string; email: string } | null> {
  try {
    const r = await apiFetch(`${API_BASE}/v1/auth/me`);
    if (!r.ok) return null;
    const data = await r.json();
    if (!data || data.error) return null;
    return data as { id: string; email: string };
  } catch {
    return null;
  }
}

// ── Dev-only prefs override ───────────────────────────────────────────────────
// Local dev / screenshot workflow: `?devprefs=1` forces a fixed set of tracked
// teams/players without touching a real account. Gated on import.meta.env.DEV
// so this can never activate in a production build regardless of query string.
const DEV_PREFS: Prefs = {
  tracked_teams: ['NJD', 'SJS'],
  tracked_players: [8484801, 8478460, 8481559, 8480800, 8480002], // Celebrini, Werenski, J. Hughes, Q. Hughes, Hischier
  filter_presets: [],
};

function devPrefsRequested(): boolean {
  if (!import.meta.env.DEV || typeof window === 'undefined') return false;
  try {
    return new URLSearchParams(window.location.search).get('devprefs') === '1';
  } catch {
    return false;
  }
}

/** GET /v1/account/prefs — returns Prefs, or null on 401/error. */
export async function getPrefs(): Promise<Prefs | null> {
  if (devPrefsRequested()) return DEV_PREFS;
  try {
    const r = await apiFetch(`${API_BASE}/v1/account/prefs`);
    if (!r.ok) return null;
    const data = await r.json();
    if (!data || data.error) return null;
    return {
      tracked_teams: data.tracked_teams ?? [],
      tracked_players: data.tracked_players ?? [],
      filter_presets: data.filter_presets ?? [],
    };
  } catch {
    return null;
  }
}

/** PUT /v1/account/prefs — returns the updated Prefs, or null on error. */
export async function putPrefs(body: Partial<Prefs>): Promise<Prefs | null> {
  try {
    const r = await apiFetch(`${API_BASE}/v1/account/prefs`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) return null;
    const data = await r.json();
    if (!data || data.error) return null;
    return {
      tracked_teams: data.tracked_teams ?? [],
      tracked_players: data.tracked_players ?? [],
      filter_presets: data.filter_presets ?? [],
    };
  } catch {
    return null;
  }
}

// ── Local preset migration ────────────────────────────────────────────────────

/**
 * Merges any `hgb_filter_presets` localStorage entries into the user's cloud
 * prefs on login. Idempotent and safe to call with empty localStorage.
 *
 * Logged-in users are cloud-authoritative, so the local copy is always cleared
 * after this runs.
 */
export async function mergeLocalPresets(): Promise<void> {
  if (typeof window === 'undefined') return;

  // 1. No session → nothing to migrate.
  if (!getSessionToken()) return;

  // 2. Read local presets — bail (and clear) if empty/missing.
  let local: FilterPreset[] = [];
  try {
    local = JSON.parse(localStorage.getItem(LOCAL_PRESETS_KEY) ?? '[]');
  } catch {
    local = [];
  }
  if (!Array.isArray(local) || local.length === 0) {
    try {
      localStorage.removeItem(LOCAL_PRESETS_KEY);
    } catch {
      /* ignore */
    }
    return;
  }

  // 3. Fetch cloud prefs — if not logged in (null), leave local intact.
  const prefs = await getPrefs();
  if (!prefs) return;

  // 4. Keep only local presets whose names aren't already in the cloud.
  const cloud = prefs.filter_presets ?? [];
  const cloudNames = new Set(cloud.map((p) => p.name));
  const newFromLocal = local.filter((p) => !cloudNames.has(p.name));

  // 5. Push the merged set (capped at 10) if there's anything new.
  if (newFromLocal.length > 0) {
    await putPrefs({ filter_presets: [...cloud, ...newFromLocal].slice(0, 10) });
  }

  // 6. Always clear the local copy — cloud is authoritative.
  try {
    localStorage.removeItem(LOCAL_PRESETS_KEY);
  } catch {
    /* ignore */
  }
}
