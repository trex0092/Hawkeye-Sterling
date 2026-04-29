// Hawkeye Sterling — multi-language adverse-media catalogues + tokenizers.
//
// English keyword matching with `indexOf` works for Latin-script languages
// because word boundaries are explicit. It silently fails on Chinese (no
// spaces) and produces noisy substring matches in Arabic where prefixed
// articles fuse onto roots ("الـ"+root). This module ships per-language
// catalogues and a script-aware tokenizer so multi-script news corpora
// can be classified with the same precision as English.
//
// Languages covered (ISO-639-1):
//   ar — Arabic       (Right-to-left; Arabic-Indic digits)
//   fr — French       (Latin; diacritics)
//   ru — Russian      (Cyrillic)
//   zh — Chinese      (CJK Unified; no whitespace tokens)
//
// The catalogues mirror the English risk topology (financial crime,
// terrorist financing, sanctions, corruption, drugs, human trafficking).
// For each language we additionally specify a tokenizer because the choice
// of tokenizer drives both recall (catching morphological variants) and
// precision (avoiding false sub-string hits).

export type SupportedLang = "ar" | "fr" | "ru" | "zh";

export interface LangKeywordPack {
  lang: SupportedLang;
  /** ISO 639-2 / common name for UI display */
  displayName: string;
  /** Keywords are stored already lower-cased / normalised. */
  keywords: string[];
  /** Token-yielding split for this language. CJK uses character n-grams. */
  tokenize: (text: string) => Set<string>;
}

// ─────────────────────────────────────────────────────────────────────────
// Catalogues — kept compact (≤ 60 terms / language) on the regulator-
// relevant predicates: ML, TF, sanctions, bribery, fraud, drug trafficking,
// human trafficking. Add freely; tokenisation makes near-duplicates safe.
// ─────────────────────────────────────────────────────────────────────────

const AR_KEYWORDS = [
  // Money laundering / financial crime
  "غسل الأموال", "تبييض الأموال", "غسيل أموال", "تمويل الإرهاب",
  "احتيال", "اختلاس", "تزوير", "تهرب ضريبي", "تهريب", "رشوة",
  "فساد", "إفساد", "اتجار", "اتجار بالبشر", "اتجار بالمخدرات",
  "مخدرات", "إرهاب", "تمويل إرهاب", "عقوبات", "خرق العقوبات",
  // Persons / acts
  "اعتقال", "اعتُقل", "أُدين", "محكوم", "متهم", "ملاحق قضائياً",
  "حكم بالسجن", "تجميد الأصول", "إدراج", "تجميد أموال",
  // Sanctions regimes
  "عقوبات أمريكية", "قائمة المخالفين", "قائمة الحظر", "قائمة الإرهاب",
  // Cyber / proliferation
  "هجوم سيبراني", "برامج فدية", "أسلحة الدمار الشامل", "أسلحة نووية",
];

const FR_KEYWORDS = [
  // Financial crime / ML / TF
  "blanchiment", "blanchiment d'argent", "blanchiment de capitaux",
  "financement du terrorisme", "financement terroriste",
  "fraude", "fraude fiscale", "évasion fiscale", "évasion de capitaux",
  "détournement", "détournement de fonds", "escroquerie", "abus de biens sociaux",
  "corruption", "pot-de-vin", "pots-de-vin", "trafic d'influence",
  // Persons / acts
  "condamné", "condamnée", "condamnation", "arrêté", "arrêtée",
  "soupçonné", "inculpé", "mis en examen", "mise en examen",
  "interpellé", "écroué", "écrouée",
  "perquisition", "blanchiment aggravé",
  // Sanctions
  "sanctions", "sanctions économiques", "gel des avoirs", "gel d'avoirs",
  "embargo", "violation des sanctions", "contournement des sanctions",
  // Predicates
  "trafic de drogue", "trafic d'êtres humains", "traite des êtres humains",
  "esclavage moderne", "travail forcé", "criminalité organisée", "mafia",
  // Proliferation / cyber
  "armes de destruction massive", "prolifération nucléaire",
  "rançongiciel", "cyberattaque", "fraude informatique",
];

const RU_KEYWORDS = [
  // ML / TF / fraud
  "отмывание денег", "отмывание", "финансирование терроризма",
  "финансирование экстремизма", "мошенничество", "хищение", "растрата",
  "уклонение от налогов", "налоговое мошенничество",
  "взятка", "взяточничество", "коррупция", "злоупотребление полномочиями",
  // Persons / acts
  "арестован", "арестована", "задержан", "задержана",
  "обвиняемый", "обвиняемая", "осужден", "осуждена",
  "приговорен", "приговорена", "уголовное дело", "уголовная статья",
  "обвинительное заключение", "обыск",
  // Sanctions / regimes
  "санкции", "финансовые санкции", "санкционный список",
  "обход санкций", "нарушение санкций", "заморозка активов",
  "арест активов", "OFAC", "СДН",
  // Predicates
  "наркоторговля", "торговля наркотиками", "контрабанда",
  "торговля людьми", "принудительный труд", "организованная преступность",
  "оружие массового поражения", "ядерная программа",
  "кибератака", "вымогательское программное обеспечение",
];

const ZH_KEYWORDS = [
  // 反洗钱 / 反恐怖融资
  "洗钱", "反洗钱", "可疑交易",
  "恐怖融资", "资助恐怖主义", "恐怖主义",
  "欺诈", "诈骗", "金融欺诈", "电信诈骗",
  "贪污", "腐败", "贿赂", "受贿", "行贿", "回扣",
  "挪用公款", "侵占", "经济犯罪",
  // Persons / acts
  "被捕", "被拘留", "被起诉", "被定罪", "判刑",
  "立案", "调查", "通缉", "潜逃",
  "刑事案件", "经济案件",
  // Sanctions
  "制裁", "经济制裁", "金融制裁", "资产冻结", "禁运",
  "违反制裁", "规避制裁", "美国制裁",
  // Predicates
  "毒品走私", "贩毒", "毒品交易",
  "人口贩卖", "人口走私", "强迫劳动", "现代奴役",
  "有组织犯罪", "黑社会", "黑帮",
  // Proliferation / cyber
  "大规模杀伤性武器", "核扩散",
  "勒索软件", "网络攻击", "黑客攻击", "数据泄露",
];

// ─────────────────────────────────────────────────────────────────────────
// Tokenisers
// ─────────────────────────────────────────────────────────────────────────

/** Latin/Cyrillic script — split on whitespace + common punctuation,
 *  produce both single tokens and bigrams so multi-word phrases match.
 *  Apostrophes (ASCII + curly U+2019) are folded to spaces so French
 *  contractions ("d'argent") tokenise the same way as their catalogue
 *  entries. */
function whitespaceTokenize(text: string): Set<string> {
  const norm = text.toLowerCase().replace(/[’']/g, " ");
  const words = norm
    .split(/[\s.,;:!?"«»\(\)\[\]\/\\<>\-—–]+/u)
    .filter((w) => w.length > 0);
  const out = new Set<string>(words);
  // Bigrams + trigrams
  for (let i = 0; i < words.length - 1; i++) {
    out.add(`${words[i]} ${words[i + 1]}`);
    if (i < words.length - 2) {
      out.add(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
    }
  }
  return out;
}

/** Arabic — strip diacritics + tatweel, normalise letter forms (ا/أ/إ/آ
 *  → ا · ى → ي · ة → ه), then whitespace-tokenise + bigrams. The
 *  normalisation steps are standard for Arabic IR pipelines. */
function arabicTokenize(text: string): Set<string> {
  const stripped = text
    // Remove harakat (combining marks), tatweel
    .replace(/[ً-ٰٟـ]/g, "")
    // Letter-form folding
    .replace(/[إأآا]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    // Strip Arabic-Indic punctuation
    .replace(/[،؛؟]/g, " ");
  return whitespaceTokenize(stripped);
}

/** CJK — no whitespace word boundaries. Yield character bigrams,
 *  trigrams, and 4-grams; matches keyword recall used by Chinese IR
 *  systems (Mandarin OOV terms are typically 2–4 chars). */
function cjkTokenize(text: string): Set<string> {
  const han = text.replace(/\s+/g, "");
  const out = new Set<string>();
  for (let i = 0; i < han.length; i++) {
    for (let n = 2; n <= 4; n++) {
      if (i + n <= han.length) out.add(han.slice(i, i + n));
    }
  }
  return out;
}

// Pre-normalise Arabic catalogue once so each classify call is O(|tokens|).
const AR_KEYWORDS_NORM = AR_KEYWORDS.map((k) =>
  k
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[إأآا]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .toLowerCase(),
);

// Mirror the apostrophe-folding the tokeniser applies, so multi-word
// French entries with contractions ("blanchiment d'argent") match.
const FR_KEYWORDS_NORM = FR_KEYWORDS.map((k) => k.toLowerCase().replace(/[’']/g, " ").replace(/\s+/g, " "));
const RU_KEYWORDS_NORM = RU_KEYWORDS.map((k) => k.toLowerCase());
const ZH_KEYWORDS_NORM = ZH_KEYWORDS; // CJK already case-insensitive

export const I18N_PACKS: Record<SupportedLang, LangKeywordPack> = {
  ar: { lang: "ar", displayName: "Arabic",  keywords: AR_KEYWORDS_NORM, tokenize: arabicTokenize },
  fr: { lang: "fr", displayName: "French",  keywords: FR_KEYWORDS_NORM, tokenize: whitespaceTokenize },
  ru: { lang: "ru", displayName: "Russian", keywords: RU_KEYWORDS_NORM, tokenize: whitespaceTokenize },
  zh: { lang: "zh", displayName: "Chinese", keywords: ZH_KEYWORDS_NORM, tokenize: cjkTokenize },
};

// ─────────────────────────────────────────────────────────────────────────
// Language detection — script-based heuristic. We never try to discriminate
// between Latin-script languages here; the English pipeline already handles
// those. Detection only cares whether a non-Latin script is the dominant
// one, which is enough to route to the right keyword pack.
// ─────────────────────────────────────────────────────────────────────────

interface ScriptCounts {
  arabic: number;
  cyrillic: number;
  cjk: number;
  latin: number;
  other: number;
}

function countScripts(text: string): ScriptCounts {
  const c: ScriptCounts = { arabic: 0, cyrillic: 0, cjk: 0, latin: 0, other: 0 };
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp >= 0x0600 && cp <= 0x06FF) c.arabic++;
    else if (cp >= 0x0400 && cp <= 0x04FF) c.cyrillic++;
    else if (cp >= 0x4E00 && cp <= 0x9FFF) c.cjk++;
    else if ((cp >= 0x0041 && cp <= 0x007A) || (cp >= 0x00C0 && cp <= 0x024F)) c.latin++;
    else c.other++;
  }
  return c;
}

export function detectLanguage(text: string): SupportedLang | "en" | "unknown" {
  const c = countScripts(text);
  const total = c.arabic + c.cyrillic + c.cjk + c.latin;
  if (total === 0) return "unknown";
  // Use 30% threshold so a single Arabic name embedded in an English
  // article doesn't flip detection.
  if (c.arabic / total > 0.30)   return "ar";
  if (c.cjk / total > 0.30)      return "zh";
  if (c.cyrillic / total > 0.30) return "ru";
  // Latin script: try to disambiguate French via diacritic-density.
  if (c.latin / total > 0.50) {
    const french = /[àâçéèêëîïôûùüÿœæ]/i.test(text);
    return french ? "fr" : "en";
  }
  return "unknown";
}

// ─────────────────────────────────────────────────────────────────────────
// Multi-language classifier
// ─────────────────────────────────────────────────────────────────────────

export interface I18nHit {
  lang: SupportedLang;
  keyword: string;
}

/** Classify an item against the i18n catalogues. Always tries the detected
 *  language first; if no hit, falls back to scanning every supported pack
 *  (cross-lingual articles do exist). */
export function classifyI18n(text: string): I18nHit[] {
  const detected = detectLanguage(text);
  const order: SupportedLang[] =
    detected === "ar" || detected === "fr" || detected === "ru" || detected === "zh"
      ? [detected, ...((["ar", "fr", "ru", "zh"] as SupportedLang[]).filter((l) => l !== detected))]
      : ["ar", "fr", "ru", "zh"];

  const hits: I18nHit[] = [];
  for (const lang of order) {
    const pack = I18N_PACKS[lang];
    const tokens = pack.tokenize(text);
    for (const k of pack.keywords) {
      if (tokens.has(k)) hits.push({ lang, keyword: k });
    }
    if (hits.length > 0 && lang === detected) break; // primary-language hit is sufficient
  }
  return hits;
}

/** All keywords across every i18n pack, lower-cased. Useful to seed news-API
 *  query strings or to embed in keyword-density dashboards. */
export function allI18nKeywords(): Array<{ lang: SupportedLang; keyword: string }> {
  const out: Array<{ lang: SupportedLang; keyword: string }> = [];
  for (const lang of Object.keys(I18N_PACKS) as SupportedLang[]) {
    for (const k of I18N_PACKS[lang].keywords) out.push({ lang, keyword: k });
  }
  return out;
}
