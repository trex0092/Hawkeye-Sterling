// Hawkeye Sterling — phonetic matcher.
// Implements Cologne phonetics (Kölner Phonetik) and an Arabic phonetic
// approximation algorithm for detecting intentionally misspelled sanctioned
// names. Double Metaphone is implemented in matching.ts; this module adds
// the Cologne algorithm and Arabic-specific phonetics.
//
// Sanctioned names are routinely misspelled to evade screening.
// Phonetic algorithms catch these evasion techniques.

// ── Cologne Phonetics (Kölner Phonetik) ──────────────────────────────────────
// Designed for German but effective for European names broadly.
// RFC: Hans Joachim Postel, 1969.
// Produces a digit string; leading zeros are collapsed.

// Cologne code table: maps characters to codes.
// H and silent letters → ''; vowels → '0'
function cologneCharCode(prev: string, curr: string, next: string): string {
  const c = curr.toUpperCase();
  const n = next.toUpperCase();
  const p = prev.toUpperCase();

  // Vowels
  if ('AEIJOUY'.includes(c)) return '0';
  // H is silent
  if (c === 'H') return '';
  // B, P (not before H)
  if (c === 'B') return '1';
  if (c === 'P') {
    if (n === 'H') return '3'; // PH → 3 (F-sound)
    return '1';
  }
  // D, T (not before C, S, Z)
  if (c === 'D' || c === 'T') {
    if ('CSZ'.includes(n)) return '8';
    return '2';
  }
  // F, V, W
  if ('FVW'.includes(c)) return '3';
  // G, K, Q
  if ('GKQ'.includes(c)) return '4';
  // C before AHKLOQRUX → 4; before EIY or after SZ → 8
  if (c === 'C') {
    // `p &&` guard: String.prototype.includes('') always returns true, so an
    // empty prev (word-start position) would wrongly trigger the SZ branch.
    if (p && 'SZ'.includes(p)) return '8';
    if ('AHKLOQRUX'.includes(n)) return '4';
    if ('EIYJÄÖÜ'.includes(n)) return '8';
    return '4';
  }
  // X
  if (c === 'X') return '48'; // KS
  // L
  if (c === 'L') return '5';
  // M, N
  if ('MN'.includes(c)) return '6';
  // R
  if (c === 'R') return '7';
  // S, Z, ß
  if ('SZß'.includes(c)) return '8';

  return '';
}

export function colognePhonetic(input: string): string {
  if (!input) return '';
  // Transliterate umlauts
  const prep = input
    .replace(/ä/gi, 'ae')
    .replace(/ö/gi, 'oe')
    .replace(/ü/gi, 'ue')
    .replace(/ß/gi, 'ss')
    .replace(/[^a-zA-ZäöüÄÖÜß]/g, '');

  if (!prep) return '';

  let code = '';
  for (let i = 0; i < prep.length; i++) {
    const prev = i > 0 ? (prep[i - 1] ?? '') : '';
    const curr = prep[i] ?? '';
    const next = i < prep.length - 1 ? (prep[i + 1] ?? '') : '';
    const digit = cologneCharCode(prev, curr, next);
    for (const d of digit) code += d;
  }

  // Remove consecutive duplicates
  let deduped = '';
  for (let i = 0; i < code.length; i++) {
    if (i === 0 || code[i] !== code[i - 1]) deduped += code[i] ?? '';
  }

  // Remove embedded zeros (except leading)
  const leading = deduped[0] === '0' ? '0' : '';
  const rest = deduped.replace(/0/g, '');
  return leading + rest || '0';
}

// ── Arabic Phonetic Approximation ─────────────────────────────────────────────
// Produces a consonant-skeleton code for Arabic names.
// Arabic writing is consonantal; vowels are usually absent in proper nouns.
// Two names with the same consonant skeleton are likely the same name.
//
// Algorithm:
//   1. Strip diacritics, tatweel, hamza forms
//   2. Map each Arabic letter to a phonetic class
//   3. Remove consecutive duplicates
//   4. Return the code (3–6 chars)

// Arabic letter → phonetic class
const ARABIC_PHONETIC: Record<string, string> = {
  // Alef family → A
  'ا': 'A', 'أ': 'A', 'إ': 'A', 'آ': 'A', 'ى': 'A',
  // Ba → B
  'ب': 'B',
  // Ta/Tha family → T
  'ت': 'T', 'ث': 'T', 'ة': 'T',
  // Jim/Ha/Kha → H
  'ج': 'J', 'ح': 'H', 'خ': 'KH',
  // Dal/Dhal → D
  'د': 'D', 'ذ': 'D',
  // Ra/Zain → R
  'ر': 'R', 'ز': 'Z',
  // Sin/Shin → S
  'س': 'S', 'ش': 'SH',
  // Sad/Dad → S
  'ص': 'S', 'ض': 'D',
  // Tah/Zah → T
  'ط': 'T', 'ظ': 'Z',
  // Ain/Ghain → A/G
  'ع': 'A', 'غ': 'G',
  // Fa → F
  'ف': 'F',
  // Qaf → Q
  'ق': 'Q',
  // Kaf → K
  'ك': 'K', 'ک': 'K',
  // Lam → L
  'ل': 'L',
  // Mim → M
  'م': 'M',
  // Nun → N
  'ن': 'N',
  // Ha (all forms) → H
  'ه': 'H', 'ھ': 'H', 'ہ': 'H',
  // Waw → W
  'و': 'W',
  // Ya → Y
  'ي': 'Y', 'ئ': 'Y', 'ی': 'Y',
  // Hamza alone
  'ء': 'A', 'ؤ': 'W',
  // Persian additions
  'پ': 'P', 'چ': 'CH', 'ژ': 'ZH', 'گ': 'G',
};

// Arabic diacritics to strip
const AR_DIACRITICS = /[ً-ٰٟٱ]/gu;
const AR_TATWEEL = /ـ/gu;

export function arabicPhoneticCode(input: string): string {
  if (!input) return '';

  // Strip diacritics and tatweel
  const stripped = input.replace(AR_DIACRITICS, '').replace(AR_TATWEEL, '');

  // Build code
  let code = '';
  for (const ch of stripped) {
    const cls = ARABIC_PHONETIC[ch];
    if (cls) code += cls + '-';
  }

  if (!code) return '';

  // Split into tokens, deduplicate consecutive same tokens
  const tokens = code.split('-').filter(Boolean);
  const deduped: string[] = [];
  for (const t of tokens) {
    if (deduped[deduped.length - 1] !== t) deduped.push(t);
  }

  // Drop short connectives (alef articles at start)
  return deduped.slice(0, 8).join('');
}

// ── Latin phonetic normalization for Arabic names ─────────────────────────────
// After romanisation, reduce to a phonetic skeleton for comparison.

const LATIN_ARABIC_COLLAPSE: Array<[RegExp, string]> = [
  [/kh/gi, 'K'],
  [/sh/gi, 'S'],
  [/gh/gi, 'G'],
  [/dh/gi, 'D'],
  [/th/gi, 'T'],
  [/ch/gi, 'S'],
  [/ph/gi, 'F'],
  [/oo/gi, 'U'],
  [/ee/gi, 'I'],
  [/aa/gi, 'A'],
  [/ai/gi, 'A'],
  [/ou/gi, 'U'],
  [/[aeiou]/gi, ''],  // remove all remaining vowels
  [/(.)\1+/g, '$1'],  // collapse repeated chars
];

export function latinArabicPhoneticCode(input: string): string {
  if (!input) return '';
  let s = input.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  for (const [pattern, replacement] of LATIN_ARABIC_COLLAPSE) {
    s = s.replace(pattern, replacement);
  }
  return s.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6);
}

// ── Cross-script phonetic match ───────────────────────────────────────────────

export interface PhoneticMatchResult {
  cologne: { a: string; b: string; match: boolean };
  arabicPhonetic: { a: string; b: string; match: boolean };
  latinArabic: { a: string; b: string; match: boolean };
  anyMatch: boolean;
  method: string | null;
}

export function phoneticMatchFull(a: string, b: string): PhoneticMatchResult {
  const cologneA = colognePhonetic(a);
  const cologneB = colognePhonetic(b);
  const cologneMatch = Boolean(cologneA && cologneB && cologneA === cologneB);

  const arabicA = arabicPhoneticCode(a);
  const arabicB = arabicPhoneticCode(b);
  const arabicMatch = Boolean(arabicA && arabicB && arabicA === arabicB);

  const latinA = latinArabicPhoneticCode(a);
  const latinB = latinArabicPhoneticCode(b);
  const latinMatch = Boolean(latinA && latinB && latinA === latinB && latinA.length >= 3);

  const anyMatch = cologneMatch || arabicMatch || latinMatch;
  const method = cologneMatch ? 'cologne'
    : arabicMatch ? 'arabic_phonetic'
    : latinMatch ? 'latin_arabic_skeleton'
    : null;

  return {
    cologne: { a: cologneA, b: cologneB, match: cologneMatch },
    arabicPhonetic: { a: arabicA, b: arabicB, match: arabicMatch },
    latinArabic: { a: latinA, b: latinB, match: latinMatch },
    anyMatch,
    method,
  };
}
