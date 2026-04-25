// Hawkeye Sterling — name-matching library.
// Multi-script normalisation + classic fuzzy algorithms, composed into a single
// calibrated 0..1 score. Used by entity_resolution, list_walk, sanctions_cross_reference,
// and the forthcoming /api/screen matching pass.

const LATIN_DIACRITICS = /[̀-ͯ]/g;
const HONORIFICS = new Set([
  'mr','mrs','ms','miss','mx','dr','sir','madam','lord','lady','prof','professor',
  'hon','honorable','rev','reverend','fr','father','capt','captain','sgt','sergeant',
  'lt','lieutenant','gen','general','col','colonel','maj','major','adm','admiral',
  'sh','sheikh','sheik','sheikha','hh','hrh','his','her','highness','royal',
  'eng','engineer','ar','architect','amb','ambassador','sen','senator',
]);
const CORP_SUFFIXES = new Set([
  'ltd','limited','llc','llp','lp','inc','incorporated','corp','corporation','co','company',
  'gmbh','ag','sa','sas','sarl','oy','ab','as','nv','bv','kg','sp','srl','spa','plc',
  'pty','pt','tbk','fzco','fze','dmcc','llc-fz','fz-llc','dwc','jltd','jsc','ooo','zao','pjsc',
  'holding','holdings','group','international','global','trading','services','enterprise','enterprises',
]);
const TOKEN_SPLIT = /[\s\-._,'()&/+]+/u;

// ── Latin normalisation ──────────────────────────────────────────────────
export function normalizeLatin(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(LATIN_DIACRITICS, '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenize(raw: string): string[] {
  return normalizeLatin(raw).split(TOKEN_SPLIT).filter((t) => t.length > 0);
}

export function stripHonorificsAndSuffixes(tokens: string[]): string[] {
  return tokens.filter((t) => !HONORIFICS.has(t) && !CORP_SUFFIXES.has(t));
}

// ── Arabic normalisation ─────────────────────────────────────────────────
// Strip tashkeel, unify alef/yeh/teh-marbuta variants, collapse hamza forms.
const ARABIC_TASHKEEL = /[ً-ْٰـ]/g;
const ARABIC_ALEF = /[آأإٱ]/g;   // آأإٱ → ا
const ARABIC_YEH = /[ىي]/g;                // ىي → ي (merge alef-maksura)
const ARABIC_TEH_MARBUTA = /ة/g;                // ة → ه
const ARABIC_HAMZA = /[ؤئ]/g;              // ؤئ → ء

export function normalizeArabic(raw: string): string {
  return raw
    .replace(ARABIC_TASHKEEL, '')
    .replace(ARABIC_ALEF, 'ا')
    .replace(ARABIC_YEH, 'ي')
    .replace(ARABIC_TEH_MARBUTA, 'ه')
    .replace(ARABIC_HAMZA, 'ء')
    .replace(/\s+/g, ' ')
    .trim();
}

// Arabic-to-Latin transliteration — conservative Buckwalter-derived mapping.
const ARABIC_BUCKWALTER: Record<string, string> = {
  'ا':'a','ب':'b','ت':'t','ث':'th','ج':'j','ح':'h','خ':'kh','د':'d','ذ':'dh',
  'ر':'r','ز':'z','س':'s','ش':'sh','ص':'s','ض':'d','ط':'t','ظ':'z','ع':'','غ':'gh',
  'ف':'f','ق':'q','ك':'k','ل':'l','م':'m','ن':'n','ه':'h','و':'w','ي':'y','ء':'',
};
export function transliterateArabic(raw: string): string {
  const normed = normalizeArabic(raw);
  let out = '';
  for (const ch of normed) out += ARABIC_BUCKWALTER[ch] ?? ch;
  return normalizeLatin(out);
}

// ── CJK normalisation ────────────────────────────────────────────────────
// Strip whitespace; leave CJK ideographs intact for exact match. Phonetic
// transliteration (Pinyin/Hepburn/Revised-Romanisation) is Phase-3 work — we
// compare ideographs directly and flag when transliteration is required.
export function normalizeCJK(raw: string): string {
  return raw.replace(/\s+/g, '').normalize('NFKC');
}
export function hasCJK(raw: string): boolean {
  return /[㐀-鿿豈-﫿぀-ヿ가-힯]/.test(raw);
}
export function hasArabic(raw: string): boolean {
  return /[؀-ۿݐ-ݿࢠ-ࣿ]/.test(raw);
}
export function hasCyrillic(raw: string): boolean {
  return /[Ѐ-ӿ]/.test(raw);
}

// ── Cyrillic transliteration (GOST 7.79 simplified) ──────────────────────
const CYRILLIC_MAP: Record<string, string> = {
  'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'e','ж':'zh','з':'z',
  'и':'i','й':'i','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r',
  'с':'s','т':'t','у':'u','ф':'f','х':'kh','ц':'ts','ч':'ch','ш':'sh','щ':'shch',
  'ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya',
};
export function transliterateCyrillic(raw: string): string {
  const lower = raw.toLowerCase();
  let out = '';
  for (const ch of lower) out += CYRILLIC_MAP[ch] ?? ch;
  return normalizeLatin(out);
}

// ── Levenshtein (O(m*n) DP) ──────────────────────────────────────────────
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const m = a.length, n = b.length;
  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        (curr[j - 1] ?? 0) + 1,
        (prev[j] ?? 0) + 1,
        (prev[j - 1] ?? 0) + cost,
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n] ?? Math.max(m, n);
}

// ── Damerau-Levenshtein (includes transposition) ─────────────────────────
export function damerauLevenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const d: number[][] = [];
  for (let i = 0; i <= m; i++) { const row: number[] = []; for (let j = 0; j <= n; j++) row.push(0); d.push(row); }
  for (let i = 0; i <= m; i++) (d[i] as number[])[0] = i;
  for (let j = 0; j <= n; j++) (d[0] as number[])[j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      const row = d[i]!;
      const prow = d[i - 1]!;
      row[j] = Math.min(row[j - 1]! + 1, prow[j]! + 1, prow[j - 1]! + cost);
      if (
        i > 1 && j > 1 &&
        a.charCodeAt(i - 1) === b.charCodeAt(j - 2) &&
        a.charCodeAt(i - 2) === b.charCodeAt(j - 1)
      ) {
        const pprow = d[i - 2]!;
        row[j] = Math.min(row[j]!, pprow[j - 2]! + 1);
      }
    }
  }
  return d[m]![n]!;
}

// ── Jaro ─────────────────────────────────────────────────────────────────
export function jaro(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  const matchWindow = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const aMatch = new Array<boolean>(a.length).fill(false);
  const bMatch = new Array<boolean>(b.length).fill(false);
  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    const lo = Math.max(0, i - matchWindow);
    const hi = Math.min(b.length - 1, i + matchWindow);
    for (let j = lo; j <= hi; j++) {
      if (bMatch[j]) continue;
      if (a[i] !== b[j]) continue;
      aMatch[i] = true;
      bMatch[j] = true;
      matches++;
      break;
    }
  }
  if (matches === 0) return 0;
  let transpositions = 0, k = 0;
  for (let i = 0; i < a.length; i++) {
    if (!aMatch[i]) continue;
    while (k < b.length && !bMatch[k]) k++;
    if (k >= b.length) break;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }
  transpositions /= 2;
  return (matches / a.length + matches / b.length + (matches - transpositions) / matches) / 3;
}

// ── Jaro-Winkler ─────────────────────────────────────────────────────────
export function jaroWinkler(a: string, b: string, p = 0.1, maxPrefix = 4): number {
  const j = jaro(a, b);
  let l = 0;
  const cap = Math.min(maxPrefix, Math.min(a.length, b.length));
  while (l < cap && a[l] === b[l]) l++;
  return j + l * p * (1 - j);
}

// ── n-gram Jaccard ───────────────────────────────────────────────────────
export function ngrams(s: string, n = 3): Set<string> {
  const out = new Set<string>();
  if (s.length < n) { out.add(s); return out; }
  for (let i = 0; i <= s.length - n; i++) out.add(s.slice(i, i + n));
  return out;
}
export function jaccardNgrams(a: string, b: string, n = 3): number {
  const A = ngrams(a, n), B = ngrams(b, n);
  if (A.size === 0 && B.size === 0) return 1;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const denom = A.size + B.size - inter;
  return denom === 0 ? 0 : inter / denom;
}

// ── Metaphone (simplified, Latin) ────────────────────────────────────────
export function metaphone(raw: string): string {
  const s = normalizeLatin(raw).replace(/[^a-z]/g, '');
  if (!s) return '';
  let out = '';
  let i = 0;
  if (/^(kn|gn|pn|ae|wr)/.test(s)) i = 1;
  else if (s.startsWith('x')) { out = 's'; i = 1; }
  while (i < s.length) {
    const c = s[i]!;
    const prev = out[out.length - 1];
    if (c === prev && c !== 'c') { i++; continue; }
    switch (c) {
      case 'a': case 'e': case 'i': case 'o': case 'u':
        if (i === 0) out += c; break;
      case 'b': out += 'b'; break;
      case 'c':
        if (s[i+1] === 'h') { out += 'x'; i++; }
        else if (/[iey]/.test(s[i+1] ?? '')) out += 's';
        else out += 'k';
        break;
      case 'd':
        if (s[i+1] === 'g' && /[iey]/.test(s[i+2] ?? '')) { out += 'j'; i += 2; }
        else out += 't';
        break;
      case 'f': out += 'f'; break;
      case 'g':
        if (s[i+1] === 'h') { if (i === 0) { out += 'k'; } i++; }
        else if (s[i+1] === 'n') { out += 'n'; i++; }
        else if (/[iey]/.test(s[i+1] ?? '')) out += 'j';
        else out += 'k';
        break;
      case 'h':
        if (i === 0 || /[aeiou]/.test(s[i-1] ?? '')) {
          if (/[aeiou]/.test(s[i+1] ?? '')) out += 'h';
        }
        break;
      case 'j': out += 'j'; break;
      case 'k': if (s[i-1] !== 'c') out += 'k'; break;
      case 'l': out += 'l'; break;
      case 'm': out += 'm'; break;
      case 'n': out += 'n'; break;
      case 'p': if (s[i+1] === 'h') { out += 'f'; i++; } else out += 'p'; break;
      case 'q': out += 'k'; break;
      case 'r': out += 'r'; break;
      case 's': if (s[i+1] === 'h') { out += 'x'; i++; } else out += 's'; break;
      case 't':
        if (s[i+1] === 'h') { out += '0'; i++; }
        else if (s.startsWith('tio', i) || s.startsWith('tia', i)) { out += 'x'; }
        else out += 't';
        break;
      case 'v': out += 'f'; break;
      case 'w': if (/[aeiou]/.test(s[i+1] ?? '')) out += 'w'; break;
      case 'x': out += 'ks'; break;
      case 'y': if (/[aeiou]/.test(s[i+1] ?? '')) out += 'y'; break;
      case 'z': out += 's'; break;
    }
    i++;
  }
  return out;
}

// ── Double Metaphone (primary, alternate) — simplified ───────────────────
export function doubleMetaphone(raw: string): [string, string] {
  const p = metaphone(raw);
  // Alternate: strip leading vowels, keep consonant skeleton.
  const alt = p.replace(/^[aeiouy]+/, '');
  return [p, alt || p];
}

// ── Token-set similarity (order-invariant) ───────────────────────────────
export function tokenSetSimilarity(a: string, b: string): number {
  const A = new Set(stripHonorificsAndSuffixes(tokenize(a)));
  const B = new Set(stripHonorificsAndSuffixes(tokenize(b)));
  if (A.size === 0 && B.size === 0) return 1;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  const denom = A.size + B.size - inter;
  return denom === 0 ? 0 : inter / denom;
}

// ── Composite weighted score ─────────────────────────────────────────────
// Weights calibrated for entity-resolution under real-world OFAC/UN noise.
export interface MatchScore {
  score: number;              // 0..1 composite
  confidence: number;         // 0..1 — higher when multiple signals agree
  jaroWinkler: number;
  tokenSet: number;
  jaccard3: number;
  levenshteinRatio: number;
  phoneticMatch: boolean;
  scriptStrategy: 'latin' | 'arabic_translit' | 'cyrillic_translit' | 'cjk_exact' | 'mixed';
}
export function matchScore(rawA: string, rawB: string): MatchScore {
  const scriptStrategy: MatchScore['scriptStrategy'] =
    hasCJK(rawA) || hasCJK(rawB) ? 'cjk_exact'
    : hasArabic(rawA) || hasArabic(rawB) ? 'arabic_translit'
    : hasCyrillic(rawA) || hasCyrillic(rawB) ? 'cyrillic_translit'
    : 'latin';
  let a = rawA, b = rawB;
  if (scriptStrategy === 'arabic_translit') { a = transliterateArabic(rawA); b = transliterateArabic(rawB); }
  else if (scriptStrategy === 'cyrillic_translit') { a = transliterateCyrillic(rawA); b = transliterateCyrillic(rawB); }
  else if (scriptStrategy === 'cjk_exact') { a = normalizeCJK(rawA); b = normalizeCJK(rawB); }
  else { a = normalizeLatin(rawA); b = normalizeLatin(rawB); }

  const jw = jaroWinkler(a, b);
  const ts = tokenSetSimilarity(a, b);
  const jc = jaccardNgrams(a, b, 3);
  const lev = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length, 1);
  const levRatio = 1 - lev / maxLen;
  const [pa] = doubleMetaphone(a);
  const [pb] = doubleMetaphone(b);
  const phonetic = pa.length > 0 && pa === pb;

  const composite =
    0.35 * jw +
    0.25 * ts +
    0.15 * jc +
    0.15 * levRatio +
    (phonetic ? 0.10 : 0);

  const agreements = [jw > 0.85, ts > 0.7, jc > 0.5, levRatio > 0.7, phonetic].filter(Boolean).length;
  const confidence = Math.min(0.95, 0.4 + 0.12 * agreements);

  return {
    score: Math.max(0, Math.min(1, composite)),
    confidence,
    jaroWinkler: jw,
    tokenSet: ts,
    jaccard3: jc,
    levenshteinRatio: Math.max(0, levRatio),
    phoneticMatch: phonetic,
    scriptStrategy,
  };
}

export interface CandidateMatch<T> {
  candidate: T;
  name: string;
  match: MatchScore;
}
export function rankCandidates<T>(
  query: string,
  candidates: ReadonlyArray<T>,
  getName: (c: T) => string,
  topK = 20,
): CandidateMatch<T>[] {
  const scored = candidates.map((c) => ({
    candidate: c,
    name: getName(c),
    match: matchScore(query, getName(c)),
  }));
  scored.sort((a, b) => b.match.score - a.match.score);
  return scored.slice(0, topK);
}
