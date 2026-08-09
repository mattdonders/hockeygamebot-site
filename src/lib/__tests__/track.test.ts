import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { trackEvent } from '../track';

/**
 * 0R.8 contract: `trackEvent` (the SAME beacon helper Tonight's Game reuses for its
 * `tonight_game` events) must NEVER throw and NEVER return something the caller has
 * to await — a blocked/throwing beacon must not be able to interrupt or duplicate an
 * attendance write. These tests install a fake window/navigator whose transports
 * throw synchronously (the worst case a real browser could hand back) and assert the
 * call still returns normally.
 */

const origWindow = (globalThis as any).window;
const origNavigator = (globalThis as any).navigator;
const origFetch = (globalThis as any).fetch;

function installBrowserLike(opts: {
  sendBeacon?: (...args: unknown[]) => boolean;
  hasSendBeacon?: boolean;
  fetchImpl?: (...args: unknown[]) => unknown;
}) {
  (globalThis as any).window = {};
  const nav: Record<string, unknown> = {};
  if (opts.hasSendBeacon !== false) {
    nav.sendBeacon = opts.sendBeacon ?? (() => true);
  }
  // Node 21+ ships a read-only `globalThis.navigator` getter — plain assignment
  // throws. redefine it (configurable, so afterEach can restore the original).
  Object.defineProperty(globalThis, 'navigator', { value: nav, configurable: true, writable: true });
  (globalThis as any).fetch = opts.fetchImpl ?? vi.fn();
}

afterEach(() => {
  (globalThis as any).window = origWindow;
  Object.defineProperty(globalThis, 'navigator', { value: origNavigator, configurable: true, writable: true });
  (globalThis as any).fetch = origFetch;
  vi.restoreAllMocks();
});

describe('trackEvent — fire-and-forget contract', () => {
  it('no-ops under SSR (no window) without throwing', () => {
    delete (globalThis as any).window;
    expect(() => trackEvent('tonight_game', { meta: { action: 'surfaced' } })).not.toThrow();
  });

  it('never throws when navigator.sendBeacon itself throws synchronously', () => {
    installBrowserLike({
      sendBeacon: () => {
        throw new Error('boom');
      },
    });
    expect(() => trackEvent('tonight_game', { meta: { action: 'write_attempted' } })).not.toThrow();
  });

  it('falls back to fetch when sendBeacon returns false, and never throws even if fetch rejects', () => {
    const fetchMock = vi.fn(() => Promise.reject(new Error('network down')));
    installBrowserLike({ sendBeacon: () => false, fetchImpl: fetchMock });

    expect(() => trackEvent('tonight_game', { meta: { action: 'write_failed' } })).not.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('never throws when fetch itself throws synchronously (no sendBeacon available)', () => {
    installBrowserLike({
      hasSendBeacon: false,
      fetchImpl: () => {
        throw new Error('boom');
      },
    });
    expect(() => trackEvent('tonight_game', { meta: { action: 'undo' } })).not.toThrow();
  });

  it('does not return a promise the caller must await', () => {
    installBrowserLike({});
    const result = trackEvent('tonight_game', { meta: { action: 'share' } });
    expect(result).toBeUndefined();
  });

  it('sends the tonight_game event with its action in meta on the happy path', () => {
    const sendBeacon = vi.fn((_url: string, _data: BodyInit) => true);
    installBrowserLike({ sendBeacon });
    trackEvent('tonight_game', { meta: { action: 'candidate_found' } });

    expect(sendBeacon).toHaveBeenCalledTimes(1);
    const [url, blob] = sendBeacon.mock.calls[0];
    expect(url).toContain('/v1/track');
    expect(blob).toBeInstanceOf(Blob);
  });

  // Defect #10 (privacy contract, must-fix): a `tonight_game` beacon fired in a
  // geolocation-success context (surfaced / candidate_found / write_*) must NEVER
  // carry a game_id or any other candidate-identifying field — that would let the
  // server infer WHICH ARENA the user was physically at, i.e. precise-location
  // inference, which the locked contract forbids outright. `meta` must be
  // action-only. This replaces an earlier version of this suite that wrongly
  // asserted game_id WAS acceptable — that encoded the wrong contract.
  it('never includes a game_id or other candidate-identifying field in a tonight_game beacon', async () => {
    const sendBeacon = vi.fn((_url: string, _data: BodyInit) => true);
    installBrowserLike({ sendBeacon });
    trackEvent('tonight_game', { meta: { action: 'write_succeeded' } });

    const [, blob] = sendBeacon.mock.calls[0] as [string, Blob];
    const body = JSON.parse(await blob.text());
    expect(body).toEqual({ event: 'tonight_game', meta: { action: 'write_succeeded' } });
    expect(body.meta).not.toHaveProperty('game_id');
    expect(Object.keys(body.meta)).toEqual(['action']);
  });
});
