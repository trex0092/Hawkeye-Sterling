// Hawkeye Sterling — name romanisation / transliteration helpers.
// UAE-aligned: Arabic names are the first-class concern. The brain uses these
// to (a) normalise the common spelling variants of widely-shared names and
// (b) generate alias candidates for matching. These are PRAGMATIC helpers —
// full script-level Arabic root analysis lands in Phase 3.

// Common family of romanisations that collapse to a single canonical form.
const ROMAN_FAMILIES: Array<{ canonical: string; variants: string[] }> = [
  { canonical: 'muhammad', variants: ['muhammad', 'mohammed', 'mohamed', 'mohamad', 'mohd', 'mohammad', 'mohmed', 'mohamud'] },
  { canonical: 'ahmad', variants: ['ahmad', 'ahmed', 'ahmet'] },
  { canonical: 'ali', variants: ['ali', 'aly', 'alie'] },
  { canonical: 'hassan', variants: ['hassan', 'hasan', 'hassen'] },
  { canonical: 'hussein', variants: ['hussein', 'husain', 'husayn', 'husein', 'hussain'] },
  { canonical: 'ibrahim', variants: ['ibrahim', 'ebrahim', 'ibraheem'] },
  { canonical: 'abdullah', variants: ['abdullah', 'abdallah', 'abd allah', 'abdullahi', 'abdulla'] },
  { canonical: 'abdul rahman', variants: ['abdul rahman', 'abdulrahman', 'abdurrahman', 'abd al-rahman', 'abdel rahman'] },
  { canonical: 'abdul aziz', variants: ['abdul aziz', 'abdulaziz', 'abd al-aziz', 'abdelaziz'] },
  { canonical: 'khalid', variants: ['khalid', 'khaled', 'khaleed'] },
  { canonical: 'yusuf', variants: ['yusuf', 'yousef', 'yusof', 'youssef', 'yousuf', 'yusef'] },
  { canonical: 'omar', variants: ['omar', 'umar', 'omer'] },
  { canonical: 'osama', variants: ['osama', 'oussama', 'usama'] },
  { canonical: 'fatima', variants: ['fatima', 'fatimah', 'fatma', 'fatemeh'] },
  { canonical: 'aisha', variants: ['aisha', 'ayesha', 'aicha', 'ayisha'] },
  { canonical: 'khadija', variants: ['khadija', 'khadijah', 'khadeeja'] },
  { canonical: 'zainab', variants: ['zainab', 'zaynab', 'zeinab'] },
  { canonical: 'al saeed', variants: ['al-saeed', 'el-saeed', 'al saeed', 'el saeed', 'saeed', 'said', 'sayed'] },
];

const CANONICAL_BY_VARIANT: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const f of ROMAN_FAMILIES) {
    for (const v of f.variants) m.set(v.toLowerCase(), f.canonical);
    m.set(f.canonical.toLowerCase(), f.canonical);
  }
  return m;
})();

const VARIANTS_BY_CANONICAL: Map<string, string[]> = (() => {
  const m = new Map<string, string[]>();
  for (const f of ROMAN_FAMILIES) m.set(f.canonical, f.variants);
  return m;
})();

// Strip common Arabic-name prefixes and particles.
const PARTICLES = new Set([
  'al', 'el', 'bin', 'ben', 'bint', 'abu', 'abo', 'umm', 'abd',
  'ibn', 'ibnu', 'ould', 'ould al',
]);

// Honorifics stripped before matching.
const HONORIFICS = new Set([
  'h.h.', 'hh', 'h.e.', 'he', 'sheikh', 'shaikh', 'sheikha', 'shaykh',
  'mr', 'mr.', 'mrs', 'mrs.', 'ms', 'ms.', 'dr', 'dr.', 'prof', 'prof.',
  'sir', 'dame', 'rt.', 'hon', 'hon.', 'sayed', 'sayyid',
]);

function deaccent(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function normaliseArabicRoman(input: string): string {
  if (!input) return '';
  let s = deaccent(input).toLowerCase();
  s = s.replace(/[’'`´]/g, '').replace(/[^a-z\s-]/g, ' ').replace(/-/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  const tokens = s.split(' ').filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (HONORIFICS.has(t)) continue;
    if (PARTICLES.has(t)) continue;
    // Collapse two-token compounds like "abdul rahman" before canonicalising.
    if (t === 'abdul' && tokens[i + 1]) {
      const pair = `abdul ${tokens[i + 1]!.toLowerCase()}`;
      if (CANONICAL_BY_VARIANT.has(pair)) {
        out.push(CANONICAL_BY_VARIANT.get(pair)!);
        i++;
        continue;
      }
    }
    out.push(CANONICAL_BY_VARIANT.get(t) ?? t);
  }
  return out.join(' ').trim();
}

export function variantsOf(canonical: string): string[] {
  return VARIANTS_BY_CANONICAL.get(canonical.toLowerCase()) ?? [canonical];
}

export interface RomanisedName {
  raw: string;
  normalised: string;
  tokens: string[];
  particlesStripped: string[];
}

export function romanise(input: string): RomanisedName {
  const raw = input;
  const particlesStripped: string[] = [];
  const tokens = deaccent(input)
    .toLowerCase()
    .replace(/[’'`´]/g, '')
    .replace(/[^a-z\s-]/g, ' ')
    .replace(/-/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((t) => {
      if (HONORIFICS.has(t) || PARTICLES.has(t)) {
        particlesStripped.push(t);
        return false;
      }
      return true;
    });
  const normalised = tokens
    .map((t) => CANONICAL_BY_VARIANT.get(t) ?? t)
    .join(' ');
  return { raw, normalised, tokens, particlesStripped };
}
