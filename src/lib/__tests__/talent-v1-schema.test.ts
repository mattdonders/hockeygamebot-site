import { describe, it, expect } from 'vitest';
import { PlayerRecordSchema, PlayerRecordsSchema } from '../stats-schemas';
import fixture from './fixtures/talent-v1-records.json';

// Real prod records (players.json, verified 2026-08-22) covering every
// Talent-v1 nullability state the migration must survive. Zod .object() STRIPS
// unknown keys, so an un-declared field would silently vanish from the parsed
// payload and the card would render an em-dash for everyone — these lock that
// the schema keeps them.
const byId = (id: number) => fixture.find((r: any) => r.player_id === id)!;
const FULL   = byId(8478402); // McDavid — full, pct 100
const LTD_NP = byId(8483482); // Luneau — limited_sample, pct null, gp 1
const ABSENT = byId(8470600); // Suter — talent_v1 keys absent entirely
const LTD_V  = byId(8485366); // Schaefer — limited_sample, pct 96

describe('Talent-v1 schema migration', () => {
  it('parses the whole representative prod slice without error', () => {
    expect(() => PlayerRecordsSchema.parse(fixture)).not.toThrow();
  });

  it('retains full-confidence Talent-v1 fields (no strip)', () => {
    const r = PlayerRecordSchema.parse(FULL);
    expect(r.hgb_talent_v1_percentile).toBe(100);
    expect(r.hgb_talent_v1_confidence).toBe('full');
    expect(typeof r.hgb_talent_v1).toBe('number');
  });

  it('accepts limited_sample with an explicit-null percentile', () => {
    const r = PlayerRecordSchema.parse(LTD_NP);
    expect(r.hgb_talent_v1_percentile).toBeNull();
    expect(r.hgb_talent_v1_confidence).toBe('limited_sample');
  });

  it('accepts limited_sample with a present percentile', () => {
    const r = PlayerRecordSchema.parse(LTD_V);
    expect(r.hgb_talent_v1_percentile).toBe(96);
    expect(r.hgb_talent_v1_confidence).toBe('limited_sample');
  });

  it('accepts a key-absent record (fields undefined, not an error)', () => {
    const r = PlayerRecordSchema.parse(ABSENT);
    expect(r.hgb_talent_v1_percentile).toBeUndefined();
    expect(r.hgb_talent_v1_confidence).toBeUndefined();
  });

  it('does NOT strip the new keys (they round-trip through parse)', () => {
    const parsed = PlayerRecordSchema.parse(FULL);
    expect(Object.keys(parsed)).toEqual(
      expect.arrayContaining(['hgb_talent_v1', 'hgb_talent_v1_percentile', 'hgb_talent_v1_confidence']),
    );
  });

  it('rejects an out-of-contract confidence value (fail loud, not silent-coerce)', () => {
    const res = PlayerRecordSchema.safeParse({
      ...FULL,
      hgb_talent_v1_confidence: 'limited', // legacy hgb_rating value — NOT valid for talent_v1
    });
    expect(res.success).toBe(false);
  });
});

// The hero sample qualifiers live inline in [slug].astro (client canvas script,
// un-importable), so lock their boundary predicates here as the contract of
// record. LTD SAMPLE ⇔ confidence === 'limited_sample'; EARLY SAMPLE ⇔ gp < 20.
describe('Talent hero sample-qualifier boundaries', () => {
  const isLtd   = (conf: string | null | undefined) => conf === 'limited_sample';
  const isEarly = (gp: number | null | undefined) => gp != null && gp < 20;

  it('LTD SAMPLE only for limited_sample confidence', () => {
    expect(isLtd('limited_sample')).toBe(true);
    expect(isLtd('full')).toBe(false);
    expect(isLtd(null)).toBe(false);
    expect(isLtd(undefined)).toBe(false);
  });

  it('EARLY SAMPLE at gp<20, not at gp>=20 (19/20 boundary)', () => {
    expect(isEarly(19)).toBe(true);
    expect(isEarly(20)).toBe(false);
    expect(isEarly(0)).toBe(true);
    expect(isEarly(null)).toBe(false);
  });

  it('matches the real fixture rows (Luneau gp=1 EARLY+LTD; McDavid neither)', () => {
    expect(isEarly(LTD_NP.gp)).toBe(true);
    expect(isLtd(LTD_NP.hgb_talent_v1_confidence)).toBe(true);
    expect(isEarly(FULL.gp)).toBe(false);
    expect(isLtd(FULL.hgb_talent_v1_confidence)).toBe(false);
  });
});
