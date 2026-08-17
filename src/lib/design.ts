/**
 * Build-time consumer of the vendored canonical HGB design manifest.
 *
 * This is the site's SELF-CONTAINED entry point to the canonical HGB design
 * system. The manifest under `src/data/design/v1/` is a byte-identical vendored
 * copy of `hgb-docs/design/v1/design.json`, synced by
 * `hgb-docs/design/v1/sync_design.py`. Cloudflare Pages builds the site from
 * this checkout alone — no sibling repo, no network fetch.
 *
 * At import time (build / SSR) this module:
 *   1. imports the parsed manifest,
 *   2. re-hashes its exact bytes (`?raw`) and verifies against the vendored
 *      `design.sha256`,
 *   3. validates the invariants renderers rely on,
 * and throws loudly if the vendored copy is stale, tampered, or malformed —
 * before any page is generated.
 *
 * SERVER-ONLY: uses `node:crypto`. Import from `.astro` frontmatter and pass the
 * small `designInjection` subset into `define:vars`; do NOT import into client
 * bundles.
 *
 * Composition stays local: this owns identity + semantics (colors, type roles,
 * metric-color rules), never layout/coordinates/sizes.
 */
import { createHash } from 'node:crypto';
import DESIGN from '../data/design/v1/design.json';
// `?raw` gives the exact file bytes (as UTF-8 text) so the hash matches the
// canonical/Python computation over design.json's bytes.
import DESIGN_RAW from '../data/design/v1/design.json?raw';
import SHA_RAW from '../data/design/v1/design.sha256?raw';

export interface TypeRole {
  family: string;
  weights?: number[];
}
export interface EvalBand {
  min: number;
  max: number;
  label: string;
  color: string;
}

const HEX = /^#[0-9A-Fa-f]{6}$/;

function fail(msg: string): never {
  throw new Error(`[design] ${msg}`);
}

// ── hash verification (vendored JSON vs vendored SHA) ────────────────────────
export const DESIGN_HASH = (SHA_RAW as string).trim();
{
  const actual = createHash('sha256').update(DESIGN_RAW as string).digest('hex');
  if (actual !== DESIGN_HASH) {
    fail(`vendored design.json hash mismatch: file=${actual} expected=${DESIGN_HASH} — copy is stale/tampered (run sync_design.py)`);
  }
}
export const DESIGN_HASH_SHORT = DESIGN_HASH.slice(0, 8);
// Observability: emit the canonical design identity once at build/SSR import so
// a stale vendored copy is visible in the build log, not just a silent success.
console.log(`[design] HGB Design v${DESIGN.schema_version} · ${DESIGN_HASH_SHORT}`);

// ── validation (mirrors the canonical schema invariants) ─────────────────────
{
  if (DESIGN.schema_version !== 1) fail('schema_version must be 1');
  for (const k of ['red', 'cream', 'ink'] as const) {
    if (!HEX.test((DESIGN.brand as any)[k])) fail(`brand.${k} invalid`);
  }
  for (const role of ['display', 'hero', 'body', 'pill', 'technical']) {
    if (!(DESIGN.typography.main as any)[role]?.family) fail(`typography.main.${role} missing family`);
  }
  for (const role of ['keepsake', 'ui', 'metadata']) {
    if (!(DESIGN.typography.passport as any)[role]?.family) fail(`typography.passport.${role} missing family`);
  }
  const bands = DESIGN.metric_semantics.evaluative.bands;
  if (bands.length !== 5) fail(`expected 5 evaluative bands, got ${bands.length}`);
  if (bands[0].min !== 0 || bands[bands.length - 1].max !== 100) fail('bands must cover 0..100');
  bands.forEach((b, i) => {
    if (!HEX.test(b.color)) fail(`band[${i}].color invalid`);
    if (!(0 <= b.min && b.min <= b.max && b.max <= 100)) fail(`band[${i}] bounds out of order`);
    if (i > 0 && b.min !== bands[i - 1].max + 1) fail(`bands not contiguous at index ${i}`);
  });
  const dc = DESIGN.metric_semantics.descriptive.color as string | null;
  if (dc !== null && !HEX.test(dc)) fail('descriptive.color must be #RRGGBB or null');
}

// ── typed access ─────────────────────────────────────────────────────────────
export const brand = DESIGN.brand as { red: string; cream: string; ink: string };
export const evalBands = DESIGN.metric_semantics.evaluative.bands as EvalBand[];
export const descriptiveColor = DESIGN.metric_semantics.descriptive.color as string | null;
export const pill = DESIGN.pill_semantics as {
  identity: { color: string };
  metadata: { color: string };
};

export function fontFamily(register: 'main' | 'passport', role: string): string {
  const fam = (DESIGN.typography as any)[register]?.[role]?.family;
  if (!fam) fail(`unknown typography role ${register}.${role}`);
  return fam;
}

/**
 * Resolve a percentile (0..100) to its discrete evaluative band color.
 * Boundary behavior is exact: 20→very_poor, 21→below_average, 40→below_average,
 * 41→neutral, 60→neutral, 61→above_average, 80→above_average, 81→elite.
 * Throws on impossible values (outside 0..100 or non-numeric).
 */
export function evaluativeColor(pct: number): string {
  if (typeof pct !== 'number' || Number.isNaN(pct) || pct < 0 || pct > 100) {
    fail(`percentile out of range [0,100]: ${pct}`);
  }
  for (const b of evalBands) if (pct <= b.max) return b.color;
  return evalBands[evalBands.length - 1].color;
}

/**
 * The exact semantic subset to spread into a `drawCanvas` `define:vars` object.
 * Data only (serializable) — the inline canvas script rebuilds resolvers from
 * `evalBands`. Composition (px sizes, layout) stays in the canvas code.
 */
export const designInjection = {
  hash: DESIGN_HASH,
  hashShort: DESIGN_HASH_SHORT,
  red: brand.red,
  cream: brand.cream,
  ink: brand.ink,
  contextBlue: descriptiveColor,
  fonts: {
    display: fontFamily('main', 'display'),
    hero: fontFamily('main', 'hero'),
    body: fontFamily('main', 'body'),
    pill: fontFamily('main', 'pill'),
    technical: fontFamily('main', 'technical'),
  },
  evalBands: evalBands.map((b) => ({ max: b.max, color: b.color })),
} as const;

export { DESIGN };
