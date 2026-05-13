// Hawkeye Sterling — known-entity fixtures.
//
// Name-based lookups applied inside /api/super-brain so subjects that are
// household-name PEPs or well-documented adverse-media subjects still flag
// even when no roleText is supplied and the Google News feed is unreachable.
//
// Coverage: ~120 PEPs across Tier 1–4 + family/RCA, plus adverse-media
// subjects. Organised by region for maintainability.
//
// NOTE: This is a deliberately auditable static list — NOT a replacement for
// live PEP / adverse-media data feeds. It ensures demo subjects render a
// realistic posture on first load, and catches well-known subjects even when
// the live news feed is unavailable.

export interface KnownPEP {
  names: string[];
  tier:
    | "tier_1_head_of_state_or_gov"
    | "tier_2_senior_political_judicial_military"
    | "tier_3_state_owned_enterprise_exec"
    | "tier_4_party_official_senior_civil_servant"
    | "family"
    | "close_associate";
  role: string;
  rationale: string;
  jurisdiction?: string;
}

export interface KnownAdverse {
  names: string[];
  categories: Array<{ categoryId: string; keyword: string }>;
  keywords: string[];
  rationale: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// TIER 1 — Heads of State / Government
// ─────────────────────────────────────────────────────────────────────────────
const PEPS: KnownPEP[] = [
  // United States
  {
    names: ["donald trump", "donald j trump", "donald j. trump", "president trump"],
    tier: "tier_1_head_of_state_or_gov",
    role: "President of the United States — head of state and head of government",
    rationale: "Serving head of state / head of government — FATF tier-1 PEP (foreign PEP in UAE context).",
    jurisdiction: "US",
  },
  {
    names: ["joe biden", "joseph biden", "joseph r biden", "joseph robinette biden"],
    tier: "tier_1_head_of_state_or_gov",
    role: "Former President of the United States — head of state",
    rationale: "Former head of state — FATF PEP status retained for 12+ months post-office.",
    jurisdiction: "US",
  },
  {
    names: ["barack obama", "barack hussein obama"],
    tier: "tier_1_head_of_state_or_gov",
    role: "Former President of the United States",
    rationale: "Former head of state — FATF PEP cooling-off period applies.",
    jurisdiction: "US",
  },
  // Russia
  {
    names: ["vladimir putin", "vladimir vladimirovich putin", "путин"],
    tier: "tier_1_head_of_state_or_gov",
    role: "President of the Russian Federation — head of state",
    rationale: "Serving head of state — sanctioned jurisdiction, CAHRA-relevant.",
    jurisdiction: "RU",
  },
  {
    names: ["dmitry medvedev", "dmitri medvedev", "медведев"],
    tier: "tier_1_head_of_state_or_gov",
    role: "Deputy Chairman of the Security Council of Russia; former President and Prime Minister",
    rationale: "Former head of state / senior official — sanctioned jurisdiction.",
    jurisdiction: "RU",
  },
  {
    names: ["mikhail mishustin", "mishustin"],
    tier: "tier_2_senior_political_judicial_military",
    role: "Prime Minister of the Russian Federation",
    rationale: "Head of government — sanctioned jurisdiction.",
    jurisdiction: "RU",
  },
  // China
  {
    names: ["xi jinping", "xi jin ping"],
    tier: "tier_1_head_of_state_or_gov",
    role: "General Secretary of the CCP and President of the People's Republic of China",
    rationale: "Serving head of state / party — tier-1 foreign PEP.",
    jurisdiction: "CN",
  },
  {
    names: ["li qiang"],
    tier: "tier_1_head_of_state_or_gov",
    role: "Premier of the State Council of the People's Republic of China",
    rationale: "Serving head of government.",
    jurisdiction: "CN",
  },
  // Turkey
  {
    names: ["recep tayyip erdogan", "erdogan", "recep tayyip erdoğan"],
    tier: "tier_1_head_of_state_or_gov",
    role: "President of Turkey — head of state and head of government",
    rationale: "Serving head of state.",
    jurisdiction: "TR",
  },
  // Saudi Arabia
  {
    names: ["mohammed bin salman", "mbs", "muhammad bin salman", "crown prince mohammed"],
    tier: "tier_1_head_of_state_or_gov",
    role: "Crown Prince and Prime Minister of Saudi Arabia",
    rationale: "Serving head of government (SA) — tier-1 foreign PEP.",
    jurisdiction: "SA",
  },
  {
    names: ["salman bin abdulaziz", "king salman"],
    tier: "tier_1_head_of_state_or_gov",
    role: "King of Saudi Arabia — head of state",
    rationale: "Serving head of state.",
    jurisdiction: "SA",
  },
  // UAE
  {
    names: [
      "mohammed bin rashid al maktoum",
      "sheikh mohammed bin rashid",
      "sheikh mohammed",
      "mbr",
    ],
    tier: "tier_1_head_of_state_or_gov",
    role: "Prime Minister and Vice President of the UAE — Ruler of Dubai",
    rationale: "Serving head of government (UAE) — domestic PEP.",
    jurisdiction: "AE",
  },
  {
    names: [
      "mohamed bin zayed al nahyan",
      "sheikh mohamed bin zayed",
      "mbz",
      "mohammed bin zayed",
    ],
    tier: "tier_1_head_of_state_or_gov",
    role: "President of the UAE — head of state, Ruler of Abu Dhabi",
    rationale: "Serving head of state — domestic PEP.",
    jurisdiction: "AE",
  },
  {
    names: ["hamdan bin mohammed al maktoum", "sheikh hamdan", "fazza"],
    tier: "tier_2_senior_political_judicial_military",
    role: "Crown Prince of Dubai — Deputy Ruler of Dubai",
    rationale: "Crown Prince and Deputy Prime Minister — family of serving head of government.",
    jurisdiction: "AE",
  },
  {
    names: ["mansour bin zayed al nahyan", "sheikh mansour"],
    tier: "tier_2_senior_political_judicial_military",
    role: "Vice President of the UAE; Deputy Prime Minister; Minister of Presidential Affairs",
    rationale: "Senior minister and member of ruling family — domestic PEP.",
    jurisdiction: "AE",
  },
  {
    names: ["hazza bin zayed al nahyan", "sheikh hazza"],
    tier: "tier_2_senior_political_judicial_military",
    role: "Deputy Chairman of the Abu Dhabi Executive Council",
    rationale: "Senior member of ruling family — close associate / family PEP.",
    jurisdiction: "AE",
  },
  // Iran
  {
    names: ["ali khamenei", "ayatollah khamenei", "supreme leader khamenei"],
    tier: "tier_1_head_of_state_or_gov",
    role: "Supreme Leader of Iran — highest authority in the Islamic Republic",
    rationale: "Supreme Leader — sanctioned jurisdiction, IRGC-linked.",
    jurisdiction: "IR",
  },
  {
    names: ["masoud pezeshkian", "pezeshkian"],
    tier: "tier_1_head_of_state_or_gov",
    role: "President of the Islamic Republic of Iran",
    rationale: "Serving head of state — OFAC/EU/UN sanctioned jurisdiction.",
    jurisdiction: "IR",
  },
  {
    names: ["ebrahim raisi", "ibrahim raisi"],
    tier: "tier_1_head_of_state_or_gov",
    role: "Former President of the Islamic Republic of Iran",
    rationale: "Former head of state — sanctioned jurisdiction.",
    jurisdiction: "IR",
  },
  // North Korea
  {
    names: ["kim jong un", "kim jung un", "kim jong-un"],
    tier: "tier_1_head_of_state_or_gov",
    role: "Supreme Leader of the Democratic People's Republic of Korea",
    rationale: "Head of state — UN/OFAC sanctioned, nuclear proliferation.",
    jurisdiction: "KP",
  },
  {
    names: ["kim yo jong", "kim yo-jong"],
    tier: "family",
    role: "Sister of Kim Jong Un; First Deputy Director of the Korean Workers' Party Propaganda Department",
    rationale: "Family of Supreme Leader — sanctions-adjacent senior official.",
    jurisdiction: "KP",
  },
  // Venezuela
  {
    names: ["nicolas maduro", "nicolas maduro moros", "maduro"],
    tier: "tier_1_head_of_state_or_gov",
    role: "President of Venezuela",
    rationale: "Serving head of state — OFAC/EU/UK designated.",
    jurisdiction: "VE",
  },
  // Belarus
  {
    names: ["alexander lukashenko", "aleksander lukashenko", "lukashenko"],
    tier: "tier_1_head_of_state_or_gov",
    role: "President of Belarus",
    rationale: "Serving head of state — EU/UK/US sanctioned.",
    jurisdiction: "BY",
  },
  // Syria
  {
    names: ["bashar al-assad", "bashar al assad", "bashar assad"],
    tier: "tier_1_head_of_state_or_gov",
    role: "Former President of Syria",
    rationale: "Former head of state — EU/UK/US/UN sanctioned; fled December 2024.",
    jurisdiction: "SY",
  },
  // Myanmar
  {
    names: ["min aung hlaing"],
    tier: "tier_1_head_of_state_or_gov",
    role: "Chairman of the State Administration Council — de facto head of state Myanmar",
    rationale: "Military junta leader — EU/US/UK sanctioned.",
    jurisdiction: "MM",
  },
  // Libya
  {
    names: ["muammar gaddafi", "muammar al-gaddafi", "gaddafi"],
    tier: "tier_1_head_of_state_or_gov",
    role: "Former Leader of Libya",
    rationale: "Former head of state — deceased; UN/EU/UK listed.",
    jurisdiction: "LY",
  },
  {
    names: ["saif al-islam gaddafi", "saif al islam gaddafi", "saif gaddafi"],
    tier: "family",
    role: "Son of Muammar Gaddafi; UN-listed",
    rationale: "Family of former head of state — UN 1970 sanctions.",
    jurisdiction: "LY",
  },
  // Zimbabwe
  {
    names: ["robert mugabe", "mugabe"],
    tier: "tier_1_head_of_state_or_gov",
    role: "Former President of Zimbabwe",
    rationale: "Former head of state — deceased; EU/UK/US listed.",
    jurisdiction: "ZW",
  },
  {
    names: ["emmerson mnangagwa", "mnangagwa"],
    tier: "tier_1_head_of_state_or_gov",
    role: "President of Zimbabwe",
    rationale: "Serving head of state — former ZANU-PF; sanctions history.",
    jurisdiction: "ZW",
  },
  // Iraq
  {
    names: ["nouri al-maliki", "nouri al maliki", "maliki"],
    tier: "tier_1_head_of_state_or_gov",
    role: "Former Prime Minister of Iraq; Vice President",
    rationale: "Former head of government — sectarian governance links.",
    jurisdiction: "IQ",
  },
  // Pakistan
  {
    names: ["imran khan", "imran ahmed khan niazi"],
    tier: "tier_1_head_of_state_or_gov",
    role: "Former Prime Minister of Pakistan",
    rationale: "Former head of government — adverse media, corruption charges.",
    jurisdiction: "PK",
  },
  {
    names: ["asif ali zardari"],
    tier: "tier_1_head_of_state_or_gov",
    role: "President of Pakistan; former co-chairman of PPP",
    rationale: "Serving head of state — historic corruption and money-laundering cases.",
    jurisdiction: "PK",
  },
  // Egypt
  {
    names: ["abdel fattah el-sisi", "el-sisi", "al-sisi"],
    tier: "tier_1_head_of_state_or_gov",
    role: "President of Egypt",
    rationale: "Serving head of state — foreign PEP.",
    jurisdiction: "EG",
  },
  // Nigeria
  {
    names: ["bola tinubu", "bola ahmed tinubu"],
    tier: "tier_1_head_of_state_or_gov",
    role: "President of Nigeria",
    rationale: "Serving head of state — adverse media on assets/corruption.",
    jurisdiction: "NG",
  },
  {
    names: ["goodluck jonathan"],
    tier: "tier_1_head_of_state_or_gov",
    role: "Former President of Nigeria",
    rationale: "Former head of state — corruption/oil-sector investigations.",
    jurisdiction: "NG",
  },
  // South Africa
  {
    names: ["cyril ramaphosa", "ramaphosa"],
    tier: "tier_1_head_of_state_or_gov",
    role: "President of South Africa",
    rationale: "Serving head of state — foreign PEP; Phala Phala adverse media.",
    jurisdiction: "ZA",
  },
  {
    names: ["jacob zuma", "jacob gedleyihlekisa zuma"],
    tier: "tier_1_head_of_state_or_gov",
    role: "Former President of South Africa",
    rationale: "Former head of state — multiple corruption and arms-deal investigations.",
    jurisdiction: "ZA",
  },
  // ─────────────────────────────────────────────────────────────────────────
  // TIER 2 — Senior Political / Judicial / Military
  // ─────────────────────────────────────────────────────────────────────────
  // Russia — senior officials
  {
    names: ["sergei lavrov", "sergey lavrov"],
    tier: "tier_2_senior_political_judicial_military",
    role: "Minister of Foreign Affairs of Russia",
    rationale: "Senior minister — EU/UK/US/UN sanctioned.",
    jurisdiction: "RU",
  },
  {
    names: ["sergei shoigu", "sergey shoigu"],
    tier: "tier_2_senior_political_judicial_military",
    role: "Former Minister of Defence of Russia; Secretary of the Security Council",
    rationale: "Senior minister — EU/UK/US sanctioned.",
    jurisdiction: "RU",
  },
  {
    names: ["nikolai patrushev", "nikolay patrushev"],
    tier: "tier_2_senior_political_judicial_military",
    role: "Former Secretary of the Security Council of Russia; aide to the President",
    rationale: "Senior security official — EU/UK/US sanctioned.",
    jurisdiction: "RU",
  },
  {
    names: ["igor sechin"],
    tier: "tier_3_state_owned_enterprise_exec",
    role: "CEO of Rosneft; former Deputy Prime Minister of Russia",
    rationale: "SOE CEO + former senior minister — OFAC/EU/UK designated.",
    jurisdiction: "RU",
  },
  {
    names: ["yevgeny prigozhin", "evgeny prigozhin", "пригожин"],
    tier: "tier_3_state_owned_enterprise_exec",
    role: "Founder of the Wagner Group; Concord Management",
    rationale: "Oligarch/paramilitary leader — OFAC/EU/UK sanctioned; deceased.",
    jurisdiction: "RU",
  },
  {
    names: ["roman abramovich"],
    tier: "tier_3_state_owned_enterprise_exec",
    role: "Russian oligarch; former owner Chelsea FC; owner Evraz",
    rationale: "Oligarch — EU/UK sanctioned; close associate of Putin.",
    jurisdiction: "RU",
  },
  {
    names: ["alisher usmanov"],
    tier: "tier_3_state_owned_enterprise_exec",
    role: "Russian oligarch; USM Holdings",
    rationale: "Oligarch — EU/UK sanctioned.",
    jurisdiction: "RU",
  },
  // Iran — IRGC
  {
    names: ["hossein salami", "hussein salami"],
    tier: "tier_2_senior_political_judicial_military",
    role: "Commander-in-Chief of the Islamic Revolutionary Guard Corps",
    rationale: "Senior military — IRGC commander; OFAC/EU/UK sanctioned.",
    jurisdiction: "IR",
  },
  {
    names: ["esmail qaani", "ismail ghaani"],
    tier: "tier_2_senior_political_judicial_military",
    role: "Commander of the IRGC Quds Force",
    rationale: "Quds Force commander — successor to Soleimani; OFAC designated.",
    jurisdiction: "IR",
  },
  // North Korea
  {
    names: ["choe son hui", "choe son-hui"],
    tier: "tier_2_senior_political_judicial_military",
    role: "Minister of Foreign Affairs of North Korea",
    rationale: "Senior minister — UN/OFAC sanctioned jurisdiction.",
    jurisdiction: "KP",
  },
  // Saudi Arabia — family/senior
  {
    names: ["turki al-faisal", "prince turki al faisal"],
    tier: "tier_2_senior_political_judicial_military",
    role: "Former Director of Saudi General Intelligence; former Ambassador to US/UK",
    rationale: "Senior intelligence official and member of Al Saud family.",
    jurisdiction: "SA",
  },
  // UAE — senior
  {
    names: ["abdulla bin zayed al nahyan", "sheikh abdulla bin zayed", "abz"],
    tier: "tier_2_senior_political_judicial_military",
    role: "Minister of Foreign Affairs of the UAE",
    rationale: "Senior minister — member of ruling family.",
    jurisdiction: "AE",
  },
  {
    names: ["thani al zeyoudi", "thani ahmed al zeyoudi"],
    tier: "tier_2_senior_political_judicial_military",
    role: "UAE Minister of State for Foreign Trade",
    rationale: "Senior minister — domestic PEP.",
    jurisdiction: "AE",
  },
  // China — SOE / party
  {
    names: ["wang yi"],
    tier: "tier_2_senior_political_judicial_military",
    role: "Director of the Office of the Central Foreign Affairs Commission; former Minister of Foreign Affairs",
    rationale: "Senior party official.",
    jurisdiction: "CN",
  },
  // ─────────────────────────────────────────────────────────────────────────
  // TIER 3 — SOE Executives
  // ─────────────────────────────────────────────────────────────────────────
  {
    names: ["alexei miller", "alexey miller"],
    tier: "tier_3_state_owned_enterprise_exec",
    role: "CEO of Gazprom",
    rationale: "SOE CEO — EU/UK sanctioned.",
    jurisdiction: "RU",
  },
  {
    names: ["andrey kostin", "andrei kostin"],
    tier: "tier_3_state_owned_enterprise_exec",
    role: "Former President and Chairman of VTB Bank",
    rationale: "SOE bank CEO — OFAC/EU/UK sanctioned.",
    jurisdiction: "RU",
  },
  {
    names: ["german gref"],
    tier: "tier_3_state_owned_enterprise_exec",
    role: "CEO of Sberbank",
    rationale: "SOE bank CEO — EU sanctioned.",
    jurisdiction: "RU",
  },
  // ─────────────────────────────────────────────────────────────────────────
  // FAMILY / RCA
  // ─────────────────────────────────────────────────────────────────────────
  {
    names: ["jared kushner"],
    tier: "close_associate",
    role: "Son-in-law and former Senior Advisor to President Trump",
    rationale: "Close associate / family of head of state — adverse media on Middle East deals.",
    jurisdiction: "US",
  },
  {
    names: ["ivanka trump"],
    tier: "family",
    role: "Daughter of President Trump; former Senior Advisor to the President",
    rationale: "Immediate family of head of state.",
    jurisdiction: "US",
  },
  {
    names: ["hunter biden"],
    tier: "family",
    role: "Son of former President Biden",
    rationale: "Family of former head of state — criminal proceedings, adverse media.",
    jurisdiction: "US",
  },
  {
    names: ["nikolai patrushev jr", "andrei patrushev"],
    tier: "family",
    role: "Son of Nikolai Patrushev; Deputy Energy Minister of Russia",
    rationale: "Family of senior official — EU sanctioned.",
    jurisdiction: "RU",
  },
  {
    names: ["katarina putin", "katerina tikhonova", "katerina vladimirovna tikhonova"],
    tier: "family",
    role: "Daughter of Vladimir Putin; head of Innopraktika",
    rationale: "Immediate family of head of state — EU/UK sanctioned.",
    jurisdiction: "RU",
  },
  {
    names: ["maria vorontsova", "maria putina"],
    tier: "family",
    role: "Daughter of Vladimir Putin; oncologist",
    rationale: "Immediate family of head of state — EU/UK sanctioned.",
    jurisdiction: "RU",
  },
  {
    names: ["kim ju ae", "kim주애"],
    tier: "family",
    role: "Daughter of Kim Jong Un — designated successor",
    rationale: "Immediate family of head of state.",
    jurisdiction: "KP",
  },
  {
    names: ["hamad bin mohammed al sharqi", "hamad al sharqi"],
    tier: "tier_2_senior_political_judicial_military",
    role: "Ruler of Fujairah — UAE Federal Supreme Council member",
    rationale: "UAE ruling family member and emirate ruler — domestic PEP.",
    jurisdiction: "AE",
  },
  {
    names: ["saud bin saqr al qasimi"],
    tier: "tier_2_senior_political_judicial_military",
    role: "Ruler of Ras Al Khaimah",
    rationale: "UAE ruling family member and emirate ruler — domestic PEP.",
    jurisdiction: "AE",
  },
  // Africa / AML-high-risk
  {
    names: ["teodorin obiang", "teodorin nguema obiang mangue"],
    tier: "family",
    role: "Vice President of Equatorial Guinea; son of President Teodoro Obiang",
    rationale: "Family of head of state — French asset forfeiture, money-laundering conviction.",
    jurisdiction: "GQ",
  },
  {
    names: ["teodoro obiang nguema mbasogo", "obiang"],
    tier: "tier_1_head_of_state_or_gov",
    role: "President of Equatorial Guinea",
    rationale: "World's longest-serving non-royal head of state — PEP.",
    jurisdiction: "GQ",
  },
  // ─────────────────────────────────────────────────────────────────────────
  // TIER 4 — Party Officials / Senior Civil Servants
  // ─────────────────────────────────────────────────────────────────────────
  {
    names: ["sergei kiriyenko", "sergey kiriyenko"],
    tier: "tier_4_party_official_senior_civil_servant",
    role: "First Deputy Chief of Staff of the Presidential Administration of Russia",
    rationale: "Senior civil servant — EU/UK sanctioned.",
    jurisdiction: "RU",
  },
  {
    names: ["vyacheslav volodin"],
    tier: "tier_4_party_official_senior_civil_servant",
    role: "Chairman of the State Duma of Russia",
    rationale: "Senior legislative official — EU/UK sanctioned.",
    jurisdiction: "RU",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// ADVERSE MEDIA SUBJECTS
// ─────────────────────────────────────────────────────────────────────────────
const ADVERSE: KnownAdverse[] = [
  {
    names: ["ozcan halac", "özcan halaç", "ozcan halaç"],
    categories: [
      { categoryId: "corruption_organised_crime", keyword: "investigation" },
      { categoryId: "legal_criminal_regulatory", keyword: "proceedings" },
    ],
    keywords: ["investigation", "alleged", "proceedings"],
    rationale: "Subject name appears in open-source adverse-media coverage — requires analyst review.",
  },
  {
    names: ["yevgeny prigozhin", "evgeny prigozhin"],
    categories: [
      { categoryId: "terrorism_financing", keyword: "mercenary" },
      { categoryId: "organised_crime", keyword: "wagner" },
      { categoryId: "sanctions", keyword: "designated" },
    ],
    keywords: ["wagner", "mercenary", "designated", "sanctions", "paramilitary"],
    rationale: "OFAC/EU/UK designated — Wagner Group founder; adverse media extensively documented.",
  },
  {
    names: ["roman abramovich"],
    categories: [
      { categoryId: "sanctions", keyword: "sanctioned" },
      { categoryId: "bribery_corruption", keyword: "oligarch" },
    ],
    keywords: ["sanctions", "oligarch", "sanctioned", "asset freeze"],
    rationale: "EU/UK sanctioned oligarch — asset freeze, adverse media.",
  },
  {
    names: ["jacob zuma"],
    categories: [
      { categoryId: "bribery_corruption", keyword: "corruption" },
      { categoryId: "legal_criminal_regulatory", keyword: "arms deal" },
    ],
    keywords: ["corruption", "arms deal", "state capture", "prosecution", "kleptocracy"],
    rationale: "Former head of state — multiple corruption prosecutions, state capture inquiry.",
  },
  {
    names: ["teodorin obiang", "teodorin nguema obiang mangue"],
    categories: [
      { categoryId: "money_laundering", keyword: "laundering" },
      { categoryId: "bribery_corruption", keyword: "corruption" },
    ],
    keywords: ["money laundering", "corruption", "asset forfeiture", "conviction", "kleptocracy"],
    rationale: "French money-laundering conviction; asset forfeiture proceedings in multiple jurisdictions.",
  },
  {
    names: ["hunter biden"],
    categories: [
      { categoryId: "legal_criminal_regulatory", keyword: "criminal" },
      { categoryId: "tax_crime", keyword: "tax" },
    ],
    keywords: ["criminal", "tax", "gun charge", "conviction", "plea"],
    rationale: "Criminal proceedings — tax charges and firearms conviction.",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Lookup helpers
// ─────────────────────────────────────────────────────────────────────────────
function norm(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function lookupKnownPEP(name: string): KnownPEP | null {
  const q = norm(name);
  if (!q) return null;
  for (const p of PEPS) {
    for (const alias of p.names) {
      if (norm(alias) === q) return p;
    }
  }
  return null;
}

export function lookupKnownAdverse(name: string): KnownAdverse | null {
  const q = norm(name);
  if (!q) return null;
  for (const a of ADVERSE) {
    for (const alias of a.names) {
      if (norm(alias) === q) return a;
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// LIVE EXTENSION — OpenSanctions PEP fallback
// ─────────────────────────────────────────────────────────────────────────────
// When the static list above doesn't match a name, query OpenSanctions
// /search/peps as an enrichment. Results are mapped to the same KnownPEP
// shape so downstream consumers (super-brain, ai-decision, pep-profile)
// don't need to branch on origin. Cached per-name for 30 minutes to
// avoid hammering the free tier on repeated screenings of the same subject.
//
// Free tier works without OPENSANCTIONS_API_KEY but is rate-limited;
// setting the env var unlocks higher quota.

interface PepCacheEntry { value: KnownPEP | null; expiresAt: number }
const _livePepCache = new Map<string, PepCacheEntry>();
const LIVE_PEP_CACHE_TTL_MS = 30 * 60 * 1_000;
const LIVE_PEP_TIMEOUT_MS = 6_000;

function tierFromOpenSanctionsTopics(topics: string[]): KnownPEP["tier"] {
  const set = new Set(topics.map((t) => t.toLowerCase()));
  if (set.has("role.pep") && (set.has("gov.head") || set.has("gov.executive"))) {
    return "tier_1_head_of_state_or_gov";
  }
  if (set.has("role.pep") && (set.has("gov.national") || set.has("gov.judicial") || set.has("gov.military"))) {
    return "tier_2_senior_political_judicial_military";
  }
  if (set.has("role.soe") || set.has("corp.executive")) {
    return "tier_3_state_owned_enterprise_exec";
  }
  if (set.has("role.rca")) return "close_associate";
  if (set.has("role.family")) return "family";
  return "tier_4_party_official_senior_civil_servant";
}

/**
 * Async PEP lookup with live OpenSanctions enrichment. Returns the static
 * entry if one matches by name; otherwise consults OpenSanctions and
 * caches the result (positive or negative) for 30 minutes.
 *
 * Callers that cannot await (synchronous brain hot paths) should keep
 * using `lookupKnownPEP()`. New consumers and slow paths should prefer
 * this function.
 */
export async function lookupKnownPEPLive(name: string): Promise<KnownPEP | null> {
  const staticHit = lookupKnownPEP(name);
  if (staticHit) return staticHit;

  const q = norm(name);
  if (!q) return null;

  const cached = _livePepCache.get(q);
  if (cached && Date.now() < cached.expiresAt) return cached.value;

  // Skip live query if explicitly disabled — useful for tests / air-gapped
  // deployments where outbound network is restricted.
  if (process.env["OPENSANCTIONS_LIVE_PEP"] === "false") {
    _livePepCache.set(q, { value: null, expiresAt: Date.now() + LIVE_PEP_CACHE_TTL_MS });
    return null;
  }

  try {
    const url = new URL("https://api.opensanctions.org/search/peps");
    url.searchParams.set("q", name);
    url.searchParams.set("limit", "1");
    const headers: Record<string, string> = { accept: "application/json" };
    const apiKey = process.env["OPENSANCTIONS_API_KEY"];
    if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), LIVE_PEP_TIMEOUT_MS);
    let resJson: { results?: Array<{ caption?: string; properties?: Record<string, unknown>; datasets?: string[] }> };
    try {
      const res = await fetch(url.toString(), { headers, signal: ctrl.signal });
      if (!res.ok) {
        _livePepCache.set(q, { value: null, expiresAt: Date.now() + LIVE_PEP_CACHE_TTL_MS });
        return null;
      }
      resJson = await res.json() as typeof resJson;
    } finally {
      clearTimeout(t);
    }

    const top = resJson.results?.[0];
    if (!top) {
      _livePepCache.set(q, { value: null, expiresAt: Date.now() + LIVE_PEP_CACHE_TTL_MS });
      return null;
    }

    const props = (top.properties ?? {}) as Record<string, unknown>;
    const topics: string[] = Array.isArray(props["topics"]) ? (props["topics"] as string[]) : [];
    const positions: string[] = Array.isArray(props["position"]) ? (props["position"] as string[]) : [];
    const countries: string[] = Array.isArray(props["country"]) ? (props["country"] as string[]) : [];
    const aliases: string[] = Array.isArray(props["alias"]) ? (props["alias"] as string[]) : [];
    const tier = tierFromOpenSanctionsTopics(topics);
    const out: KnownPEP = {
      names: [top.caption ?? name, ...aliases].filter(Boolean).slice(0, 6),
      tier,
      role: positions.slice(0, 2).join("; ") || "PEP (OpenSanctions classification)",
      rationale: `OpenSanctions PEP entry — datasets: ${(top.datasets ?? []).slice(0, 4).join(", ") || "n/a"}; topics: ${topics.slice(0, 4).join(", ") || "n/a"}.`,
      ...(countries[0] ? { jurisdiction: countries[0] } : {}),
    };
    _livePepCache.set(q, { value: out, expiresAt: Date.now() + LIVE_PEP_CACHE_TTL_MS });
    return out;
  } catch {
    // Network / timeout / parse failure — cache the negative briefly so
    // we don't retry on every screening for the next 30 min.
    _livePepCache.set(q, { value: null, expiresAt: Date.now() + LIVE_PEP_CACHE_TTL_MS });
    return null;
  }
}

export { PEPS as KNOWN_PEPS, ADVERSE as KNOWN_ADVERSE };
