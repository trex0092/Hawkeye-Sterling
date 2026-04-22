import { describe, expect, it } from 'vitest';
import {
  matchExact,
  matchLevenshtein,
  matchJaroWinkler,
  matchSoundex,
  matchDoubleMetaphone,
  matchTokenSet,
  matchEnsemble,
  levenshteinDistance,
  jaro,
  jaroWinkler,
  soundex,
} from '../matching.js';

describe('matching — exact', () => {
  it('normalises case and punctuation', () => {
    expect(matchExact('Ivan Ivanov', 'ivan ivanov').pass).toBe(true);
    expect(matchExact('Al-Saeed', 'al saeed').pass).toBe(true);
  });
  it('distinguishes different names', () => {
    expect(matchExact('Ivan Ivanov', 'Ivan Petrov').pass).toBe(false);
  });
});

describe('matching — Levenshtein', () => {
  it('computes correct distance', () => {
    expect(levenshteinDistance('kitten', 'sitting')).toBe(3);
    expect(levenshteinDistance('ahmad', 'ahmed')).toBe(1);
  });
  it('score is 1 for identical strings', () => {
    expect(matchLevenshtein('Muhammad Ali', 'muhammad ali').score).toBe(1);
  });
  it('one-character typo still near 1', () => {
    const m = matchLevenshtein('Muhammad Ali', 'Muhammad Ali ');
    expect(m.score).toBeGreaterThan(0.95);
  });
});

describe('matching — Jaro / Jaro-Winkler', () => {
  it('Jaro returns 1 for equal strings', () => {
    expect(jaro('Khaled', 'Khaled')).toBe(1);
  });
  it('Jaro-Winkler is >= Jaro', () => {
    const a = 'Mohammed';
    const b = 'Mohamed';
    expect(jaroWinkler(a, b)).toBeGreaterThanOrEqual(jaro(a, b));
  });
  it('close typo passes default 0.9 threshold', () => {
    expect(matchJaroWinkler('Mohammed', 'Mohamed').pass).toBe(true);
  });
});

describe('matching — Soundex', () => {
  it('equals expected codes', () => {
    expect(soundex('Robert')).toBe('R163');
    expect(soundex('Rupert')).toBe('R163');
    expect(soundex('Ashcraft')).toBe('A261');
  });
  it('matches homophone variants', () => {
    expect(matchSoundex('Ahmed', 'Ahmad').pass).toBe(true);
  });
});

describe('matching — Double Metaphone', () => {
  it('matches common Arabic romanisation variants', () => {
    expect(matchDoubleMetaphone('Mohammed', 'Mohamed').pass).toBe(true);
  });
});

describe('matching — token-set', () => {
  it('order-insensitive token overlap', () => {
    expect(matchTokenSet('Ivan Ivanovich Ivanov', 'Ivanov Ivan Ivanovich').pass).toBe(true);
  });
  it('low overlap fails the threshold', () => {
    expect(matchTokenSet('Ali Khan', 'Omar Farouk').pass).toBe(false);
  });
});

describe('matching — ensemble', () => {
  it('returns a best score and a phonetic-agreement flag', () => {
    const e = matchEnsemble('Mohammed Ali', 'Mohamed Aly');
    expect(e.best.score).toBeGreaterThan(0.8);
    expect(e.phoneticAgreement).toBe(true);
  });
});
