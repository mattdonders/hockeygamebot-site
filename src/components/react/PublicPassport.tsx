/**
 * PublicPassport — the READ-ONLY public profile island for
 * /puck-passport/@{handle}.
 *
 * A static-host-friendly light island: the page shell is served for any
 * /puck-passport/@* path (Cloudflare `_redirects` rewrite → this page), and the
 * island reads the handle from the URL, fetches GET /v1/passport/:handle, and
 * renders the FOUR public sections only — counters, badges (earned + ghost),
 * the Home Rinks arena meter, and team records. NO add flow, NO game list, NO
 * players-seen, NO single-game records (the locked public scope).
 *
 * It deliberately reuses the dashboard's att-* markup + shared CSS so a public
 * profile is visually identical to the owner's own dashboard.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { getPassport, type PublicPassport as PassportData, type PassportBadge } from '../../lib/auth-client';
import { NHL_TEAMS } from '../../lib/nhl-teams';
import { pickTeamColor } from '../../lib/team-colors';
import {
  sortCatalog,
  parseOneInN,
  badgeBlurb,
  type CatalogBadge,
} from './puck-passport-badges';

const API = 'https://api.hockeygamebot.com';

/** Extract the handle from /puck-passport/@handle (strip the leading @). */
function handleFromPath(): string {
  if (typeof window === 'undefined') return '';
  const seg = window.location.pathname.split('/').filter(Boolean).pop() ?? '';
  return decodeURIComponent(seg).replace(/^@/, '').trim().toLowerCase();
}

/** Server catalog entry → the shared CatalogBadge shape (mirrors the dashboard's
 *  mapSummaryCatalog). Blurbs aren't sent over the wire — reuse the local ones. */
function mapCatalog(c: PassportBadge): CatalogBadge {
  return {
    id: c.id,
    label: c.label,
    family: c.family,
    earned: !!c.earned,
    count: c.count ?? 0,
    rarity: c.rarity ?? '',
    rarityHint: c.rarity_hint ?? '',
    blurb: badgeBlurb(c.id),
    note: c.note,
    total: c.total,
    rarityRatio: c.earned && c.count > 0 && c.total ? c.total / c.count : parseOneInN(c.rarity_hint),
  };
}

type ConfigTeam = { id: number; abbrev: string };

export default function PublicPassport() {
  const [handle] = useState(handleFromPath);
  const [state, setState] = useState<'loading' | 'ok' | 'missing'>('loading');
  const [data, setData] = useState<PassportData | null>(null);
  const [abbrevToId, setAbbrevToId] = useState<Map<string, number>>(new Map());

  // Fetch the public projection. 404 (unknown OR private) → the "missing" state.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!handle) {
        setState('missing');
        return;
      }
      const p = await getPassport(handle);
      if (cancelled) return;
      if (!p) {
        setState('missing');
      } else {
        setData(p);
        setState('ok');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [handle]);

  // team abbrev → NHL id (for colouring the Home Rinks pips from teams_seen).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${API}/v1/config`);
        if (!r.ok) return;
        const cfg = await r.json();
        const m = new Map<string, number>();
        for (const t of (cfg.teams ?? []) as ConfigTeam[]) {
          if (typeof t.id === 'number' && t.abbrev) m.set(t.abbrev, t.id);
        }
        if (!cancelled) setAbbrevToId(m);
      } catch {
        /* non-fatal: pips just stay grey without the id map */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const catalog = useMemo<CatalogBadge[]>(
    () =>
      data
        ? sortCatalog(data.badges.catalog.filter((c) => c.id !== 'arenas-visited').map(mapCatalog))
        : [],
    [data],
  );
  const earnedCount = useMemo(() => catalog.filter((c) => c.earned).length, [catalog]);
  const pipTeams = useMemo(() => [...NHL_TEAMS].sort((a, b) => a.name.localeCompare(b.name)), []);
  const teamsSeen = useMemo(() => new Set(data?.arenas.teams_seen ?? []), [data]);

  // ── Shared renderers (same markup as the dashboard) ─────────────────────────
  const renderCatalogBadge = (c: CatalogBadge) =>
    c.earned ? (
      <div className="att-badge" data-family={c.family} key={c.id}>
        <div className="att-badge-top">
          <span className="att-badge-label">{c.label}</span>
          <span className="att-badge-count">×{c.count}</span>
        </div>
        <span className="att-badge-rarity">
          {c.rarity ? `${c.rarity} games` : c.rarityHint}
          <span className="att-badge-family"> · {c.family === 'game-type' ? 'type' : 'moment'}</span>
        </span>
        {c.blurb ? <span className="att-badge-blurb">{c.blurb}</span> : null}
        {c.note ? <span className="att-badge-note">{c.note}</span> : null}
      </div>
    ) : (
      <div className="att-badge att-badge-ghost" data-family={c.family} key={c.id}>
        <div className="att-badge-top">
          <span className="att-badge-label">{c.label}</span>
          <span className="att-badge-ghost-tag">Locked</span>
        </div>
        <span className="att-badge-rarity">
          {c.rarityHint ? `rarity ~${c.rarityHint}` : 'not yet seen'}
          <span className="att-badge-family"> · {c.family === 'game-type' ? 'type' : 'moment'}</span>
        </span>
        {c.blurb ? <span className="att-badge-blurb">{c.blurb}</span> : null}
      </div>
    );

  const renderPip = (t: { abbr: string; name: string }, collected: boolean) => (
    <div
      className={collected ? 'att-rink att-rink-on' : 'att-rink'}
      key={t.abbr}
      title={collected ? `${t.name} — collected` : `${t.name} — not yet`}
    >
      <span className="att-rink-pip" style={{ background: collected ? pickTeamColor(t.abbr) : 'var(--ink-14)' }} />
      <span className="att-rink-abbr">{t.abbr}</span>
    </div>
  );

  // ── Masthead (shared with the dashboard) ────────────────────────────────────
  const masthead = (title: string, sub: string) => (
    <section className="att-mast">
      <div className="att-mast-ghost">PASSPORT</div>
      <div className="att-mast-corners">
        <div className="att-corner tl"></div>
        <div className="att-corner tr"></div>
      </div>
      <div className="att-wrap att-mast-inner">
        <div className="att-mast-top">
          <span className="att-mast-top-eyebrow">
            <span className="pip"></span> HockeyGameBot · Puck Passport
          </span>
        </div>
        <div className="att-mast-card">
          <span className="att-eyebrow">Public Passport</span>
          <h1 className="att-headline">{title}</h1>
          <p className="att-sub">{sub}</p>
        </div>
      </div>
    </section>
  );

  const body = (children: React.ReactNode) => (
    <section className="att-body">
      <div className="att-wrap">{children}</div>
    </section>
  );

  if (state === 'loading') {
    return (
      <>
        {masthead('Puck Passport', ' ')}
        {body(<div className="att-loading">Loading passport…</div>)}
      </>
    );
  }

  if (state === 'missing' || !data) {
    return (
      <>
        {masthead('Puck Passport', 'A fan-made record of NHL games attended in person.')}
        {body(
          <div className="pp-404">
            <div className="pp-404-title">This passport is private or doesn't exist</div>
            <div className="pp-404-sub">
              The handle you're looking for isn't public — or hasn't been claimed yet. Start your own and stamp every
              game you've been to.
            </div>
            <div className="pp-404-cta">
              <a className="pp-cta" href="/puck-passport/">
                Make your own →
              </a>
            </div>
          </div>,
        )}
      </>
    );
  }

  const c = data.counters;
  const arenas = data.arenas;
  const homeRinksEarned = arenas.home_rinks > 0;

  return (
    <>
      {masthead(
        `@${data.handle}'s Puck Passport`,
        'Every NHL game this fan has been to in person — counters, badges, home rinks collected, and team records.',
      )}
      {body(
        <div className="att-root">
          {/* Read-only note + make-your-own CTA */}
          <div className="pp-cta-row">
            <a className="pp-cta" href="/puck-passport/">
              Make your own →
            </a>
            <span className="pp-readonly-note">// A read-only public profile. Stats are computed from attended games.</span>
          </div>

          {/* Counters */}
          <div className="att-counters">
            <div className="att-counter">
              <div className="att-counter-num">{c.games}</div>
              <div className="att-counter-label">Games</div>
            </div>
            <div className="att-counter">
              <div className="att-counter-num">{c.periods}</div>
              <div className="att-counter-label">Periods</div>
            </div>
            <div className="att-counter">
              <div className="att-counter-num">{c.goals}</div>
              <div className="att-counter-label">Goals</div>
            </div>
            <div className="att-counter">
              <div className="att-counter-num">{c.shots}</div>
              <div className="att-counter-label">Shots</div>
            </div>
            <div className="att-counter">
              <div className="att-counter-num">{c.players_seen}</div>
              <div className="att-counter-label">Players Seen</div>
            </div>
          </div>

          {/* Badges — earned (rarest first) then ghost/unearned */}
          <section className="att-section">
            <div className="att-section-head">
              <span className="att-section-label">Badges</span>
              <span className="att-section-meta">
                {earnedCount + (homeRinksEarned ? 1 : 0)} of {catalog.length + 1}
              </span>
            </div>
            <div className="att-badges">
              {homeRinksEarned ? (
                <div className="att-badge att-badge-collection" data-family="collection">
                  <div className="att-badge-top">
                    <span className="att-badge-label">Home Rinks</span>
                    <span className="att-badge-count">
                      {arenas.home_rinks}/{arenas.total}
                    </span>
                  </div>
                  <span className="att-badge-rarity">home rinks collected · collection</span>
                </div>
              ) : null}
              {catalog.map(renderCatalogBadge)}
            </div>
          </section>

          {/* Team records + Home Rinks side by side */}
          <div className="att-two-col">
            <section className="att-section">
              <div className="att-section-head">
                <span className="att-section-label">Team Records</span>
                <span className="att-section-meta">every team seen</span>
              </div>
              {data.team_records.length === 0 ? (
                <div className="att-add-empty">No completed games yet.</div>
              ) : (
                <div className="att-teams">
                  {data.team_records.map((t) => (
                    <div className="att-team-row" key={t.abbrev}>
                      <span className="att-team-dot" style={{ background: pickTeamColor(t.abbrev) }} />
                      <span className="att-team-abbr">{t.abbrev}</span>
                      <span className="att-team-name">{t.name}</span>
                      <span className="att-team-rec">
                        {t.w}-{t.l}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="att-section">
              <div className="att-section-head">
                <span className="att-section-label">
                  Home Rinks — {arenas.home_rinks} / {arenas.total}
                </span>
                <span className="att-section-meta">
                  {arenas.total - arenas.home_rinks} to go — collect all {arenas.total}
                </span>
              </div>
              <div className="att-rinks">
                {pipTeams.map((t) => {
                  const id = abbrevToId.get(t.abbr);
                  return renderPip(t, id != null && teamsSeen.has(id));
                })}
              </div>
              <div className="att-rinks-substat">{arenas.distinct_buildings} total arenas visited</div>
            </section>
          </div>
        </div>,
      )}
    </>
  );
}
