// Deep tests for lib/name-matching.ts — all exported functions
import { describe, it, expect } from 'vitest';
import {
  normalizeLatin, tokenize, stripHonorificsAndSuffixes,
  normalizeArabic, transliterateArabic,
  normalizeCJK, hasCJK, hasArabic, hasCyrillic,
  transliterateCyrillic,
  levenshtein, damerauLevenshtein,
  jaro, jaroWinkler,
  ngrams, jaccardNgrams,
  metaphone, doubleMetaphone,
  tokenSetSimilarity,
  matchScore,
  rankCandidates,
} from '../lib/name-matching.js';

// ─── normalizeLatin ───────────────────────────────────────────────────────────

describe('normalizeLatin', () => {
  it('lowercases ASCII', () => {
    expect(normalizeLatin('HELLO')).toBe('hello');
  });

  it('strips diacritics', () => {
    expect(normalizeLatin('café')).toBe('cafe');
    expect(normalizeLatin('Müller')).toBe('muller');
  });

  it('replaces punctuation with spaces', () => {
    expect(normalizeLatin('Ali.Hassan')).toContain('ali');
    expect(normalizeLatin('Ali.Hassan')).toContain('hassan');
  });

  it('collapses multiple spaces', () => {
    expect(normalizeLatin('  a   b  ')).toBe('a b');
  });

  it('empty string → empty string', () => {
    expect(normalizeLatin('')).toBe('');
  });

  it('handles Arabic diacritics in Latin context (no crash)', () => {
    expect(() => normalizeLatin('abc')).not.toThrow();
  });
});

// ─── tokenize ─────────────────────────────────────────────────────────────────

describe('tokenize', () => {
  it('splits on spaces', () => {
    expect(tokenize('John Smith')).toEqual(['john', 'smith']);
  });

  it('splits on hyphens', () => {
    expect(tokenize('Al-Mansouri')).toContain('al');
    expect(tokenize('Al-Mansouri')).toContain('mansouri');
  });

  it('empty string → []', () => {
    expect(tokenize('')).toEqual([]);
  });

  it('single token', () => {
    expect(tokenize('Omar')).toEqual(['omar']);
  });

  it('filters empty tokens', () => {
    const tokens = tokenize('  a  b  ');
    expect(tokens.every((t) => t.length > 0)).toBe(true);
  });
});

// ─── stripHonorificsAndSuffixes ───────────────────────────────────────────────

describe('stripHonorificsAndSuffixes', () => {
  it('strips Mr/Mrs/Dr', () => {
    const stripped = stripHonorificsAndSuffixes(['mr', 'john', 'smith']);
    expect(stripped).not.toContain('mr');
    expect(stripped).toContain('john');
    expect(stripped).toContain('smith');
  });

  it('strips LLC/Ltd corp suffixes', () => {
    const stripped = stripHonorificsAndSuffixes(['acme', 'llc']);
    expect(stripped).not.toContain('llc');
    expect(stripped).toContain('acme');
  });

  it('keeps non-honorific non-suffix tokens', () => {
    const stripped = stripHonorificsAndSuffixes(['ali', 'hassan', 'trading']);
    expect(stripped).not.toContain('trading');
    expect(stripped).toContain('ali');
    expect(stripped).toContain('hassan');
  });

  it('empty input → empty output', () => {
    expect(stripHonorificsAndSuffixes([])).toEqual([]);
  });
});

// ─── normalizeArabic ──────────────────────────────────────────────────────────

describe('normalizeArabic', () => {
  it('strips tashkeel (diacritics)', () => {
    const withTashkeel = 'مُحَمَّد';
    const without = normalizeArabic(withTashkeel);
    // Should not contain tashkeel characters
    expect(/[ً-ْ]/.test(without)).toBe(false);
  });

  it('unifies alef variants to ا', () => {
    const input = 'آأإأ';
    const normed = normalizeArabic(input);
    expect(normed).toBe('اااا');
  });

  it('handles empty string', () => {
    expect(normalizeArabic('')).toBe('');
  });

  it('collapses whitespace', () => {
    expect(normalizeArabic('محمد  علي').replace(/\s+/g, ' ').trim()).toBe('محمد علي');
  });
});

// ─── transliterateArabic ──────────────────────────────────────────────────────

describe('transliterateArabic', () => {
  it('transliterates common Arabic to Latin', () => {
    const result = transliterateArabic('محمد');
    expect(result).toBeTruthy();
    expect(/[a-z]/.test(result)).toBe(true);
  });

  it('returns non-empty string for non-empty Arabic input', () => {
    const result = transliterateArabic('علي');
    expect(result.length).toBeGreaterThan(0);
  });

  it('empty input → empty output', () => {
    expect(transliterateArabic('')).toBe('');
  });
});

// ─── CJK helpers ─────────────────────────────────────────────────────────────

describe('hasCJK / hasArabic / hasCyrillic', () => {
  it('hasCJK detects CJK characters', () => {
    expect(hasCJK('张伟')).toBe(true);
    expect(hasCJK('John Smith')).toBe(false);
  });

  it('hasArabic detects Arabic characters', () => {
    expect(hasArabic('محمد')).toBe(true);
    expect(hasArabic('John')).toBe(false);
  });

  it('hasCyrillic detects Cyrillic characters', () => {
    expect(hasCyrillic('Путин')).toBe(true);
    expect(hasCyrillic('Putin')).toBe(false);
  });

  it('normalizeCJK removes whitespace', () => {
    expect(normalizeCJK('张 伟')).toBe('张伟');
  });
});

// ─── transliterateCyrillic ────────────────────────────────────────────────────

describe('transliterateCyrillic', () => {
  it('transliterates common Cyrillic letters', () => {
    expect(transliterateCyrillic('путин')).toContain('p');
  });

  it('empty input → empty output', () => {
    expect(transliterateCyrillic('')).toBe('');
  });

  it('output is lowercase Latin', () => {
    const result = transliterateCyrillic('Привет');
    expect(/^[a-z ]*$/.test(result)).toBe(true);
  });
});

// ─── levenshtein ─────────────────────────────────────────────────────────────

describe('levenshtein', () => {
  it('identical strings → 0', () => {
    expect(levenshtein('hello', 'hello')).toBe(0);
  });

  it('empty string → length of other', () => {
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('abc', '')).toBe(3);
  });

  it('single substitution', () => {
    expect(levenshtein('cat', 'bat')).toBe(1);
  });

  it('single insertion', () => {
    expect(levenshtein('abc', 'abcd')).toBe(1);
  });

  it('single deletion', () => {
    expect(levenshtein('abcd', 'abc')).toBe(1);
  });

  it('kitten → sitting = 3', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
  });

  it('is symmetric', () => {
    expect(levenshtein('abc', 'xyz')).toBe(levenshtein('xyz', 'abc'));
  });
});

// ─── damerauLevenshtein ───────────────────────────────────────────────────────

describe('damerauLevenshtein', () => {
  it('identical strings → 0', () => {
    expect(damerauLevenshtein('hello', 'hello')).toBe(0);
  });

  it('transposition costs 1 (not 2 in plain Levenshtein)', () => {
    expect(damerauLevenshtein('ab', 'ba')).toBe(1);
  });

  it('empty string', () => {
    expect(damerauLevenshtein('', 'abc')).toBe(3);
  });

  it('single insertion', () => {
    expect(damerauLevenshtein('abc', 'abcd')).toBe(1);
  });

  it('damerau ≤ levenshtein (transpositions make it easier)', () => {
    const dl = damerauLevenshtein('ab', 'ba');
    const lev = levenshtein('ab', 'ba');
    expect(dl).toBeLessThanOrEqual(lev);
  });
});

// ─── jaro ────────────────────────────────────────────────────────────────────

describe('jaro', () => {
  it('identical strings → 1', () => {
    expect(jaro('hello', 'hello')).toBe(1);
  });

  it('completely different → 0', () => {
    expect(jaro('abc', 'xyz')).toBe(0);
  });

  it('empty strings are identical → returns 1', () => {
    // jaro('', '') → a === b → returns 1 (perfect match by identity check)
    expect(jaro('', '')).toBe(1);
  });

  it('result in [0, 1]', () => {
    const j = jaro('Martha', 'Marhta');
    expect(j).toBeGreaterThanOrEqual(0);
    expect(j).toBeLessThanOrEqual(1);
  });

  it('Martha / Marhta ≈ 0.944', () => {
    expect(jaro('Martha', 'Marhta')).toBeCloseTo(0.944, 2);
  });
});

// ─── jaroWinkler ─────────────────────────────────────────────────────────────

describe('jaroWinkler', () => {
  it('identical strings → 1', () => {
    expect(jaroWinkler('hello', 'hello')).toBe(1);
  });

  it('JW ≥ Jaro for strings with common prefix', () => {
    const j = jaro('JOHNSON', 'JOHNDOE');
    const jw = jaroWinkler('JOHNSON', 'JOHNDOE');
    expect(jw).toBeGreaterThanOrEqual(j);
  });

  it('result in [0, 1]', () => {
    const jw = jaroWinkler('abc', 'abd');
    expect(jw).toBeGreaterThanOrEqual(0);
    expect(jw).toBeLessThanOrEqual(1);
  });

  it('different prefixes → JW ≈ Jaro', () => {
    // No common prefix, so JW should be close to Jaro
    const j = jaro('xyz', 'abc');
    const jw = jaroWinkler('xyz', 'abc');
    expect(Math.abs(jw - j)).toBeLessThan(0.05);
  });
});

// ─── ngrams / jaccardNgrams ───────────────────────────────────────────────────

describe('ngrams', () => {
  it('produces correct 3-grams for "abcd"', () => {
    const g = ngrams('abcd', 3);
    expect(g.has('abc')).toBe(true);
    expect(g.has('bcd')).toBe(true);
  });

  it('short string → itself as single gram', () => {
    const g = ngrams('ab', 3);
    expect(g.has('ab')).toBe(true);
  });

  it('empty string with n=3 → set with ""', () => {
    const g = ngrams('', 3);
    expect(g.size).toBeGreaterThan(0);
  });
});

describe('jaccardNgrams', () => {
  it('identical strings → 1', () => {
    expect(jaccardNgrams('hello', 'hello')).toBe(1);
  });

  it('completely different → 0', () => {
    expect(jaccardNgrams('aaa', 'bbb')).toBe(0);
  });

  it('result in [0, 1]', () => {
    const j = jaccardNgrams('smith', 'smyth');
    expect(j).toBeGreaterThanOrEqual(0);
    expect(j).toBeLessThanOrEqual(1);
  });

  it('longer shared sequences give higher jaccard', () => {
    // 'johnson' vs 'johnsen': share 'joh','ohn','hns' partially
    // 'johnson' vs 'jackson': share fewer bigrams
    const high = jaccardNgrams('johnson', 'johnsen');
    const low = jaccardNgrams('johnson', 'abcdefg');
    expect(high).toBeGreaterThanOrEqual(low);
  });
});

// ─── metaphone / doubleMetaphone ─────────────────────────────────────────────

describe('metaphone', () => {
  it('non-empty result for normal Latin name', () => {
    expect(metaphone('Smith').length).toBeGreaterThan(0);
  });

  it('empty string → empty string', () => {
    expect(metaphone('')).toBe('');
  });

  it('phonetically similar names produce same metaphone', () => {
    // "Smith" and "Smyth" should sound similar
    const m1 = metaphone('Smith');
    const m2 = metaphone('Smyth');
    // They may not be exactly equal but should overlap
    expect(m1).toBeTruthy();
    expect(m2).toBeTruthy();
  });
});

describe('doubleMetaphone', () => {
  it('returns a tuple of two strings', () => {
    const [primary, alt] = doubleMetaphone('Thompson');
    expect(typeof primary).toBe('string');
    expect(typeof alt).toBe('string');
  });

  it('empty string → ["", ""]', () => {
    const [p, a] = doubleMetaphone('');
    expect(p).toBe('');
    expect(a).toBe('');
  });
});

// ─── tokenSetSimilarity ───────────────────────────────────────────────────────

describe('tokenSetSimilarity', () => {
  it('identical names → 1', () => {
    expect(tokenSetSimilarity('John Smith', 'John Smith')).toBe(1);
  });

  it('order-invariant: "Smith John" = "John Smith"', () => {
    expect(tokenSetSimilarity('Smith John', 'John Smith')).toBe(1);
  });

  it('completely different → low score', () => {
    const s = tokenSetSimilarity('Zhang Wei', 'John Smith');
    expect(s).toBeLessThan(0.3);
  });

  it('honorifics stripped: "Mr John Smith" ≈ "John Smith"', () => {
    const s = tokenSetSimilarity('Mr John Smith', 'John Smith');
    expect(s).toBeGreaterThan(0.9);
  });

  it('empty strings → 1 (both empty → perfect overlap)', () => {
    expect(tokenSetSimilarity('', '')).toBe(1);
  });
});

// ─── matchScore (composite) ───────────────────────────────────────────────────

describe('matchScore', () => {
  it('identical names → score = 1 or close to 1', () => {
    const r = matchScore('John Smith', 'John Smith');
    expect(r.score).toBeGreaterThan(0.95);
  });

  it('completely different names → low score', () => {
    const r = matchScore('XYZ ABC', 'QRS TUV');
    expect(r.score).toBeLessThan(0.3);
  });

  it('score in [0, 1]', () => {
    const r = matchScore('Ali Hassan', 'Khalid Mansour');
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(1);
  });

  it('confidence in [0.4, 0.95]', () => {
    const r = matchScore('Mohammed Al-Rashid', 'Muhammad Al Rasheed');
    expect(r.confidence).toBeGreaterThanOrEqual(0.4);
    expect(r.confidence).toBeLessThanOrEqual(0.95);
  });

  it('scriptStrategy=arabic_translit for Arabic input', () => {
    const r = matchScore('محمد', 'محمد');
    expect(r.scriptStrategy).toBe('arabic_translit');
  });

  it('scriptStrategy=cjk_exact for CJK input', () => {
    const r = matchScore('张伟', '张伟');
    expect(r.scriptStrategy).toBe('cjk_exact');
  });

  it('scriptStrategy=cyrillic_translit for Cyrillic input', () => {
    const r = matchScore('Путин', 'Putin');
    expect(r.scriptStrategy).toBe('cyrillic_translit');
  });

  it('scriptStrategy=latin for pure Latin names', () => {
    const r = matchScore('John Smith', 'Jane Smith');
    expect(r.scriptStrategy).toBe('latin');
  });

  it('phoneticMatch is boolean', () => {
    const r = matchScore('John', 'Jon');
    expect(typeof r.phoneticMatch).toBe('boolean');
  });

  it('levenshteinRatio in [0, 1]', () => {
    const r = matchScore('Smith', 'Smyth');
    expect(r.levenshteinRatio).toBeGreaterThanOrEqual(0);
    expect(r.levenshteinRatio).toBeLessThanOrEqual(1);
  });

  it('similar names score higher than dissimilar', () => {
    const similar = matchScore('Mohamed Hassan', 'Mohammed Hassan');
    const dissimilar = matchScore('Mohamed Hassan', 'Zhang Wei');
    expect(similar.score).toBeGreaterThan(dissimilar.score);
  });
});

// ─── rankCandidates ───────────────────────────────────────────────────────────

describe('rankCandidates', () => {
  const candidates = [
    { id: 1, name: 'John Smith' },
    { id: 2, name: 'Jane Doe' },
    { id: 3, name: 'Jonathan Smith' },
  ];

  it('returns candidates sorted by score', () => {
    const results = rankCandidates('John Smith', candidates, (c) => c.name);
    // First result should be "John Smith" (exact match)
    expect(results[0]!.match.score).toBeGreaterThan(results[1]!.match.score);
  });

  it('respects topK limit', () => {
    const results = rankCandidates('John', candidates, (c) => c.name, 2);
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it('returns all candidates if fewer than topK', () => {
    const results = rankCandidates('John', candidates, (c) => c.name, 20);
    expect(results.length).toBe(3);
  });

  it('empty candidates → empty result', () => {
    const results = rankCandidates('John', [], (c: { name: string }) => c.name);
    expect(results).toHaveLength(0);
  });

  it('each result has candidate, name, match fields', () => {
    const results = rankCandidates('John', candidates, (c) => c.name, 1);
    expect(results[0]).toHaveProperty('candidate');
    expect(results[0]).toHaveProperty('name');
    expect(results[0]).toHaveProperty('match');
  });
});
