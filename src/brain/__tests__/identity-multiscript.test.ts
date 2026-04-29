import { describe, expect, it } from 'vitest';
import {
  scriptOf, normaliseArabicName, expandArabicVariants, reorderNameParts,
  parsePartialDate, dobOverlap, matchIdentities, tokeniseLatin,
} from '../identity-multiscript.js';

describe('identity-multiscript: script detection', () => {
  it('detects Arabic', () => { expect(scriptOf('محمد الهاشمي')).toBe('arabic'); });
  it('detects Persian by pe/che/gaf', () => { expect(scriptOf('پارسی')).toBe('persian'); });
  it('detects Cyrillic', () => { expect(scriptOf('Владимир')).toBe('cyrillic'); });
  it('detects CJK', () => { expect(scriptOf('王明')).toBe('cjk'); });
  it('detects Latin', () => { expect(scriptOf('Mohammed Al-Hassan')).toBe('latin'); });
});

describe('identity-multiscript: normaliseArabicName', () => {
  it('normalises hamza-bearing alefs', () => {
    expect(normaliseArabicName('أحمد')).toBe(normaliseArabicName('احمد'));
    expect(normaliseArabicName('إبراهيم')).toBe(normaliseArabicName('ابراهيم'));
  });
  it('maps taa-marbuta to haa', () => {
    expect(normaliseArabicName('فاطمة')).toBe(normaliseArabicName('فاطمه'));
  });
  it('maps Persian kaf/yaa to Arabic', () => {
    expect(normaliseArabicName('حسین')).toBe(normaliseArabicName('حسين'));
  });
});

describe('identity-multiscript: expandArabicVariants', () => {
  it('expands Mohammed into the family', () => {
    const vs = expandArabicVariants('Mohammed');
    expect(vs).toContain('mohammed');
    expect(vs).toContain('muhammad');
    expect(vs).toContain('mohamed');
  });
  it('combines tokens cartesian-style', () => {
    const vs = expandArabicVariants('Mohammed Al-Hassan');
    expect(vs.some((v) => v.startsWith('mohammed'))).toBe(true);
    expect(vs.some((v) => v.startsWith('muhammad'))).toBe(true);
  });
});

describe('identity-multiscript: reorderNameParts', () => {
  it('exposes both [first last] and [last first]', () => {
    const ord = reorderNameParts('Mohammed Al Hassan');
    expect(ord.some((x) => x === 'hassan mohammed')).toBe(true);
    expect(ord.some((x) => x === 'mohammed hassan')).toBe(true);
  });
  it('returns single token for one-token name', () => {
    expect(reorderNameParts('Mohammed')).toEqual(['mohammed']);
  });
});

describe('identity-multiscript: DoB handling', () => {
  it('parses partial dates', () => {
    expect(parsePartialDate('1985')).toEqual({ year: 1985 });
    expect(parsePartialDate('1985-03')).toEqual({ year: 1985, month: 3 });
    expect(parsePartialDate('1985-03-12')).toEqual({ year: 1985, month: 3, day: 12 });
  });
  it('rejects garbage', () => {
    expect(parsePartialDate('March 1985')).toBe(null);
    expect(parsePartialDate('1985-13')).toBe(null);
  });
  it('overlaps with year tolerance', () => {
    expect(dobOverlap('1985-03-12', '1985-03-12')).toBeGreaterThan(0.9);
    expect(dobOverlap('1985', '1986')).toBeGreaterThan(0);       // within tol=1
    expect(dobOverlap('1985', '1990')).toBe(0);                  // outside tol
  });
});

describe('identity-multiscript: matchIdentities end-to-end', () => {
  it('matches Mohammed / Muhammad / محمد across scripts with DoB agreement', () => {
    const r = matchIdentities(
      { name: 'Mohammed Al-Hassan', dob: '1985-03-12', nationality: 'AE' },
      { name: 'محمد الحسن',           dob: '1985-03-12', nationality: 'AE' },
    );
    expect(r.overallScore).toBeGreaterThan(0.7);
    expect(r.dobScore).toBeGreaterThan(0.9);
    expect(r.nationalityMatch).toBe(true);
  });
  it('caps score on strong-ID conflict', () => {
    const r = matchIdentities(
      { name: 'Ali Hassan', identifiers: { passport: 'X1234' } },
      { name: 'Ali Hassan', identifiers: { passport: 'Y9999' } },
    );
    expect(r.strongIdConflict).not.toBeNull();
    expect(r.overallScore).toBeLessThanOrEqual(0.5);
  });
  it('rewards matching strong ID', () => {
    const r = matchIdentities(
      { name: 'Ali Hassan', identifiers: { passport: 'X1234' } },
      { name: 'A Hassan',   identifiers: { passport: 'X1234' } },
    );
    expect(r.strongIdHit).not.toBeNull();
    expect(r.overallScore).toBeGreaterThan(0.6);
  });
  it('tokenises Latin and strips particles', () => {
    expect(tokeniseLatin('H.E. Sheikh Mohammed Al-Hassan')).toEqual(['mohammed', 'hassan']);
  });
});
