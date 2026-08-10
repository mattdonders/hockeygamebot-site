import { describe, it, expect, vi, afterEach } from 'vitest';
import { nhlGameType } from '../nhl-game-type';

afterEach(() => vi.restoreAllMocks());

describe('nhlGameType — mapped types', () => {
  it('maps every known code to its label/chip', () => {
    expect(nhlGameType('2025010001')).toMatchObject({ kind: 'preseason', label: 'Preseason', chip: 'PRE' });
    expect(nhlGameType('2025020001')).toMatchObject({ kind: 'regular', label: 'Regular Season', chip: '' });
    expect(nhlGameType('2025030141')).toMatchObject({ kind: 'playoff', label: 'Playoffs', chip: 'PLAYOFF' });
    expect(nhlGameType('2025040001')).toMatchObject({ kind: 'allstar', label: 'All-Star', chip: 'ALL-STAR' });
    expect(nhlGameType('2024190002')).toMatchObject({ kind: 'tournament', label: 'Tournament', chip: 'TOURNAMENT' });
  });

  it('makes no type claim for manual/absent ids', () => {
    expect(nhlGameType('manual-abc')).toMatchObject({ kind: 'none', label: '—', chip: '', code: '' });
    expect(nhlGameType(null)).toMatchObject({ kind: 'none', chip: '' });
  });
});

describe('nhlGameType — unknown codes never reach consumers', () => {
  it('renders no chip and a neutral label, but still warns and keeps the raw code', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Unique code per run so the module-scoped warn-dedup set doesn't swallow it.
    const t = nhlGameType('2025770001');
    expect(t.kind).toBe('unknown');
    expect(t.chip).toBe(''); // no chip — consumer sees nothing
    expect(t.label).toBe('—'); // neutral, never "Type 77"
    expect(t.code).toBe('77'); // diagnostics still get the raw code
    expect(warn).toHaveBeenCalledTimes(1); // fail loud, to the developer
    expect(String(warn.mock.calls[0][0])).toContain('77');
  });

  it('never emits a consumer string containing the raw code', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const code of ['00', '55', '99']) {
      const t = nhlGameType(`2025${code}0001`);
      expect(t.chip).not.toContain(code);
      expect(t.label).not.toContain(code);
      expect(t.chip.toUpperCase()).not.toContain('TYPE');
      expect(t.label.toUpperCase()).not.toContain('TYPE');
    }
  });
});
