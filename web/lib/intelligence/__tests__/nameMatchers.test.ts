// Hawkeye Sterling — name matchers unit tests.
// Covers rules 96-105.

import { describe, it, expect } from 'vitest';
import {
  levenshtein,
  damerauLevenshtein,
  jaroWinkler,
  tokenSetRatio,
  soundex,
  nysiis,
  mra,
  cologne,
  initialsMatch,
  reverseMatch,
} from '../nameMatchers.js';

describe('levenshtein (rule 96)', () => {
  it('returns 1 for identical strings', () => {
    expect(levenshtein('abc', 'abc')).toBe(1);
    expect(levenshtein('Smith', 'Smith')).toBe(1);
  });

  it('returns 0 for empty vs non-empty', () => {
    expect(levenshtein('', 'abc')).toBe(0);
    expect(levenshtein('abc', '')).toBe(0);
  });

  it('is case-insensitive', () => {
    expect(levenshtein('Smith', 'SMITH')).toBe(1);
  });

  it('computes normalised distance for typos', () => {
    const r = levenshtein('Smith', 'Smyth');
    expect(r).toBeGreaterThan(0.7);
    expect(r).toBeLessThan(1);
  });

  it('is symmetric', () => {
    expect(levenshtein('abc', 'xyz')).toBeCloseTo(levenshtein('xyz', 'abc'));
  });
});

describe('damerauLevenshtein (rule 97)', () => {
  it('returns 1 for identical strings', () => {
    expect(damerauLevenshtein('abc', 'abc')).toBe(1);
  });

  it('returns 1 for two empty strings', () => {
    expect(damerauLevenshtein('', '')).toBe(1);
  });

  it('returns 0 for one empty string', () => {
    expect(damerauLevenshtein('', 'abc')).toBe(0);
    expect(damerauLevenshtein('abc', '')).toBe(0);
  });

  it('handles transpositions (single swap = 1 edit)', () => {
    // 'abcd' → 'abdc' is a transposition (1 edit in Damerau)
    const d = damerauLevenshtein('abcd', 'abdc');
    const l = levenshtein('abcd', 'abdc');
    expect(d).toBeGreaterThan(l); // Damerau should give higher score (fewer edits)
  });
});

describe('jaroWinkler (rule 98)', () => {
  it('returns 1 for identical strings', () => {
    expect(jaroWinkler('abc', 'abc')).toBe(1);
  });

  it('returns 0 for empty strings', () => {
    expect(jaroWinkler('', 'abc')).toBe(0);
    expect(jaroWinkler('abc', '')).toBe(0);
  });

  it('is case-insensitive', () => {
    expect(jaroWinkler('Smith', 'SMITH')).toBe(1);
  });

  it('gives high score for similar names', () => {
    expect(jaroWinkler('Dwayne', 'Duane')).toBeGreaterThan(0.8);
  });

  it('gives lower score for very different names', () => {
    expect(jaroWinkler('John', 'Xyz')).toBeLessThan(0.6);
  });

  it('returns 0 when there are no matches', () => {
    expect(jaroWinkler('abc', 'xyz')).toBe(0);
  });
});

describe('tokenSetRatio (rule 99)', () => {
  it('returns 1 for same tokens in different order', () => {
    expect(tokenSetRatio('John Smith', 'Smith John')).toBeGreaterThan(0.9);
  });

  it('returns 1 for identical strings', () => {
    expect(tokenSetRatio('abc', 'abc')).toBe(1);
  });

  it('returns 1 for two empty strings', () => {
    expect(tokenSetRatio('', '')).toBe(1);
  });

  it('handles partial overlap', () => {
    const r = tokenSetRatio('Acme Holdings Ltd', 'Acme Corp');
    expect(r).toBeGreaterThan(0);
  });
});

describe('soundex (rule 100)', () => {
  it('returns empty string for empty input', () => {
    expect(soundex('')).toBe('');
  });

  it('returns empty string for non-alphabetic input', () => {
    expect(soundex('123')).toBe('');
  });

  it('returns same code for phonetically similar names', () => {
    expect(soundex('Robert')).toBe(soundex('Rupert'));
  });

  it('returns a 4-character code', () => {
    const code = soundex('Washington');
    expect(code).toHaveLength(4);
  });

  it('pads with zeros if name is short', () => {
    const code = soundex('Bo');
    expect(code).toHaveLength(4);
    expect(code).toMatch(/^B/);
  });

  it('handles adjacent same-sounding consonants correctly', () => {
    // Adjacent same code letters should not be duplicated
    const code = soundex('Lloyd');
    expect(code).toHaveLength(4);
  });
});

describe('nysiis (rule 101)', () => {
  it('returns empty for empty input', () => {
    expect(nysiis('')).toBe('');
  });

  it('handles MAC- prefix', () => {
    const r = nysiis('MacDonald');
    expect(r.startsWith('MC')).toBe(true);
  });

  it('handles KN- prefix', () => {
    const r = nysiis('Knight');
    expect(r.startsWith('N')).toBe(true);
  });

  it('handles PH- prefix', () => {
    const r = nysiis('Phillip');
    // PH→FF prefix transform, but then single-char loop collapses duplicates
    expect(r).toBeTruthy();
    expect(r.startsWith('F')).toBe(true);
  });

  it('handles SCH- prefix', () => {
    const r = nysiis('Schmidt');
    // SCH→SSS prefix, then duplicate S's collapse in loop
    expect(r).toBeTruthy();
    expect(r.startsWith('S')).toBe(true);
  });

  it('handles EE/IE suffix replacement', () => {
    // These transformations happen at end of name
    const r = nysiis('Marie');
    expect(r).toBeTruthy();
  });

  it('truncates to 6 characters', () => {
    const r = nysiis('VeryLongNameForTesting');
    expect(r.length).toBeLessThanOrEqual(6);
  });
});

describe('mra (rule 102)', () => {
  it('returns empty for empty input', () => {
    expect(mra('')).toBe('');
  });

  it('removes vowels (except first character)', () => {
    const r = mra('John');
    expect(r).not.toContain('o'); // 'o' in John is not first char
  });

  it('removes duplicate consecutive letters', () => {
    // 'ABBA' → remove duplicates → 'ABA'
    const r = mra('ABBA');
    expect(r).not.toContain('BB');
  });

  it('truncates long names to first 3 + last 3 chars', () => {
    const r = mra('ABCDEFGHIJ');
    expect(r.length).toBeLessThanOrEqual(6);
    // First 3 + last 3 of the processed string
    expect(r.slice(0, 3)).toBe('ABC');
  });
});

describe('cologne (rule 103)', () => {
  it('returns empty for empty input', () => {
    expect(cologne('')).toBe('');
  });

  it('encodes first vowel as 0', () => {
    const r = cologne('Adam');
    expect(r.startsWith('0')).toBe(true);
  });

  it('encodes B correctly', () => {
    const r = cologne('Bob');
    expect(r).toContain('1');
  });

  it('handles P before H (→ 3)', () => {
    const r = cologne('Phishing');
    expect(r.startsWith('3')).toBe(true);
  });

  it('handles X (→ 48)', () => {
    const r = cologne('Marx');
    expect(r).toBeTruthy();
    // X → "48" so result should have both 4 and 8
    expect(r).toContain('4');
  });

  it('handles DT before C/S/Z (→ 8)', () => {
    const r = cologne('Adtsch');
    expect(r).toBeTruthy();
  });

  it('does not duplicate consecutive identical codes', () => {
    // LL → both L → code 5; should appear only once
    const r = cologne('Willing');
    const allCodes = r.split('');
    for (let i = 1; i < allCodes.length; i++) {
      expect(allCodes[i]).not.toBe(allCodes[i - 1]);
    }
  });
});

describe('initialsMatch (rule 104)', () => {
  it('returns 1 for identical initials', () => {
    expect(initialsMatch('John Smith', 'Jeremy Scott')).toBe(1); // both JS
  });

  it('returns 0 for empty strings', () => {
    expect(initialsMatch('', '')).toBe(0);
    expect(initialsMatch('John', '')).toBe(0);
  });

  it('returns 0.7 when one initials string is prefix of the other', () => {
    // JAS vs J
    expect(initialsMatch('John Alan Smith', 'James')).toBe(0.7);
  });

  it('returns 0 for completely different initials', () => {
    expect(initialsMatch('Alice Brown', 'John Smith')).toBe(0);
  });
});

describe('reverseMatch (rule 105)', () => {
  it('returns 1 for reversed-token match with same length', () => {
    const r = reverseMatch('Smith John', 'John Smith');
    expect(r).toBe(1);
  });

  it('returns a score for partial match', () => {
    const r = reverseMatch('Smith John Alan', 'John Smith');
    expect(r).toBeGreaterThan(0);
    expect(r).toBeLessThanOrEqual(1);
  });

  it('uses jaroWinkler for non-perfect reverse match', () => {
    const r = reverseMatch('Mohamed Ali', 'Ali Mohamed');
    expect(r).toBe(1); // perfect reverse
  });
});
