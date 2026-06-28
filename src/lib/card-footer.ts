/* ─────────────────────────────────────────────────────────────────────────
   card-footer.ts — single source of truth for card / page footer strings
   ---------------------------------------------------------------------------
   WHY: Footer / watermark / attribution strings were hand-written per card and
   had drifted badly — "HGB STATS" vs "HGB Stats" vs "HGB Analytics", year as
   "2025-26" vs "2025–26" vs "2025–2026", inconsistent NHL Edge attribution
   (some PBP-derived cards wrongly claimed "EDGE DATA: NHL"), and faint
   low-contrast footer ink (0.20–0.24 alpha). This module centralizes the
   builder, the LOCKED tokens, and shared readable style tokens so footers stop
   drifting.

   FOOTER SHAPE (joined with " · "):
     [def | HGB STATS] · DOMAIN · [2025-26] · [percentile vs {Position}] · [extra] · [EDGE attr]
       - leading slot: a `def` string (e.g. "WAR = single-season") OR, when no
         def, the "HGB STATS" label (cards) — controlled by `lead`.
       - DOMAIN: HOCKEYGAMEBOT.COM (cards) / hockeygamebot.com (pages) — always.

   LOCKED RULES (see PR description):
     • Casing: HOCKEYGAMEBOT.COM uppercase on canvas/shareable CARDS;
       hockeygamebot.com lowercase on HTML PAGE footers.
     • NHL attribution "EDGE DATA: NHL, INC." ONLY on cards that actually render
       NHL Edge tracking (Season w/ Edge panel, EDGE card, Edge Compare, goalie
       card IF it shows Edge). NOT on Talent/WAR/RAPM/History/Impact/Series/Lines
       (all PBP-derived).
     • "percentile vs {Position}" only when the card shows position-relative
       percentiles.
     • Year token is always "2025-26" (hyphen). "HGB STATS" uppercase on cards.
   ───────────────────────────────────────────────────────────────────────── */

/** Current season token — hyphen form, locked. */
export const SEASON = '2025-26';

/** Domain tokens. Uppercase = cards (canvas/shareable); lowercase = HTML pages. */
export const DOMAIN_UPPER = 'HOCKEYGAMEBOT.COM';
export const DOMAIN_LOWER = 'hockeygamebot.com';

/** Leading brand label for cards (when no `def` leads). */
export const HGB_STATS = 'HGB STATS';

/** NHL Edge attribution — ONLY for cards/views that display NHL Edge tracking. */
export const NHL_ATTRIBUTION = 'EDGE DATA: NHL, INC.';

/** Site-wide legal disclaimer (small, light) for page footers. */
export const SITE_DISCLAIMER =
  'Not affiliated with or endorsed by the NHL. NHL and team marks are property of their respective owners.';

/** Readable-but-subtle footer style tokens. Small + light weight, but legible.
 *  Replaces the faint 0.20–0.32 alpha footers scattered across the cards. */
export const FOOTER_STYLE = {
  /** Footer ink on the cream (#EFEEE8) / light surface. */
  inkOnLight: 'rgba(13,13,20,0.55)',
  /** Footer ink on a dark (--ink) surface. */
  inkOnDark: 'rgba(255,255,255,0.5)',
  /** Canvas font — small, weight 400. Caller picks the family/size around this. */
  canvasFontPx: 9,
  canvasFontWeight: 400,
} as const;

export interface CardFooterParts {
  /** Leading definition segment, e.g. "WAR = single-season". When set, it leads
   *  instead of the "HGB STATS" label. */
  def?: string;
  /** Domain casing: 'upper' for cards (default), 'lower' for HTML pages,
   *  false to omit the domain entirely. */
  domain?: 'upper' | 'lower' | false;
  /** Show the leading "HGB STATS" label when there is no `def`. Default true
   *  (cards). Set false to drop it (e.g. terse watermarks). */
  hgbStats?: boolean;
  /** Append the season token (2025-26). Default true. */
  season?: boolean;
  /** Override the season token (default: SEASON constant). */
  seasonOverride?: string;
  /** Position name for "percentile vs {Position}" — omit to drop that segment. */
  vsPosition?: string;
  /** Extra trailing context, e.g. "GSAx XGBoost". */
  extra?: string;
  /** When true, appends the NHL Edge attribution. Only set for cards/views that
   *  actually render NHL Edge tracking data. */
  edgeData?: boolean;
}

/**
 * Build a footer string by joining present segments with " · ".
 * Order: [def | HGB STATS] · DOMAIN · [season] · [percentile vs Pos] · [extra] · [EDGE attr]
 *
 * Examples:
 *   cardFooterText({ def: 'WAR = single-season', vsPosition: 'Forwards', edgeData: true })
 *     → "WAR = single-season · HOCKEYGAMEBOT.COM · 2025-26 · percentile vs Forwards · EDGE DATA: NHL, INC."
 *   cardFooterText({ domain: 'lower', extra: 'GSAx XGBoost' })
 *     → "HGB STATS · hockeygamebot.com · 2025-26 · GSAx XGBoost"
 */
export function cardFooterText(parts: CardFooterParts = {}): string {
  const {
    def,
    domain = 'upper',
    hgbStats = true,
    season = true,
    seasonOverride,
    vsPosition,
    extra,
    edgeData = false,
  } = parts;

  const segments: string[] = [];
  if (def) segments.push(def);
  else if (hgbStats) segments.push(HGB_STATS);
  if (domain === 'upper') segments.push(DOMAIN_UPPER);
  else if (domain === 'lower') segments.push(DOMAIN_LOWER);
  if (season) segments.push(seasonOverride ?? SEASON);
  if (vsPosition) segments.push(`percentile vs ${vsPosition}`);
  if (extra) segments.push(extra);
  if (edgeData) segments.push(NHL_ATTRIBUTION);

  return segments.join(' · ');
}
