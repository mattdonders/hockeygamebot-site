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

import type { TierStatId } from '../components/react/puck-passport-badges';
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

// The Puck Passport public identity lives on the users row: `handle` is the
// public @name (auto-assigned at signup, so non-null for real logins) and
// `is_public` is the public-passport opt-in.
export type Me = {
  id: string;
  email: string;
  handle: string | null;
  is_public: boolean;
};

/** GET /v1/auth/me — returns { user }, or null on 401/error. */
export async function getMe(): Promise<{ user: Me } | null> {
  try {
    const r = await apiFetch(`${API_BASE}/v1/auth/me`);
    if (!r.ok) return null;
    const data = await r.json();
    if (!data || data.error || !data.user) return null;
    return data as { user: Me };
  } catch {
    return null;
  }
}

// ── Puck Passport public identity (handle + privacy) ────────────────────────────

/** PUT /v1/account/public — set the public-passport opt-in. Returns the new
 *  is_public value on success, or null on error. */
export async function putAccountPublic(isPublic: boolean): Promise<boolean | null> {
  try {
    const r = await apiFetch(`${API_BASE}/v1/account/public`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_public: isPublic }),
    });
    if (!r.ok) return null;
    const data = await r.json();
    if (!data || data.error) return null;
    return !!data.is_public;
  } catch {
    return null;
  }
}

export type HandleAvailability = { available: boolean; reason?: 'format' | 'reserved' };

/** GET /v1/account/handle-available?handle=x — live availability check. */
export async function checkHandleAvailable(handle: string): Promise<HandleAvailability | null> {
  try {
    const r = await apiFetch(
      `${API_BASE}/v1/account/handle-available?handle=${encodeURIComponent(handle)}`,
    );
    if (!r.ok) return null;
    const data = await r.json();
    if (!data) return null;
    return data as HandleAvailability;
  } catch {
    return null;
  }
}

export type PutHandleResult = { ok: boolean; handle?: string; status: number; error?: string };

/** PUT /v1/account/handle — claim/change the handle. Surfaces 400 (bad format /
 *  reserved) and 409 ("handle taken") via `status` so the caller can message the
 *  user. `status: 0` means a network error (no response). */
export async function putHandle(handle: string): Promise<PutHandleResult> {
  try {
    const r = await apiFetch(`${API_BASE}/v1/account/handle`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handle }),
    });
    const data = await r.json().catch(() => ({}) as any);
    if (r.ok && data?.ok) return { ok: true, handle: data.handle, status: r.status };
    return { ok: false, status: r.status, error: data?.error ?? 'Could not update handle' };
  } catch {
    return { ok: false, status: 0, error: 'Network error — try again.' };
  }
}

// ── Public passport projection (GET /v1/passport/:handle) ───────────────────────

export type PassportCounters = {
  games: number;
  periods: number;
  goals: number;
  shots: number;
  players_seen: number;
};
export type PassportBadge = {
  id: string;
  label: string;
  family: string;
  earned: boolean;
  count: number;
  rarity: string;
  rarity_hint: string;
  note?: string;
  total?: number;
};
export type PassportArenas = {
  home_rinks: number;
  total: number;
  distinct_buildings: number;
  teams_seen: number[];
  /** The arena ladder's rung, bucketed from home_rinks (2026-08-02 — this replaced
   *  the 'tier-arenas' chip, which restated this same meter). Optional so a client
   *  running against an older Worker degrades to the bare "N of 32 collected". */
  rung?: number;
  rung_name?: string;
  next_threshold?: number | null;
  next_rung_name?: string | null;
};
export type PassportTeamRecord = { abbrev: string; name: string; w: number; l: number };
export type PublicPassport = {
  handle: string;
  counters: PassportCounters;
  badges: { earned: unknown[]; catalog: PassportBadge[] };
  /** Cumulative stat ladders, server-computed. Optional because a passport served
   *  by a Worker deployed before 2026-08-02 won't carry it — the page renders an
   *  empty tier section rather than fabricating one. */
  tiers?: PassportTier[];
  arenas: PassportArenas;
  team_records: PassportTeamRecord[];
};
/** Mirrors TierBadgeView in puck-passport-badges.ts (the wire shape). `id` reuses
 *  that module's union rather than a bare `string`, so a consumer typed against
 *  TierBadgeView accepts this directly instead of needing a cast. */
export type PassportTier = {
  id: TierStatId;
  label: string;
  family: 'tier';
  earned: boolean;
  maxed: boolean;
  rung: number;
  rung_name: string;
  value: number;
  next_threshold: number | null;
  next_rung_name: string | null;
  progress: string;
  fraction: number;
};

/** GET /v1/passport/:handle (public, no auth). Returns the projection, or null
 *  on 404 (unknown OR private — deliberately indistinguishable) / error. */
export async function getPassport(handle: string): Promise<PublicPassport | null> {
  try {
    const r = await fetch(`${API_BASE}/v1/passport/${encodeURIComponent(handle)}`);
    if (!r.ok) return null;
    const data = await r.json();
    if (!data || data.error || !data.handle) return null;
    return data as PublicPassport;
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
