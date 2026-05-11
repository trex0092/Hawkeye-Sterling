// Item 15 — Arabic / multi-script name matching (Control 4.03 / 13.01)
//
// Provides:
//   transliterateArabic()  — Arabic Unicode → Latin (ALA-LC–inspired)
//   transliterateCyrillic() — Cyrillic → Latin (ISO 9 / BGN)
//   transliterateChinese()  — basic Pinyin-strip for CJK
//   normaliseNameScript()   — detect script and dispatch to correct handler
//   nameVariants()          — produce search-variant set for a subject name
//   arabicNameKey()         — canonical phonetic key for deduplication
//
// No external dependencies — runs at the Netlify edge and in CI.

// ── Arabic → Latin (ALA-LC simplified) ───────────────────────────────────────

const AR_TABLE: [RegExp, string][] = [
  // Definite article normalisation — strip before processing individual chars
  [/\bال(?=[^\s])/gu, "al-"],
  [/\bالـ/gu, "al-"],

  // Hamza / Alif variants → a
  [/[أإآٱ]/gu, "a"],
  [/ء/gu, "'"],

  // Letters
  [/ب/gu, "b"],
  [/ت/gu, "t"],
  [/ث/gu, "th"],
  [/ج/gu, "j"],
  [/ح/gu, "h"],
  [/خ/gu, "kh"],
  [/د/gu, "d"],
  [/ذ/gu, "dh"],
  [/ر/gu, "r"],
  [/ز/gu, "z"],
  [/س/gu, "s"],
  [/ش/gu, "sh"],
  [/ص/gu, "s"],
  [/ض/gu, "d"],
  [/ط/gu, "t"],
  [/ظ/gu, "z"],
  [/ع/gu, "'"],
  [/غ/gu, "gh"],
  [/ف/gu, "f"],
  [/ق/gu, "q"],
  [/ك/gu, "k"],
  [/ل/gu, "l"],
  [/م/gu, "m"],
  [/ن/gu, "n"],
  [/ه/gu, "h"],
  [/و/gu, "w"],
  [/ي|ى/gu, "y"],

  // Taa marbuta
  [/ة/gu, "a"],

  // Diacritics (tashkeel) — strip them
  [/[ً-ٰٟ]/gu, ""],

  // Tatweel
  [/ـ/gu, ""],
];

export function transliterateArabic(input: string): string {
  let s = input;
  for (const [rx, rep] of AR_TABLE) s = s.replace(rx, rep);
  return s.toLowerCase().replace(/[^a-z0-9\s'-]/g, "").replace(/\s+/g, " ").trim();
}

// ── Cyrillic → Latin (BGN/PCGN) ──────────────────────────────────────────────

const CYR_TABLE: Record<string, string> = {
  А: "A", Б: "B", В: "V", Г: "G", Д: "D", Е: "Ye", Ё: "Yo", Ж: "Zh",
  З: "Z", И: "I", Й: "Y", К: "K", Л: "L", М: "M", Н: "N", О: "O",
  П: "P", Р: "R", С: "S", Т: "T", У: "U", Ф: "F", Х: "Kh", Ц: "Ts",
  Ч: "Ch", Ш: "Sh", Щ: "Shch", Ъ: "", Ы: "Y", Ь: "", Э: "E", Ю: "Yu",
  Я: "Ya",
};
const CYR_TABLE_LOWER = Object.fromEntries(
  Object.entries(CYR_TABLE).map(([k, v]) => [k.toLowerCase(), v.toLowerCase()])
);

export function transliterateCyrillic(input: string): string {
  return input
    .split("")
    .map((c) => CYR_TABLE[c] ?? CYR_TABLE_LOWER[c] ?? c)
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

// ── CJK → stripped (retain Pinyin when already latin, strip ideographs) ───────

export function transliterateChinese(input: string): string {
  return input
    .replace(/[一-鿿㐀-䶿]/gu, " ") // CJK unified ideographs
    .replace(/\s+/g, " ")
    .trim();
}

// ── Persian / Farsi (common characters beyond standard Arabic) ────────────────

const FA_EXTRAS: [RegExp, string][] = [
  [/پ/gu, "p"],
  [/چ/gu, "ch"],
  [/ژ/gu, "zh"],
  [/گ/gu, "g"],
];

export function transliteratePersian(input: string): string {
  let s = input;
  for (const [rx, rep] of FA_EXTRAS) s = s.replace(rx, rep);
  return transliterateArabic(s);
}

// ── Script detection ──────────────────────────────────────────────────────────

export type Script = "arabic" | "cyrillic" | "chinese" | "persian" | "latin" | "mixed";

export function detectScript(input: string): Script {
  const arabicCount = (input.match(/[؀-ۿ]/g) ?? []).length;
  const cyrillicCount = (input.match(/[Ѐ-ӿ]/g) ?? []).length;
  const cjkCount = (input.match(/[一-鿿]/g) ?? []).length;
  const persianExtra = (input.match(/[پچژگ]/g) ?? []).length;
  const total = arabicCount + cyrillicCount + cjkCount;
  if (total === 0) return "latin";
  if (cyrillicCount > arabicCount && cyrillicCount > cjkCount) return "cyrillic";
  if (cjkCount > arabicCount && cjkCount > cyrillicCount) return "chinese";
  if (arabicCount > 0) return persianExtra > 0 ? "persian" : "arabic";
  return "mixed";
}

// ── Unified normalise ─────────────────────────────────────────────────────────

export function normaliseNameScript(input: string): string {
  const script = detectScript(input);
  switch (script) {
    case "arabic":  return transliterateArabic(input);
    case "persian": return transliteratePersian(input);
    case "cyrillic": return transliterateCyrillic(input);
    case "chinese": return transliterateChinese(input);
    default:        return input.toLowerCase().replace(/\s+/g, " ").trim();
  }
}

// ── Name prefix / particle table (AML-relevant name parsing) ─────────────────

const ARABIC_PREFIXES = [
  "al", "el", "al-", "el-",
  "bin", "bint", "ibn", "abu", "um", "umm",
  "abd", "abdel", "abdal",
  "bou", "bel", "ben",
];

const LATIN_PARTICLES = [
  "van", "van der", "van den", "van de",
  "de", "del", "della", "di", "da",
  "von", "zu", "af", "av",
  "mac", "mc", "o'", "o",
  "le", "la", "les",
];

export function stripNameParticles(name: string): string {
  const lower = name.toLowerCase();
  for (const p of [...ARABIC_PREFIXES, ...LATIN_PARTICLES]) {
    if (lower.startsWith(p + " ") || lower.startsWith(p + "-")) {
      return name.slice(p.length).replace(/^[\s-]+/, "").trim();
    }
  }
  return name.trim();
}

// ── Canonical key for deduplication ──────────────────────────────────────────
// Produces a normalised, phonetic-key-style token that is invariant to:
//   • script (arabic/latin)
//   • diacritics
//   • common prefix/particle variants
//   • double letters (common in phonetic near-misses)

export function arabicNameKey(name: string): string {
  const transliterated = normaliseNameScript(name);
  return transliterated
    .replace(/[^a-z]/g, "")          // keep only lowercase latin
    .replace(/([a-z])\1+/g, "$1")    // collapse double letters
    .replace(/^(al|el|bin|ibn|abu|abd)/, "") // strip leading prefixes in key
    || transliterated.replace(/[^a-z]/g, "");
}

// ── Name variant generator ────────────────────────────────────────────────────
// Returns a Set of search-ready variants for a subject name, useful for
// building a candidate set before fuzzy scoring.

export function nameVariants(rawName: string): Set<string> {
  const variants = new Set<string>();
  const add = (s: string) => { if (s.trim().length > 1) variants.add(s.trim().toLowerCase()); };

  // Original
  add(rawName);

  // Without diacritics (Latin)
  const noAccents = rawName.normalize("NFD").replace(/[̀-ͯ]/g, "");
  add(noAccents);

  // Script transliteration
  const transliterated = normaliseNameScript(rawName);
  add(transliterated);

  // Without leading particles
  add(stripNameParticles(rawName));
  add(stripNameParticles(transliterated));

  // Reversed tokens (family name first vs given name first)
  const tokens = transliterated.split(/\s+/);
  if (tokens.length >= 2) {
    add(tokens.slice().reverse().join(" "));
    // First + last only (drop middle)
    add([tokens[0], tokens[tokens.length - 1]].join(" "));
  }

  // Canonical key
  add(arabicNameKey(rawName));

  // Alternative al- prefixes: "Mohammed Al-Rashid" ↔ "Mohammed Alrashid"
  const alNorm = transliterated.replace(/\bal-/g, "al").replace(/\bal /g, "al");
  add(alNorm);
  const alSplit = transliterated.replace(/\bal(?!-)(\S)/g, "al-$1");
  add(alSplit);

  return variants;
}

// ── Similarity score (0-1) ───────────────────────────────────────────────────
// Lightweight Levenshtein-based similarity, script-normalised.
// For production use you'd combine this with Beider-Morse phonetics.

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const dp: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

export function nameScriptSimilarity(nameA: string, nameB: string): number {
  const a = arabicNameKey(nameA);
  const b = arabicNameKey(nameB);
  if (!a || !b) return 0;
  const dist = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  return maxLen === 0 ? 1 : Math.max(0, 1 - dist / maxLen);
}

// ── Common alias expansions for sanctions screening ──────────────────────────
// Covers common misspellings / transliteration variants used in sanctions lists.

export const COMMON_ALIAS_EXPANSIONS: Record<string, string[]> = {
  mohammad: ["mohammed", "muhammed", "mohamed", "mohamad", "muhamad"],
  mohammed: ["mohammad", "muhammed", "mohamed"],
  ali: ["aly", "alee"],
  hussein: ["husain", "husayn", "hossein"],
  hassan: ["hasan", "hasson"],
  ibrahim: ["ebrahim", "abraham"],
  abdulrahman: ["abd al-rahman", "abd alrahman", "abdulrahman"],
  abdallah: ["abdullah", "abd allah", "abd al-lah"],
  vladimir: ["vladymir", "wladimir"],
  yevgeny: ["evgeny", "evgenii", "yevgeniy"],
};

export function expandAliases(name: string): string[] {
  const key = name.toLowerCase().replace(/\s+/g, "");
  return COMMON_ALIAS_EXPANSIONS[key] ?? [];
}
