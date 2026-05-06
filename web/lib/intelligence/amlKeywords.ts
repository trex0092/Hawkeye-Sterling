// Hawkeye Sterling — canonical AML/CFT/financial-crime keyword set.
//
// One source of truth used by:
//   - GDELT query (adverse-media-live route)
//   - Claude LLM prompt (llmAdverseMedia)
//   - Free RSS aggregator (filters articles whose title/snippet mentions
//     subject AND any AML keyword)
//   - Adverse-media augmentation in /api/quick-screen

// English core taxonomy — FATF predicate offences + sanctions/CFT +
// market-conduct + cyber/organised-crime.
export const AML_KEYWORDS_EN: string[] = [
  // Core
  "launder", "fraud", "bribe", "corrupt", "arrest", "blackmail", "breach",
  "convict", "court case", "embezzle", "extort", "felon", "fined",
  "guilty", "illegal", "imprisonment", "jail", "kickback", "litigate",
  "mafia", "murder", "prosecute", "terrorism", "theft", "unlawful",
  "verdict", "sanctions",
  // Financial crime taxonomy
  "money laundering", "financial crime", "economic crime",
  "terrorist financing", "financing of terrorism", "terror funding",
  "extremist", "radicalisation", "designated terrorist", "militant",
  "proliferation financing", "weapons of mass destruction", "WMD",
  "dual-use", "sanctions evasion", "arms trafficking",
  "weapons smuggling", "nuclear", "chemical weapons", "biological weapons",
  // Tax & market
  "tax evasion", "tax fraud", "VAT fraud", "Ponzi", "pyramid scheme",
  "insider trading", "market manipulation", "accounting fraud",
  "asset misappropriation", "forgery", "counterfeiting",
  "identity theft", "cyber fraud", "wire fraud",
  // Governance
  "corruption", "abuse of power", "conflict of interest",
  "misuse of funds", "kleptocracy", "state capture",
  // Predicate offences
  "organised crime", "drug trafficking", "narcotics", "cartel",
  "human trafficking", "people smuggling", "forced labour",
  "modern slavery", "wildlife trafficking",
  // Cyber
  "cybercrime", "ransomware", "darknet",
  // Regulatory
  "debarred", "blacklisted", "regulatory breach",
  // Short-seller / activist (catches Marex/Hindenburg/Muddy Waters cases)
  "short seller", "short report", "house of cards", "accounting irregularities",
  "off-balance-sheet", "class action", "shareholder lawsuit",
];

// Multilingual keywords — surface adverse media in non-English first-
// surfacing outlets (Turkish niche press, Brazilian investigative sites,
// Spanish/Portuguese LATAM, Russian independent press, etc.).
export const AML_KEYWORDS_MULTILINGUAL: Record<string, string[]> = {
  tr: ["tutuklandı", "gözaltı", "soruşturma", "yolsuzluk", "kara para", "rüşvet", "dolandırıcılık", "iddianame", "kaçakçılık"],
  pt: ["preso", "lavagem de dinheiro", "investigação", "corrupção", "fraude", "denúncia", "operação", "indiciado", "ouro ilegal"],
  es: ["detenido", "lavado de dinero", "investigación", "corrupción", "fraude", "denuncia", "operativo", "imputado", "narcotráfico"],
  ru: ["арест", "коррупция", "отмывание", "следствие", "мошенничество", "взятка"],
  fr: ["arrêté", "blanchiment", "corruption", "fraude", "enquête", "mise en examen", "trafic"],
  de: ["verhaftet", "Geldwäsche", "Korruption", "Betrug", "Ermittlung", "Anklage", "Schmuggel"],
  ar: ["اعتقال", "غسيل أموال", "فساد", "احتيال", "تحقيق", "رشوة"],
  it: ["arrestato", "riciclaggio", "corruzione", "frode", "indagine", "mafia"],
};

/** Flat list of every keyword across every language. */
export function allAmlKeywords(): string[] {
  return [...AML_KEYWORDS_EN, ...Object.values(AML_KEYWORDS_MULTILINGUAL).flat()];
}

/** GDELT-style OR query fragment — quotes multi-word phrases. */
export function gdeltKeywordOr(): string {
  return allAmlKeywords()
    .map((k) => (k.includes(" ") ? `"${k}"` : k))
    .join(" OR ");
}

/** Returns true when the text contains ANY AML keyword (case-insensitive). */
export function textMentionsAml(text: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  for (const k of AML_KEYWORDS_EN) {
    if (lower.includes(k.toLowerCase())) return true;
  }
  for (const list of Object.values(AML_KEYWORDS_MULTILINGUAL)) {
    for (const k of list) {
      if (text.includes(k)) return true;     // diacritic-sensitive for non-Latin
    }
  }
  return false;
}

/** Returns the matched keywords (de-duplicated) — useful for evidence trails. */
export function matchAmlKeywords(text: string): string[] {
  if (!text) return [];
  const out = new Set<string>();
  const lower = text.toLowerCase();
  for (const k of AML_KEYWORDS_EN) {
    if (lower.includes(k.toLowerCase())) out.add(k);
  }
  for (const list of Object.values(AML_KEYWORDS_MULTILINGUAL)) {
    for (const k of list) {
      if (text.includes(k)) out.add(k);
    }
  }
  return Array.from(out);
}
