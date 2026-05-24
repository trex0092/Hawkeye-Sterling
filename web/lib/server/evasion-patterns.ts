// Hawkeye Sterling — Extended Sanctions Evasion Pattern Library
// 10+ FATF-aligned typology patterns with keyword/heuristic context matching.

export interface EvasionPattern {
  id: string;
  name: string;
  description: string;
  indicators: string[];
  riskWeight: number;  // 0–1
  typology: string;    // FATF typology reference
}

// ---------------------------------------------------------------------------
// Extended evasion pattern library
// ---------------------------------------------------------------------------

export const EXTENDED_EVASION_PATTERNS: EvasionPattern[] = [
  // Transliteration / script-switching evasion
  {
    id: "transliteration_switch",
    name: "Script Transliteration Evasion",
    description: "Entity name alternates between scripts (Arabic↔Latin) across documents",
    indicators: ["multiple script forms of same name", "name components reordered", "diacritics removed"],
    riskWeight: 0.8,
    typology: "FATF-R16",
  },

  // Date of birth shifting
  {
    id: "dob_shift",
    name: "Date of Birth Manipulation",
    description: "DOB differs by 1–2 years or day/month transposition vs. known records",
    indicators: ["day/month swap", "year +/-1 vs. sanctions list", "partial DOB omission"],
    riskWeight: 0.9,
    typology: "FATF-R10",
  },

  // Beneficial ownership layering
  {
    id: "ubo_layering",
    name: "Beneficial Ownership Layering",
    description: "Complex chain of entities obscures ultimate beneficial owner",
    indicators: ["3+ corporate layers", "multiple jurisdictions", "bearer shares", "nominee directors"],
    riskWeight: 0.85,
    typology: "FATF-R24",
  },

  // Trade-based money laundering
  {
    id: "tbml_over_under",
    name: "Trade-Based ML: Over/Under Invoicing",
    description: "Invoice value deviates significantly from market price",
    indicators: ["price >30% above/below market", "dual invoicing", "phantom shipment"],
    riskWeight: 0.75,
    typology: "FATF-R16",
  },

  // Virtual asset layering
  {
    id: "va_layering",
    name: "Virtual Asset Layering",
    description: "Funds moved through multiple crypto wallets or mixers before reaching VASP",
    indicators: ["mixer/tumbler use", "rapid wallet hopping", "chain-hopping", "privacy coin conversion"],
    riskWeight: 0.9,
    typology: "FATF-R15",
  },

  // Shell company network
  {
    id: "shell_network",
    name: "Shell Company Network",
    description: "Multiple shell companies with no staff, no revenue, same registered address",
    indicators: ["same registered agent", "no employees", "no operational activity", "recurring inter-company loans"],
    riskWeight: 0.8,
    typology: "FATF-R24",
  },

  // Smurfing / structuring
  {
    id: "smurfing",
    name: "Smurfing / Structuring",
    description: "Multiple transactions just below reporting threshold from related parties",
    indicators: ["transactions clustered just below threshold", "multiple senders to same recipient", "timing correlation"],
    riskWeight: 0.85,
    typology: "FATF-R16",
  },

  // Passport shopping / CBI
  {
    id: "passport_shopping",
    name: "Citizenship-by-Investment / Passport Shopping",
    description: "Subject holds passports from multiple high-risk CBI jurisdictions",
    indicators: ["3+ nationalities", "CBI jurisdiction (Vanuatu, St Kitts, Grenada)", "recent citizenship acquisition"],
    riskWeight: 0.7,
    typology: "FATF-R10",
  },

  // Hawala / informal value transfer
  {
    id: "hawala",
    name: "Hawala / Informal Value Transfer",
    description: "Payments settled without corresponding wire transfers; informal settlement networks",
    indicators: ["no bank wire for large settlements", "informal agent network", "Gulf/South Asia cross-border cash"],
    riskWeight: 0.8,
    typology: "FATF-R14",
  },

  // Real estate money laundering
  {
    id: "real_estate_ml",
    name: "Real Estate Money Laundering",
    description: "High-value real estate purchase in cash or via opaque structures",
    indicators: ["cash purchase >$500k", "shell company buyer", "price below market", "immediate resale"],
    riskWeight: 0.75,
    typology: "FATF-R22",
  },

  // Correspondent banking exploitation
  {
    id: "correspondent_banking",
    name: "Correspondent Banking Exploitation",
    description: "Nested correspondent banking relationships used to obscure the originator",
    indicators: ["nested accounts", "payable-through accounts", "high-volume low-value transfers", "offshore respondent bank"],
    riskWeight: 0.8,
    typology: "FATF-R13",
  },

  // PEP family network abuse
  {
    id: "pep_family_network",
    name: "PEP Family / Associate Network",
    description: "Politically exposed person uses close associates or family members to hold assets",
    indicators: ["spouse/child as beneficial owner", "same-address relatives", "recent asset transfer to family", "joint account with PEP"],
    riskWeight: 0.85,
    typology: "FATF-R12",
  },
];

// ---------------------------------------------------------------------------
// Context object for matching
// ---------------------------------------------------------------------------

export interface MatchContext {
  subjectName?: string;
  aliases?: string[];
  entityType?: string;           // "individual" | "company" | "trust" | "vessel" etc.
  jurisdiction?: string;         // ISO-2 country code
  transactionNarrative?: string; // free text from transaction
  corporateLayers?: number;      // number of corporate entity layers
  cryptoAddresses?: string[];    // wallet addresses associated with subject
  passportCount?: number;        // number of passports held
}

export interface PatternMatch {
  pattern: EvasionPattern;
  matchedIndicators: string[];
  confidence: number; // 0–1
}

// ---------------------------------------------------------------------------
// Keyword extraction helpers
// ---------------------------------------------------------------------------

/** Normalise a text blob to lowercase tokens for keyword matching. */
function normalize(text: string | undefined): string {
  return (text ?? "").toLowerCase();
}

/** Returns the combined searchable text from the context. */
function buildSearchText(ctx: MatchContext): string {
  return [
    ctx.subjectName,
    ...(ctx.aliases ?? []),
    ctx.entityType,
    ctx.jurisdiction,
    ctx.transactionNarrative,
  ]
    .filter(Boolean)
    .map(normalize)
    .join(" ");
}

// ---------------------------------------------------------------------------
// Pattern-specific match functions
// ---------------------------------------------------------------------------

function matchTransliterationSwitch(ctx: MatchContext, text: string): string[] {
  const matched: string[] = [];
  // Arabic/Cyrillic characters in subject name or aliases alongside Latin
  const hasArabic = /[؀-ۿ]/.test(ctx.subjectName ?? "") ||
    (ctx.aliases ?? []).some((a) => /[؀-ۿ]/.test(a));
  const hasCyrillic = /[Ѐ-ӿ]/.test(ctx.subjectName ?? "") ||
    (ctx.aliases ?? []).some((a) => /[Ѐ-ӿ]/.test(a));
  const hasLatin = /[a-zA-Z]/.test(ctx.subjectName ?? "");
  if (hasArabic && hasLatin) matched.push("multiple script forms of same name");
  if (hasCyrillic && hasLatin) matched.push("multiple script forms of same name");
  if ((ctx.aliases?.length ?? 0) >= 3) matched.push("name components reordered");
  if (text.includes("diacritic") || text.includes("transliterat")) matched.push("diacritics removed");
  return matched;
}

function matchDobShift(text: string): string[] {
  const matched: string[] = [];
  if (text.includes("dob") || text.includes("date of birth") || text.includes("birth date")) {
    if (text.includes("swap") || text.includes("transpos")) matched.push("day/month swap");
    if (text.includes("year") || text.includes("+1") || text.includes("-1")) matched.push("year +/-1 vs. sanctions list");
    if (text.includes("partial") || text.includes("omit") || text.includes("unknown dob")) matched.push("partial DOB omission");
    if (matched.length === 0) matched.push("partial DOB omission"); // generic DOB flag
  }
  return matched;
}

function matchUboLayering(ctx: MatchContext, text: string): string[] {
  const matched: string[] = [];
  if ((ctx.corporateLayers ?? 0) >= 3) matched.push("3+ corporate layers");
  if (text.includes("nominee") || text.includes("nominee director")) matched.push("nominee directors");
  if (text.includes("bearer share")) matched.push("bearer shares");
  // Multiple jurisdictions if corporateLayers >= 2 and jurisdiction context present
  if ((ctx.corporateLayers ?? 0) >= 2 && ctx.jurisdiction) matched.push("multiple jurisdictions");
  if (text.includes("layering") || text.includes("complex structure") || text.includes("offshore")) {
    if (matched.length === 0) matched.push("multiple jurisdictions");
  }
  return matched;
}

function matchTbml(text: string): string[] {
  const matched: string[] = [];
  if (text.includes("invoice") || text.includes("trade") || text.includes("shipment") || text.includes("cargo")) {
    if (text.includes("over") || text.includes("under") || text.includes("inflat") || text.includes("deflat")) {
      matched.push("price >30% above/below market");
    }
    if (text.includes("dual invoice") || text.includes("double invoice")) matched.push("dual invoicing");
    if (text.includes("phantom") || text.includes("fictitious shipment") || text.includes("ghost shipment")) {
      matched.push("phantom shipment");
    }
    if (matched.length === 0 && (text.includes("trade finance") || text.includes("letter of credit"))) {
      matched.push("price >30% above/below market");
    }
  }
  return matched;
}

function matchVaLayering(ctx: MatchContext, text: string): string[] {
  const matched: string[] = [];
  const hasCrypto = (ctx.cryptoAddresses?.length ?? 0) > 0;
  if (hasCrypto || text.includes("crypto") || text.includes("bitcoin") || text.includes("wallet") || text.includes("blockchain")) {
    if (text.includes("mixer") || text.includes("tumbler") || text.includes("tornado")) matched.push("mixer/tumbler use");
    if (text.includes("rapid") || text.includes("wallet hopping") || text.includes("chain hop")) matched.push("rapid wallet hopping");
    if (text.includes("chain-hop") || text.includes("bridge") || text.includes("cross-chain")) matched.push("chain-hopping");
    if (text.includes("monero") || text.includes("zcash") || text.includes("privacy coin")) matched.push("privacy coin conversion");
    if (hasCrypto && matched.length === 0) matched.push("rapid wallet hopping");
  }
  return matched;
}

function matchShellNetwork(text: string): string[] {
  const matched: string[] = [];
  if (text.includes("shell") || text.includes("nominee") || text.includes("letterbox")) {
    if (text.includes("same agent") || text.includes("registered agent") || text.includes("same address")) matched.push("same registered agent");
    if (text.includes("no employee") || text.includes("no staff") || text.includes("zero employee")) matched.push("no employees");
    if (text.includes("no revenue") || text.includes("no activit") || text.includes("dormant")) matched.push("no operational activity");
    if (text.includes("inter-company loan") || text.includes("intercompany") || text.includes("related party loan")) matched.push("recurring inter-company loans");
    if (matched.length === 0) matched.push("same registered agent");
  }
  return matched;
}

function matchSmurfing(text: string): string[] {
  const matched: string[] = [];
  const keywords = ["structur", "smurf", "threshold", "below reporting", "split payment", "multiple transfer"];
  if (keywords.some((kw) => text.includes(kw))) {
    if (text.includes("threshold") || text.includes("below reporting") || text.includes("just under")) {
      matched.push("transactions clustered just below threshold");
    }
    if (text.includes("multiple sender") || text.includes("related sender") || text.includes("split payment")) {
      matched.push("multiple senders to same recipient");
    }
    if (text.includes("timing") || text.includes("coordinated") || text.includes("simultaneous")) {
      matched.push("timing correlation");
    }
    if (matched.length === 0) matched.push("transactions clustered just below threshold");
  }
  return matched;
}

function matchPassportShopping(ctx: MatchContext, text: string): string[] {
  const matched: string[] = [];
  const cbiJurisdictions = ["vanuatu", "st kitts", "saint kitts", "grenada", "dominica", "malta", "cyprus", "antigua"];
  const hasCbi = cbiJurisdictions.some((j) => text.includes(j)) || text.includes("citizenship by investment") || text.includes("cbi");
  const passportCount = ctx.passportCount ?? 0;
  if (passportCount >= 3) matched.push("3+ nationalities");
  if (hasCbi) matched.push("CBI jurisdiction (Vanuatu, St Kitts, Grenada)");
  if (text.includes("recent citizenship") || text.includes("newly acquired") || text.includes("acquired citizenship")) {
    matched.push("recent citizenship acquisition");
  }
  return matched;
}

function matchHawala(text: string): string[] {
  const matched: string[] = [];
  if (text.includes("hawala") || text.includes("hundi") || text.includes("informal transfer") || text.includes("informal value")) {
    if (text.includes("no wire") || text.includes("no bank") || text.includes("no swift")) matched.push("no bank wire for large settlements");
    if (text.includes("agent") || text.includes("broker") || text.includes("intermediary")) matched.push("informal agent network");
    if (text.includes("gulf") || text.includes("south asia") || text.includes("remittance") || text.includes("cash")) {
      matched.push("Gulf/South Asia cross-border cash");
    }
    if (matched.length === 0) matched.push("informal agent network");
  }
  return matched;
}

function matchRealEstateML(text: string): string[] {
  const matched: string[] = [];
  const reKeywords = ["real estate", "property", "land", "house", "villa", "apartment", "commercial property"];
  if (reKeywords.some((kw) => text.includes(kw))) {
    if (text.includes("cash purchase") || text.includes("cash buyer") || text.includes("paid in cash")) {
      matched.push("cash purchase >$500k");
    }
    if (text.includes("shell") || text.includes("nominee buyer") || text.includes("company buyer")) {
      matched.push("shell company buyer");
    }
    if (text.includes("below market") || text.includes("undervalue") || text.includes("under-market")) {
      matched.push("price below market");
    }
    if (text.includes("immediate resale") || text.includes("quick resale") || text.includes("flip")) {
      matched.push("immediate resale");
    }
    if (matched.length === 0) matched.push("shell company buyer");
  }
  return matched;
}

function matchCorrespondentBanking(text: string): string[] {
  const matched: string[] = [];
  if (text.includes("correspondent") || text.includes("respondent bank") || text.includes("nested account") || text.includes("payable-through")) {
    if (text.includes("nested") || text.includes("nesting")) matched.push("nested accounts");
    if (text.includes("payable-through") || text.includes("payable through")) matched.push("payable-through accounts");
    if (text.includes("high volume") || text.includes("large number of transfer")) matched.push("high-volume low-value transfers");
    if (text.includes("offshore") || text.includes("respondent")) matched.push("offshore respondent bank");
    if (matched.length === 0) matched.push("nested accounts");
  }
  return matched;
}

function matchPepFamilyNetwork(text: string): string[] {
  const matched: string[] = [];
  if (text.includes("pep") || text.includes("politically exposed") || text.includes("family") || text.includes("associate")) {
    if (text.includes("spouse") || text.includes("wife") || text.includes("husband") || text.includes("child") || text.includes("son") || text.includes("daughter")) {
      matched.push("spouse/child as beneficial owner");
    }
    if (text.includes("same address") || text.includes("same-address") || text.includes("same residence")) {
      matched.push("same-address relatives");
    }
    if (text.includes("transfer") || text.includes("gift") || text.includes("asset transfer")) {
      matched.push("recent asset transfer to family");
    }
    if (text.includes("joint account") || text.includes("joint holder")) {
      matched.push("joint account with PEP");
    }
    if (matched.length === 0 && (text.includes("politically exposed") || text.includes("pep"))) {
      matched.push("spouse/child as beneficial owner");
    }
  }
  return matched;
}

// ---------------------------------------------------------------------------
// Main matching function
// ---------------------------------------------------------------------------

/** Runs heuristic keyword matching against all evasion patterns.
 *  Returns only patterns with at least one matched indicator. */
export function matchEvasionPatterns(ctx: MatchContext): PatternMatch[] {
  const text = buildSearchText(ctx);
  const results: PatternMatch[] = [];

  const patternMatchers: [string, (ctx: MatchContext, text: string) => string[]][] = [
    ["transliteration_switch", (c, t) => matchTransliterationSwitch(c, t)],
    ["dob_shift",              (_c, t) => matchDobShift(t)],
    ["ubo_layering",           (c, t) => matchUboLayering(c, t)],
    ["tbml_over_under",        (_c, t) => matchTbml(t)],
    ["va_layering",            (c, t) => matchVaLayering(c, t)],
    ["shell_network",          (_c, t) => matchShellNetwork(t)],
    ["smurfing",               (_c, t) => matchSmurfing(t)],
    ["passport_shopping",      (c, t) => matchPassportShopping(c, t)],
    ["hawala",                 (_c, t) => matchHawala(t)],
    ["real_estate_ml",         (_c, t) => matchRealEstateML(t)],
    ["correspondent_banking",  (_c, t) => matchCorrespondentBanking(t)],
    ["pep_family_network",     (_c, t) => matchPepFamilyNetwork(t)],
  ];

  for (const [id, matcher] of patternMatchers) {
    const pattern = EXTENDED_EVASION_PATTERNS.find((p) => p.id === id);
    if (!pattern) continue;

    const matchedIndicators = matcher(ctx, text);
    if (matchedIndicators.length === 0) continue;

    // Confidence: ratio of matched indicators to total indicators, weighted by riskWeight
    const rawConfidence = matchedIndicators.length / pattern.indicators.length;
    const confidence = Math.min(1, rawConfidence * pattern.riskWeight + pattern.riskWeight * 0.2);

    results.push({
      pattern,
      matchedIndicators,
      confidence: Math.round(confidence * 100) / 100,
    });
  }

  // Sort by confidence descending
  results.sort((a, b) => b.confidence - a.confidence);
  return results;
}
