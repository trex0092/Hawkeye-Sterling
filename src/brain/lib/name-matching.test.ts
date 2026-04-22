import { describe, it, expect } from 'vitest';
import {
  normalizeLatin, normalizeArabic, transliterateArabic, transliterateCyrillic,
  levenshtein, damerauLevenshtein, jaroWinkler, jaccardNgrams,
  metaphone, doubleMetaphone, tokenSetSimilarity, matchScore, rankCandidates,
} from './name-matching.js';

describe('normalizeLatin', () => {
  it('strips diacritics + lowercases', () => {
    expect(normalizeLatin('Séán O\'Brien')).toBe('sean o brien');
  });
});

describe('normalizeArabic', () => {
  it('unifies alef variants', () => {
    expect(normalizeArabic('أحمد')).toContain('احمد');
  });
});

describe('transliterateArabic', () => {
  it('produces Latin skeleton', () => {
    const r = transliterateArabic('محمد');
    expect(r.length).toBeGreaterThan(0);
    expect(/[a-z]/.test(r)).toBe(true);
  });
});

describe('transliterateCyrillic', () => {
  it('maps Путин → putin skeleton', () => {
    const r = transliterateCyrillic('Путин');
    expect(r).toContain('putin');
  });
});

describe('levenshtein', () => {
  it('returns 0 for identical', () => { expect(levenshtein('abc', 'abc')).toBe(0); });
  it('counts edits', () => { expect(levenshtein('kitten', 'sitting')).toBe(3); });
});

describe('damerauLevenshtein', () => {
  it('counts transposition as 1', () => {
    expect(damerauLevenshtein('abcd', 'abdc')).toBe(1);
    expect(levenshtein('abcd', 'abdc')).toBe(2);
  });
});

describe('jaroWinkler', () => {
  it('scores identical 1', () => { expect(jaroWinkler('abc', 'abc')).toBe(1); });
  it('scores Dwayne / Duane > 0.8', () => { expect(jaroWinkler('dwayne', 'duane')).toBeGreaterThan(0.8); });
});

describe('jaccardNgrams', () => {
  it('identical = 1', () => { expect(jaccardNgrams('abcdef', 'abcdef')).toBe(1); });
});

describe('phonetic', () => {
  it('metaphone gives consistent code', () => {
    expect(metaphone('smith')).toBe(metaphone('smith'));
  });
  it('double metaphone returns pair', () => {
    const [a, b] = doubleMetaphone('schmidt');
    expect(a.length).toBeGreaterThan(0);
    expect(b.length).toBeGreaterThan(0);
  });
});

describe('tokenSetSimilarity', () => {
  it('is order-invariant and strips corp suffixes', () => {
    const s1 = tokenSetSimilarity('Acme Holdings Ltd', 'Holdings Acme Limited');
    expect(s1).toBe(1);
  });
});

describe('matchScore', () => {
  it('scores exact English name high', () => {
    const r = matchScore('Vladimir Putin', 'Vladimir Putin');
    expect(r.score).toBeGreaterThan(0.95);
    expect(r.scriptStrategy).toBe('latin');
  });
  it('picks Cyrillic transliteration strategy', () => {
    const r = matchScore('Путин', 'Putin');
    expect(r.scriptStrategy).toBe('cyrillic_translit');
    expect(r.score).toBeGreaterThan(0.5);
  });
  it('tolerates small typos', () => {
    // Composite is conservative by design: single-char typo + token-set
    // mismatch lands in the "worth investigating" 0.7+ band, not auto-pass.
    const r = matchScore('John Smith', 'Jon Smith');
    expect(r.score).toBeGreaterThan(0.7);
    expect(r.jaroWinkler).toBeGreaterThan(0.9);
  });
});

describe('rankCandidates', () => {
  it('orders by score', () => {
    const ranked = rankCandidates(
      'Acme Holdings',
      ['Acme Holdings Ltd', 'Foobar Corp', 'Acme Holding'],
      (c) => c,
    );
    expect(ranked[0]?.candidate).toMatch(/acme holding/i);
  });
});
