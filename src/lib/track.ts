/**
 * track — tiny fire-and-forget client beacon for anonymous product telemetry.
 *
 * Posts to the hgb-api telemetry endpoint (POST /v1/track → 204). The endpoint
 * accepts ONLY the client events wired today: `handle_view` (public passport page
 * view, with the viewed `handle` + `?ref=` attribution), `share_click` (the Puck
 * Passport tracker's Share action), and `visit` (a tracker page opened via a
 * `?ref=`-tagged link — channel attribution for the landing page itself).
 *
 * Contract:
 *   - NEVER throws and NEVER returns a promise the caller must await — it is
 *     fire-and-forget. Call it and move on.
 *   - No-ops gracefully under SSR (guards on `window`/`navigator`).
 *   - Prefers `navigator.sendBeacon` (survives page unload / navigation) with a
 *     JSON Blob, falling back to `fetch(..., { keepalive: true })`.
 */

const API_BASE = 'https://api.hockeygamebot.com';
const TRACK_URL = `${API_BASE}/v1/track`;

export type TrackEvent = 'handle_view' | 'share_click' | 'visit';

export interface TrackPayload {
  /** Handle in context (viewed passport, or the current user's own handle). */
  handle?: string | null;
  /** `?ref=` attribution (channel/referrer) — carried by `handle_view` and `visit`. */
  ref?: string | null;
  /** Optional free-form metadata bag. */
  meta?: Record<string, unknown>;
}

/**
 * Fire an anonymous telemetry beacon. Fire-and-forget: does not return a value,
 * never throws, never needs awaiting.
 */
export function trackEvent(event: TrackEvent, payload: TrackPayload = {}): void {
  // SSR / non-browser guard — nothing to send from the server.
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return;

  try {
    // Only include keys that carry a real value (endpoint treats handle/ref as
    // optional; sending empty strings/nulls would be noise).
    const body: Record<string, unknown> = { event };
    if (payload.handle) body.handle = payload.handle;
    if (payload.ref) body.ref = payload.ref;
    if (payload.meta) body.meta = payload.meta;

    const json = JSON.stringify(body);

    // Preferred path: sendBeacon survives unload/navigation and is non-blocking.
    // CROSS-ORIGIN CAVEAT: the site (hockeygamebot.com) beacons to api.hockeygamebot.com.
    // A Blob typed `application/json` is NOT a CORS-safelisted content type → it would
    // require a preflight, which sendBeacon cannot perform, so the beacon silently
    // drops. `text/plain` IS safelisted → the request is "simple" and reliably sent;
    // the Worker's request.json() parses the body regardless of Content-Type.
    if (typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([json], { type: 'text/plain;charset=UTF-8' });
      if (navigator.sendBeacon(TRACK_URL, blob)) return;
      // false = queue full / too large → fall through to fetch.
    }

    // Fallback: keepalive fetch so it still completes across a navigation.
    void fetch(TRACK_URL, {
      method: 'POST',
      keepalive: true,
      headers: { 'content-type': 'application/json' },
      body: json,
    }).catch(() => {
      /* fire-and-forget: swallow all network errors */
    });
  } catch {
    /* never throw from a telemetry call */
  }
}
