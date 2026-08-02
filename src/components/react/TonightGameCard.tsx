/**
 * Tonight's Game — same-night one-tap logging card.
 *
 * Spec: hgb-docs/docs/plans/puck-passport-tonights-game-spec-2026-07-31.md (locked).
 * Mock: hgb-docs/docs/plans/mocks/puck-passport-tonights-game-mock-v3.html (approved).
 *
 * Renders at the top of the Puck Passport dashboard, above the ticket-stub hero.
 * FAILURE RULE: any failure — schedule fetch, bad payload, geolocation — renders
 * NOTHING. This is an enhancement on a page that already works; it must never turn
 * into a broken dashboard.
 *
 * Data ownership: the server (`/v1/passport/tonight`) supplies the eligible
 * candidate set + canonical timing; this component does the client-local pick
 * (geolocation, then rooting team) via `pickCandidate`. Logging itself goes through
 * the SAME `addGame`/`removeGame` the rest of the dashboard uses (anti-divergence —
 * see AttendedTracker's docblock) — this component owns no write path of its own.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchTonight, type TonightGame, type TonightResponse } from '../../lib/tonight-client';
import {
  pickCandidate,
  makeManualCandidate,
  readDismissed,
  dismissGame,
  undismissGame,
  type Candidate,
} from '../../lib/tonight-candidate';
import {
  readGeoPreference,
  recordGrant,
  recordDecline,
  recordPermissionDenied,
  disableGeo,
  canPromptNow,
  recordFreshFix,
  readFreshFix,
  type GeoPrefState,
} from '../../lib/geo-preference';
import TonightGamePicker from './TonightGamePicker';
import type { AttendedGame, AttendedSummary, RawGame, EarnedDelta } from './AttendedTracker';

const POLL_MS = 60_000; // catch pre→open transitions / score updates without a reload

/** The same `?tonightNow=` off-season/QA override `fetchTonight` reads (see the
 *  polling effect below), but resolved to millis for dismissal math. Without this,
 *  dismissing a debug-dated (e.g. April) game gets compared against the REAL clock
 *  (e.g. August) by `readDismissed`, reads as already-expired, and silently no-ops —
 *  making "Not this one" untestable in the off-season. Undefined in production. */
function debugNowMs(): number | undefined {
  if (typeof window === 'undefined') return undefined;
  const raw = new URLSearchParams(window.location.search).get('tonightNow');
  const t = raw ? Date.parse(raw) : NaN;
  return Number.isFinite(t) ? t : undefined;
}

export type StubOrdinals = {
  gameOrd: Map<string, number>;
  arenaOrd: Map<string, number>;
  firstAtArena: Set<string>;
};

type Props = {
  games: AttendedGame[];
  summary: AttendedSummary | null;
  isLoggedIn: boolean;
  anchor: string | null; // rooting-team abbrev, or null (no anchor / neutral)
  stubOrdinals: StubOrdinals;
  addGame: (raw: RawGame, opts?: { earned?: boolean }) => Promise<{ ok: boolean; earned?: EarnedDelta }>;
  removeGame: (gameId: string) => Promise<void>;
  handleStub: (g: AttendedGame) => Promise<void>;
  /** Fires whenever this card transitions between rendering something and rendering
   *  nothing, so the page can collapse the ticket-stub hero while Tonight leads. */
  onActiveChange?: (active: boolean) => void;
};

function toRawGame(g: TonightGame): RawGame {
  return {
    game_id: g.game_id,
    date: g.date,
    home_team: g.home,
    away_team: g.away,
    venue: g.venue,
    last_period_type: g.last_period_type,
    status: g.status,
  };
}

/** Window end for a dismissal: a generous fixed bound (start ± a day covers the
 *  documented 3h-pre → 12h-post-final span) since the server doesn't hand back an
 *  explicit "tonight window" end — only start_time/date. Erring wide just means a
 *  dismissal occasionally outlives the card by a few hours; it never expires early
 *  and resurfaces a game the user just hid. */
function dismissExpiry(g: TonightGame): string {
  const base = g.start_time ? Date.parse(g.start_time) : Date.parse(`${g.date}T00:00:00Z`);
  const t = Number.isFinite(base) ? base : Date.now();
  return new Date(t + 30 * 60 * 60 * 1000).toISOString(); // start/date + 30h
}

// Away–home score only — the abbreviations are already shown in tn-teams
// immediately above this, in the same away@home order.
function scoreLine(g: TonightGame): string | null {
  if (g.status !== 'live' && g.status !== 'final') return null;
  return `${g.away.score}–${g.home.score}`;
}

function isMorningAfter(g: TonightGame, now: Date): boolean {
  // Local date, not UTC — g.date is the hockey/local game date, and comparing it
  // against now.toISOString()'s UTC date mislabels a still-live West Coast evening
  // game as "last night" the moment UTC rolls over mid-game.
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return g.date !== today;
}

export default function TonightGameCard({
  games,
  summary,
  isLoggedIn,
  anchor,
  stubOrdinals,
  addGame,
  removeGame,
  handleStub,
  onActiveChange,
}: Props) {
  const [resp, setResp] = useState<TonightResponse | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(() => readDismissed(debugNowMs()));
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [geoBusy, setGeoBusy] = useState(false);
  const [showGeoPreprompt, setShowGeoPreprompt] = useState(false);
  // Mirrors geo-preference.ts's canPromptNow() — recomputed (not re-read fresh) after
  // every mutating call below so the component re-renders without needing a poll.
  const [promptSuppressed, setPromptSuppressed] = useState<boolean>(() => !canPromptNow(debugNowMs() ?? Date.now()));
  // Drives the visible on/off status line — only 'enabled'/'disabled' render anything;
  // 'unset'/'deferred'/'suppressed' show no status line at all (see geo-preference.ts docblock).
  const [geoPrefState, setGeoPrefState] = useState<GeoPrefState>(() => readGeoPreference(debugNowMs() ?? Date.now()).state);
  const [manualCandidate, setManualCandidate] = useState<Candidate | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  // Has a geolocation attempt from the bootstrap discovery prompt (below) already run to
  // completion, success or failure? Without this, a denied/no-match attempt would leave
  // `coords` null forever and the discovery prompt would keep re-showing every render.
  const [geoResolved, setGeoResolved] = useState(false);
  // A prior visit got a real position (state==='enabled') — the browser itself already
  // remembers the permission grant silently, so re-showing "USE MY LOCATION" and making
  // the user tap it again on every fresh load is us re-asking a question the browser
  // already answered. This gates the discovery/pre-prompt UI shut while that silent
  // reacquire is in flight, so it never flashes before `requestGeo()` resolves below.
  // The actual reacquire is further gated (hasEligibleGames/hasGeoMatchableGames/fresh-fix
  // cache) in the effect below — this flag alone no longer triggers a GPS call.
  const [geoAutoPending, setGeoAutoPending] = useState<boolean>(
    () => readGeoPreference(debugNowMs() ?? Date.now()).state === 'enabled',
  );
  const [sessionUndo, setSessionUndo] = useState<{ gameId: string; expiresAt: string } | null>(null);
  const [phase, setPhase] = useState<'idle' | 'pending'>('idle');
  const [celebrating, setCelebrating] = useState<string | null>(null); // game_id, once logged this visit
  const [celebrationExtras, setCelebrationExtras] = useState<{
    badges: string[];
    badgesPending: boolean;
    newArena: boolean;
  } | null>(null);
  const preLogBadgeIdsRef = useRef<Set<string> | null>(null);
  const mutatingRef = useRef(false); // synchronous double-tap guard — mirrors AttendedTracker's toggleSearchResult lock

  // Fetch candidates on mount, then poll — a pre-game card must become loggable at
  // puck drop without a manual reload, and a live score should keep moving.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    // Off-season / QA override: ?tonightDate=YYYY-MM-DD (&tonightNow=ISO) points the
    // card at a real past game day instead of the live clock, since there's no way to
    // exercise this component end-to-end when nothing is actually being played tonight.
    // Debug-only — absent by default, and only ever read client-side.
    const params = new URLSearchParams(window.location.search);
    const debugDate = params.get('tonightDate') ?? undefined;
    const debugNow = params.get('tonightNow') ?? undefined;
    const load = async () => {
      const data = await fetchTonight({ date: debugDate, now: debugNow });
      if (cancelled) return;
      setResp(data);
      timer = setTimeout(load, POLL_MS);
    };
    load();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  const candidate: Candidate | null = useMemo(() => {
    if (!resp || !Array.isArray(resp.games) || resp.games.length === 0) return null;
    return pickCandidate(resp.games, anchor, coords, dismissed);
  }, [resp, anchor, coords, dismissed]);

  // Explicit user intent always wins over inference, and is never displaced by a
  // later-resolving geo match — see tonight-candidate.ts's makeManualCandidate docblock.
  const effectiveCandidate = manualCandidate ?? candidate;

  const alreadyLogged = effectiveCandidate ? games.some((g) => g.game_id === effectiveCandidate.game.game_id) : false;
  const isFirstGame = games.length === 0 && !alreadyLogged;

  // Bootstrap gap: without a geo match, the only other path to a candidate is the
  // rooting-team anchor — but that's a guess that may not even apply tonight (no
  // anchor, or an anchor whose team isn't playing). Either way `pickCandidate` has
  // already returned null by the time we get here, so `!candidate` alone captures
  // "nothing to show yet, but geolocation might still find something" — no need to
  // additionally gate on `!anchor`, which wrongly stayed silent forever for a
  // signed-in user whose anchor simply doesn't match tonight's game. The geo
  // pre-prompt normally only renders INSIDE an already-resolved candidate card;
  // without this, the exact "zero-game passport" first-use case the spec calls out
  // (§4) can never surface a card at all. Team-agnostic on purpose — it never names
  // a specific matchup, so it isn't the generic "some game is on tonight" card the
  // spec bans; it's a generic PROMPT for a still-unknown game.
  const hasEligibleGames = !!resp && Array.isArray(resp.games) && resp.games.some((g) => !dismissed.has(g.game_id));
  // GPS can only ever help if at least one eligible game actually has arena coordinates —
  // otherwise there's nothing to match against and querying it is pure noise.
  const hasGeoMatchableGames =
    !!resp &&
    Array.isArray(resp.games) &&
    resp.games.some((g) => !dismissed.has(g.game_id) && g.arena?.lat != null && g.arena?.lon != null);
  const showDiscovery =
    !effectiveCandidate && !coords && !promptSuppressed && !geoResolved && !geoAutoPending && hasEligibleGames;

  // "Newly earned" badges for a logged-out celebration resolve once the public
  // summary catches up (no server delta path for anon users) — diff against the
  // pre-tap snapshot. Never blocks the celebration itself (game/arena ordinals are
  // already known locally, synchronously, from `games`+stubOrdinals).
  useEffect(() => {
    if (!celebrationExtras?.badgesPending || !preLogBadgeIdsRef.current || !summary) return;
    const before = preLogBadgeIdsRef.current;
    const after = new Set((summary.badges?.earned ?? []).map((b) => b.id));
    if (after.size === before.size && [...after].every((id) => before.has(id))) return; // summary hasn't caught up yet
    const newly = [...after].filter((id) => !before.has(id));
    const labelFor = new Map((summary.badges?.catalog ?? []).map((c) => [c.id, c.label]));
    setCelebrationExtras((prev) =>
      prev ? { ...prev, badges: newly.map((id) => labelFor.get(id) ?? id), badgesPending: false } : prev,
    );
  }, [summary, celebrationExtras]);

  const active = !!effectiveCandidate || !!sessionUndo || showDiscovery;
  useEffect(() => {
    onActiveChange?.(active);
  }, [active, onActiveChange]);

  const requestGeo = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGeoResolved(true); // no geolocation API — never re-offer the discovery prompt
      setGeoAutoPending(false);
      return; // silent — §6.4
    }
    setGeoBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const nowMs = debugNowMs() ?? Date.now();
        setGeoBusy(false);
        setGeoResolved(true);
        setGeoAutoPending(false);
        setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        recordGrant(nowMs);
        recordFreshFix(pos.coords.latitude, pos.coords.longitude, nowMs);
        setGeoPrefState('enabled');
        setPromptSuppressed(!canPromptNow(nowMs));
      },
      (err) => {
        const nowMs = debugNowMs() ?? Date.now();
        setGeoBusy(false); // denied/unavailable/timeout — no error, no toast (§6.4)
        setGeoResolved(true); // don't re-show the discovery prompt after a failed attempt
        setGeoAutoPending(false);
        // A real browser denial gets real backoff. Timeout/unavailable is transient and
        // retryable next load — the persisted preference must not change for those.
        if (err.code === err.PERMISSION_DENIED) {
          recordPermissionDenied(nowMs);
          setGeoPrefState('suppressed');
          setPromptSuppressed(!canPromptNow(nowMs));
        }
      },
      { maximumAge: 5 * 60_000, timeout: 8_000 },
    );
  }, []);

  // Silently reacquire location on mount if a prior visit already granted it — but only
  // once `resp` has loaded, and only if there's actually something GPS could match against
  // and no fresh fix from earlier this same visit already covers it. The old version fired
  // unconditionally on mount whenever the legacy grant flag was set, polling the user's GPS
  // even on nights with zero eligible games — that was the confirmed live bug this replaces.
  const autoReacquireDoneRef = useRef(false);
  useEffect(() => {
    if (autoReacquireDoneRef.current) return;
    if (!resp) return; // wait for the schedule to load before deciding anything
    autoReacquireDoneRef.current = true;
    if (!geoAutoPending) return;
    if (!hasEligibleGames || !hasGeoMatchableGames) {
      setGeoAutoPending(false);
      return;
    }
    const nowMs = debugNowMs() ?? Date.now();
    const fresh = readFreshFix(nowMs);
    if (fresh) {
      setCoords(fresh);
      setGeoResolved(true);
      setGeoAutoPending(false);
      return;
    }
    requestGeo();
  }, [resp, geoAutoPending, hasEligibleGames, hasGeoMatchableGames, requestGeo]);

  const notNowGeo = useCallback(() => {
    setShowGeoPreprompt(false);
    const nowMs = debugNowMs() ?? Date.now();
    recordDecline(nowMs);
    setPromptSuppressed(!canPromptNow(nowMs));
  }, []);

  const turnOffGeo = useCallback(() => {
    const nowMs = debugNowMs() ?? Date.now();
    disableGeo(nowMs);
    setGeoPrefState('disabled');
    setPromptSuppressed(!canPromptNow(nowMs));
    setGeoAutoPending(false);
  }, []);

  const doLog = useCallback(
    async (g: TonightGame) => {
      if (mutatingRef.current) return;
      mutatingRef.current = true;
      setPhase('pending');
      try {
        preLogBadgeIdsRef.current = new Set((summary?.badges?.earned ?? []).map((b) => b.id));
        const raw = toRawGame(g);
        // "new arena" pre-computed from the CURRENT (pre-add) games list — this
        // game's own venue isn't in `games` yet, so this is the same "first at
        // this venue" check the ordinal memo does, without waiting on it to
        // re-derive from the post-add list (which a stale closure can't see).
        const venue = g.venue?.trim().toLowerCase();
        const newArena = !!venue && !games.some((existing) => existing.venue?.trim().toLowerCase() === venue);
        const { ok, earned } = await addGame(raw, { earned: isLoggedIn });
        if (!ok) {
          // Genuine write failure (logged-in only — logged-out writes can't fail).
          // addGame already rolled back and surfaced the shared writeError banner;
          // don't celebrate a log that didn't happen.
          return;
        }
        setCelebrating(g.game_id);
        if (earned) {
          const labelFor = new Map((summary?.badges?.catalog ?? []).map((c) => [c.id, c.label]));
          setCelebrationExtras({
            badges: earned.earned.badges.map((id) => labelFor.get(id) ?? id),
            badgesPending: false,
            newArena: earned.earned.new_arena,
          });
        } else {
          setCelebrationExtras({ badges: [], badgesPending: true, newArena });
        }
      } finally {
        mutatingRef.current = false;
        setPhase('idle');
      }
    },
    [addGame, isLoggedIn, summary, games],
  );

  const doUndo = useCallback(
    async (gameId: string) => {
      if (mutatingRef.current) return;
      mutatingRef.current = true;
      try {
        await removeGame(gameId);
        setCelebrating(null);
        setCelebrationExtras(null);
      } finally {
        mutatingRef.current = false;
      }
    },
    [removeGame],
  );

  const doDismiss = useCallback((g: TonightGame) => {
    const expiresAt = dismissExpiry(g);
    dismissGame(g.game_id, expiresAt, debugNowMs());
    setDismissed(readDismissed(debugNowMs()));
    setSessionUndo({ gameId: g.game_id, expiresAt });
    setManualCandidate(null); // "not this one" also un-sticks an explicit manual pick
  }, []);

  const doUndismiss = useCallback((gameId: string) => {
    undismissGame(gameId);
    setDismissed(readDismissed(debugNowMs()));
    setSessionUndo(null);
  }, []);

  const doDone = useCallback((g: TonightGame) => {
    // "Done" hides the card for the rest of tonight's window — same mechanism as
    // "Not this one", just reached from the logged side.
    dismissGame(g.game_id, dismissExpiry(g), debugNowMs());
    setDismissed(readDismissed(debugNowMs()));
    setCelebrating(null);
    setCelebrationExtras(null);
    setManualCandidate(null);
  }, []);

  const doShare = useCallback(
    (gameId: string) => {
      const g = games.find((x) => x.game_id === gameId);
      if (g) handleStub(g);
    },
    [games, handleStub],
  );

  // ── Session-only dismiss undo strip ─────────────────────────────────────────
  if (sessionUndo && !effectiveCandidate) {
    return (
      <div className="tn-dismissed">
        <div className="txt">Tonight's game hidden.</div>
        <button type="button" className="btn-text" onClick={() => doUndismiss(sessionUndo.gameId)}>
          Undo
        </button>
      </div>
    );
  }

  // ── Bootstrap discovery: no candidate yet (no geo, and anchor didn't match or
  // doesn't exist), but a game is eligible tonight ──────────────────────────────
  if (showDiscovery) {
    return (
      <div className="tn">
        <GeoPreprompt
          text="📍 Want to make it easier to check into games? Grant location access and Puck Passport will automatically detect when you're near an arena with a game that day. Your location stays on this device."
          onUse={requestGeo}
          onNotNow={notNowGeo}
          onFindManually={() => setShowPicker(true)}
          busy={geoBusy}
          standalone
        />
        {showPicker && resp ? (
          <TonightGamePicker
            games={resp.games}
            loggedGameIds={new Set(games.map((g) => g.game_id))}
            onPick={(g) => {
              setManualCandidate(makeManualCandidate(g, resp.games));
              setShowPicker(false);
            }}
            onClose={() => setShowPicker(false)}
          />
        ) : null}
      </div>
    );
  }

  if (!effectiveCandidate) return null;

  const { game } = effectiveCandidate;
  const loggedThisVisit = celebrating === game.game_id;
  const showCelebration = loggedThisVisit || alreadyLogged;

  // ── Pre-game: informational strip only — no logging affordance (spec decision 1) ──
  // Gate on `game.loggable`, not `game.window`, per the server-owned-write-gate
  // contract in tonight-client.ts — today the two are always in lockstep (windowFor
  // sets loggable:true iff window:'open'), but this is the field that means "may
  // write", and inferring it from window duplicates server logic client-side.
  if (!game.loggable && !showCelebration) {
    return (
      <div className="tn tn-strip">
        <div className="when">
          Tonight · {game.start_time ? new Date(game.start_time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''}
        </div>
        <div className="tn-teams">
          {game.away.abbrev} <span className="at">@</span> {game.home.abbrev}
        </div>
        {game.venue ? <div className="where">{game.venue}</div> : null}
        {game.arena && !coords && !promptSuppressed && !geoAutoPending && geoPrefState !== 'disabled' ? (
          <button type="button" className="tn-geo-btn spacer" onClick={() => setShowGeoPreprompt(true)}>
            Use my location
          </button>
        ) : null}
        <div className="gate">Logging opens at puck drop · your coordinates stay on this device.</div>
        {showGeoPreprompt ? <GeoPreprompt onUse={() => { setShowGeoPreprompt(false); requestGeo(); }} onNotNow={notNowGeo} busy={geoBusy} /> : null}
        {!showGeoPreprompt ? <GeoStatusLine state={geoPrefState} onEnable={requestGeo} onDisable={turnOffGeo} busy={geoBusy} /> : null}
      </div>
    );
  }

  // ── Celebration ──────────────────────────────────────────────────────────────
  if (showCelebration) {
    const gOrd = stubOrdinals.gameOrd.get(game.game_id);
    const aOrd = stubOrdinals.arenaOrd.get(game.game_id);
    const isNewArena = loggedThisVisit ? celebrationExtras?.newArena : stubOrdinals.firstAtArena.has(game.game_id);
    const badges = loggedThisVisit ? celebrationExtras?.badges ?? [] : [];
    const headline = gOrd === 1 ? 'Your 1st NHL game' : gOrd ? `Your ${ordinal(gOrd)} game` : 'Logged';
    return (
      <div className="tn">
        <div className="cel-top">
          <div>
            <div className="tn-eyebrow">
              <span className="dot" /> Logged
            </div>
            <div className="cel-head">{headline}</div>
            <div className="cel-sub">
              {game.away.abbrev} @ {game.home.abbrev}
              {game.date ? ` · ${game.date}` : ''}
            </div>
          </div>
          <button type="button" className="cel-undo" onClick={() => doUndo(game.game_id)}>
            Undo
          </button>
        </div>
        {loggedThisVisit && (badges.length > 0 || isNewArena) ? (
          <ul className="cel-list">
            {badges.map((label) => (
              <li key={label}>
                <span className="mark">✦</span> New badge <span className="cel-badge">{label}</span>
              </li>
            ))}
            {isNewArena && aOrd ? (
              <li>
                <span className="mark">✦</span> {ordinal(aOrd)} arena{game.venue ? ` — ${game.venue}` : ''}
              </li>
            ) : null}
          </ul>
        ) : null}
        <div className="tn-actions">
          <button type="button" className="btn btn-primary" onClick={() => doShare(game.game_id)}>
            🎟 Share ticket stub
          </button>
          <button type="button" className="btn-text" onClick={() => doDone(game)}>
            Done
          </button>
        </div>
      </div>
    );
  }

  // ── Live / final / morning-after — loggable ─────────────────────────────────
  const morning = isMorningAfter(game, new Date());
  const eyebrowLabel = morning ? 'Last night · Final' : game.status === 'live' ? 'Tonight · Live' : 'Tonight · Final';
  // "Tonight's" reads wrong the morning after — we don't know the time of day the
  // user opened this, only that the game itself wasn't tonight per the calendar.
  const askCopy = isFirstGame
    ? morning
      ? 'Start your passport with this game?'
      : "Start your passport with tonight's game?"
    : 'Were you at this game?';
  const score = scoreLine(game);
  const geoConfirmed = effectiveCandidate.source === 'geo';

  return (
    <div className="tn">
      <div className={`tn-eyebrow${game.status === 'live' ? ' live' : ''}`}>
        <span className="dot" /> {eyebrowLabel}
      </div>
      <div className="tn-game">
        <div className="tn-teams">
          {game.away.abbrev} <span className="at">@</span> {game.home.abbrev}
        </div>
        {score ? <div className="tn-score">{score}</div> : null}
      </div>
      {geoConfirmed ? (
        <div className="tn-pin">📍 You're at {game.venue ?? game.arena?.name}</div>
      ) : game.venue ? (
        <div className="tn-meta">{game.venue}</div>
      ) : null}
      <div className={`tn-ask${isFirstGame ? ' first-ask' : ''}`}>{askCopy}</div>
      <div className="tn-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={phase === 'pending'}
          onClick={() => doLog(game)}
        >
          {phase === 'pending' ? 'Logging…' : 'Yes, I was there'}
        </button>
        <button type="button" className="btn-text" onClick={() => doDismiss(game)}>
          Not this one
        </button>
      </div>
      {!geoConfirmed && game.arena && !coords && !promptSuppressed && !geoAutoPending && geoPrefState !== 'disabled' ? (
        <div className="tn-geo">
          <div className="tn-geo-txt">
            <b>Near the arena?</b> Use location to confirm this game.
          </div>
          <button type="button" className="tn-geo-btn" onClick={() => setShowGeoPreprompt(true)}>
            Use my location
          </button>
          <div className="tn-privacy">Your coordinates stay on this device.</div>
          {showGeoPreprompt ? (
            <GeoPreprompt onUse={() => { setShowGeoPreprompt(false); requestGeo(); }} onNotNow={notNowGeo} busy={geoBusy} />
          ) : null}
        </div>
      ) : null}
      {!showGeoPreprompt ? <GeoStatusLine state={geoPrefState} onEnable={requestGeo} onDisable={turnOffGeo} busy={geoBusy} /> : null}
    </div>
  );
}

function GeoPreprompt({
  text,
  onUse,
  onNotNow,
  onFindManually,
  busy,
  standalone,
}: {
  text?: string;
  onUse: () => void;
  onNotNow: () => void;
  /** Only passed at the bootstrap-discovery call site — the escape hatch for someone who
   *  declines/isn't geo-matched but still wants to log a game explicitly. */
  onFindManually?: () => void;
  busy: boolean;
  /** Rendered with no game info above it (bootstrap discovery) — drop the divider
   *  border, which otherwise only makes sense separating this from that content. */
  standalone?: boolean;
}) {
  return (
    <div className={standalone ? 'tn-geo-preprompt standalone' : 'tn-geo-preprompt'}>
      <div className="tn-geo-txt">
        {text ??
          "📍 Find tonight's game automatically? Allow location and we'll detect the arena you're at, so you can log in one tap. Your location never leaves your device."}
      </div>
      <div className="tn-actions">
        <button type="button" className="btn btn-primary" disabled={busy} onClick={onUse}>
          Use my location
        </button>
        <button type="button" className="btn-text" onClick={onNotNow}>
          Not now
        </button>
        {onFindManually ? (
          <button type="button" className="btn-text" onClick={onFindManually}>
            Find my game
          </button>
        ) : null}
      </div>
    </div>
  );
}

function GeoStatusLine({
  state,
  onEnable,
  onDisable,
  busy,
}: {
  state: GeoPrefState;
  onEnable: () => void;
  onDisable: () => void;
  busy: boolean;
}) {
  if (state === 'enabled') {
    return (
      <div className="tn-privacy">
        📍 Automatic detection: On ·{' '}
        <button type="button" className="btn-text" onClick={onDisable}>
          Turn off
        </button>
      </div>
    );
  }
  if (state === 'disabled') {
    return (
      <div className="tn-privacy">
        📍 Automatic detection: Off ·{' '}
        <button type="button" className="btn-text" disabled={busy} onClick={onEnable}>
          Turn on
        </button>
      </div>
    );
  }
  // 'unset' / 'deferred' / 'suppressed' — the user never told us to turn anything off,
  // so no status line claims otherwise.
  return null;
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}
