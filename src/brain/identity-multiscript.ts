// Hawkeye Sterling — multi-script identity matching.
//
// Supplements the existing translit.ts / translit-cyrillic-cjk.ts / matching.ts
// with:
//   - scriptOf()           — detect Arabic/Persian/Cyrillic/CJK/Latin runs
//   - normaliseArabicName  — broader Arabic+Persian letter-level normalisation
//     (ٱ→ا, ى→ي, ة→ه, إأآ→ا, ؤ→و, ئ→ي, ک→ك, ی→ي, ...) — canonicalises
//     spelling variants that pre-computed name families cannot cover
//   - expandArabicVariants — token-by-token expansion into canonical families
//     (e.g. `Mohammad Al-Hassan` → {Mohammed, Muhammad, ...} × {Al-Hassan, Hassan, ...})
//   - reorderNameParts     — patronymic handling + particle-agnostic surname
//   - dobOverlap           — DoB±tolerance matching with partial-date support
//   - matchIdentities      — unified multi-script matcher combining the above
//
// Goal: out-perform Refinitiv World-Check on Arabic-script false-negative rate
// (where WC routinely misses Mohammed↔Muhammad↔محمد and Al-Hassan↔Hassan).

import { matchEnsemble, type EnsembleMatch } from './matching.js';
import { normaliseArabicRoman, variantsOf } from './translit.js';
import { transliterateAny, cyrillicToLatin, chineseToPinyinSubset } from './translit-cyrillic-cjk.js';

export type ScriptRun = 'latin' | 'arabic' | 'persian' | 'cyrillic' | 'cjk' | 'other';

/** Dominant script of the string (the one that carries most letters). */
export function scriptOf(s: string): ScriptRun {
  let latin = 0, arabic = 0, persian = 0, cyrillic = 0, cjk = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    if ((c >= 0x0041 && c <= 0x007A) || (c >= 0x00C0 && c <= 0x024F)) latin++;
    else if (c >= 0x0600 && c <= 0x06FF) {
      // Persian-specific letters sit in the Arabic block.
      if (c === 0x067E /* پ */ || c === 0x0686 /* چ */ || c === 0x0698 /* ژ */
        || c === 0x06AF /* گ */ || c === 0x06CC /* ی */ || c === 0x06A9 /* ک */) persian++;
      else arabic++;
    } else if (c >= 0x0400 && c <= 0x04FF) cyrillic++;
    else if ((c >= 0x3040 && c <= 0x30FF) || (c >= 0x4E00 && c <= 0x9FFF)
      || (c >= 0xAC00 && c <= 0xD7AF)) cjk++;
  }
  const top = Math.max(latin, arabic, persian, cyrillic, cjk);
  if (top === 0) return 'other';
  if (top === latin) return 'latin';
  if (top === arabic) return 'arabic';
  if (top === persian) return 'persian';
  if (top === cyrillic) return 'cyrillic';
  return 'cjk';
}

/** Aggressive Arabic+Persian letter-level normalisation.
 *
 *  Canonicalises: hamza-bearing alefs → alef, taa-marbuta → haa, alef-maksura → yaa,
 *  Persian kaf/yaa → Arabic kaf/yaa, strips tashkeel (diacritics), collapses whitespace. */
export function normaliseArabicName(input: string): string {
  let s = input.normalize('NFC');
  // Strip tashkeel / harakat (diacritics).
  s = s.replace(/[ً-ٰٟۖ-ۭ]/g, '');
  // Tatweel.
  s = s.replace(/ـ/g, '');
  // Hamza-bearing forms → plain alef / waaw / yaa.
  s = s.replace(/[آأإٱ]/g, 'ا'); // ٱ آ أ إ → ا
  s = s.replace(/ؤ/g, 'و'); // ؤ → و
  s = s.replace(/ئ/g, 'ي'); // ئ → ي
  s = s.replace(/ء/g, ''); // bare hamza ء → drop
  // Alef-maksura → yaa.
  s = s.replace(/ى/g, 'ي');
  // Taa-marbuta → haa (end-of-name variant).
  s = s.replace(/ة/g, 'ه');
  // Persian-specific mappings to the common Arabic form.
  s = s.replace(/ک/g, 'ك'); // ک → ك
  s = s.replace(/ی/g, 'ي'); // ی → ي
  // Collapse whitespace.
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

/** Broader Arabic+Persian canonical-family table. Extends translit.ts's ~20
 *  names with the most common first-name + particle + patronymic variants.
 *  The table is keyed by a Latin canonical form; each entry lists additional
 *  Latin spellings, Arabic forms, and Persian forms. */
interface NameFamily {
  latin: string[];       // canonical first, then aliases
  arabic: string[];      // Arabic-script forms
  persian?: string[];    // Persian-script forms (optional, if distinctive)
}

export const ARABIC_NAME_FAMILIES: Record<string, NameFamily> = {
  muhammad: {
    latin: ['muhammad', 'mohammad', 'mohammed', 'mohamed', 'mohamad', 'mehmet', 'muhammed'],
    arabic: ['محمد', 'مـحـمـد'],
  },
  ahmad: {
    latin: ['ahmad', 'ahmed', 'ahmet', 'achmad'],
    arabic: ['احمد', 'أحمد'],
  },
  mahmoud: {
    latin: ['mahmoud', 'mahmud', 'mahmood', 'mehmood'],
    arabic: ['محمود'],
  },
  ali: {
    latin: ['ali', 'aly'],
    arabic: ['علي'],
  },
  hassan: {
    latin: ['hassan', 'hasan', 'hasen'],
    arabic: ['حسن'],
  },
  hussein: {
    latin: ['hussein', 'hossein', 'husayn', 'hussain', 'husain', 'husein'],
    arabic: ['حسين'],
    persian: ['حسین'],
  },
  ibrahim: {
    latin: ['ibrahim', 'ebrahim', 'ibraheem'],
    arabic: ['ابراهيم', 'إبراهيم'],
  },
  abdullah: {
    latin: ['abdullah', 'abdallah', 'abdalla', 'abdellah'],
    arabic: ['عبدالله', 'عبد الله'],
  },
  abdulrahman: {
    latin: ['abdulrahman', 'abd al-rahman', 'abderrahmane', 'abdelrahman', 'abdul rahman'],
    arabic: ['عبدالرحمن', 'عبد الرحمن'],
  },
  abdulaziz: {
    latin: ['abdulaziz', 'abdelaziz', 'abdel aziz', 'abd al-aziz'],
    arabic: ['عبدالعزيز', 'عبد العزيز'],
  },
  khalid: {
    latin: ['khalid', 'khaled', 'khaleed', 'kahled'],
    arabic: ['خالد'],
  },
  yusuf: {
    latin: ['yusuf', 'youssef', 'yousef', 'yosef', 'yousif', 'yossef'],
    arabic: ['يوسف'],
  },
  omar: {
    latin: ['omar', 'umar', 'omer', 'oumar'],
    arabic: ['عمر'],
  },
  osama: {
    latin: ['osama', 'usama', 'ousama'],
    arabic: ['اسامة', 'أسامة'],
  },
  said: {
    latin: ['said', 'saeed', 'sayyid', 'sayed', 'seyed', 'seyyed', 'sayid'],
    arabic: ['سعيد', 'سيد'],
  },
  fatima: {
    latin: ['fatima', 'fatimah', 'fatma', 'fatemeh', 'fatemah'],
    arabic: ['فاطمة'],
  },
  aisha: {
    latin: ['aisha', 'ayesha', 'aicha', 'aysha'],
    arabic: ['عائشة', 'عايشة'],
  },
  khadija: {
    latin: ['khadija', 'khadijah', 'khadidja'],
    arabic: ['خديجة'],
  },
  zainab: {
    latin: ['zainab', 'zaynab', 'zeinab', 'zeynep'],
    arabic: ['زينب'],
  },
  maryam: {
    latin: ['maryam', 'mariam', 'maria', 'miriam'],
    arabic: ['مريم'],
  },
  fahd: {
    latin: ['fahd', 'fahad'],
    arabic: ['فهد'],
  },
  salman: {
    latin: ['salman'],
    arabic: ['سلمان'],
  },
  sultan: {
    latin: ['sultan'],
    arabic: ['سلطان'],
  },
  tariq: {
    latin: ['tariq', 'tarek', 'tarik', 'tareq'],
    arabic: ['طارق'],
  },
  nasser: {
    latin: ['nasser', 'nasr', 'nasir'],
    arabic: ['ناصر', 'نصر'],
  },
  saad: {
    latin: ['saad', 'sa\'d'],
    arabic: ['سعد'],
  },
  saleh: {
    latin: ['saleh', 'salih', 'salah'],
    arabic: ['صالح', 'صلاح'],
  },
  bandar: {
    latin: ['bandar'],
    arabic: ['بندر'],
  },
  jamal: {
    latin: ['jamal', 'gamal'],
    arabic: ['جمال'],
  },
  nour: {
    latin: ['nour', 'noor', 'nur'],
    arabic: ['نور'],
  },
  abd_al_: {
    latin: ['abdel', 'abdul', 'abd al', 'abd el'],
    arabic: ['عبد'],
  },
};

/** Particles and honorifics stripped from name tokens (case-insensitive). */
const PARTICLES = new Set([
  'al', 'el', 'as', 'es', 'ash', 'bin', 'ben', 'ibn', 'ould', 'abu', 'abou',
  'de', 'der', 'van', 'von', 'le', 'la', 'di', 'da', 'dos', 'du',
]);
const HONORIFICS = new Set([
  'hh', 'he', 'dr', 'mr', 'mrs', 'ms', 'sheikh', 'sheik', 'shaikh',
  'sayyid', 'sayed', 'mullah', 'mawlawi', 'imam', 'ustad', 'prof', 'professor',
  'sir', 'madam', 'eng', 'capt', 'gen', 'maj',
]);

/** Lowercase, strip diacritics, strip particles and honorifics, return clean tokens. */
export function tokeniseLatin(input: string): string[] {
  const s = normaliseArabicRoman(input).toLowerCase();
  const raw = s.split(/[^a-z0-9']+/).filter(Boolean);
  return raw.filter((t) => !PARTICLES.has(t) && !HONORIFICS.has(t.replace(/\./g, '')));
}

/** Expand a token into its canonical-family set. Returns the token itself
 *  if no family matches. */
export function expandToken(token: string): Set<string> {
  const lower = token.toLowerCase();
  const out = new Set<string>([lower]);
  for (const fam of Object.values(ARABIC_NAME_FAMILIES)) {
    if (fam.latin.includes(lower)) {
      for (const v of fam.latin) out.add(v);
    }
  }
  // Also pull in the translit.ts family helper (covers some edge cases).
  for (const v of variantsOf(lower)) out.add(v);
  return out;
}

/** Cartesian-expand a full Latin name into all variant spellings. */
export function expandArabicVariants(input: string): string[] {
  const tokens = tokeniseLatin(input);
  if (tokens.length === 0) return [input.toLowerCase()];
  const variants: string[][] = tokens.map((t) => [...expandToken(t)]);
  const out: string[] = [];
  const walk = (i: number, acc: string[]): void => {
    if (i === variants.length) { out.push(acc.join(' ')); return; }
    for (const v of variants[i]!) walk(i + 1, [...acc, v]);
  };
  walk(0, []);
  // Keep variant count bounded.
  return Array.from(new Set(out)).slice(0, 400);
}

/** Reorder name parts: [last, first, middle] and [first, last] should match.
 *  Returns both orderings and a particle-stripped "surname only" candidate. */
export function reorderNameParts(input: string): string[] {
  const tokens = tokeniseLatin(input);
  if (tokens.length === 0) return [input];
  if (tokens.length === 1) return tokens;
  const head = tokens[0]!;
  const tail = tokens.slice(1);
  const last = tokens[tokens.length - 1]!;
  const head2 = tokens.slice(0, -1);
  const orderings = new Set<string>([
    tokens.join(' '),                    // original
    [...tail, head].join(' '),           // rotate first to end
    [last, ...head2].join(' '),          // surname first
    `${head} ${last}`,                   // first + last only
    last,                                // surname only
  ]);
  return [...orderings];
}

/** Parse ISO-ish partial dates: 'YYYY', 'YYYY-MM', 'YYYY-MM-DD'. Returns
 *  {year, month?, day?} or null on failure. */
export function parsePartialDate(s: string): { year: number; month?: number; day?: number } | null {
  const m = /^(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?$/.exec(s.trim());
  if (!m) return null;
  const year = Number.parseInt(m[1]!, 10);
  if (!Number.isFinite(year) || year < 1800 || year > 2200) return null;
  const month = m[2] ? Number.parseInt(m[2], 10) : undefined;
  const day = m[3] ? Number.parseInt(m[3], 10) : undefined;
  if (month !== undefined && (month < 1 || month > 12)) return null;
  if (day !== undefined && (day < 1 || day > 31)) return null;
  const out: { year: number; month?: number; day?: number } = { year };
  if (month !== undefined) out.month = month;
  if (day !== undefined) out.day = day;
  return out;
}

/** Compute an overlap score in [0,1] between two (possibly partial) DoBs.
 *  yearToleranceYears: acceptable year-slippage (default 1; a typo of one
 *  digit in a DoB is a known OFAC issue). */
export function dobOverlap(
  a: string | undefined,
  b: string | undefined,
  opts: { yearToleranceYears?: number } = {},
): number {
  if (!a || !b) return 0;
  const pa = parsePartialDate(a);
  const pb = parsePartialDate(b);
  if (!pa || !pb) return 0;
  const yearTol = opts.yearToleranceYears ?? 1;
  const yearDelta = Math.abs(pa.year - pb.year);
  if (yearDelta > yearTol) return 0;
  let score = 1 - yearDelta / Math.max(1, yearTol);  // 1.0 for exact year.
  // Month contribution.
  if (pa.month !== undefined && pb.month !== undefined) {
    if (pa.month === pb.month) score = Math.min(1, score + 0.15);
    else score = Math.max(0, score - 0.25);
  }
  // Day contribution.
  if (pa.day !== undefined && pb.day !== undefined) {
    if (pa.day === pb.day) score = Math.min(1, score + 0.1);
    else score = Math.max(0, score - 0.15);
  }
  return Math.max(0, Math.min(1, score));
}

export interface IdentityMatchInput {
  name: string;
  aliases?: string[];
  dob?: string;               // ISO partial date ok
  nationality?: string;       // ISO 3166-1 alpha-2 or -3
  identifiers?: Record<string, string>;
}

export interface IdentityMatchResult {
  overallScore: number;       // 0..1
  bestName: string;           // the best-matching candidate form
  nameScore: number;          // 0..1 best ensemble score over all variants
  nameMethod: EnsembleMatch['method'];
  dobScore: number;           // 0..1 (0 if either DoB missing)
  nationalityMatch: boolean;
  strongIdHit: { kind: string; value: string } | null;
  strongIdConflict: { kind: string; a: string; b: string } | null;
  scriptA: ScriptRun;
  scriptB: ScriptRun;
  reasons: string[];
}

/** Unified multi-script identity matcher. Expands both inputs into their
 *  script-specific canonical forms, runs ensemble matching, layers DoB
 *  overlap + nationality + strong-ID overlay, and returns a single score. */
export function matchIdentities(a: IdentityMatchInput, b: IdentityMatchInput): IdentityMatchResult {
  const scriptA = scriptOf(a.name);
  const scriptB = scriptOf(b.name);
  const reasons: string[] = [];

  // Convert everything to a Latin canonical form first.
  const latinA = toLatinish(a.name, scriptA);
  const latinB = toLatinish(b.name, scriptB);

  // Variant expansion (Arabic families + reorderings).
  const variantsA = uniqueVariants([
    ...expandArabicVariants(latinA),
    ...reorderNameParts(latinA),
    ...(a.aliases ?? []).flatMap((x) => expandArabicVariants(toLatinish(x, scriptOf(x)))),
  ]);
  const variantsB = uniqueVariants([
    ...expandArabicVariants(latinB),
    ...reorderNameParts(latinB),
    ...(b.aliases ?? []).flatMap((x) => expandArabicVariants(toLatinish(x, scriptOf(x)))),
  ]);

  let bestScore = 0;
  let bestA = variantsA[0] ?? latinA;
  let bestB = variantsB[0] ?? latinB;
  let bestMethod: EnsembleMatch['method'] = 'exact';
  const cap = Math.min(variantsA.length, 40) * Math.min(variantsB.length, 40);
  let compared = 0;
  for (const va of variantsA.slice(0, 40)) {
    for (const vb of variantsB.slice(0, 40)) {
      compared++;
      if (compared > 1600) break;
      const r = matchEnsemble(va, vb);
      if (r.score > bestScore) { bestScore = r.score; bestA = va; bestB = vb; bestMethod = r.method; }
      if (bestScore === 1) break;
    }
    if (bestScore === 1) break;
  }
  reasons.push(`Name: best variant "${bestA}" vs "${bestB}" → ${bestMethod} score ${bestScore.toFixed(3)} (${variantsA.length}×${variantsB.length} variants considered, capped at ${Math.min(cap, 1600)}).`);

  // DoB overlap.
  const dobScore = dobOverlap(a.dob, b.dob);
  if (dobScore > 0) reasons.push(`DoB overlap: ${dobScore.toFixed(2)} ("${a.dob}" ~ "${b.dob}").`);
  else if (a.dob && b.dob) reasons.push(`DoB mismatch: "${a.dob}" vs "${b.dob}".`);

  // Nationality.
  const nationalityMatch = !!a.nationality && !!b.nationality
    && a.nationality.toLowerCase().slice(0, 2) === b.nationality.toLowerCase().slice(0, 2);
  if (nationalityMatch) reasons.push(`Nationality match: ${a.nationality}.`);

  // Strong-ID overlap / conflict.
  let strongIdHit: IdentityMatchResult['strongIdHit'] = null;
  let strongIdConflict: IdentityMatchResult['strongIdConflict'] = null;
  const ida = a.identifiers ?? {};
  const idb = b.identifiers ?? {};
  for (const kind of Object.keys(ida)) {
    if (idb[kind]) {
      if (normaliseId(ida[kind]!) === normaliseId(idb[kind]!)) {
        strongIdHit = { kind, value: ida[kind]! };
        break;
      } else {
        strongIdConflict = { kind, a: ida[kind]!, b: idb[kind]! };
      }
    }
  }
  if (strongIdHit) reasons.push(`Strong-ID match: ${strongIdHit.kind}=${strongIdHit.value}.`);
  if (strongIdConflict) reasons.push(`Strong-ID conflict: ${strongIdConflict.kind} differs ("${strongIdConflict.a}" vs "${strongIdConflict.b}"). Per charter P6, never merge on conflicting strong IDs.`);

  // Composite score — ensemble name (60%) + DoB (15%) + nationality (5%) + strong-ID (20%).
  // Strong-ID conflict HARD caps the composite at 0.5 regardless of the rest.
  let overall = 0.6 * bestScore;
  overall += 0.15 * dobScore;
  if (nationalityMatch) overall += 0.05;
  if (strongIdHit) overall += 0.2;
  if (strongIdConflict) overall = Math.min(overall, 0.5);
  overall = Math.max(0, Math.min(1, overall));

  return {
    overallScore: overall,
    bestName: bestA,
    nameScore: bestScore,
    nameMethod: bestMethod,
    dobScore,
    nationalityMatch,
    strongIdHit,
    strongIdConflict,
    scriptA,
    scriptB,
    reasons,
  };
}

// ── helpers ────────────────────────────────────────────────────────────

function uniqueVariants(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of list) {
    const k = v.trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

function toLatinish(input: string, script: ScriptRun): string {
  if (script === 'arabic' || script === 'persian') {
    const normalised = normaliseArabicName(input);
    // Look up the normalised Arabic form against every family's arabic[] list.
    for (const fam of Object.values(ARABIC_NAME_FAMILIES)) {
      for (const ar of fam.arabic) {
        if (normaliseArabicName(ar) === normalised) return fam.latin[0]!;
      }
      if (fam.persian) {
        for (const fa of fam.persian) {
          if (normaliseArabicName(fa) === normalised) return fam.latin[0]!;
        }
      }
    }
    // Fallback: character-level best-effort. transliterateAny handles cyrillic/cjk.
    const fallback = transliterateAny(input);
    return fallback || input;
  }
  if (script === 'cyrillic') return cyrillicToLatin(input);
  if (script === 'cjk') return chineseToPinyinSubset(input);
  return input;
}

function normaliseId(v: string): string {
  return v.replace(/[^0-9a-z]/gi, '').toLowerCase();
}
