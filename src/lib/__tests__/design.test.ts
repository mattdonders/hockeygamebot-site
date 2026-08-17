import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  DESIGN,
  DESIGN_HASH,
  DESIGN_HASH_SHORT,
  brand,
  evalBands,
  evaluativeColor,
  descriptiveColor,
  pill,
  fontFamily,
  designInjection,
} from '../design';

describe('vendored design manifest', () => {
  it('loads, validates, and exposes a 64-hex identity', () => {
    expect(DESIGN.schema_version).toBe(1);
    expect(DESIGN_HASH).toMatch(/^[0-9a-f]{64}$/);
    expect(DESIGN_HASH_SHORT).toBe(DESIGN_HASH.slice(0, 8));
  });

  it('hash matches the exact vendored bytes', () => {
    const p = fileURLToPath(new URL('../../data/design/v1/design.json', import.meta.url));
    const actual = createHash('sha256').update(readFileSync(p)).digest('hex');
    expect(actual).toBe(DESIGN_HASH);
  });

  it('carries canonical brand colors', () => {
    expect(brand.red).toBe('#E8002D');
    expect(brand.cream).toBe('#EFEEE8');
    expect(brand.ink).toBe('#0D0D14');
  });

  it('encodes both typography registers', () => {
    expect(fontFamily('main', 'hero')).toBe('Barlow Condensed');
    expect(fontFamily('main', 'body')).toBe('Barlow');
    expect(fontFamily('main', 'technical')).toBe('JetBrains Mono');
    expect(fontFamily('passport', 'keepsake')).toBe('Newsreader');
    expect(fontFamily('passport', 'ui')).toBe('Instrument Sans');
    expect(fontFamily('passport', 'metadata')).toBe('JetBrains Mono');
  });

  it('resolves the context/descriptive blue and pill semantics', () => {
    expect(descriptiveColor).toBe('#4285F4');
    expect(pill.identity.color).toBe('#E8002D');
    expect(pill.metadata.color).toBe('#0D0D14');
  });
});

describe('five-band evaluative boundaries', () => {
  const cases: Array<[number, string]> = [
    [0, '#B4232F'],
    [20, '#B4232F'],
    [21, '#E8002D'],
    [40, '#E8002D'],
    [41, '#8A8A8A'],
    [60, '#8A8A8A'],
    [61, '#4CAF50'],
    [80, '#4CAF50'],
    [81, '#137333'],
    [100, '#137333'],
  ];
  it.each(cases)('percentile %i -> %s', (pct, color) => {
    expect(evaluativeColor(pct)).toBe(color);
  });

  it('bands are contiguous, non-overlapping, and cover 0..100', () => {
    expect(evalBands).toHaveLength(5);
    expect(evalBands[0].min).toBe(0);
    expect(evalBands[4].max).toBe(100);
    for (let i = 1; i < evalBands.length; i++) {
      expect(evalBands[i].min).toBe(evalBands[i - 1].max + 1);
    }
  });

  it.each([-1, 101, NaN, -0.5, 100.5])('rejects impossible value %s', (bad) => {
    expect(() => evaluativeColor(bad as number)).toThrow();
  });
});

describe('define:vars injection subset', () => {
  it('is serializable data only (no functions)', () => {
    const clone = JSON.parse(JSON.stringify(designInjection));
    expect(clone.red).toBe('#E8002D');
    expect(clone.contextBlue).toBe('#4285F4');
    expect(clone.fonts.hero).toBe('Barlow Condensed');
    expect(clone.evalBands).toHaveLength(5);
    expect(clone.evalBands[0]).toEqual({ max: 20, color: '#B4232F' });
  });
});
