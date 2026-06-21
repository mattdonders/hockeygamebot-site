/* ─────────────────────────────────────────────────────────────────────────
   EdgeCompare.tsx — side-by-side NHL Edge comparison tool
   ---------------------------------------------------------------------------
   WHY: Lets a user pick two players and view their NHL Edge tracking data side
   by side, each panel themed in that player's team color, with a subtle ▲
   marking who leads each comparable metric. Reuses the existing PlayerSearch
   typeahead and the shared edge-panel logic/CSS so the panel is pixel-faithful
   to EdgePanel.astro (the single-player page). Markup here mirrors that Astro
   component 1:1 — keep them in lockstep.

   NOT a card renderer; it reads the live single-season `edge` object that ships
   on each player record from the production stats API.
   ───────────────────────────────────────────────────────────────────────── */

import React, { useMemo, useRef, useState } from 'react';
import { toCanvas } from 'html-to-image';

// Provided by /js/table-export.js (loaded via <script> on the page). Routes the
// rendered canvas through the site's shared branded download modal.
declare global {
  interface Window {
    HGB_Export?: {
      showCardModal: (canvas: HTMLCanvasElement, filename: string) => void;
    };
  }
}
import PlayerSearch, { type PlayerSearchItem } from './PlayerSearch';
import { pickTeamColor, pickTeamColorRgb } from '../../lib/team-colors';
import { getTeamLogoSvg } from '../../lib/team-logos';
import {
  edgeStatRows, edgeShotCols, edgeZones, edgeTierColor,
  ordinalSuffix, barWidth, isEdgeEmpty, type EdgeData,
} from '../../lib/edge-panel';

// Player record as flattened by the compare page (search fields + edge object).
export type EdgePlayer = PlayerSearchItem & {
  player_id: number;
  edge: EdgeData | null;
};

type Props = {
  players: EdgePlayer[];
  /** display_name of the two players to show on first load. */
  defaultLeft?: string;
  defaultRight?: string;
};

const MONO: React.CSSProperties = { fontFamily: "'JetBrains Mono', monospace" };

// "win" lookups: maps a metric key → which side has the higher value.
type WinMap = Record<string, 'L' | 'R' | null>;

function compareValues(
  a: number | null | undefined,
  b: number | null | undefined,
  higherWins = true,
): 'L' | 'R' | null {
  if (a == null || b == null) return null;
  if (a === b) return null;
  const aWins = higherWins ? a > b : a < b;
  return aWins ? 'L' : 'R';
}

function buildWinMap(left: EdgeData | null, right: EdgeData | null): WinMap {
  const map: WinMap = {};
  if (!left || !right) return map;
  // Speed / distance rows
  for (const row of edgeStatRows(left)) {
    const r = edgeStatRows(right).find(x => x.key === row.key)!;
    map[`stat:${row.key}`] = compareValues(row.val, r.val, row.higherWins);
  }
  // Zone time — more OZ% wins
  map['zone:oz'] = compareValues(left.oz_pct, right.oz_pct, true);
  // Shot danger — attempts (n) and shooting% per zone; bigger is better
  for (const col of edgeShotCols(left)) {
    const r = edgeShotCols(right).find(x => x.key === col.key)!;
    map[`shot:${col.key}:n`]  = compareValues(col.n, r.n, true);
    map[`shot:${col.key}:sh`] = compareValues(col.sh, r.sh, true);
  }
  return map;
}

const WinMark = () => <span className="edge-win-mark" aria-label="leads">▲</span>;

/* Inline-SVG team logo (vector, build-bundled). WHY: html-to-image's toPng()
 * taints the canvas on cross-origin <img> (the NHL CDN logos), so the PNG export
 * throws. Inlining the SVG markup keeps the capture subtree free of any remote
 * resource. Mirrors TeamLogo.astro, including its placeholder fallback. */
function teamLogoHtml(abbr: string): string {
  return (
    getTeamLogoSvg(abbr) ??
    `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${abbr} logo"><rect width="32" height="32" rx="3" fill="#1a1a22"/><text x="16" y="20" text-anchor="middle" fill="#9aa0aa" font-family="-apple-system,Segoe UI,sans-serif" font-size="10" font-weight="700">${abbr}</text></svg>`
  );
}

// Full team names for the hero chips (mirrors the Season Card canvas renderer).
const TEAM_NAMES: Record<string, string> = {
  ANA:'ANAHEIM DUCKS',ARI:'ARIZONA COYOTES',BOS:'BOSTON BRUINS',BUF:'BUFFALO SABRES',
  CGY:'CALGARY FLAMES',CAR:'CAROLINA HURRICANES',CHI:'CHICAGO BLACKHAWKS',COL:'COLORADO AVALANCHE',
  CBJ:'COLUMBUS BLUE JACKETS',DAL:'DALLAS STARS',DET:'DETROIT RED WINGS',EDM:'EDMONTON OILERS',
  FLA:'FLORIDA PANTHERS',LAK:'LOS ANGELES KINGS',MIN:'MINNESOTA WILD',MTL:'MONTREAL CANADIENS',
  NSH:'NASHVILLE PREDATORS',NJD:'NEW JERSEY DEVILS',NYI:'NEW YORK ISLANDERS',NYR:'NEW YORK RANGERS',
  OTT:'OTTAWA SENATORS',PHI:'PHILADELPHIA FLYERS',PIT:'PITTSBURGH PENGUINS',SEA:'SEATTLE KRAKEN',
  SJS:'SAN JOSE SHARKS',STL:'ST. LOUIS BLUES',TBL:'TAMPA BAY LIGHTNING',TOR:'TORONTO MAPLE LEAFS',
  UTA:'UTAH HOCKEY CLUB',VAN:'VANCOUVER CANUCKS',VGK:'VEGAS GOLDEN KNIGHTS',WSH:'WASHINGTON CAPITALS',
  WPG:'WINNIPEG JETS',
};
const teamName = (abbr: string) => TEAM_NAMES[abbr] ?? abbr;

// ── Branded hero header — spans both panels, inside the capture area ──────────
// Mirrors the single-season player card masthead: big Barlow Condensed matchup
// (last names), a "EDGE COMPARE · 2025-26" eyebrow top-right, and a chip-pill
// row (one team chip per player in that team's color, a season chip, and the
// red HOCKEYGAMEBOT chip right-aligned).
function CompareHero({ left, right }: { left: EdgePlayer | null; right: EdgePlayer | null }) {
  const names = [left, right].filter(Boolean) as EdgePlayer[];
  const heroText =
    names.length === 2
      ? { a: left!.last_name, b: right!.last_name }
      : names.length === 1
        ? { a: names[0].last_name, b: '' }
        : { a: 'EDGE', b: 'COMPARE' };

  // Width-aware shrink: scale the hero down as the combined name length grows so
  // a long pair (e.g. BEDARD vs CELEBRINI) doesn't overflow the card.
  const combinedLen = (heroText.a.length + heroText.b.length) || 12;
  const heroSize =
    combinedLen <= 12 ? 'clamp(34px,5vw,56px)'
    : combinedLen <= 18 ? 'clamp(28px,4vw,46px)'
    : 'clamp(22px,3.2vw,38px)';

  return (
    <div className="edge-cmp-hero">
      <div className="edge-cmp-hero-top">
        <span className="edge-cmp-hero-kicker">Head to head</span>
        <span className="edge-cmp-hero-eyebrow">EDGE COMPARE · 2025–26</span>
      </div>
      <div className="edge-cmp-hero-name" style={{ fontSize: heroSize }}>
        {names.length >= 2 ? (
          <>
            {heroText.a}<span className="edge-cmp-hero-vs">vs</span>{heroText.b}
          </>
        ) : (
          <>{heroText.a}{heroText.b ? <> <span className="edge-cmp-hero-vs">vs</span> {heroText.b}</> : ''}</>
        )}
      </div>
      <div className="edge-cmp-hero-chips">
        {left && (
          <span
            className="edge-cmp-chip"
            style={{ background: pickTeamColor(left.team_abbrev), color: '#EFEEE8' }}
          >{teamName(left.team_abbrev)}</span>
        )}
        {right && (
          <span
            className="edge-cmp-chip"
            style={{ background: pickTeamColor(right.team_abbrev), color: '#EFEEE8' }}
          >{teamName(right.team_abbrev)}</span>
        )}
        <span className="edge-cmp-chip edge-cmp-chip-ink">2025–26</span>
        <span className="edge-cmp-chip edge-cmp-chip-brand">HOCKEYGAMEBOT</span>
      </div>
    </div>
  );
}

// ── One Edge panel — mirrors EdgePanel.astro markup exactly ──────────────────
function EdgePanelView({
  player,
  side,
  wins,
}: {
  player: EdgePlayer | null;
  side: 'L' | 'R';
  wins: WinMap;
}) {
  if (!player) {
    return (
      <div className="card edge-panel">
        <div className="edge-empty">Pick a player to compare.</div>
      </div>
    );
  }

  const teamColor    = pickTeamColor(player.team_abbrev);
  const teamColorRgb = pickTeamColorRgb(player.team_abbrev);
  const e = (player.edge ?? {}) as EdgeData;
  const empty = isEdgeEmpty(player.edge);
  const rows  = edgeStatRows(e);
  const shots = edgeShotCols(e);
  const { oz, nz, dz, total } = edgeZones(e);
  const won = (key: string) => wins[key] === side;

  const style = {
    '--team-color': teamColor,
    '--team-color-rgb': teamColorRgb,
  } as React.CSSProperties;

  return (
    <div className="card edge-panel" style={style}>
      {/* Player identity strip — themed to team color */}
      <div className="edge-cmp-id" style={{ borderLeft: `3px solid ${teamColor}` }}>
        <span
          className="edge-cmp-logo"
          role="img"
          aria-label={`${player.team_abbrev} logo`}
          dangerouslySetInnerHTML={{ __html: teamLogoHtml(player.team_abbrev) }}
        />
        <div>
          <div className="edge-cmp-name">{player.first_name} {player.last_name}</div>
          <div className="edge-cmp-meta" style={MONO}>{player.team_abbrev} · {player.pos} · {player.gp} GP</div>
        </div>
      </div>

      {empty ? (
        <div className="edge-empty">No NHL Edge tracking data available.</div>
      ) : (
        <>
          {/* Speed + Distance 2×2 grid */}
          <div className="edge-stat-grid">
            {rows.map(stat => {
              const tierC = edgeTierColor(stat.pct);
              return (
                <div className="edge-stat-cell" key={stat.key}>
                  <div className="edge-stat-lbl">{stat.lbl}</div>
                  {stat.val != null ? (
                    <div className="edge-stat-val">
                      {stat.val}<span className="edge-stat-unit">{stat.unit ? ` ${stat.unit}` : ''}</span>
                      {won(`stat:${stat.key}`) && <WinMark />}
                    </div>
                  ) : (
                    <div className="edge-stat-val">—</div>
                  )}
                  <div className="edge-bar-track">
                    <div className="edge-bar-fill" style={{ width: `${barWidth(stat.pct)}%`, background: tierC }} />
                  </div>
                  <div className="edge-stat-pct" style={{ color: tierC }}>
                    {stat.pct != null ? `${ordinalSuffix(stat.pct)} percentile` : '—'}
                  </div>
                  {stat.avg != null && (
                    <div className="edge-stat-avg">avg {stat.avg}{stat.avgUnit ? ` ${stat.avgUnit}` : ''}</div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Zone time */}
          <div className="edge-zone">
            <div className="edge-zone-lbl">
              Zone Time — Even Strength
              {e.oz_ev_pct_pct != null && (
                <span className="edge-zone-note"> · OZ {ordinalSuffix(e.oz_ev_pct_pct)} percentile</span>
              )}
              {won('zone:oz') && <WinMark />}
            </div>
            <div className="edge-zone-bar">
              <div className="edge-zone-oz" style={{ width: `${(oz / total * 100).toFixed(1)}%` }} />
              <div className="edge-zone-nz" style={{ width: `${(nz / total * 100).toFixed(1)}%` }} />
              <div className="edge-zone-dz" style={{ width: `${(dz / total * 100).toFixed(1)}%` }} />
            </div>
            <div className="edge-zone-labels">
              <div className="edge-zone-seg" style={{ width: `${(oz / total * 100).toFixed(1)}%` }}>
                <span className="edge-zone-pct">{oz.toFixed(0)}%</span>
                <span className="edge-zone-name">Offensive</span>
              </div>
              <div className="edge-zone-seg" style={{ width: `${(nz / total * 100).toFixed(1)}%` }}>
                <span className="edge-zone-pct">{nz.toFixed(0)}%</span>
                <span className="edge-zone-name">Neutral</span>
              </div>
              <div className="edge-zone-seg" style={{ width: `${(dz / total * 100).toFixed(1)}%` }}>
                <span className="edge-zone-pct">{dz.toFixed(0)}%</span>
                <span className="edge-zone-name">Defensive</span>
              </div>
            </div>
          </div>

          {/* Shot location by danger zone */}
          <div className="edge-shot-header">Shot Location by Danger Zone</div>
          <div className="edge-shot-grid">
            {shots.map(z => {
              const npC  = edgeTierColor(z.np);
              const shpC = edgeTierColor(z.shp);
              return (
                <div className="edge-shot-col" key={z.key}>
                  <div className={`edge-shot-chip ${z.accent ? 'accent-chip' : ''}`}>{z.lbl}</div>
                  <div className="edge-shot-row">
                    <div>
                      <div className="edge-shot-sublbl">Attempts</div>
                      <div className="edge-shot-n">{z.n ?? '—'}{won(`shot:${z.key}:n`) && <WinMark />}</div>
                      <div className="edge-shot-pct" style={{ color: npC }}>{z.np != null ? ordinalSuffix(z.np) : ''}</div>
                      <div className="edge-mini-bar"><div className="edge-mini-fill" style={{ width: `${barWidth(z.np)}%`, background: npC }} /></div>
                    </div>
                    <div>
                      <div className="edge-shot-sublbl">Sh%</div>
                      <div className="edge-shot-n">{z.sh != null ? `${z.sh}%` : '—'}{won(`shot:${z.key}:sh`) && <WinMark />}</div>
                      <div className="edge-shot-pct" style={{ color: shpC }}>{z.shp != null ? ordinalSuffix(z.shp) : ''}</div>
                      <div className="edge-mini-bar"><div className="edge-mini-fill" style={{ width: `${barWidth(z.shp)}%`, background: shpC }} /></div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ── Tool shell ───────────────────────────────────────────────────────────────
export default function EdgeCompare({ players, defaultLeft, defaultRight }: Props) {
  const findByName = (name?: string) =>
    name ? players.find(p => p.display_name === name || `${p.first_name} ${p.last_name}` === name) ?? null : null;

  const [left, setLeft]   = useState<EdgePlayer | null>(() => findByName(defaultLeft));
  const [right, setRight] = useState<EdgePlayer | null>(() => findByName(defaultRight));
  const [busy, setBusy]   = useState(false);
  const captureRef = useRef<HTMLDivElement>(null);

  const wins = useMemo(
    () => buildWinMap(left?.edge ?? null, right?.edge ?? null),
    [left, right],
  );

  async function downloadPng() {
    const node = captureRef.current;
    if (!node) return;
    setBusy(true);
    // Force the horizontal side-by-side layout for the capture, even on a narrow
    // viewport, so the downloaded card is always the 2-column desktop look.
    node.classList.add('exporting');
    try {
      const canvas = await toCanvas(node, {
        pixelRatio: 2,
        backgroundColor: '#EFEEE8',
        cacheBust: true,
      });
      const slug = [left, right]
        .map(p => (p ? p.last_name.toLowerCase() : 'player'))
        .join('-vs-');
      const filename = `edge-compare-${slug}.png`;
      if (window.HGB_Export?.showCardModal) {
        window.HGB_Export.showCardModal(canvas, filename);
      } else {
        // Shared export module not loaded — fail gracefully without crashing.
        console.error('[EdgeCompare] window.HGB_Export.showCardModal unavailable; skipping download.');
      }
    } catch (err) {
      console.error('[EdgeCompare] PNG export failed', err);
    } finally {
      node.classList.remove('exporting');
      setBusy(false);
    }
  }

  return (
    <div className="edge-cmp">
      {/* Selectors */}
      <div className="edge-cmp-selectors">
        <div className="edge-cmp-sel">
          <span className="edge-cmp-sel-lbl">Player A</span>
          <PlayerSearch
            players={players}
            placeholder="Search player A…"
            onSelect={p => setLeft(players.find(x => x.slug === p.slug) ?? null)}
            navigateTo={false}
            maxResults={8}
          />
        </div>
        <div className="edge-cmp-vs">vs</div>
        <div className="edge-cmp-sel">
          <span className="edge-cmp-sel-lbl">Player B</span>
          <PlayerSearch
            players={players}
            placeholder="Search player B…"
            onSelect={p => setRight(players.find(x => x.slug === p.slug) ?? null)}
            navigateTo={false}
            maxResults={8}
          />
        </div>
      </div>

      <div className="edge-cmp-actions">
        <button
          type="button"
          className="edge-cmp-btn"
          onClick={downloadPng}
          disabled={busy || (!left && !right)}
        >
          {busy ? 'Rendering…' : 'Download PNG ↓'}
        </button>
        <span className="edge-cmp-hint" style={MONO}>▲ marks the leader in each metric</span>
      </div>

      {/* Captured area — hero + footer live INSIDE so the downloaded PNG is branded */}
      <div className="edge-cmp-capture" ref={captureRef}>
        <CompareHero left={left} right={right} />
        <div className="edge-cmp-grid">
          <EdgePanelView player={left}  side="L" wins={wins} />
          <EdgePanelView player={right} side="R" wins={wins} />
        </div>
        <div className="edge-cmp-watermark" style={MONO}>hockeygamebot.com · NHL Edge · 2025–26</div>
      </div>
    </div>
  );
}
