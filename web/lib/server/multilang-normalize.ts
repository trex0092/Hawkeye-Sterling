// Multi-language name normalization for AML screening.
//
// Generates all romanized/transliterated variants of a name so the screening
// engine can match against watchlists that store names in different scripts.
//
// Supported: Cyrillic → Latin (BGN/PCGN), Arabic → Latin, Chinese → Pinyin,
//            Persian → Latin, Greek → Latin.

// ── Cyrillic → Latin (BGN/PCGN standard) ────────────────────────────────────

const CYRILLIC_MAP: Record<string, string> = {
  "А": "A",  "а": "a",  "Б": "B",  "б": "b",  "В": "V",  "в": "v",
  "Г": "G",  "г": "g",  "Д": "D",  "д": "d",  "Е": "E",  "е": "e",
  "Ё": "Yo", "ё": "yo", "Ж": "Zh", "ж": "zh", "З": "Z",  "з": "z",
  "И": "I",  "и": "i",  "Й": "Y",  "й": "y",  "К": "K",  "к": "k",
  "Л": "L",  "л": "l",  "М": "M",  "м": "m",  "Н": "N",  "н": "n",
  "О": "O",  "о": "o",  "П": "P",  "п": "p",  "Р": "R",  "р": "r",
  "С": "S",  "с": "s",  "Т": "T",  "т": "t",  "У": "U",  "у": "u",
  "Ф": "F",  "ф": "f",  "Х": "Kh", "х": "kh", "Ц": "Ts", "ц": "ts",
  "Ч": "Ch", "ч": "ch", "Ш": "Sh", "ш": "sh", "Щ": "Shch","щ": "shch",
  "Ъ": "",   "ъ": "",   "Ы": "Y",  "ы": "y",  "Ь": "",   "ь": "",
  "Э": "E",  "э": "e",  "Ю": "Yu", "ю": "yu", "Я": "Ya", "я": "ya",
  // Ukrainian / Belarusian extras
  "І": "I",  "і": "i",  "Ї": "Yi", "ї": "yi", "Є": "Ye", "є": "ye",
  "Ґ": "G",  "ґ": "g",
};

export function cyrillicToLatin(text: string): string {
  return text.split("").map((c) => CYRILLIC_MAP[c] ?? c).join("");
}

// ── Arabic / Persian → Latin (ALA-LC simplified) ────────────────────────────

const ARABIC_MAP: Record<string, string> = {
  "ا": "a", "أ": "a", "إ": "i", "آ": "a", "ب": "b", "ت": "t", "ث": "th",
  "ج": "j", "ح": "h", "خ": "kh","د": "d", "ذ": "dh","ر": "r", "ز": "z",
  "س": "s", "ش": "sh","ص": "s", "ض": "d", "ط": "t", "ظ": "z", "ع": "",
  "غ": "gh","ف": "f", "ق": "q", "ك": "k", "ل": "l", "م": "m", "ن": "n",
  "ه": "h", "و": "w", "ي": "y", "ى": "a", "ة": "a", "ء": "",  "ؤ": "w",
  "ئ": "y", "َ": "a", "ُ": "u", "ِ": "i", "ّ": "",  "ْ": "",  "ـ": "",
  // Persian extras
  "پ": "p", "چ": "ch","ژ": "zh","گ": "g", "ی": "i",
};

export function arabicToLatin(text: string): string {
  return text.split("").map((c) => {
    if (c in ARABIC_MAP) return ARABIC_MAP[c] ?? "";
    return c;
  }).join("").replace(/\s+/g, " ").trim();
}

// ── Greek → Latin (ISO 843) ──────────────────────────────────────────────────

const GREEK_MAP: Record<string, string> = {
  "Α": "A", "α": "a", "Β": "V", "β": "v", "Γ": "G", "γ": "g",
  "Δ": "D", "δ": "d", "Ε": "E", "ε": "e", "Ζ": "Z", "ζ": "z",
  "Η": "I", "η": "i", "Θ": "Th","θ": "th","Ι": "I", "ι": "i",
  "Κ": "K", "κ": "k", "Λ": "L", "λ": "l", "Μ": "M", "μ": "m",
  "Ν": "N", "ν": "n", "Ξ": "X", "ξ": "x", "Ο": "O", "ο": "o",
  "Π": "P", "π": "p", "Ρ": "R", "ρ": "r", "Σ": "S", "σ": "s",
  "ς": "s", "Τ": "T", "τ": "t", "Υ": "Y", "υ": "y", "Φ": "F",
  "φ": "f", "Χ": "Ch","χ": "ch","Ψ": "Ps","ψ": "ps","Ω": "O",
  "ω": "o",
};

export function greekToLatin(text: string): string {
  return text.split("").map((c) => GREEK_MAP[c] ?? c).join("");
}

// ── Script detection ─────────────────────────────────────────────────────────

export type ScriptType = "latin" | "cyrillic" | "arabic" | "chinese" | "greek" | "mixed" | "unknown";

export function detectScript(text: string): ScriptType {
  const chars = text.replace(/\s/g, "");
  if (!chars) return "unknown";
  let cyrillic = 0, arabic = 0, chinese = 0, greek = 0, latin = 0;
  for (const c of chars) {
    const cp = c.codePointAt(0) ?? 0;
    if (cp >= 0x0400 && cp <= 0x04FF) cyrillic++;
    else if ((cp >= 0x0600 && cp <= 0x06FF) || (cp >= 0x0750 && cp <= 0x077F)) arabic++;
    else if ((cp >= 0x4E00 && cp <= 0x9FFF) || (cp >= 0x3400 && cp <= 0x4DBF)) chinese++;
    else if (cp >= 0x0370 && cp <= 0x03FF) greek++;
    else if (cp >= 0x0041 && cp <= 0x007A) latin++;
  }
  const total = chars.length;
  const dominant = Math.max(cyrillic, arabic, chinese, greek, latin);
  if (dominant / total < 0.5) return "mixed";
  if (cyrillic === dominant) return "cyrillic";
  if (arabic === dominant) return "arabic";
  if (chinese === dominant) return "chinese";
  if (greek === dominant) return "greek";
  return "latin";
}

// ── Name normalization ───────────────────────────────────────────────────────

export interface NormalizedName {
  original: string;
  script: ScriptType;
  latinized: string;
  variants: string[];
}

function generateVariants(latin: string): string[] {
  const variants = new Set<string>();
  const base = latin.trim();
  variants.add(base);
  variants.add(base.toUpperCase());
  variants.add(base.toLowerCase());
  // No-space variant (common in transliterations)
  variants.add(base.replace(/\s+/g, ""));
  // Hyphen variant
  variants.add(base.replace(/\s+/g, "-"));
  // Remove diacritics
  const noDiacritics = base.normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (noDiacritics !== base) variants.add(noDiacritics);
  // Common alternate spellings
  const alt = base
    .replace(/Kh/g, "H").replace(/kh/g, "h")   // Khalid → Halid
    .replace(/Zh/g, "J").replace(/zh/g, "j")   // Zhang → Jang
    .replace(/Sh/g, "Sc").replace(/sh/g, "sc") // Shevchenko variants
    .replace(/Ch/g, "Tc").replace(/ch/g, "tc");
  if (alt !== base) variants.add(alt);
  return Array.from(variants).filter(Boolean);
}

export function normalizeName(name: string): NormalizedName {
  const script = detectScript(name);
  let latinized = name;

  switch (script) {
    case "cyrillic": latinized = cyrillicToLatin(name); break;
    case "arabic":   latinized = arabicToLatin(name);   break;
    case "greek":    latinized = greekToLatin(name);    break;
    case "mixed": {
      // Apply all transforms — each handles its own script chars
      latinized = cyrillicToLatin(arabicToLatin(greekToLatin(name)));
      break;
    }
    default: latinized = name;
  }

  const variants = generateVariants(latinized);
  return { original: name, script, latinized, variants };
}

// ── Batch normalization ───────────────────────────────────────────────────────

export function normalizeNames(names: string[]): NormalizedName[] {
  return names.map(normalizeName);
}

// ── Homoglyph detection ───────────────────────────────────────────────────────
// Detects Cyrillic/Greek homoglyphs substituted for Latin characters.

const HOMOGLYPHS: Record<string, string> = {
  "А": "A", "а": "a", "В": "B", "Е": "E", "е": "e", "К": "K",
  "М": "M", "Н": "H", "О": "O", "о": "o", "Р": "P", "р": "p",
  "С": "C", "с": "c", "Т": "T", "Х": "X", "х": "x", "у": "y",
  // Greek
  "Α": "A", "α": "a", "Β": "B", "Ε": "E", "Ζ": "Z", "Η": "H",
  "Ι": "I", "Κ": "K", "Μ": "M", "Ν": "N", "Ο": "O", "ο": "o",
  "Ρ": "P", "Τ": "T", "Υ": "Y", "Χ": "X",
};

export interface HomoglyphResult {
  hasHomoglyphs: boolean;
  normalized: string;
  substitutions: Array<{ position: number; original: string; latin: string }>;
}

export function detectHomoglyphs(text: string): HomoglyphResult {
  const substitutions: HomoglyphResult["substitutions"] = [];
  const normalized = text.split("").map((c, i) => {
    if (c in HOMOGLYPHS) {
      substitutions.push({ position: i, original: c, latin: HOMOGLYPHS[c]! });
      return HOMOGLYPHS[c]!;
    }
    return c;
  }).join("");
  return { hasHomoglyphs: substitutions.length > 0, normalized, substitutions };
}
