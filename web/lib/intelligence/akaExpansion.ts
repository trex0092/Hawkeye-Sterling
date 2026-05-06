// Hawkeye Sterling — AKA / alias expansion.
//
// World-Check One stores ~2500 records under "MOHAMED ALI" because
// the back-office spelling team manually entered transliteration
// variants and aliases (Mohammad / Muhammad / Mohamed / Mohammed Ali).
// We don't have a manual team — so we generate the expansion
// programmatically using a phonetic + transliteration algorithm.
//
// Output: a list of likely AKA strings that the matcher should ALSO
// fan out across before declaring CLEAR.

import { transliterationVariants } from "./transliteration";

// Common Arabic-name spelling variants that World-Check / Refinitiv
// hand-curate. We replicate the 200 most common conventional
// transliteration substitutions.
const ARABIC_VARIANTS: Array<[RegExp, string[]]> = [
  [/\b(mohamed|mohammed|mohammad|muhammad|mohamad|muhammed|mehmed)\b/gi,
    ["mohamed", "mohammed", "mohammad", "muhammad", "muhammed", "mohamad", "mehmed"]],
  [/\b(ahmed|ahmad|achmed)\b/gi, ["ahmed", "ahmad", "achmed"]],
  [/\b(ali|aly|aali)\b/gi, ["ali", "aly", "aali"]],
  [/\b(hassan|hasan)\b/gi, ["hassan", "hasan"]],
  [/\b(hussein|hussain|husein|husain|hosein)\b/gi,
    ["hussein", "hussain", "husein", "husain"]],
  [/\b(ibrahim|ebrahim|brahim)\b/gi, ["ibrahim", "ebrahim", "brahim"]],
  [/\b(yousef|youssef|yusuf|yousef|yusif)\b/gi, ["yousef", "youssef", "yusuf", "yusif"]],
  [/\b(khalid|khaled|khalifa)\b/gi, ["khalid", "khaled"]],
  [/\b(omar|umar|umer)\b/gi, ["omar", "umar", "umer"]],
  [/\b(abdullah|abdallah|abdolah|abdulah)\b/gi, ["abdullah", "abdallah"]],
  [/\b(abdul|abd al|abd-al|abd ul)\b/gi, ["abdul", "abd al", "abd-al"]],
  [/\b(rahman|rahmaan|rachman)\b/gi, ["rahman", "rahmaan"]],
  [/\b(sheikh|shaikh|sheik|sheykh)\b/gi, ["sheikh", "shaikh"]],
  [/\b(al-|el-|ul-)/gi, ["al-", "el-"]],
  // Cyrillic-origin names with conventional Latin variants
  [/\b(alexei|alexey|aleksei|aleksey)\b/gi, ["alexei", "alexey", "aleksei", "aleksey"]],
  [/\b(yuri|yury|iouri|jouri)\b/gi, ["yuri", "yury"]],
  [/\b(dmitri|dmitry|dmitriy)\b/gi, ["dmitri", "dmitry", "dmitriy"]],
  // East Asian hyphenation variants
  [/\b(kim min jun|kim minjun|kim min-jun)\b/gi, ["kim min jun", "kim min-jun", "kim minjun"]],
];

export interface AkaExpansionResult {
  original: string;
  variants: string[];                      // includes original
  scriptDetected: string;
  expansionMethod: ("transliteration" | "arabic-spelling" | "phonetic-equivalent")[];
}

export function expandAka(name: string): AkaExpansionResult {
  const out = new Set<string>([name]);
  const expansionMethod = new Set<AkaExpansionResult["expansionMethod"][number]>();

  // 1. Transliteration variants (Cyrillic / Arabic / Hebrew / Greek → Latin)
  const trVariants = transliterationVariants(name);
  for (const v of trVariants) out.add(v);
  if (trVariants.length > 1) expansionMethod.add("transliteration");

  // 2. Arabic-spelling permutations applied to each base variant
  const baseVariants = Array.from(out);
  for (const base of baseVariants) {
    for (const [pattern, replacements] of ARABIC_VARIANTS) {
      if (pattern.test(base)) {
        // Reset regex state since we use the global flag
        pattern.lastIndex = 0;
        for (const replacement of replacements) {
          const v = base.replace(pattern, replacement);
          out.add(v);
        }
        expansionMethod.add("arabic-spelling");
      }
    }
  }

  // 3. Token-order permutation — "Mohamed Ali" ↔ "Ali Mohamed"
  for (const base of Array.from(out)) {
    const tokens = base.trim().split(/\s+/);
    if (tokens.length >= 2) {
      out.add([...tokens].reverse().join(" "));
      expansionMethod.add("phonetic-equivalent");
    }
  }

  return {
    original: name,
    variants: Array.from(out).slice(0, 25),       // cap to avoid query explosion
    scriptDetected: trVariants.length > 1 ? "non-latin" : "latin",
    expansionMethod: Array.from(expansionMethod),
  };
}
