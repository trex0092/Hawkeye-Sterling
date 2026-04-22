import { describe, expect, it } from 'vitest';
import { normaliseArabicRoman, romanise } from '../translit.js';
import { expandAliases } from '../aliases.js';

describe('arabic romanisation', () => {
  it('collapses Muhammad family to a single canonical', () => {
    for (const v of ['Muhammad', 'Mohammed', 'Mohamed', 'Mohamad', 'Mohd', 'Mohammad']) {
      expect(normaliseArabicRoman(v)).toBe('muhammad');
    }
  });

  it('strips particles and honorifics', () => {
    expect(normaliseArabicRoman('H.H. Sheikh Mohammed bin Rashid Al Maktoum'))
      .toBe('muhammad rashid maktoum');
  });

  it('collapses compound names like abdul rahman', () => {
    expect(normaliseArabicRoman('Abdul Rahman Al-Saeed')).toBe('abdul rahman al saeed');
  });

  it('romanise returns tokens and particles-stripped separately', () => {
    const r = romanise('Sheikh Mohammed bin Rashid');
    expect(r.tokens).toEqual(['muhammad', 'rashid']);
    expect(r.particlesStripped).toContain('sheikh');
    expect(r.particlesStripped).toContain('bin');
  });
});

describe('alias expander', () => {
  it('produces Muhammad romanisation family', () => {
    const e = expandAliases('Muhammad Ali');
    expect(e.variants).toEqual(expect.arrayContaining(['mohammed ali', 'mohamed ali', 'mohamad ali']));
    expect(e.canonical).toBe('muhammad ali');
  });

  it('includes name-order permutations', () => {
    const e = expandAliases('Ivan Ivanovich Ivanov');
    expect(e.variants.length).toBeGreaterThan(1);
  });
});
