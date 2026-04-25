// Hawkeye Sterling — name-matching algorithms.
// Real implementations of: exact, Levenshtein (distance + ratio),
// Jaro, Jaro-Winkler, Soundex, Double Metaphone (ASCII subset),
// token-set (order-insensitive token similarity),
// trigram (character n-gram Jaccard), partial-token-set (subset ratio).
// Every matcher returns a normalised score in [0,1] and declares its method
// so the reasoning chain can cite which algorithm produced a hit.

import { cyrillicToLatin, chineseToPinyinSubset } from './translit-cyrillic-cjk.js';

// Minimal Arabic/Persian Unicode block → Latin transliteration.
// Used only to feed Double Metaphone with ASCII when the input is Arabic-script.
const ARABIC_TO_LATIN: Record<number, string> = {
  0x0627: 'A', 0x0628: 'B', 0x062A: 'T', 0x062B: 'TH', 0x062C: 'J', 0x062D: 'H',
  0x062E: 'KH', 0x062F: 'D', 0x0630: 'TH', 0x0631: 'R', 0x0632: 'Z', 0x0633: 'S',
  0x0634: 'SH', 0x0635: 'S', 0x0636: 'D', 0x0637: 'T', 0x0638: 'TH', 0x0639: 'A',
  0x063A: 'GH', 0x0641: 'F', 0x0642: 'Q', 0x0643: 'K', 0x0644: 'L', 0x0645: 'M',
  0x0646: 'N', 0x0647: 'H', 0x0648: 'W', 0x0649: 'Y', 0x064A: 'Y',
  // Persian-specific
  0x067E: 'P', 0x0686: 'CH', 0x0698: 'ZH', 0x06AF: 'G', 0x06A9: 'K', 0x06CC: 'Y',
};

function arabicToLatin(input: string): string {
  let out = '';
  for (const ch of input) {
    const cp = ch.codePointAt(0) ?? 0;
    // Arabic/Persian Unicode block 0x0600–0x06FF
    if (cp >= 0x0600 && cp <= 0x06FF) {
      out += ARABIC_TO_LATIN[cp] ?? '';
    } else {
      out += ch;
    }
  }
  return out;
}

function hasNonLatin(s: string): boolean {
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    if (c > 0x007F) return true;
  }
  return false;
}

/** Pre-romanise non-Latin scripts (Arabic, Cyrillic, CJK) into ASCII before
 *  phonetic encoding. Passes pure ASCII strings through unchanged. */
function toLatinScript(input: string): string {
  if (!hasNonLatin(input)) return input;
  // Arabic/Persian block
  let s = arabicToLatin(input);
  // Cyrillic
  s = cyrillicToLatin(s);
  // CJK subset
  s = chineseToPinyinSubset(s);
  return s;
}

export type MatchingMethod =
  | 'exact'
  | 'levenshtein'
  | 'jaro'
  | 'jaro_winkler'
  | 'soundex'
  | 'double_metaphone'
  | 'token_set'
  | 'trigram'
  | 'partial_token_set'
  | 'abbreviated';

export interface MatchScore {
  method: MatchingMethod;
  score: number;
  threshold: number;
  pass: boolean;
}

function normalise(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------- exact
export function matchExact(a: string, b: string): MatchScore {
  const pass = normalise(a) === normalise(b);
  return { method: 'exact', score: pass ? 1 : 0, threshold: 1, pass };
}

// ---------- Levenshtein
// Damerau-Levenshtein (Optimal String Alignment) — extends standard Levenshtein
// with transposition of adjacent characters. Critical for AML: OCR errors and
// manual-entry typos frequently swap adjacent letters ("Muhammda" → "Muhammad").
export function levenshteinDistance(a: string, b: string): number {
  const s = normalise(a);
  const t = normalise(b);
  const m = s.length;
  const n = t.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const d: number[][] = [];
  for (let i = 0; i <= m; i++) {
    d[i] = new Array<number>(n + 1);
    d[i]![0] = i;
  }
  for (let j = 0; j <= n; j++) d[0]![j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      d[i]![j] = Math.min(
        d[i - 1]![j]! + 1,           // deletion
        d[i]![j - 1]! + 1,           // insertion
        d[i - 1]![j - 1]! + cost,    // substitution
      );
      // Transposition of two adjacent characters (OSA extension).
      if (i > 1 && j > 1 && s[i - 1] === t[j - 2] && s[i - 2] === t[j - 1]) {
        d[i]![j] = Math.min(d[i]![j]!, d[i - 2]![j - 2]! + cost);
      }
    }
  }
  return d[m]![n]!;
}

export function matchLevenshtein(a: string, b: string, threshold = 0.82): MatchScore {
  const s = normalise(a);
  const t = normalise(b);
  const maxLen = Math.max(s.length, t.length);
  if (maxLen === 0) return { method: 'levenshtein', score: 1, threshold, pass: true };
  const d = levenshteinDistance(s, t);
  const score = 1 - d / maxLen;
  return { method: 'levenshtein', score, threshold, pass: score >= threshold };
}

// ---------- Jaro
export function jaro(a: string, b: string): number {
  const s = normalise(a);
  const t = normalise(b);
  if (s === t) return 1;
  const m = s.length;
  const n = t.length;
  if (m === 0 || n === 0) return 0;
  const matchWindow = Math.max(0, Math.floor(Math.max(m, n) / 2) - 1);
  const sFlags = new Array<boolean>(m).fill(false);
  const tFlags = new Array<boolean>(n).fill(false);
  let matches = 0;
  for (let i = 0; i < m; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, n);
    for (let j = start; j < end; j++) {
      if (tFlags[j]) continue;
      if (s.charCodeAt(i) !== t.charCodeAt(j)) continue;
      sFlags[i] = true;
      tFlags[j] = true;
      matches++;
      break;
    }
  }
  if (matches === 0) return 0;
  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < m; i++) {
    if (!sFlags[i]) continue;
    while (k < n && !tFlags[k]) k++;
    if (k >= n) break;
    if (s.charCodeAt(i) !== t.charCodeAt(k)) transpositions++;
    k++;
  }
  transpositions = Math.floor(transpositions / 2);
  return (matches / m + matches / n + (matches - transpositions) / matches) / 3;
}

// ---------- Jaro-Winkler
export function jaroWinkler(a: string, b: string, p = 0.1, maxPrefix = 4): number {
  const j = jaro(a, b);
  if (j <= 0) return 0;
  const s = normalise(a);
  const t = normalise(b);
  let l = 0;
  const cap = Math.min(maxPrefix, s.length, t.length);
  while (l < cap && s.charCodeAt(l) === t.charCodeAt(l)) l++;
  return j + l * p * (1 - j);
}

export function matchJaroWinkler(a: string, b: string, threshold = 0.9): MatchScore {
  const score = jaroWinkler(a, b);
  return { method: 'jaro_winkler', score, threshold, pass: score >= threshold };
}

// ---------- Soundex (classic)
export function soundex(input: string): string {
  const s = normalise(toLatinScript(input)).replace(/\s+/g, '');
  if (!s) return '';
  const first = s[0]!.toUpperCase();
  const map: Record<string, string> = {
    b: '1', f: '1', p: '1', v: '1',
    c: '2', g: '2', j: '2', k: '2', q: '2', s: '2', x: '2', z: '2',
    d: '3', t: '3',
    l: '4',
    m: '5', n: '5',
    r: '6',
  };
  let out = first;
  let prev = map[s[0]!] ?? '';
  for (let i = 1; i < s.length && out.length < 4; i++) {
    const ch = s[i]!;
    const code = map[ch] ?? '';
    if (code) {
      if (code !== prev) out += code;
      prev = code;
    } else if (ch === 'h' || ch === 'w') {
      // H and W neither reset nor emit — letters they separate keep merging.
    } else {
      // Vowel (or other): resets the merge so a later same-coded letter emits anew.
      prev = '';
    }
  }
  return (out + '000').slice(0, 4);
}

export function matchSoundex(a: string, b: string): MatchScore {
  const pass = soundex(a) === soundex(b) && soundex(a) !== '';
  return { method: 'soundex', score: pass ? 1 : 0, threshold: 1, pass };
}

// ---------- Double Metaphone (ASCII-subset pragmatic port)
// Non-Latin scripts (Arabic, Cyrillic, CJK) are pre-romanised via
// toLatinScript() before the ASCII phonetic algorithm runs, so names like
// "محمد" (Muhammad) and "Мухаммад" (Mukhammad) produce the same code as
// their Latin equivalents.
export function doubleMetaphone(input: string): { primary: string; alternate: string } {
  const s = normalise(toLatinScript(input)).replace(/\s+/g, '').toUpperCase();
  if (!s) return { primary: '', alternate: '' };
  let primary = '';
  let alternate = '';
  let i = 0;
  const len = s.length;

  const at = (n: number) => s.charAt(n);
  const slice = (from: number, length: number) => s.slice(from, from + length);
  const isVowel = (c: string) => 'AEIOUY'.includes(c);

  while (i < len && (primary.length < 4 || alternate.length < 4)) {
    const c = at(i);
    switch (c) {
      case 'A': case 'E': case 'I': case 'O': case 'U': case 'Y':
        if (i === 0) { primary += 'A'; alternate += 'A'; }
        i++;
        break;
      case 'B':
        primary += 'P'; alternate += 'P';
        i += at(i + 1) === 'B' ? 2 : 1;
        break;
      case 'C':
        if (i > 0 && slice(i - 2, 6) === 'ACHACH') { primary += 'K'; alternate += 'K'; i += 2; break; }
        if (at(i + 1) === 'H') { primary += 'X'; alternate += 'K'; i += 2; break; }
        if (at(i + 1) === 'I' && at(i + 2) === 'A') { primary += 'X'; alternate += 'X'; i += 3; break; }
        if ('IEY'.includes(at(i + 1))) { primary += 'S'; alternate += 'S'; i += 2; break; }
        primary += 'K'; alternate += 'K';
        i += at(i + 1) === 'C' ? 2 : 1;
        break;
      case 'D':
        if (at(i + 1) === 'G' && 'IEY'.includes(at(i + 2))) { primary += 'J'; alternate += 'J'; i += 3; break; }
        primary += 'T'; alternate += 'T';
        i += at(i + 1) === 'D' || at(i + 1) === 'T' ? 2 : 1;
        break;
      case 'F':
        primary += 'F'; alternate += 'F';
        i += at(i + 1) === 'F' ? 2 : 1;
        break;
      case 'G':
        if (at(i + 1) === 'H') { primary += 'K'; alternate += 'K'; i += 2; break; }
        if (at(i + 1) === 'N') { primary += 'N'; alternate += 'N'; i += 2; break; }
        if ('IEY'.includes(at(i + 1))) { primary += 'J'; alternate += 'K'; i += 2; break; }
        primary += 'K'; alternate += 'K';
        i += at(i + 1) === 'G' ? 2 : 1;
        break;
      case 'H':
        if (i === 0 || isVowel(at(i - 1))) { if (isVowel(at(i + 1))) { primary += 'H'; alternate += 'H'; } }
        i++;
        break;
      case 'J':
        primary += 'J'; alternate += 'A';
        i++;
        break;
      case 'K':
        primary += 'K'; alternate += 'K';
        i += at(i + 1) === 'K' ? 2 : 1;
        break;
      case 'L':
        primary += 'L'; alternate += 'L';
        i += at(i + 1) === 'L' ? 2 : 1;
        break;
      case 'M':
        primary += 'M'; alternate += 'M';
        i += at(i + 1) === 'M' ? 2 : 1;
        break;
      case 'N':
        primary += 'N'; alternate += 'N';
        i += at(i + 1) === 'N' ? 2 : 1;
        break;
      case 'P':
        if (at(i + 1) === 'H') { primary += 'F'; alternate += 'F'; i += 2; break; }
        primary += 'P'; alternate += 'P';
        i += at(i + 1) === 'P' || at(i + 1) === 'B' ? 2 : 1;
        break;
      case 'Q':
        primary += 'K'; alternate += 'K';
        i += at(i + 1) === 'Q' ? 2 : 1;
        break;
      case 'R':
        primary += 'R'; alternate += 'R';
        i += at(i + 1) === 'R' ? 2 : 1;
        break;
      case 'S':
        if (at(i + 1) === 'H') { primary += 'X'; alternate += 'X'; i += 2; break; }
        if (at(i + 1) === 'C' && at(i + 2) === 'H') { primary += 'X'; alternate += 'X'; i += 3; break; }
        primary += 'S'; alternate += 'S';
        i += at(i + 1) === 'S' || at(i + 1) === 'Z' ? 2 : 1;
        break;
      case 'T':
        if (at(i + 1) === 'H') { primary += '0'; alternate += 'T'; i += 2; break; }
        if (at(i + 1) === 'I' && at(i + 2) === 'O') { primary += 'X'; alternate += 'X'; i += 3; break; }
        primary += 'T'; alternate += 'T';
        i += at(i + 1) === 'T' || at(i + 1) === 'D' ? 2 : 1;
        break;
      case 'V':
        primary += 'F'; alternate += 'F';
        i += at(i + 1) === 'V' ? 2 : 1;
        break;
      case 'W':
        if (isVowel(at(i + 1))) { primary += 'W'; alternate += 'W'; }
        i++;
        break;
      case 'X':
        primary += 'KS'; alternate += 'KS';
        i++;
        break;
      case 'Z':
        primary += 'S'; alternate += 'S';
        i += at(i + 1) === 'Z' ? 2 : 1;
        break;
      default:
        i++;
    }
  }
  return { primary: primary.slice(0, 4), alternate: alternate.slice(0, 4) };
}

export function matchDoubleMetaphone(a: string, b: string): MatchScore {
  const pa = doubleMetaphone(a);
  const pb = doubleMetaphone(b);
  const pass =
    (pa.primary !== '' && (pa.primary === pb.primary || pa.primary === pb.alternate)) ||
    (pa.alternate !== '' && (pa.alternate === pb.primary || pa.alternate === pb.alternate));
  return { method: 'double_metaphone', score: pass ? 1 : 0, threshold: 1, pass };
}

// ---------- trigram (character n-gram Jaccard)
// Catches company-name abbreviations, spacing differences, and character
// transpositions that cross token boundaries ("Al Rajhi" / "AlRajhi").
function ngramSet(s: string, n: number): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i <= s.length - n; i++) out.add(s.slice(i, i + n));
  return out;
}

export function matchTrigram(a: string, b: string, threshold = 0.5): MatchScore {
  const sa = normalise(a);
  const sb = normalise(b);
  const ta = ngramSet(sa, 3);
  const tb = ngramSet(sb, 3);
  if (ta.size === 0 || tb.size === 0) {
    return { method: 'trigram', score: 0, threshold, pass: false };
  }
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const union = ta.size + tb.size - inter;
  const score = union === 0 ? 0 : inter / union;
  return { method: 'trigram', score, threshold, pass: score >= threshold };
}

// ---------- partial token-set (subset ratio)
// Measures intersection / min(|A|, |B|) so a name that is a strict subset
// of another (e.g. "Mohammed Khan" ⊂ "Mohammed Abdul Khan") still scores 1.
export function matchPartialTokenSet(a: string, b: string, threshold = 0.85): MatchScore {
  const ta = normalise(a).split(' ').filter(Boolean);
  const tb = normalise(b).split(' ').filter(Boolean);
  if (ta.length === 0 || tb.length === 0) {
    return { method: 'partial_token_set', score: 0, threshold, pass: false };
  }
  const [shorter, longer] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const longerSet = new Set(longer);
  let inter = 0;
  for (const t of shorter) if (longerSet.has(t)) inter++;
  const score = inter / shorter.length;
  return { method: 'partial_token_set', score, threshold, pass: score >= threshold };
}

// ---------- abbreviated name matching
// Handles initial-based abbreviations ("M. Hassan" ↔ "Mohammed Hassan",
// "J.K. Rowling" ↔ "Joanne Kathleen Rowling"). A single-character token is
// treated as an initial and matches the first letter of any token in the
// counterpart name. Multi-character tokens require exact token equality.
export function matchAbbreviated(a: string, b: string, threshold = 0.85): MatchScore {
  const ta = normalise(a).split(' ').filter(Boolean);
  const tb = normalise(b).split(' ').filter(Boolean);
  if (ta.length === 0 || tb.length === 0) {
    return { method: 'abbreviated', score: 0, threshold, pass: false };
  }
  // Only fire when one side is meaningfully shorter and contains at least one initial.
  const [abbr, full] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const hasInitial = abbr.some((tok) => tok.length === 1);
  // If neither side has single-letter tokens the partial-token-set matcher
  // is already sufficient; skip to avoid spurious matches.
  if (!hasInitial) {
    return { method: 'abbreviated', score: 0, threshold, pass: false };
  }
  let matched = 0;
  for (const tok of abbr) {
    if (full.includes(tok)) { matched++; continue; }
    if (tok.length === 1 && full.some((ft) => ft.charAt(0) === tok)) { matched++; }
  }
  const score = matched / abbr.length;
  return { method: 'abbreviated', score, threshold, pass: score >= threshold };
}

// ---------- token-set (order-insensitive)
export function matchTokenSet(a: string, b: string, threshold = 0.8): MatchScore {
  const tokensA = new Set(normalise(a).split(' ').filter(Boolean));
  const tokensB = new Set(normalise(b).split(' ').filter(Boolean));
  if (tokensA.size === 0 || tokensB.size === 0) {
    return { method: 'token_set', score: 0, threshold, pass: false };
  }
  let inter = 0;
  for (const t of tokensA) if (tokensB.has(t)) inter++;
  const union = new Set<string>([...tokensA, ...tokensB]).size;
  const score = union === 0 ? 0 : inter / union;
  return { method: 'token_set', score, threshold, pass: score >= threshold };
}

// ---------- ensemble
export interface EnsembleMatch {
  subject: string;
  candidate: string;
  scores: MatchScore[];
  best: MatchScore;
  phoneticAgreement: boolean;
}

// Inline transliteration maps — keep the matcher module self-contained so
// callers don't need to import from translit.ts to get native-script
// coverage. Covers Arabic abjad (28 letters + hamza/taa-marbutah/alef
// variants) and Cyrillic (Russian alphabet).
const ARABIC_LETTER_MAP: Record<string, string> = {
  'ا': 'a', 'أ': 'a', 'إ': 'i', 'آ': 'a', 'ب': 'b', 'ت': 't', 'ث': 'th',
  'ج': 'j', 'ح': 'h', 'خ': 'kh', 'د': 'd', 'ذ': 'dh', 'ر': 'r', 'ز': 'z',
  'س': 's', 'ش': 'sh', 'ص': 's', 'ض': 'd', 'ط': 't', 'ظ': 'z', 'ع': 'a',
  'غ': 'gh', 'ف': 'f', 'ق': 'q', 'ك': 'k', 'ل': 'l', 'م': 'm', 'ن': 'n',
  'ه': 'h', 'و': 'w', 'ي': 'y', 'ى': 'a', 'ة': 'h', 'ء': '', 'ؤ': 'w', 'ئ': 'y',
};
const CYRILLIC_LETTER_MAP: Record<string, string> = {
  'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'e',
  'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'j', 'к': 'k', 'л': 'l', 'м': 'm',
  'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
  'ф': 'f', 'х': 'kh', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch',
  'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
};
const ROMAN_FAMILIES: Record<string, string> = {
  // Muhammad variants
  mohamed: 'muhammad', mohammed: 'muhammad', mohammad: 'muhammad',
  mohamad: 'muhammad', mohd: 'muhammad', muhammed: 'muhammad',
  muhamad: 'muhammad', mehmed: 'muhammad', mehmet: 'muhammad',
  // Ahmad variants
  ahmed: 'ahmad', ahmet: 'ahmad', ahamed: 'ahmad',
  // Hussein variants
  husain: 'hussein', husayn: 'hussein', hussain: 'hussein',
  hossein: 'hussein', housein: 'hussein',
  // Hassan variants
  hasan: 'hassan', hasaan: 'hassan', hasen: 'hassan',
  // Yusuf variants
  yousef: 'yusuf', youssef: 'yusuf', yousuf: 'yusuf',
  yosef: 'yusuf', yusup: 'yusuf', yossuf: 'yusuf',
  // Abdullah variants
  abdulla: 'abdullah', abdallah: 'abdullah', abdulla: 'abdullah',
  // Abdul compoud variants
  abdulaziz: 'abdulaziz', abdelaziz: 'abdulaziz',
  abdulrahman: 'abdulrahman', abdurrahman: 'abdulrahman',
  abdelrahman: 'abdulrahman', abdulrahman: 'abdulrahman',
  abdulkarim: 'abdulkarim', abdelkarim: 'abdulkarim',
  // Khalid variants
  khaled: 'khalid', khaleed: 'khalid', khaalid: 'khalid',
  // Fatima variants
  fatimah: 'fatima', fatma: 'fatima', fatime: 'fatima',
  // Aisha variants
  ayesha: 'aisha', aicha: 'aisha', aysha: 'aisha', aesha: 'aisha',
  // Umar variants
  omar: 'umar', omer: 'umar', omair: 'umar',
  // Saeed variants
  said: 'saeed', sayed: 'saeed', sayid: 'saeed', saied: 'saeed',
  // Ibrahim variants
  ibrahim: 'ibrahim', ebrahim: 'ibrahim', ibraheem: 'ibrahim',
  ibrahim: 'ibrahim', abrahem: 'ibrahim',
  // Ismail variants
  ismail: 'ismail', esmail: 'ismail', ismael: 'ismail',
  ismaeil: 'ismail', ismayil: 'ismail',
  // Mustafa variants
  mustafa: 'mustafa', mostafa: 'mustafa', moustafa: 'mustafa',
  mustapha: 'mustafa', mostafa: 'mustafa', mustafa: 'mustafa',
  // Rashid variants
  rashed: 'rashid', rasheed: 'rashid', raashid: 'rashid',
  // Mahmud variants
  mahmoud: 'mahmud', mahamoud: 'mahmud', mahmmoud: 'mahmud',
  // Nasir variants
  nasser: 'nasir', naser: 'nasir', naasr: 'nasir',
  // Karim variants
  kareem: 'karim', karem: 'karim', karим: 'karim',
  // Jamal variants
  gamal: 'jamal', djamil: 'jamal', cemal: 'jamal',
  // Bilal variants
  bilel: 'bilal', belal: 'bilal',
  // Hamid variants
  hameed: 'hamid', hamied: 'hamid',
  // Tariq variants
  tarek: 'tariq', taric: 'tariq', tarig: 'tariq',
  // Sulaiman variants
  suleiman: 'sulaiman', sulayman: 'sulaiman', suleyman: 'sulaiman',
  suleman: 'sulaiman', solaiman: 'sulaiman',
  // Faisal variants
  faysal: 'faisal', feisal: 'faisal', faysal: 'faisal',
  // Walid variants
  waleed: 'walid', waled: 'walid', waleed: 'walid',
  // Ziad variants
  ziyad: 'ziad', zyad: 'ziad', ziiad: 'ziad',
  // Ayman variants
  aiman: 'ayman', eymen: 'ayman',
  // Amin variants
  ameen: 'amin', amine: 'amin',
  // Adil variants
  adel: 'adil', aadel: 'adil',
  // Usama variants
  osama: 'usama', oussama: 'usama',
  // Ali variants
  aly: 'ali', aali: 'ali',
  // Khalil variants
  halil: 'khalil', khaleel: 'khalil', kalil: 'khalil',
  // Salim variants
  salem: 'salim', selim: 'salim',
  // Maryam variants
  mariam: 'maryam', miriam: 'maryam',
  // Layla variants
  leila: 'layla', leyla: 'layla', laila: 'layla',
  // Hana variants
  hanna: 'hana',
  // Russian / Slavic variants
  dmitry: 'dmitri', dmitriy: 'dmitri', dmitrii: 'dmitri',
  mikhail: 'mikhail', mikhael: 'mikhail', mikhayil: 'mikhail', michail: 'mikhail',
  nikolay: 'nikolai', nikolaj: 'nikolai', nikolas: 'nikolai',
  sergey: 'sergei', serghei: 'sergei', sergej: 'sergei',
  aleksey: 'aleksei', alexey: 'aleksei', alexei: 'aleksei',
  andrey: 'andrei', andrej: 'andrei',
  yuriy: 'yuri', yury: 'yuri', iuri: 'yuri',
  iwan: 'ivan',
  // Chinese romanization variants (pinyin vs. Wade-Giles vs. Jyutping)
  chou: 'zhou', chu: 'zhu', tze: 'zi', hsiao: 'xiao',
  chiang: 'jiang', tsai: 'cai', teng: 'deng', hsu: 'xu',
  // Arabic consonant skeletons — Abjad transliteration of the most common
  // Arabic-script names. When normaliseForMatch strips harakat and maps each
  // letter, the result is the consonant skeleton; mapping that skeleton here
  // merges it with the Latin romanisation family so cross-script matching
  // works without a full vowelled transcription.
  mhmd: 'muhammad',   // محمد  (m ح m d)
  ahmd: 'ahmad',      // أحمد  (a ح m d)
  hsn:  'hassan',     // حسن   (h s n)
  hsyn: 'hussein',    // حسين  (h s y n)
  hssyn: 'hussein',   // alternative tokenisation
  khld: 'khalid',     // خالد  (kh a l d)
  ftmh: 'fatima',     // فاطمة (f a t m h)
  mhmwd: 'mahmud',    // محمود (m h m w d)
  amr: 'umar',        // عمر   (a m r)
  slm: 'salim',       // سلم   (s l m)
  mstf: 'mustafa',    // مصطفى (m s t f)
  ibrhm: 'ibrahim',   // إبراهيم (i b r h m)
  yswf: 'yusuf',      // يوسف  (y s w f)
  abl: 'abdullah',    // عبدالله short form
};
const MATCHER_PARTICLES: Set<string> = new Set([
  // Arabic / Semitic
  'al', 'el', 'bin', 'ben', 'bint', 'abu', 'ibn', 'banu',
  // Dutch / Flemish
  'van', 'de', 'der', 'den', 'ter', 'ten',
  // German
  'von', 'zu', 'zum',
  // Romance languages
  'di', 'da', 'du', 'dos', 'das',
  // South Asian (patronymic connectors)
  'ul', 'ur', 'us',
  // Persian suffixes sometimes standalone
  'pur',
]);

// Characters that do not decompose via NFD Unicode normalisation, mapped
// to their closest ASCII / multi-char Latin equivalent. Covers Turkish (ı),
// German (ß), Polish/Czech (ł), Nordic (æ, ø, þ, ð), and others.
const SPECIAL_CHAR_MAP: Record<string, string> = {
  'ı': 'i', 'ß': 'ss', 'ł': 'l', 'Ł': 'l',
  'æ': 'ae', 'Æ': 'ae', 'ø': 'o', 'Ø': 'o',
  'þ': 'th', 'Þ': 'th', 'ð': 'd', 'Ð': 'd',
  'đ': 'd', 'Đ': 'd', 'ħ': 'h', 'Ħ': 'h',
  'ŋ': 'n', 'Ŋ': 'n', 'œ': 'oe', 'Œ': 'oe',
  'ĸ': 'k', 'ŉ': 'n', 'ĳ': 'ij', 'Ĳ': 'ij',
};

// Arabic harakat (vowel diacritics) and orthographic marks that survive NFD
// decomposition. Removing them before letter-mapping prevents them becoming
// spurious spaces and breaking "مُحَمَّد" → "muhammad" (was "m h m d").
const ARABIC_DIACRITICS_RE = /[ؐ-ًؚ-ٟـ]/gu;

// Lam-alef ligatures (Arabic Presentation Forms-A) → expand to component letters
// so that ARABIC_LETTER_MAP can handle each character independently.
const LAM_ALEF_MAP: Record<string, string> = {
  'ﻵ': 'لأ', 'ﻶ': 'لأ', 'ﻷ': 'لإ', 'ﻸ': 'لإ',
  'ﻹ': 'لا', 'ﻺ': 'لا', 'ﻻ': 'لا', 'ﻼ': 'لا',
};

// Normalise a name for comparison: lowercase, strip diacritics,
// transliterate Arabic/Cyrillic to Latin, collapse Arabic-name family
// spellings, drop particles. Returns an empty string when the input
// contains no matchable characters.
export function normaliseForMatch(input: string): string {
  if (!input) return '';

  // 1. Lowercase + NFD decompose + strip Latin combining chars (U+0300–U+036F).
  let s = input.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/gu, '');

  // 2. Strip Arabic diacritics that NFD does not strip.
  s = s.replace(ARABIC_DIACRITICS_RE, '');

  // 3. Expand lam-alef ligatures.
  s = s.replace(/./gu, (ch) => LAM_ALEF_MAP[ch] ?? ch);

  // 4. Map special chars that don't decompose (ı, ß, ł, æ, ø, þ, ð …).
  s = s.replace(/./gu, (ch) => SPECIAL_CHAR_MAP[ch] ?? ch);

  // 5. Map Arabic/Persian letters.
  s = s.replace(/./gu, (ch) => ARABIC_LETTER_MAP[ch] ?? ch);

  // 6. Map Cyrillic letters.
  s = s.replace(/./gu, (ch) => CYRILLIC_LETTER_MAP[ch] ?? ch);

  // 7. Strip everything non-alphabetic, collapse spaces.
  s = s.replace(/[^a-z\s-]/g, ' ').replace(/-/g, ' ').replace(/\s+/g, ' ').trim();

  // 8. Drop particles, apply family-spelling normalisation.
  const tokens = s.split(' ').filter(Boolean);
  const out: string[] = [];
  for (const t of tokens) {
    if (MATCHER_PARTICLES.has(t)) continue;
    out.push(ROMAN_FAMILIES[t] ?? t);
  }
  return out.join(' ').trim();
}

export function matchEnsemble(subject: string, candidate: string): EnsembleMatch {
  // Run the ensemble twice — once on the raw inputs (so exact matches on
  // already-Latin names aren't diluted) and once on the transliterated /
  // normalised forms (so "محمد" finds "Mohamed Hassan" and "Дмитрий Волков"
  // finds "VOLKOV Dmitri"). The best score across both passes wins.
  const rawScores: MatchScore[] = [
    matchExact(subject, candidate),
    matchLevenshtein(subject, candidate),
    matchJaroWinkler(subject, candidate),
    matchTokenSet(subject, candidate),
    matchSoundex(subject, candidate),
    matchDoubleMetaphone(subject, candidate),
    matchTrigram(subject, candidate),
    matchPartialTokenSet(subject, candidate),
    matchAbbreviated(subject, candidate),
  ];

  const subjectNorm = normaliseForMatch(subject);
  const candidateNorm = normaliseForMatch(candidate);
  // Only run the normalised pass when normalisation actually changed
  // something — otherwise it's duplicated work for a pure-Latin pair.
  const normApplies =
    subjectNorm !== '' &&
    candidateNorm !== '' &&
    (subjectNorm !== subject.toLowerCase().trim() ||
      candidateNorm !== candidate.toLowerCase().trim());

  const normScores: MatchScore[] = normApplies
    ? [
        matchExact(subjectNorm, candidateNorm),
        matchLevenshtein(subjectNorm, candidateNorm),
        matchJaroWinkler(subjectNorm, candidateNorm),
        matchTokenSet(subjectNorm, candidateNorm),
        matchSoundex(subjectNorm, candidateNorm),
        matchDoubleMetaphone(subjectNorm, candidateNorm),
        matchTrigram(subjectNorm, candidateNorm),
        matchPartialTokenSet(subjectNorm, candidateNorm),
        matchAbbreviated(subjectNorm, candidateNorm),
      ]
    : [];

  const scores = [...rawScores, ...normScores];
  const best = scores.reduce((a, b) => (b.score > a.score ? b : a));
  const phoneticAgreement =
    (rawScores.find((s) => s.method === 'soundex')?.pass ?? false) ||
    (rawScores.find((s) => s.method === 'double_metaphone')?.pass ?? false) ||
    (normScores.find((s) => s.method === 'soundex')?.pass ?? false) ||
    (normScores.find((s) => s.method === 'double_metaphone')?.pass ?? false);
  return { subject, candidate, scores, best, phoneticAgreement };
}
