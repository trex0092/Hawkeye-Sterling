// Hawkeye Sterling — name-matching algorithms.
// Real implementations of: exact, Levenshtein (distance + ratio),
// Jaro, Jaro-Winkler, Soundex, Double Metaphone (ASCII subset),
// token-set (order-insensitive token similarity).
// Every matcher returns a normalised score in [0,1] and declares its method
// so the reasoning chain can cite which algorithm produced a hit.

export type MatchingMethod =
  | 'exact'
  | 'levenshtein'
  | 'jaro'
  | 'jaro_winkler'
  | 'soundex'
  | 'double_metaphone'
  | 'token_set';

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
export function levenshteinDistance(a: string, b: string): number {
  const s = normalise(a);
  const t = normalise(b);
  const m = s.length;
  const n = t.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const prev = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  const curr = new Array<number>(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = s.charCodeAt(i - 1) === t.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        (curr[j - 1] as number) + 1,
        (prev[j] as number) + 1,
        (prev[j - 1] as number) + cost,
      );
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j] as number;
  }
  return prev[n] as number;
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
    while (!tFlags[k]) k++;
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
  const s = normalise(input).replace(/\s+/g, '');
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
    const code = map[s[i]!] ?? '';
    if (code && code !== prev) out += code;
    if (code) prev = code;
    else prev = '';
  }
  return (out + '000').slice(0, 4);
}

export function matchSoundex(a: string, b: string): MatchScore {
  const pass = soundex(a) === soundex(b) && soundex(a) !== '';
  return { method: 'soundex', score: pass ? 1 : 0, threshold: 1, pass };
}

// ---------- Double Metaphone (ASCII-subset pragmatic port)
// A compact implementation that captures the common cases used for UAE-
// context Latin-alphabet names. Full Unicode and non-Latin scripts will be
// handled in Phase 3 alongside Arabic-root normalisation.
export function doubleMetaphone(input: string): { primary: string; alternate: string } {
  const s = normalise(input).replace(/\s+/g, '').toUpperCase();
  if (!s) return { primary: '', alternate: '' };
  let primary = '';
  let alternate = '';
  let i = 0;
  const len = s.length;

  const at = (n: number) => s.charAt(n);
  const slice = (from: number, length: number) => s.substr(from, length);
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

export function matchEnsemble(subject: string, candidate: string): EnsembleMatch {
  const scores: MatchScore[] = [
    matchExact(subject, candidate),
    matchLevenshtein(subject, candidate),
    matchJaroWinkler(subject, candidate),
    matchTokenSet(subject, candidate),
    matchSoundex(subject, candidate),
    matchDoubleMetaphone(subject, candidate),
  ];
  const best = scores.reduce((a, b) => (b.score > a.score ? b : a));
  const phoneticAgreement =
    scores.find((s) => s.method === 'soundex')!.pass ||
    scores.find((s) => s.method === 'double_metaphone')!.pass;
  return { subject, candidate, scores, best, phoneticAgreement };
}
