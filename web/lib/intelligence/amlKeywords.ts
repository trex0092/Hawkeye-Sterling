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
  // Securities fraud & market abuse — FATF predicate offences
  "pump and dump", "wash trading", "front running", "spoofing",
  "layering orders", "quote stuffing", "short and distort",
  "naked short selling", "bear raid",
  "boiler room", "cold call fraud", "advance fee fraud", "419 fraud",
  "unauthorized trading", "churning", "suitability violation",
  "false prospectus", "IPO fraud",
  // Governance & corruption
  "corruption", "abuse of power", "conflict of interest",
  "misuse of funds", "kleptocracy", "state capture",
  "bribery", "embezzlement", "nepotism", "cronyism", "influence peddling",
  "illicit enrichment", "political corruption", "official misconduct",
  "abuse of office", "defalcation", "misappropriation",
  // Bribery & corruption — FCPA / UK Bribery Act / GRECO / UNCAC terms
  "kickback", "facilitation payment", "grease payment",
  "government contract fraud", "procurement corruption", "tender rigging",
  "looting of public funds", "abuse of public office", "revolving door",
  "slush fund", "off-book payments", "secret commissions",
  "FCPA violation", "UK Bribery Act", "GRECO", "UN Convention Against Corruption",
  "politically exposed person", "politically connected", "state official",
  // Predicate offences
  "organised crime", "drug trafficking", "narcotics", "cartel",
  // Drug trafficking — expanded (FATF predicate; UNODC/DEA typologies)
  "narcotics proceeds", "cocaine proceeds", "heroin proceeds",
  "cartel money", "narco funds", "drug cartel",
  "Sinaloa cartel", "Gulf cartel",
  "fentanyl trafficking", "opioid trafficking", "methamphetamine proceeds",
  "drug money laundering", "smurfing for narcos", "bulk cash smuggling",
  "precursor chemicals", "drug lab", "clandestine laboratory",
  "UNODC narcotics", "DEA enforcement", "drug seizure",
  "human trafficking", "people smuggling", "forced labour",
  "modern slavery", "wildlife trafficking", "illegal fishing",
  "illegal logging", "environmental crime", "illegal mining",
  "poaching", "endangered species", "trafficking in persons",
  "child exploitation", "sexual exploitation", "labour exploitation",
  // Human trafficking / modern slavery — FATF predicate offence
  // (FATF Report: Financial Flows from Human Trafficking, 2018)
  "sex trafficking", "labor trafficking", "forced labor",
  "debt bondage", "human smuggling", "TIP",
  "victim exploitation", "escort services",
  "adult entertainment proceeds", "massage parlor",
  "domestic servitude", "child labor",
  "migrant smuggling", "people mover", "coyote payment",
  // Environmental crime — FATF predicate offences (FATF 2021 report)
  "deforestation", "timber fraud", "conflict timber", "carbon credit fraud",
  "ivory", "rhino horn", "pangolin",
  "IUU fishing", "fishing license fraud", "fish laundering",
  "oil theft", "bunkering", "petroleum fraud", "illegal extraction",
  "artisanal mining", "conflict minerals", "cobalt smuggling",
  "environmental fraud", "carbon offset fraud", "green washing scheme",
  // Terrorism & proliferation
  "terrorist organisation", "terror cell", "jihadist", "extremist group",
  "foreign fighter", "terror attack", "bomb plot", "explosive device",
  "bioweapon", "nerve agent", "radiological", "dirty bomb",
  // Terrorism financing — CFT / FATF R.5 / UNSCR 1267 typologies
  "terrorism financing", "terrorist financing", "CFT", "counter terrorism",
  "foreign terrorist fighter", "FTF", "returning fighter", "lone wolf",
  "suicide bombing financing", "vehicle attack financing",
  "charities for jihad", "mosque collections for terrorists",
  "ISIS financing", "ISIL financing", "Al-Qaeda financing", "Boko Haram",
  "Hezbollah financing", "Hamas financing", "PIJ financing",
  "small amount financing",
  "cryptocurrency for terrorism", "prepaid cards terrorism",
  // Cyber & digital
  "cybercrime", "ransomware", "darknet", "dark web",
  "phishing", "social engineering", "business email compromise",
  "BEC fraud", "crypto theft", "NFT fraud", "DeFi exploit",
  "rug pull", "exit scam", "pump and dump", "address poisoning",
  "data breach", "hacking", "malware", "spyware", "deepfake fraud",
  // Ransomware groups & cybercrime taxonomy
  "ransomware attack", "REvil", "Conti", "DarkSide", "LockBit", "Ryuk",
  "CEO fraud", "phishing proceeds", "credential theft proceeds",
  "darknet market", "dark web proceeds", "Hydra market", "Genesis Market",
  "crypto extortion", "sextortion", "ransomware payment",
  "hacker group", "APT group", "Lazarus Group", "Kimsuky", "Sandworm",
  "stolen card data", "carding", "dumps", "CVV shop",
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
  // Beneficial ownership & UBO
  "beneficial ownership register", "UBO", "ultimate beneficial owner",
  "beneficial owner", "nominee shareholder",
  // Informal value transfer
  "hawala", "hundi", "informal value transfer",
  // Crypto obfuscation
  "cryptocurrency mixing", "tumbler", "chain-hopping",
  // PEP
  "politically exposed person", "PEP", "senior official",
  // Virtual assets
  "virtual asset service provider", "VASP",
  // KYC / CDD
  "know your customer", "customer due diligence", "CDD",
];

/**
 * UN Security Council Resolution 1267 Consolidated Sanctions List —
 * 20 most significant currently designated terrorist entities.
 * Used for token-set similarity matching in screening routes.
 * Source: UNSC 1267/1989/2253 Committee List (as of 2025).
 */
export const UN_1267_DESIGNATED_ENTITIES: string[] = [
  // Core global jihadi networks
  "Al-Qaida",
  "Islamic State",
  "ISIL",
  "ISIS",
  "Jabhat al-Nusra",
  "Al-Shabaab",
  "Boko Haram",
  // Regional Al-Qaeda affiliates
  "Al-Qaeda in the Islamic Maghreb",
  "AQIM",
  "Al-Qaeda in the Arabian Peninsula",
  "AQAP",
  "Tehrik-e Taliban Pakistan",
  "TTP",
  // South Asia
  "Haqqani Network",
  "Lashkar-e-Tayyiba",
  "Jaish-e-Mohammed",
  "Lashkar-e-Jhangvi",
  // Sahel / West Africa / Central Africa
  "Ansar al-Islam",
  "Ansar Dine",
  "MUJAO",
  "Al-Mourabitoun",
  "Jama'at Nusrat al-Islam wal-Muslimin",
  "JNIM",
  "Islamic State in the Greater Sahara",
  "ISGS",
  "Islamic State West Africa Province",
  "ISWAP",
  "Allied Democratic Forces",
  "ADF",
];

// Multilingual keywords — surface adverse media in non-English outlets
// across all major world languages. GDELT indexes 65+ languages.
export const AML_KEYWORDS_MULTILINGUAL: Record<string, string[]> = {
  // Turkish
  tr: ["tutuklandı", "gözaltı", "soruşturma", "yolsuzluk", "kara para", "rüşvet",
       "dolandırıcılık", "iddianame", "kaçakçılık", "zimmet", "sahtecilik",
       "uyuşturucu", "terör", "yasadışı", "suç örgütü", "kara para aklama",
       "yaptırım",
       // Bribery & corruption (tr)
       "yolsuzluk", "kamu ihale yolsuzluğu", "devlet soygunculuğu"],
  // Portuguese
  pt: ["preso", "lavagem de dinheiro", "investigação", "corrupção", "fraude",
       "denúncia", "operação", "indiciado", "ouro ilegal", "tráfico",
       "desvio de verbas", "suborno", "propina", "crime organizado",
       "sanções",
       // Environmental crime (pt)
       "extração ilegal", "tráfico de animais", "pesca ilegal", "mineração ilegal",
       // Drug trafficking (pt)
       "narcotráfico", "lavagem de dinheiro do narcotráfico", "cartel de drogas"],
  // Spanish
  es: ["detenido", "lavado de dinero", "investigación", "corrupción", "fraude",
       "denuncia", "operativo", "imputado", "narcotráfico", "soborno",
       "malversación", "blanqueo", "crimen organizado", "contrabando",
       "sanciones",
       // Drug trafficking (es)
       "carteles de droga", "lavado de narcos", "dinero del cartel", "tráfico de fentanilo"],
  // Russian
  ru: ["арест", "коррупция", "отмывание", "следствие", "мошенничество", "взятка",
       "преступление", "уголовное дело", "контрабанда", "санкции", "обыск",
       "отмывание денег",
       // Cybercrime (ru)
       "программа-вымогатель", "кибератака", "хакерская группа", "дарквеб",
       // Bribery & corruption (ru)
       "взяточничество", "коррупция", "откат", "мошенничество с госконтрактами", "хищение бюджетных средств"],
  // French
  fr: ["arrêté", "blanchiment", "corruption", "fraude", "enquête",
       "mise en examen", "trafic", "détournement", "pot-de-vin", "crime organisé",
       "saisie", "contrebande", "financement du terrorisme",
       "sanctions",
       // Environmental crime (fr)
       "exploitation forestière illégale", "trafic d'espèces", "braconnage", "pêche illicite"],
  // German
  de: ["verhaftet", "Geldwäsche", "Korruption", "Betrug", "Ermittlung",
       "Anklage", "Schmuggel", "Steuerhinterziehung", "Veruntreuung",
       "Bestechung", "organisierte Kriminalität", "Sanktionen",
       // Cybercrime (de)
       "Ransomware", "Cyberkriminalität", "Darknet-Markt", "Hackergruppe"],
  // Arabic
  ar: ["اعتقال", "غسيل أموال", "فساد", "احتيال", "تحقيق", "رشوة",
       "تهريب", "جريمة", "عقوبات", "تمويل الإرهاب", "صفقة مشبوهة",
       "تمويل إرهاب",
       // Bribery & corruption (ar)
       "الرشوة", "الفساد", "عمولة سرية", "نهب المال العام", "الاستيلاء على الدولة",
       // Human trafficking (ar)
       "الاتجار بالبشر", "العمالة القسرية", "الرق الحديث", "تهريب الأشخاص",
       // TF / CFT (ar) — terrorism financing and UNSCR 1267 designated groups
       "تمويل الإرهاب", "جهاد", "داعش", "القاعدة", "حزب الله"],
  // Italian
  it: ["arrestato", "riciclaggio", "corruzione", "frode", "indagine",
       "mafia", "camorra", "ndrangheta", "evasione fiscale", "contrabbando"],
  // Chinese (Simplified)
  zh: ["洗钱", "腐败", "欺诈", "逮捕", "走私", "贿赂", "制裁",
       "非法资金", "恐怖融资", "犯罪组织", "调查", "起诉",
       // Cybercrime (zh)
       "勒索软件", "网络犯罪", "暗网", "黑客组织",
       // Securities fraud (zh)
       "内幕交易", "操纵市场", "证券欺诈", "庞氏骗局",
       // Bribery & corruption (zh)
       "行贿", "回扣", "政府采购舞弊", "国有资产侵吞"],
  // Japanese
  ja: ["マネーロンダリング", "汚職", "詐欺", "逮捕", "密輸", "制裁",
       "テロ資金", "犯罪組織", "不正", "横領",
       // Securities fraud (ja)
       "インサイダー取引", "相場操縦", "証券詐欺", "ネズミ講"],
  // Korean
  ko: ["자금세탁", "부패", "사기", "체포", "밀수", "제재",
       "테러자금", "범죄조직", "횡령", "뇌물",
       // Securities fraud (ko)
       "내부자거래", "시세조종", "증권사기", "다단계 사기"],
  // Hindi
  hi: ["मनी लॉन्ड्रिंग", "भ्रष्टाचार", "धोखाधड़ी", "गिरफ्तारी",
       "तस्करी", "प्रतिबंध", "आतंकवाद", "अपराध"],
  // Indonesian / Malay
  id: ["pencucian uang", "korupsi", "penipuan", "ditangkap", "penyelundupan",
       "sanksi", "terorisme", "kejahatan terorganisir", "suap",
       // Environmental crime (id)
       "pembalakan liar", "perdagangan satwa liar", "penambangan ilegal"],
  // Persian / Farsi
  fa: ["پولشویی", "فساد", "کلاهبرداری", "بازداشت", "قاچاق",
       "تحریم", "تروریسم", "جرم سازمان‌یافته", "رشوه",
       // Drug trafficking (fa) — Iran is a major trafficking corridor
       "قاچاق مواد مخدر", "پول کثیف", "مواد مخدر",
       // Bribery & corruption (fa) — high-risk jurisdiction
       "رشوه", "فساد", "سوء استفاده از قدرت", "اختلاس",
       // TF / CFT (fa) — terrorism financing and IRGC-linked entities
       "تأمین مالی تروریسم", "سپاه پاسداران", "حزب الله", "جهاد"],
  // Vietnamese
  vi: ["rửa tiền", "tham nhũng", "gian lận", "bắt giữ", "buôn lậu",
       "trừng phạt", "khủng bố", "tội phạm có tổ chức",
       // Human trafficking (vi)
       "buôn người", "lao động cưỡng bức", "nô lệ hiện đại"],
  // Thai
  th: ["ฟอกเงิน", "ทุจริต", "ฉ้อโกง", "จับกุม", "ลักลอบ",
       "คว่ำบาตร", "ก่อการร้าย", "อาชญากรรมองค์กร",
       // Human trafficking (th) — major trafficking route
       "การค้ามนุษย์", "แรงงานบังคับ", "การค้าประเวณี"],
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
  // Norwegian — Norway (merged)
  no: ["hvitvasking", "korrupsjon", "svindel", "pågrepet", "pågripelse",
       "smugling", "sanksjoner", "terrorisme", "organisert kriminalitet"],
  // Swahili — East Africa
  sw: ["utakatishaji fedha", "ufisadi", "udanganyifu", "rushwa",
       "kukamatwa", "magendo", "vikwazo", "ugaidi", "uhalifu",
       "fedha haramu", "biashara ya dawa", "uhalifu wa fedha",
       // Environmental crime (sw)
       "ujangili wa wanyama", "ukataji haramu wa miti", "uvuvi haramu"],
  // Hausa — West Africa
  ha: ["wankin kudi",        // money laundering
       "cin hanci",           // bribery/corruption
       "zamba"],              // fraud
  // Amharic — Ethiopia
  am: ["ብሩን ማጠብ",  // money laundering
       "ሙስና",        // corruption
       "ማጭበርበር"],   // fraud
  // Urdu — Pakistan
  ur: ["منی لانڈرنگ",   // money laundering
       "بدعنوانی",      // corruption
       "دھوکہ دہی",     // fraud
       "پابندیاں",      // sanctions
       "گرفتاری", "سمگلنگ", "دہشت گردی",
       // TF / CFT (ur) — terrorism financing and designated groups
       "دہشت گردی کی مالی اعانت", "جہاد کے لیے رقم", "القاعدہ"],
  // Bengali — Bangladesh
  bn: ["মানি লন্ডারিং",  // money laundering
       "দুর্নীতি",       // corruption
       "প্রতারণা",       // fraud
       "অর্থ পাচার", "জালিয়াতি", "গ্রেফতার",
       "চোরাচালান", "নিষেধাজ্ঞা", "সন্ত্রাসবাদ"],
  // Tagalog — Philippines
  tl: ["pagpapalaba ng pera",  // money laundering
       "katiwalian",           // corruption
       "pandaraya",            // fraud
       "suhulan",              // bribery
       // Human trafficking (tl/fil)
       "trafficking ng tao", "sapilitang paggawa",   // Filipino
       "human trafficking", "sapilitang trabaho"],    // Tagalog duplicate-safety
  // Georgian — Georgia (Caucasus)
  ka: ["ფულის გათეთრება",  // money laundering
       "კორუფცია",           // corruption
       "თაღლითობა",          // fraud
       "დაკავება",            // arrest
       "სანქციები",           // sanctions
       "კონტრაბანდა"],        // smuggling
  // Armenian — Armenia (Caucasus)
  hy: ["գումարի լվացում",  // money laundering
       "կոռուպցիա",          // corruption
       "խարդախություն",      // fraud
       "ձերբակալություն",    // arrest
       "պատժամիջոցներ",      // sanctions
       "մաքսանենգություն"],   // smuggling
  // Azerbaijani — Azerbaijan (Caucasus)
  az: ["pul yuyulması",       // money laundering
       "korrupsiya",           // corruption
       "dələduzluq",           // fraud
       "həbs",                 // arrest
       "sanksiyalar",          // sanctions
       "qaçaqmalçılıq"],       // smuggling
  // Kazakh — Kazakhstan
  kk: ["ақшаны жылыстату",  // money laundering
       "сыбайлас жемқорлық", // corruption
       "алаяқтық",           // fraud
       "тұтқындау",          // arrest
       "санкциялар",         // sanctions
       "контрабанда"],        // smuggling
  // Uzbek — Uzbekistan
  uz: ["pullarni yuvish",     // money laundering
       "korrupsiya",           // corruption
       "firibgarlik",          // fraud
       "hibsga olish",         // arrest
       "sanksiyalar",          // sanctions
       "kontrabanda"],         // smuggling
  // Nepali — Nepal
  ne: ["मनी लाउन्डरिङ",  // money laundering
       "भ्रष्टाचार",       // corruption
       "ठगी",               // fraud
       "गिरफ्तारी",        // arrest
       "प्रतिबन्ध",         // sanctions
       "तस्करी"],           // smuggling
  // Sinhala — Sri Lanka
  si: ["මුදල් විශුද්ධිකරණය",  // money laundering
       "දූෂණය",                // corruption
       "වංචාව",                // fraud
       "අත්අඩංගුවට ගැනීම",    // arrest
       "මුදල් ජාවාරම"],        // financial crime
  // Estonian — Estonia
  et: ["rahapesu",            // money laundering
       "korruptsioon",         // corruption
       "pettus",               // fraud
       "vahistamine",          // arrest
       "sanktsioonid",         // sanctions
       "salakaubavedu"],        // smuggling
  // Latvian — Latvia
  lv: ["naudas atmazgāšana",  // money laundering
       "korupcija",            // corruption
       "krāpšana",             // fraud
       "aizturēšana",          // arrest
       "sankcijas",            // sanctions
       "kontrabanda"],         // smuggling
  // Lithuanian — Lithuania
  lt: ["pinigų plovimas",     // money laundering
       "korupcija",            // corruption
       "sukčiavimas",          // fraud
       "suėmimas",             // arrest
       "sankcijos",            // sanctions
       "kontrabanda"],         // smuggling
  // Finnish — Finland
  fi: ["rahanpesu",           // money laundering
       "korruptio",            // corruption
       "petos",                // fraud
       "pidätys",              // arrest
       "pakotteet",            // sanctions
       "salakuljetus"],         // smuggling
  // Danish — Denmark
  da: ["hvidvaskning",        // money laundering
       "korruption",           // corruption
       "bedrageri",            // fraud
       "anholdelse",           // arrest
       "sanktioner",           // sanctions
       "smugleri"],            // smuggling
  // Macedonian — North Macedonia
  mk: ["перење пари",         // money laundering
       "корупција",            // corruption
       "измама",               // fraud
       "апсење",               // arrest
       "санкции",              // sanctions
       "шверц"],               // smuggling
  // Albanian — Albania
  sq: ["pastrimi i parave",   // money laundering
       "korrupsion",           // corruption
       "mashtrim",             // fraud
       "arrestim",             // arrest
       "sanksione",            // sanctions
       "kontrabandë"],         // smuggling
  // Slovenian — Slovenia
  sl: ["pranje denarja",      // money laundering
       "korupcija",            // corruption
       "goljufija",            // fraud
       "aretacija",            // arrest
       "sankcije",             // sanctions
       "tihotapstvo"],          // smuggling
  // Mongolian — Mongolia
  mn: ["мөнгө угаах",        // money laundering
       "авлига",               // corruption
       "залилан мэхлэх",      // fraud
       "баривчлах",            // arrest
       "хориг арга хэмжээ",   // sanctions
       "хар зах"],             // black market
  // Somali — East Africa / Horn of Africa
  so: ["samaynta lacagta",    // money laundering
       "musuqmaasuq",          // corruption
       "sixir",                // fraud
       "xukun",                // arrest
       "xayiraad",             // sanctions
       "smugling"],            // smuggling
  // Burmese — Myanmar
  my: ["ငွေချောင်ချောင်စီးဆင်းမှု",  // money laundering
       "အဂတိလိုက်စားမှု",              // corruption
       "လိမ်လည်မှု",                   // fraud
       "ဖမ်းဆီးမှု",                    // arrest
       "တားမြစ်ချက်"],                  // sanctions
  // Khmer — Cambodia
  km: ["លាងលុយ",             // money laundering
       "អំពើពុករលួយ",         // corruption
       "ការបោកប្រាស់",        // fraud
       "ចាប់ខ្លួន",            // arrest
       "ទណ្ឌកម្ម"],           // sanctions
  // Lao — Laos
  lo: ["ຟອກເງິນ",            // money laundering
       "ການສໍ້ລາດບັງຫລວງ",    // corruption
       "ການສໍ້ໂກງ",           // fraud
       "ການຈັບກຸມ",           // arrest
       "ການລົງໂທດ"],          // sanctions
  // Tamil — India/Sri Lanka
  ta: ["பண மோசடி",           // money laundering
       "ஊழல்",                // corruption
       "மோசடி",               // fraud
       "கைது",                // arrest
       "தடை",                 // sanctions
       "கடத்தல்",             // smuggling
       "பயங்கரவாதம்"],        // terrorism
  // Pashto — Afghanistan/Pakistan
  ps: ["د پیسو مینځل",       // money laundering
       "فساد",                // corruption
       "درغلي",               // fraud
       "نیول",                // arrest
       "بندیزونه",            // sanctions
       // Drug trafficking (ps) — Afghanistan is the world's largest opium producer
       "د نشه‌یي توکو قاچاق", // drug trafficking
       "د نشه‌یي توکو پیسې"], // drug money
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
