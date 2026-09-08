/**
 * signOutSession() — sign-out must attempt AUTHENTICATED server revocation
 * before it drops the bearer token, and must always finish locally.
 *
 * The bug this pins: the previous /account handler called clearToken() first,
 * so apiFetch() found no token and sent /v1/auth/logout unauthenticated. With
 * the cookie transport unavailable (Safari ITP), the server revoked nothing —
 * the KV session survived AND this user's pending auth_link_states stayed
 * completable after a deliberate sign-out.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MemoryStorage, installFakeWindow, uninstallFakeWindow } from './test-storage';
import { SESSION_KEY, setSessionToken, getSessionToken, signOutSession } from '../auth-client';

let storage: MemoryStorage;

beforeEach(() => {
  storage = installFakeWindow().localStorage;
  // auth-client reads the bare global `localStorage`, not window.localStorage.
  (globalThis as any).localStorage = storage;
});

afterEach(() => {
  delete (globalThis as any).localStorage;
  uninstallFakeWindow();
  vi.restoreAllMocks();
});

describe('signOutSession', () => {
  it('sends the bearer token to /v1/auth/logout, then clears it', async () => {
    setSessionToken('tok-abc');
    const fetchMock = vi.fn(async () => new Response('{"ok":true}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await signOutSession();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.hockeygamebot.com/v1/auth/logout');
    expect(init.method).toBe('POST');
    // The token must still have been in hand AT REQUEST TIME.
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer tok-abc');
    expect(init.credentials).toBe('include');

    expect(result.revoked).toBe(true);
    expect(getSessionToken()).toBeNull();
    expect(storage.getItem(SESSION_KEY)).toBeNull();
  });

  it('reads the token BEFORE the request resolves — clearing happens after', async () => {
    setSessionToken('tok-order');
    let tokenDuringRequest: string | null = 'unset';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        tokenDuringRequest = storage.getItem(SESSION_KEY);
        return new Response('{"ok":true}', { status: 200 });
      }),
    );

    await signOutSession();

    expect(tokenDuringRequest).toBe('tok-order');
    expect(storage.getItem(SESSION_KEY)).toBeNull();
  });

  it('still signs out locally when the network fails (offline)', async () => {
    setSessionToken('tok-offline');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );

    const result = await signOutSession();

    expect(result.revoked).toBe(false);
    expect(getSessionToken()).toBeNull();
  });

  it('still signs out locally when the server rejects the logout', async () => {
    setSessionToken('tok-401');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":"nope"}', { status: 401 })));

    const result = await signOutSession();

    expect(result.revoked).toBe(false);
    expect(getSessionToken()).toBeNull();
  });

  it('omits the header rather than sending "Bearer null" when no token is stored', async () => {
    const fetchMock = vi.fn(async () => new Response('{"ok":true}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await signOutSession();

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(new Headers(init.headers).get('Authorization')).toBeNull();
  });
});
