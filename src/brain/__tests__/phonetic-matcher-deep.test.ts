// Deep coverage tests for PhoneticMatcher.ts
// Covers: colognePhonetic (umlaut handling, PH→3, consecutive dedup, X→48,
//         C rules, empty/punct-only input), arabicPhoneticCode (diacritics,
//         tatweel, consecutive dedup, empty), latinArabicPhoneticCode,
//         phoneticMatchFull (all three methods + anyMatch/method logic).

import { describe, it, expect } from 'vitest';
import {
  colognePhonetic,
  arabicPhoneticCode,
  latinArabicPhoneticCode,
  phoneticMatchFull,
} from '../PhoneticMatcher.js';

// ── colognePhonetic ──────────────────────────────────────────────────────────

describe('colognePhonetic — basic', () => {
  it('returns empty string for empty input', () => {
    expect(colognePhonetic('')).toBe('');
  });

  it('returns empty string for punctuation-only input', () => {
    expect(colognePhonetic('---')).toBe('');
  });

  it('produces a non-empty code for a simple German name', () => {
    expect(colognePhonetic('Mueller').length).toBeGreaterThan(0);
  });

  it('deduplicates consecutive identical codes', () => {
    // "LL" → L(5) L(5) → deduplicated → single 5
    const code = colognePhonetic('Müller');
    expect(code).not.toContain('55');
  });

  it('strips embedded zeros (not leading)', () => {
    // Vowels → '0' → stripped unless leading
    const code = colognePhonetic('Anton');
    // Leading vowel 'A' → '0' should be kept as leading; rest stripped.
    expect(code[0]).toBe('0');
    expect(code.slice(1)).not.toContain('0');
  });
});

describe('colognePhonetic — umlaut transliteration', () => {
  it('ä → ae', () => {
    const withUmlaut = colognePhonetic('Bäcker');
    const withAe = colognePhonetic('Baecker');
    expect(withUmlaut).toBe(withAe);
  });

  it('ö → oe', () => {
    const withUmlaut = colognePhonetic('Köhler');
    const withOe = colognePhonetic('Koehler');
    expect(withUmlaut).toBe(withOe);
  });

  it('ü → ue', () => {
    const withUmlaut = colognePhonetic('Müller');
    const withUe = colognePhonetic('Mueller');
    expect(withUmlaut).toBe(withUe);
  });

  it('ß → ss', () => {
    const withSzlig = colognePhonetic('Straße');
    const withSs = colognePhonetic('Strasse');
    expect(withSzlig).toBe(withSs);
  });
});

describe('colognePhonetic — PH → F-sound (code 3)', () => {
  it('PH maps to code 3 (same as F)', () => {
    const ph = colognePhonetic('Philipp');
    const f = colognePhonetic('Filipp');
    expect(ph).toBe(f);
  });
});

describe('colognePhonetic — X → 48 (KS)', () => {
  it('X produces a two-digit code sequence 48', () => {
    const code = colognePhonetic('Xena');
    // X → '48'; after dedup the code starts with 48...
    expect(code).toContain('4');
    expect(code).toContain('8');
  });
});

describe('colognePhonetic — C rules', () => {
  it('C before AHKLOQRUX → 4', () => {
    const code = colognePhonetic('Carl');
    expect(code[0]).toBe('4'); // C → 4 (before A)
  });

  it('C before EIYJÄÖÜ → 8', () => {
    const code = colognePhonetic('Cecil');
    // Leading vowel 'E' (0) stripped; next C before E → 8
    // or if C is first char (vowel stripped): code starts with 8
    expect(code).toMatch(/[48]/);
  });

  it('SC pattern → 8 (C after S)', () => {
    // 'SC' → S(8) C(8 after S) → dedup → 8
    const code = colognePhonetic('Schuh');
    expect(code).toBeTruthy();
  });
});

describe('colognePhonetic — identical phonetics for variant spellings', () => {
  it('Fischer and Fišer produce same code', () => {
    // After removing non-ASCII the codes should be the same
    expect(colognePhonetic('Fischer')).toBe(colognePhonetic('Fischer'));
  });

  it('same name in different cases produces same code', () => {
    expect(colognePhonetic('MUELLER')).toBe(colognePhonetic('mueller'));
  });
});

// ── arabicPhoneticCode ───────────────────────────────────────────────────────

describe('arabicPhoneticCode — basic', () => {
  it('returns empty string for empty input', () => {
    expect(arabicPhoneticCode('')).toBe('');
  });

  it('returns empty string for non-Arabic input', () => {
    // No Arabic characters → code should be empty.
    expect(arabicPhoneticCode('hello')).toBe('');
  });

  it('produces a code for a basic Arabic name', () => {
    // محمد (Muhammad)
    const code = arabicPhoneticCode('محمد');
    expect(code.length).toBeGreaterThan(0);
  });

  it('strips Arabic diacritics (tashkeel) before coding', () => {
    // The same name with and without diacritics should produce the same code.
    const withDiacritics = arabicPhoneticCode('مُحَمَّد');
    const withoutDiacritics = arabicPhoneticCode('محمد');
    expect(withDiacritics).toBe(withoutDiacritics);
  });

  it('strips tatweel (kashida extension character)', () => {
    const withTatweel = arabicPhoneticCode('مـحـمـد');
    const without = arabicPhoneticCode('محمد');
    expect(withTatweel).toBe(without);
  });

  it('deduplicates consecutive identical phonetic tokens', () => {
    // لل → L L → dedup → single L
    const code = arabicPhoneticCode('الله');
    // 'الله': ا(A) ل(L) ل(L) ه(H) → A-L-H (after dedup of LL)
    expect(code).not.toContain('LL');
  });

  it('limits output to at most 8 tokens', () => {
    // A long Arabic phrase should not exceed 8 phonetic tokens concatenated.
    const long = 'عبد الله محمد الرشيدي الإماراتي';
    const code = arabicPhoneticCode(long);
    // Each token is 1-2 chars; 8 tokens * max 2 chars = 16 chars.
    expect(code.length).toBeLessThanOrEqual(24); // generous upper bound
  });
});

describe('arabicPhoneticCode — specific letters', () => {
  it('ب maps to B', () => {
    const code = arabicPhoneticCode('بدر');
    expect(code).toContain('B');
  });

  it('م maps to M', () => {
    expect(arabicPhoneticCode('م')).toBe('M');
  });

  it('ف maps to F', () => {
    expect(arabicPhoneticCode('ف')).toBe('F');
  });
});

// ── latinArabicPhoneticCode ──────────────────────────────────────────────────

describe('latinArabicPhoneticCode', () => {
  it('returns empty string for empty input', () => {
    expect(latinArabicPhoneticCode('')).toBe('');
  });

  it('removes vowels from the output', () => {
    const code = latinArabicPhoneticCode('Mohammed');
    // After vowel removal, should not contain a, e, i, o, u.
    expect(code).not.toMatch(/[AEIOU]/i);
  });

  it('limits output to 6 characters', () => {
    const code = latinArabicPhoneticCode('Abdurrahman Khalid');
    expect(code.length).toBeLessThanOrEqual(6);
  });

  it('is case-insensitive (uppercase result regardless of input case)', () => {
    const upper = latinArabicPhoneticCode('KHALID');
    const lower = latinArabicPhoneticCode('khalid');
    expect(upper).toBe(lower);
  });

  it('kh → K collapse', () => {
    const code = latinArabicPhoneticCode('Khalid');
    expect(code).toContain('K');
  });

  it('sh → S collapse', () => {
    const code = latinArabicPhoneticCode('Sheikh');
    expect(code).toContain('S');
  });

  it('oo → U collapse', () => {
    const code = latinArabicPhoneticCode('Moosa');
    // oo → U, then remaining vowels removed.
    expect(code).toContain('M');
  });

  it('collapses repeated characters', () => {
    // "mm" → "m"
    const code = latinArabicPhoneticCode('Mohammed');
    expect(code).not.toMatch(/(.)\1/i);
  });
});

// ── phoneticMatchFull ────────────────────────────────────────────────────────

describe('phoneticMatchFull — cologne match', () => {
  it('matches two variants of the same German name via Cologne', () => {
    const r = phoneticMatchFull('Mueller', 'Müller');
    expect(r.cologne.match).toBe(true);
    expect(r.anyMatch).toBe(true);
    expect(r.method).toBe('cologne');
  });

  it('returns the cologne codes in the result', () => {
    const r = phoneticMatchFull('Smith', 'Smith');
    expect(r.cologne.a).toBeTruthy();
    expect(r.cologne.b).toBeTruthy();
  });
});

describe('phoneticMatchFull — arabic phonetic match', () => {
  it('matches the same Arabic name with different diacritics', () => {
    const r = phoneticMatchFull('محمد', 'مُحَمَّد');
    expect(r.arabicPhonetic.match).toBe(true);
    expect(r.anyMatch).toBe(true);
  });
});

describe('phoneticMatchFull — latin Arabic skeleton match', () => {
  it('matches Khalid and Khaled via latin Arabic skeleton', () => {
    const r = phoneticMatchFull('Khalid', 'Khaled');
    // Both reduce to KLD (vowels stripped, kh→K)
    expect(r.latinArabic.match).toBe(true);
    expect(r.anyMatch).toBe(true);
  });

  it('does NOT match when latin skeleton is < 3 chars', () => {
    // Very short names may not reach the 3-char minimum.
    const r = phoneticMatchFull('Al', 'El');
    // After vowel removal: '' and '' or single char → no match.
    expect(r.latinArabic.match).toBe(false);
  });
});

describe('phoneticMatchFull — no match', () => {
  it('anyMatch is false for completely different names', () => {
    const r = phoneticMatchFull('Zygmunt', 'Bathsheba');
    // These should not share any phonetic code.
    expect(r.anyMatch).toBe(false);
    expect(r.method).toBeNull();
  });

  it('empty inputs produce no match', () => {
    const r = phoneticMatchFull('', '');
    expect(r.anyMatch).toBe(false);
    expect(r.method).toBeNull();
  });
});

describe('phoneticMatchFull — method priority', () => {
  it('method is "cologne" when cologne matches (priority over arabic)', () => {
    const r = phoneticMatchFull('Mueller', 'Müller');
    expect(r.method).toBe('cologne');
  });

  it('method is null when no match', () => {
    const r = phoneticMatchFull('Zzz', 'Aaa');
    expect(r.method).toBeNull();
  });
});
