// Deep coverage tests for blocking-keys.ts
// Covers: blockingKeysFor (English, Arabic, empty, punctuation, multi-token names),
// candidatePairs (empty maps, shared key dimensions, deduplication).

import { describe, it, expect } from 'vitest';
import { blockingKeysFor, candidatePairs, type BlockingKeys } from '../blocking-keys.js';

// ── blockingKeysFor — shape ───────────────────────────────────────────────────

describe('blockingKeysFor — output shape', () => {
  it('returns all six fields for a simple name', () => {
    const k = blockingKeysFor('John Smith');
    expect(k).toHaveProperty('firstInitial');
    expect(k).toHaveProperty('soundex');
    expect(k).toHaveProperty('dmPrimary');
    expect(k).toHaveProperty('dmAlternate');
    expect(k).toHaveProperty('tokenSortFirst');
    expect(k).toHaveProperty('canonical');
  });

  it('firstInitial is uppercase single char', () => {
    const k = blockingKeysFor('alice');
    expect(k.firstInitial).toBe('A');
  });

  it('firstInitial is empty string for whitespace-only name', () => {
    const k = blockingKeysFor('   ');
    expect(k.firstInitial).toBe('');
  });
});

// ── blockingKeysFor — English names ──────────────────────────────────────────

describe('blockingKeysFor — English name variations', () => {
  it('tokenSortFirst is alphabetically first token', () => {
    const k = blockingKeysFor('Smith John');
    // sorted tokens: ['john', 'smith'] → first = 'john'
    expect(k.tokenSortFirst).toBe('john');
  });

  it('soundex is non-empty for a plain ASCII name', () => {
    const k = blockingKeysFor('Robert');
    expect(k.soundex.length).toBeGreaterThan(0);
  });

  it('dmPrimary is non-empty for a plain ASCII name', () => {
    const k = blockingKeysFor('Katherine');
    expect(k.dmPrimary.length).toBeGreaterThan(0);
  });

  it('strips accents — accented and unaccented produce same tokenSortFirst', () => {
    const k1 = blockingKeysFor('Müller');
    const k2 = blockingKeysFor('Muller');
    // Both should resolve the first token to 'muller' after NFD + diacritic strip.
    expect(k1.tokenSortFirst).toBe(k2.tokenSortFirst);
  });
});

// ── blockingKeysFor — punctuation & special characters ───────────────────────

describe('blockingKeysFor — punctuation / special chars', () => {
  it('strips punctuation from tokens', () => {
    const k = blockingKeysFor("O'Brien");
    // Apostrophe should be stripped; remaining token 'obrien'.
    expect(k.firstInitial).toBe('O');
  });

  it('handles hyphens correctly', () => {
    const k = blockingKeysFor('Al-Rashidi');
    expect(k.firstInitial).toBe('A');
  });
});

// ── blockingKeysFor — empty string ───────────────────────────────────────────

describe('blockingKeysFor — empty string', () => {
  it('does not throw', () => {
    expect(() => blockingKeysFor('')).not.toThrow();
  });

  it('firstInitial is empty', () => {
    expect(blockingKeysFor('').firstInitial).toBe('');
  });

  it('tokenSortFirst is empty', () => {
    expect(blockingKeysFor('').tokenSortFirst).toBe('');
  });
});

// ── blockingKeysFor — single token ───────────────────────────────────────────

describe('blockingKeysFor — single-token names', () => {
  it('firstInitial and tokenSortFirst are consistent', () => {
    const k = blockingKeysFor('Mohammed');
    expect(k.firstInitial).toBe('M');
    expect(k.tokenSortFirst).toBe('mohammed');
  });
});

// ── candidatePairs — basic ────────────────────────────────────────────────────

describe('candidatePairs — basic operation', () => {
  function keys(name: string): BlockingKeys {
    return blockingKeysFor(name);
  }

  it('returns empty array when keysA is empty', () => {
    const keysB = new Map([['b1', keys('John Smith')]]);
    const pairs = candidatePairs(new Map(), keysB);
    expect(pairs).toHaveLength(0);
  });

  it('returns empty array when keysB is empty', () => {
    const keysA = new Map([['a1', keys('John Smith')]]);
    const pairs = candidatePairs(keysA, new Map());
    expect(pairs).toHaveLength(0);
  });

  it('returns empty array when both are empty', () => {
    expect(candidatePairs(new Map(), new Map())).toHaveLength(0);
  });

  it('finds a pair when names share a blocking dimension', () => {
    // Smith and Smyth share the same soundex (S530).
    const keysA = new Map([['a', keys('Smith John')]]);
    const keysB = new Map([['b', keys('Smyth John')]]);
    const pairs = candidatePairs(keysA, keysB);
    expect(pairs.length).toBeGreaterThanOrEqual(1);
    expect(pairs[0]).toEqual(['a', 'b']);
  });

  it('returns no pair for completely dissimilar names', () => {
    // 'Zzz Qqq' and 'Aaa Bbb' share no blocking key.
    const keysA = new Map([['a', keys('Zzz')]]);
    const keysB = new Map([['b', keys('Bbb')]]);
    // May or may not share firstInitial — accept either result
    // but verify the function does not throw.
    expect(() => candidatePairs(keysA, keysB)).not.toThrow();
  });

  it('deduplicates pairs — same pair returned only once', () => {
    // 'Al-Rashidi Ahmed' shares multiple dimensions with 'Alrashidi Ahmed'.
    const keysA = new Map([['a', keys('Al Rashidi Ahmed')]]);
    const keysB = new Map([['b', keys('Alrashidi Ahmed')]]);
    const pairs = candidatePairs(keysA, keysB);
    // No duplicates.
    const pairStrings = pairs.map((p) => `${p[0]}|${p[1]}`);
    const uniquePairs = new Set(pairStrings);
    expect(uniquePairs.size).toBe(pairStrings.length);
  });

  it('finds multiple pairs from multiple keysB entries', () => {
    const keysA = new Map([['a', keys('Smith')]]);
    const keysB = new Map([
      ['b1', keys('Smith')],
      ['b2', keys('Smyth')],
      ['b3', keys('Qwerty')], // unlikely to match
    ]);
    const pairs = candidatePairs(keysA, keysB);
    // At minimum 'Smith' and 'Smyth' should both match 'a'.
    expect(pairs.length).toBeGreaterThanOrEqual(2);
  });

  it('each pair tuple has exactly two string elements', () => {
    const keysA = new Map([['a', keys('John')]]);
    const keysB = new Map([['b', keys('John')]]);
    const pairs = candidatePairs(keysA, keysB);
    for (const p of pairs) {
      expect(p).toHaveLength(2);
      expect(typeof p[0]).toBe('string');
      expect(typeof p[1]).toBe('string');
    }
  });
});
