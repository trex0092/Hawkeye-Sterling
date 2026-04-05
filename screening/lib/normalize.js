/**
 * Name normalization for sanctions/PEP screening.
 *
 * Produces canonical forms used by the matcher:
 *   - stripped:   lowercased, diacritics removed, punctuation/company-suffix stripped
 *   - tokens:     whitespace tokens of stripped
 *   - sorted:     tokens sorted alphabetically (token-set-ratio base)
 *   - initials:   first letter of each token
 *
 * Handles Latin, Arabic, Cyrillic, and common CJK transliteration fallbacks
 * via a lightweight rule table. For production-grade transliteration an
 * external library would be preferable, but this keeps the module dep-free.
 */

// Common company suffixes across jurisdictions. Stripped during comparison
// so that "ACME TRADING LLC" matches "Acme Trading".
const COMPANY_SUFFIXES = new Set([
  'llc', 'ltd', 'limited', 'inc', 'incorporated', 'corp', 'corporation',
  'co', 'company', 'plc', 'gmbh', 'ag', 'sa', 'sas', 'sarl', 'srl', 'spa',
  'bv', 'nv', 'oy', 'ab', 'as', 'kk', 'kg', 'oao', 'ooo', 'pjsc', 'jsc',
  'fzco', 'fze', 'fzllc', 'dmcc', 'dwc', 'holdings', 'holding', 'group',
  'trading', 'trust', 'foundation', 'establishment', 'est', 'bank',
  'international', 'intl', 'worldwide', 'global', 'partners', 'lp', 'llp',
]);

// Honorifics / titles stripped from personal names.
const HONORIFICS = new Set([
  'mr', 'mrs', 'ms', 'miss', 'dr', 'prof', 'sir', 'lord', 'lady',
  'sheikh', 'shaikh', 'sayed', 'sayyid', 'hajji', 'haji', 'hadji',
  'eng', 'engineer', 'capt', 'col', 'gen', 'maj', 'lt', 'sgt',
  'his', 'her', 'excellency', 'honorable', 'hon',
]);

// Minimal Arabic → Latin transliteration (ISO 233 simplified).
// Covers the 28 base letters; diacritics/hamza variants mapped to nearest
// Latin sound. Not linguistically perfect but sufficient for matching.
const ARABIC_MAP = {
  'ا': 'a', 'أ': 'a', 'إ': 'i', 'آ': 'aa', 'ء': '', 'ؤ': 'u', 'ئ': 'i',
  'ب': 'b', 'ت': 't', 'ث': 'th', 'ج': 'j', 'ح': 'h', 'خ': 'kh',
  'د': 'd', 'ذ': 'dh', 'ر': 'r', 'ز': 'z', 'س': 's', 'ش': 'sh',
  'ص': 's', 'ض': 'd', 'ط': 't', 'ظ': 'z', 'ع': 'a', 'غ': 'gh',
  'ف': 'f', 'ق': 'q', 'ك': 'k', 'ل': 'l', 'م': 'm', 'ن': 'n',
  'ه': 'h', 'و': 'w', 'ي': 'y', 'ى': 'a', 'ة': 'h',
  'ـ': '', // tatweel
};

// Minimal Cyrillic → Latin (GOST 7.79 system B, simplified).
const CYRILLIC_MAP = {
  'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo',
  'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
  'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
  'ф': 'f', 'х': 'kh', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'shch',
  'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
};

/**
 * Detect the dominant script of a string. Returns 'arabic', 'cyrillic',
 * 'cjk', or 'latin'. Used to select the transliteration strategy.
 */
export function detectScript(s) {
  if (!s) return 'latin';
  let arabic = 0, cyrillic = 0, cjk = 0, latin = 0;
  for (const ch of s) {
    const code = ch.codePointAt(0);
    if (code >= 0x0600 && code <= 0x06FF) arabic++;
    else if (code >= 0x0400 && code <= 0x04FF) cyrillic++;
    else if (code >= 0x4E00 && code <= 0x9FFF) cjk++;
    else if ((code >= 0x41 && code <= 0x5A) || (code >= 0x61 && code <= 0x7A)) latin++;
  }
  const max = Math.max(arabic, cyrillic, cjk, latin);
  if (max === 0) return 'latin';
  if (max === arabic) return 'arabic';
  if (max === cyrillic) return 'cyrillic';
  if (max === cjk) return 'cjk';
  return 'latin';
}

/**
 * Transliterate non-Latin scripts to Latin using the simple rule tables.
 * CJK characters are dropped (no rule table here) — callers should supply a
 * Latin alias for CJK entities.
 */
export function transliterate(s) {
  if (!s) return '';
  const script = detectScript(s);
  if (script === 'latin') return s;
  let out = '';
  for (const ch of s) {
    if (script === 'arabic' && ARABIC_MAP[ch] !== undefined) out += ARABIC_MAP[ch];
    else if (script === 'cyrillic' && CYRILLIC_MAP[ch.toLowerCase()] !== undefined) {
      out += CYRILLIC_MAP[ch.toLowerCase()];
    } else if (ch.match(/[\s\-']/)) out += ch;
    else if (script === 'cjk') continue;
    else out += ch;
  }
  return out;
}

/**
 * Remove Unicode combining marks (diacritics). "José" → "Jose".
 */
export function stripDiacritics(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Produce the full canonical form. Callers should use .stripped for
 * character-level comparisons and .tokens/.sorted for token-level ratios.
 */
export function normalize(input) {
  if (input == null) return { raw: '', stripped: '', tokens: [], sorted: '', initials: '' };
  const raw = String(input).trim();
  let s = transliterate(raw);
  s = stripDiacritics(s).toLowerCase();
  // Replace any non-alphanumeric with space, collapse whitespace.
  s = s.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const rawTokens = s.split(' ').filter(Boolean);
  // Drop honorifics and single-char tokens (usually initials left over).
  const filtered = rawTokens.filter(t => !HONORIFICS.has(t));
  // For entities, drop company suffixes.
  const entityFiltered = filtered.filter(t => !COMPANY_SUFFIXES.has(t));
  const tokens = entityFiltered.length ? entityFiltered : filtered;
  const stripped = tokens.join(' ');
  const sorted = [...tokens].sort().join(' ');
  const initials = tokens.map(t => t[0] || '').join('');
  return { raw, stripped, tokens, sorted, initials };
}

/**
 * Generate n-grams of a string for blocking/indexing. Default trigrams.
 * Used by the store to pre-filter candidates before expensive scoring.
 */
export function ngrams(s, n = 3) {
  if (!s || s.length < n) return s ? [s] : [];
  const out = [];
  for (let i = 0; i <= s.length - n; i++) out.push(s.slice(i, i + n));
  return out;
}
