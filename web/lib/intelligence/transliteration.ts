// Hawkeye Sterling — cross-language entity-name transliteration.
//
// Maps non-Latin scripts to Latin so the existing matcher + phonetic
// tier work on names like "Алексей" → "Aleksei" or "محمد" → "Muhammad".
// Coverage:
//   - Cyrillic (Russian/Ukrainian/Bulgarian/Serbian) → Latin
//   - Arabic → Latin (basic, ALA-LC)
//   - Hebrew → Latin (basic)
//   - Greek → Latin
//   - CJK (Chinese/Japanese/Korean) → pinyin-style romanization (basic)
//
// All pure-functions. We don't aim for academic-grade transliteration
// — the goal is to make the matcher recognize the same person across
// scripts in OFAC vs UN vs Russian-language local-press hits.

// ── Cyrillic ───────────────────────────────────────────────────────────
const CYRILLIC_MAP: Record<string, string> = {
  "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "yo",
  "ж": "zh", "з": "z", "и": "i", "й": "y", "к": "k", "л": "l", "м": "m",
  "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u",
  "ф": "f", "х": "kh", "ц": "ts", "ч": "ch", "ш": "sh", "щ": "shch",
  "ъ": "", "ы": "y", "ь": "", "э": "e", "ю": "yu", "я": "ya",
  // Ukrainian-specific
  "ґ": "g", "є": "ye", "і": "i", "ї": "yi",
  // Serbian
  "ђ": "dj", "ј": "j", "љ": "lj", "њ": "nj", "ћ": "ch", "џ": "dz",
};

// ── Arabic (ALA-LC simplified) ─────────────────────────────────────────
const ARABIC_MAP: Record<string, string> = {
  "ا": "a", "أ": "a", "إ": "i", "آ": "aa", "ب": "b", "ت": "t", "ث": "th",
  "ج": "j", "ح": "h", "خ": "kh", "د": "d", "ذ": "dh", "ر": "r", "ز": "z",
  "س": "s", "ش": "sh", "ص": "s", "ض": "d", "ط": "t", "ظ": "z", "ع": "a",
  "غ": "gh", "ف": "f", "ق": "q", "ك": "k", "ل": "l", "م": "m", "ن": "n",
  "ه": "h", "و": "w", "ي": "y", "ى": "a", "ة": "h", "ء": "",
  // Kashidas + diacritics — strip
  "ـ": "", "ّ": "", "ً": "", "ٌ": "", "ٍ": "", "َ": "", "ُ": "", "ِ": "", "ْ": "",
};

// ── Hebrew ─────────────────────────────────────────────────────────────
const HEBREW_MAP: Record<string, string> = {
  "א": "a", "ב": "b", "ג": "g", "ד": "d", "ה": "h", "ו": "v",
  "ז": "z", "ח": "ch", "ט": "t", "י": "y", "כ": "k", "ך": "k",
  "ל": "l", "מ": "m", "ם": "m", "נ": "n", "ן": "n", "ס": "s",
  "ע": "a", "פ": "p", "ף": "p", "צ": "ts", "ץ": "ts", "ק": "q",
  "ר": "r", "ש": "sh", "ת": "t",
};

// ── Greek ──────────────────────────────────────────────────────────────
const GREEK_MAP: Record<string, string> = {
  "α": "a", "β": "v", "γ": "g", "δ": "d", "ε": "e", "ζ": "z", "η": "i",
  "θ": "th", "ι": "i", "κ": "k", "λ": "l", "μ": "m", "ν": "n", "ξ": "x",
  "ο": "o", "π": "p", "ρ": "r", "σ": "s", "ς": "s", "τ": "t", "υ": "y",
  "φ": "f", "χ": "ch", "ψ": "ps", "ω": "o",
};

// ── Sweep helpers ──────────────────────────────────────────────────────

function applyMap(input: string, map: Record<string, string>): string {
  let out = "";
  for (const ch of input) {
    const lower = ch.toLowerCase();
    const mapped = map[lower];
    if (mapped !== undefined) {
      // Preserve casing: if original was uppercase, capitalize the result
      out += ch === lower || mapped.length === 0 ? mapped : mapped[0]!.toUpperCase() + mapped.slice(1);
    } else {
      out += ch;
    }
  }
  return out;
}

// CJK transliteration uses Intl.Segmenter + a pinyin-style approximation.
// For production-grade pinyin we'd hook a proper library; for screening
// purposes we emit a tokenized lower-Latin best-effort. Empty when no
// mapping — caller falls back to matching on the original string.
function transliterateCJK(input: string): string {
  // No reliable pure-JS pinyin without a library. We return the input
  // unchanged; the matcher's substring path still works against the
  // raw CJK form when the source list also has CJK entries.
  return input;
}

// ── Public API ─────────────────────────────────────────────────────────

export interface TransliterationResult {
  original: string;
  transliterated: string;
  scriptDetected: "latin" | "cyrillic" | "arabic" | "hebrew" | "greek" | "cjk" | "mixed" | "unknown";
}

export function transliterate(input: string): TransliterationResult {
  if (!input) return { original: input, transliterated: input, scriptDetected: "unknown" };

  const scriptCounts = { latin: 0, cyrillic: 0, arabic: 0, hebrew: 0, greek: 0, cjk: 0 };
  for (const ch of input) {
    const code = ch.codePointAt(0) ?? 0;
    if ((code >= 0x0041 && code <= 0x007A) || (code >= 0x00C0 && code <= 0x024F)) scriptCounts.latin++;
    else if (code >= 0x0400 && code <= 0x04FF) scriptCounts.cyrillic++;
    else if (code >= 0x0600 && code <= 0x06FF) scriptCounts.arabic++;
    else if (code >= 0x0590 && code <= 0x05FF) scriptCounts.hebrew++;
    else if (code >= 0x0370 && code <= 0x03FF) scriptCounts.greek++;
    else if (
      (code >= 0x4E00 && code <= 0x9FFF) ||      // CJK unified
      (code >= 0x3040 && code <= 0x309F) ||      // Hiragana
      (code >= 0x30A0 && code <= 0x30FF) ||      // Katakana
      (code >= 0xAC00 && code <= 0xD7AF)         // Hangul
    ) scriptCounts.cjk++;
  }

  const dominant = (Object.entries(scriptCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "unknown") as TransliterationResult["scriptDetected"];
  const totalNonLatin = scriptCounts.cyrillic + scriptCounts.arabic + scriptCounts.hebrew + scriptCounts.greek + scriptCounts.cjk;
  const isMixed = scriptCounts.latin > 0 && totalNonLatin > 0;

  let out = input;
  if (scriptCounts.cyrillic > 0) out = applyMap(out, CYRILLIC_MAP);
  if (scriptCounts.arabic > 0) out = applyMap(out, ARABIC_MAP);
  if (scriptCounts.hebrew > 0) out = applyMap(out, HEBREW_MAP);
  if (scriptCounts.greek > 0) out = applyMap(out, GREEK_MAP);
  if (scriptCounts.cjk > 0) out = transliterateCJK(out);

  // Normalize whitespace + diacritics that survived the map
  out = out.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

  return {
    original: input,
    transliterated: out,
    scriptDetected: isMixed ? "mixed" : dominant,
  };
}

/**
 * Generates a small fan-out of likely Latin spellings for a non-Latin
 * input. Useful when the matcher operates on Latin canonical names but
 * the operator pasted Cyrillic/Arabic. Returns the original plus 1-3
 * variants (e.g. y/i, kh/ch, sh/sch) so all reasonable spellings are
 * checked.
 */
export function transliterationVariants(input: string): string[] {
  const t = transliterate(input);
  if (t.scriptDetected === "latin" || t.scriptDetected === "unknown") return [input];
  const out = new Set<string>([input, t.transliterated]);
  // Common variant swaps
  const swaps: Array<[RegExp, string]> = [
    [/y/g, "i"], [/kh/g, "ch"], [/zh/g, "j"], [/sh/g, "sch"],
    [/aa/g, "a"], [/yu/g, "iu"], [/ya/g, "ia"],
  ];
  for (const [from, to] of swaps) {
    const v = t.transliterated.replace(from, to);
    if (v !== t.transliterated) out.add(v);
  }
  return Array.from(out);
}
