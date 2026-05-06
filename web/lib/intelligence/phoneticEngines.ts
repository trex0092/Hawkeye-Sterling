// Hawkeye Sterling — phonetic name engines (Layer #29).
//
// Compact regional phonetic encoders that complement the existing
// double-metaphone + soundex in src/brain/matching.ts. Each encoder
// returns a string token; equality on tokens implies plausible
// pronunciation match in the source language.

// ── Caverphone 2.0 (Lyon, 2004) — best for English regional / Maori ────
export function caverphone(input: string): string {
  if (!input) return "";
  let s = input.toLowerCase().replace(/[^a-z]/g, "");
  s = s.replace(/^cough/, "cou2f").replace(/^rough/, "rou2f").replace(/^tough/, "tou2f")
       .replace(/^enough/, "enou2f").replace(/^trough/, "trou2f").replace(/^gn/, "2n").replace(/mb$/, "m2");
  s = s.replace(/cq/g, "2q").replace(/ci/g, "si").replace(/ce/g, "se").replace(/cy/g, "sy")
       .replace(/tch/g, "2ch").replace(/c/g, "k").replace(/q/g, "k").replace(/x/g, "k").replace(/v/g, "f")
       .replace(/dg/g, "2g").replace(/tio/g, "sio").replace(/tia/g, "sia").replace(/d/g, "t")
       .replace(/ph/g, "fh").replace(/b/g, "p").replace(/sh/g, "s2").replace(/z/g, "s")
       .replace(/^[aeiou]/, "A").replace(/[aeiou]/g, "3");
  s = s.replace(/j/g, "y").replace(/^y3/, "Y3").replace(/^y/, "A").replace(/y/g, "3")
       .replace(/3gh3/g, "3kh3").replace(/gh/g, "22").replace(/g/g, "k")
       .replace(/s+/g, "S").replace(/t+/g, "T").replace(/p+/g, "P").replace(/k+/g, "K")
       .replace(/f+/g, "F").replace(/m+/g, "M").replace(/n+/g, "N")
       .replace(/w3/g, "W3").replace(/wh3/g, "Wh3").replace(/w$/, "3").replace(/w/g, "2")
       .replace(/^h/, "A").replace(/h/g, "2").replace(/r3/g, "R3").replace(/r$/, "3").replace(/r/g, "2")
       .replace(/l3/g, "L3").replace(/l$/, "3").replace(/l/g, "2")
       .replace(/2/g, "").replace(/3$/, "A").replace(/3/g, "");
  return (s + "1111111111").slice(0, 10);
}

// ── Beider-Morse simplified (mostly accurate for Slavic/Yiddish/Germanic) ─
// We ship a SIMPLIFIED tokeniser — full Beider-Morse is ~5MB of rules. The
// simplified version still catches the common transliteration variants
// (Schmidt/Smit, Levin/Levine, Maduro/Madura).
export function beiderMorseLite(input: string): string {
  if (!input) return "";
  const s = input.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/[^a-z]/g, "");
  return s
    .replace(/^sch/, "S")        // Schmidt → Smit
    .replace(/^sh/, "S")
    .replace(/^cz/, "C")
    .replace(/^ts/, "C")
    .replace(/dz/g, "C")
    .replace(/ph/g, "F")
    .replace(/v/g, "F")           // V/F merge for Slavic transliteration
    .replace(/w/g, "F")           // German Witt → Vit
    .replace(/[bp]/g, "P")
    .replace(/[dt]/g, "T")
    .replace(/[gk]/g, "K")
    .replace(/c(?=[ie])/g, "S")
    .replace(/c/g, "K")
    .replace(/ks/g, "K")
    .replace(/x/g, "K")
    .replace(/qu/g, "K")
    .replace(/q/g, "K")
    .replace(/[zs]/g, "S")
    .replace(/[mn]/g, "N")
    .replace(/[lr]/g, "R")
    .replace(/h/g, "")
    .replace(/y/g, "I")
    .replace(/[aeiou]+/g, "A")
    .replace(/(.)\1+/g, "$1");    // collapse repeats
}

// ── Arabic phonetic — collapses common transliteration variants ────────
// Maps the variants of Arabic personal names (Mohamed/Mohammed/Muhammad/
// Mohammad → MHMD; Khaled/Khalid → KHLD; Yousef/Yusuf → YSF).
export function arabicPhonetic(input: string): string {
  if (!input) return "";
  let s = input.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/[^a-z]/g, "");
  s = s
    .replace(/^al-/, "")
    .replace(/^el-/, "")
    .replace(/^al/, "")
    .replace(/^el/, "")
    .replace(/ph/g, "f")
    .replace(/ck/g, "k")
    .replace(/[bp]/g, "B")
    .replace(/[fv]/g, "F")
    .replace(/[gj]/g, "J")        // Gamal/Jamal merge
    .replace(/q/g, "K")
    .replace(/[ck]/g, "K")
    .replace(/x/g, "KS")
    .replace(/[dt]/g, "T")
    .replace(/[zs]/g, "S")
    .replace(/sh/g, "S")
    .replace(/[mn]/g, "N")
    .replace(/[lr]/g, "L")        // L/R merge: Maduro/Maduwo
    .replace(/y/g, "I")
    .replace(/[aeiou]+/g, "")     // Arabic phonetic ignores short vowels
    .replace(/(.)\1+/g, "$1");    // collapse doubles
  return s;
}

// ── Pinyin canonicalisation — for Chinese personal/company names ───────
// Strips tone marks, collapses common variants (Wang/Wong/Huang/Hwang).
export function pinyinCanonical(input: string): string {
  if (!input) return "";
  let s = input.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/[^a-z]/g, "");
  s = s
    .replace(/^hwang/, "wang")
    .replace(/^wong/, "wang")
    .replace(/^lee/, "li")
    .replace(/^chang/, "zhang")
    .replace(/^chiang/, "jiang")
    .replace(/^chen$/, "chen")
    .replace(/^chow/, "zhou")
    .replace(/^cheung/, "zhang")
    .replace(/^kwan/, "guan")
    .replace(/^kwok/, "guo")
    .replace(/^lau/, "liu");
  // Collapse aspirate/non-aspirate pairs (b/p, d/t, g/k) in pinyin.
  return s
    .replace(/[bp]/g, "B")
    .replace(/[dt]/g, "T")
    .replace(/[gk]/g, "K")
    .replace(/[zs]/g, "S")
    .replace(/(.)\1+/g, "$1");
}

/** Multi-engine fingerprint: returns all phonetic tokens at once. */
export function multiPhonetic(input: string): {
  caverphone: string;
  beiderMorseLite: string;
  arabicPhonetic: string;
  pinyinCanonical: string;
} {
  return {
    caverphone: caverphone(input),
    beiderMorseLite: beiderMorseLite(input),
    arabicPhonetic: arabicPhonetic(input),
    pinyinCanonical: pinyinCanonical(input),
  };
}

/** True when ANY phonetic engine produces a match across the two strings. */
export function anyPhoneticMatch(a: string, b: string): boolean {
  const A = multiPhonetic(a);
  const B = multiPhonetic(b);
  return (
    (A.caverphone && A.caverphone === B.caverphone) ||
    (A.beiderMorseLite && A.beiderMorseLite === B.beiderMorseLite) ||
    (A.arabicPhonetic && A.arabicPhonetic === B.arabicPhonetic) ||
    (A.pinyinCanonical && A.pinyinCanonical === B.pinyinCanonical)
  ) as boolean;
}
