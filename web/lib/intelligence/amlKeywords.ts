// Hawkeye Sterling — canonical AML/CFT/financial-crime keyword set.
//
// One source of truth used by:
//   - GDELT query (adverse-media-live route)
//   - Claude LLM prompt (llmAdverseMedia)
//   - Free RSS aggregator (filters articles whose title/snippet mentions
//     subject AND any AML keyword)
//   - Adverse-media augmentation in /api/quick-screen

// English core taxonomy — FATF predicate offences + sanctions/CFT +
// market-conduct + cyber/organised-crime. Minimum 200 terms.
export const AML_KEYWORDS_EN: string[] = [
  // Core criminal
  "launder", "fraud", "bribe", "corrupt", "arrest", "blackmail", "breach",
  "convict", "court case", "embezzle", "extort", "felon", "fined",
  "guilty", "illegal", "imprisonment", "jail", "kickback", "litigate",
  "mafia", "murder", "prosecute", "terrorism", "theft", "unlawful",
  "verdict", "sanctions", "fugitive", "warrant", "indicted", "charged",
  "detained", "remanded", "plea deal", "guilty plea", "criminal charges",
  "drug bust", "seized", "forfeited", "confiscated", "raided",
  // Financial crime taxonomy
  "money laundering", "financial crime", "economic crime",
  "terrorist financing", "financing of terrorism", "terror funding",
  "extremist", "radicalisation", "designated terrorist", "militant",
  "proliferation financing", "weapons of mass destruction", "WMD",
  "dual-use", "sanctions evasion", "arms trafficking",
  "weapons smuggling", "nuclear", "chemical weapons", "biological weapons",
  "proliferation", "export control violation", "embargo violation",
  // Tax & market
  "tax evasion", "tax fraud", "VAT fraud", "Ponzi", "pyramid scheme",
  "insider trading", "market manipulation", "accounting fraud",
  "asset misappropriation", "forgery", "counterfeiting",
  "identity theft", "cyber fraud", "wire fraud",
  "tax haven", "offshore account", "undeclared funds", "tax shelter",
  "invoice fraud", "billing fraud", "payroll fraud", "procurement fraud",
  "financial misstatement", "earnings manipulation", "revenue fraud",
  "securities fraud", "investment fraud", "pension fraud", "mortgage fraud",
  // Governance & corruption
  "corruption", "abuse of power", "conflict of interest",
  "misuse of funds", "kleptocracy", "state capture",
  "bribery", "embezzlement", "nepotism", "cronyism", "influence peddling",
  "illicit enrichment", "political corruption", "official misconduct",
  "abuse of office", "defalcation", "misappropriation",
  // Predicate offences
  "organised crime", "drug trafficking", "narcotics", "cartel",
  "human trafficking", "people smuggling", "forced labour",
  "modern slavery", "wildlife trafficking", "illegal fishing",
  "illegal logging", "environmental crime", "illegal mining",
  "poaching", "endangered species", "trafficking in persons",
  "child exploitation", "sexual exploitation", "labour exploitation",
  // Terrorism & proliferation
  "terrorist organisation", "terror cell", "jihadist", "extremist group",
  "foreign fighter", "terror attack", "bomb plot", "explosive device",
  "bioweapon", "nerve agent", "radiological", "dirty bomb",
  // Cyber & digital
  "cybercrime", "ransomware", "darknet", "dark web",
  "phishing", "social engineering", "business email compromise",
  "BEC fraud", "crypto theft", "NFT fraud", "DeFi exploit",
  "rug pull", "exit scam", "pump and dump", "address poisoning",
  "data breach", "hacking", "malware", "spyware", "deepfake fraud",
  // Regulatory & enforcement
  "debarred", "blacklisted", "regulatory breach", "enforcement action",
  "cease and desist", "license revoked", "regulatory fine",
  "compliance failure", "AML breach", "KYC failure", "suspicious activity",
  "Suspicious Activity Report", "SAR filed", "STR filed", "FIU referral",
  "FATF grey list", "FATF blacklist", "high-risk jurisdiction",
  "derisking", "correspondent banking", "de-dollarisation",
  // Short-seller / activist
  "short seller", "short report", "house of cards", "accounting irregularities",
  "off-balance-sheet", "class action", "shareholder lawsuit",
  "whistleblower", "whistleblowing", "leak", "Panama Papers",
  "Pandora Papers", "FinCEN Files", "Luanda Leaks", "ICIJ", "OCCRP",
  // Trade-based ML & precious metals
  "trade-based money laundering", "TBML", "over-invoicing", "under-invoicing",
  "phantom shipment", "carousel fraud", "customs fraud",
  "gold smuggling", "precious metals fraud", "conflict gold",
  "illegal gold", "gold refinery", "artisanal mining",
  "DPMS", "diamond smuggling", "conflict mineral",
  // Sanctions programmes
  "OFAC", "SDN list", "consolidated list", "EU sanctions",
  "UK sanctions", "UN sanctions", "asset freeze", "travel ban",
  "designated person", "specially designated national",
  // Vessels & aviation
  "dark fleet", "AIS manipulation", "flag hopping", "phantom vessel",
  "ship-to-ship transfer", "illicit cargo", "sanctions vessel",
  // Real estate & high-value assets
  "real estate money laundering", "cash purchase", "straw buyer",
  "shell company", "beneficial ownership", "nominee director",
  "bearer share", "offshore company", "tax-haven company",
];

// Multilingual keywords — surface adverse media in non-English outlets
// across all major world languages. GDELT indexes 65+ languages.
export const AML_KEYWORDS_MULTILINGUAL: Record<string, string[]> = {
  // Turkish
  tr: ["tutuklandı", "gözaltı", "soruşturma", "yolsuzluk", "kara para", "rüşvet",
       "dolandırıcılık", "iddianame", "kaçakçılık", "zimmet", "sahtecilik",
       "uyuşturucu", "terör", "yasadışı", "suç örgütü", "kara para aklama"],
  // Portuguese
  pt: ["preso", "lavagem de dinheiro", "investigação", "corrupção", "fraude",
       "denúncia", "operação", "indiciado", "ouro ilegal", "tráfico",
       "desvio de verbas", "suborno", "propina", "crime organizado"],
  // Spanish
  es: ["detenido", "lavado de dinero", "investigación", "corrupción", "fraude",
       "denuncia", "operativo", "imputado", "narcotráfico", "soborno",
       "malversación", "blanqueo", "crimen organizado", "contrabando"],
  // Russian
  ru: ["арест", "коррупция", "отмывание", "следствие", "мошенничество", "взятка",
       "преступление", "уголовное дело", "контрабанда", "санкции", "обыск"],
  // French
  fr: ["arrêté", "blanchiment", "corruption", "fraude", "enquête",
       "mise en examen", "trafic", "détournement", "pot-de-vin", "crime organisé",
       "saisie", "contrebande", "financement du terrorisme"],
  // German
  de: ["verhaftet", "Geldwäsche", "Korruption", "Betrug", "Ermittlung",
       "Anklage", "Schmuggel", "Steuerhinterziehung", "Veruntreuung",
       "Bestechung", "organisierte Kriminalität", "Sanktionen"],
  // Arabic
  ar: ["اعتقال", "غسيل أموال", "فساد", "احتيال", "تحقيق", "رشوة",
       "تهريب", "جريمة", "عقوبات", "تمويل الإرهاب", "صفقة مشبوهة"],
  // Italian
  it: ["arrestato", "riciclaggio", "corruzione", "frode", "indagine",
       "mafia", "camorra", "ndrangheta", "evasione fiscale", "contrabbando"],
  // Chinese (Simplified)
  zh: ["洗钱", "腐败", "欺诈", "逮捕", "走私", "贿赂", "制裁",
       "非法资金", "恐怖融资", "犯罪组织", "调查", "起诉"],
  // Japanese
  ja: ["マネーロンダリング", "汚職", "詐欺", "逮捕", "密輸", "制裁",
       "テロ資金", "犯罪組織", "不正", "横領"],
  // Korean
  ko: ["자금세탁", "부패", "사기", "체포", "밀수", "제재",
       "테러자금", "범죄조직", "횡령", "뇌물"],
  // Hindi
  hi: ["मनी लॉन्ड्रिंग", "भ्रष्टाचार", "धोखाधड़ी", "गिरफ्तारी",
       "तस्करी", "प्रतिबंध", "आतंकवाद", "अपराध"],
  // Indonesian / Malay
  id: ["pencucian uang", "korupsi", "penipuan", "ditangkap", "penyelundupan",
       "sanksi", "terorisme", "kejahatan terorganisir", "suap"],
  // Persian / Farsi
  fa: ["پولشویی", "فساد", "کلاهبرداری", "بازداشت", "قاچاق",
       "تحریم", "تروریسم", "جرم سازمان‌یافته", "رشوه"],
  // Vietnamese
  vi: ["rửa tiền", "tham nhũng", "gian lận", "bắt giữ", "buôn lậu",
       "trừng phạt", "khủng bố", "tội phạm có tổ chức"],
  // Thai
  th: ["ฟอกเงิน", "ทุจริต", "ฉ้อโกง", "จับกุม", "ลักลอบ",
       "คว่ำบาตร", "ก่อการร้าย", "อาชญากรรมองค์กร"],
  // Ukrainian
  uk: ["відмивання грошей", "корупція", "шахрайство", "арешт",
       "контрабанда", "санкції", "тероризм", "злочинна організація"],
  // Polish
  pl: ["pranie pieniędzy", "korupcja", "oszustwo", "aresztowanie",
       "przemyt", "sankcje", "terroryzm", "przestępczość zorganizowana"],
  // Dutch
  nl: ["witwassen", "corruptie", "fraude", "arrestatie", "smokkel",
       "sancties", "terrorisme", "georganiseerde misdaad", "omkoping"],
  // Hebrew
  he: ["הלבנת הון", "שחיתות", "הונאה", "מעצר", "הברחה",
       "סנקציות", "טרור", "פשע מאורגן"],
  // Greek
  el: ["ξέπλυμα χρήματος", "διαφθορά", "απάτη", "σύλληψη",
       "λαθρεμπόριο", "κυρώσεις", "τρομοκρατία"],
  // Romanian
  ro: ["spălare de bani", "corupție", "fraudă", "arest",
       "contrabandă", "sancțiuni", "terorism", "crimă organizată"],
  // Swedish
  sv: ["penningtvätt", "korruption", "bedrägeri", "arresterad",
       "smuggling", "sanktioner", "terrorism", "organiserad brottslighet"],
  // Norwegian
  no: ["hvitvasking", "korrupsjon", "svindel", "pågrepet",
       "smugling", "sanksjoner", "terrorisme", "organisert kriminalitet"],
  // Swahili
  sw: ["utakatishaji fedha", "ufisadi", "udanganyifu", "kukamatwa",
       "magendo", "vikwazo", "ugaidi", "uhalifu"],
  // Urdu
  ur: ["منی لانڈرنگ", "بدعنوانی", "دھوکہ دہی", "گرفتاری",
       "سمگلنگ", "پابندیاں", "دہشت گردی"],
  // Bengali
  bn: ["অর্থ পাচার", "দুর্নীতি", "জালিয়াতি", "গ্রেফতার",
       "চোরাচালান", "নিষেধাজ্ঞা", "সন্ত্রাসবাদ"],
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
