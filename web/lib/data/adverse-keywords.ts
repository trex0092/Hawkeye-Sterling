// Hawkeye Sterling — adverse-media keyword classifier.
//
// The classic AML/CFT adverse-media keyword set operators use in news-ingest
// alert queries, grouped by financial-crime family so each hit carries the
// typology it signals. This is the "100% right information" layer: if any of
// these terms appear in a subject's metadata, alt names, role text or media
// snippet, they fire here with the full group context.
//
// Designed to complement the 5-class classifyAdverseMedia() from the brain
// and the 28-class ESG classifier — this one is the named-keyword floor.

export type AdverseKeywordGroup =
  | "money-laundering"
  | "bribery-corruption"
  | "terrorism-financing"
  | "proliferation-wmd"
  | "organised-crime"
  | "human-trafficking"
  | "cybercrime"
  | "fraud-forgery"
  | "tax-crime"
  | "market-abuse"
  | "law-enforcement"
  | "regulatory-action"
  | "political-exposure"
  | "ai-misuse"
  | "insider-threat"
  | "environmental-crime";

export interface AdverseKeywordRule {
  group: AdverseKeywordGroup;
  label: string;
  // All terms are matched case-insensitively as whole-substring.
  terms: string[];
}

export const ADVERSE_KEYWORDS: AdverseKeywordRule[] = [
  {
    group: "money-laundering",
    label: "Money laundering & financial crime",
    terms: [
      "money laundering", "money launder", "launder",
      "financial crime", "economic crime",
      "embezzle", "embezzlement", "misappropriation", "asset misappropriation",
      "extort", "extortion", "kickback",
      // Wave 4 typologies — placement / layering / integration vehicles.
      "shell company", "shell structure", "shell entity",
      "trade-based money laundering", "tbml",
      "round-tripping", "round tripping", "smurfing", "cuckoo smurfing",
      "real estate laundering", "real-estate laundering", "property laundering",
      "luxury goods laundering", "art laundering", "yacht laundering",
      "crypto laundering", "crypto mixer", "crypto tumbler",
      "chain hopping", "chain-hopping",
      // DPMS sector laundering typologies (gold as placement vehicle)
      "gold laundering", "precious metals laundering", "gold as currency",
      "dpms", "dealer in precious metals", "dealer in precious stones",
      "cash for gold", "gold bar scheme", "bullion fraud", "gold vault fraud",
      "jewellery laundering", "diamond laundering",
      // Transaction structuring (Smurfing without using the word)
      // "structuring" omitted bare — indexOf matches "restructuring" (false positive).
      "transaction structuring", "cash structuring", "deposit structuring",
      "structured deposits", "structured payments",
      // Informal value transfer — major UAE/DPMS risk vector
      "hawala", "hundi", "fei-ch'ien", "informal value transfer",
      "underground banking", "informal remittance", "unregulated remittance",
      // Mule and nominee networks
      "money mule", "mule account", "mule network", "account mule",
      "nominee account", "nominee director", "nominee shareholder",
      "bearer shares", "bearer bonds", "bearer instrument",
      "beneficial ownership concealment", "hidden ownership",
      // Trade-based ML
      "over-invoicing", "under-invoicing", "mis-invoicing", "trade misinvoicing",
      "false invoice", "phantom invoice", "multiple invoicing", "document fraud",
      "phantom shipment", "ghost shipment",
      // VAT / carousel fraud (major UAE gold vector)
      "carousel fraud", "missing trader fraud", "missing trader",
      "vat carousel", "intra-community fraud",
      // Layering vehicles
      "layering scheme", "placement scheme",
      "ghost company", "phantom company", "front company",
      // Bulk cash & complex schemes
      "bulk cash smuggling", "bulk cash",
      "loan back scheme", "back-to-back loan", "back-to-back loan scheme",
      "mirror trading", "mirror trade",
      "payable through account", "nested account", "correspondent banking abuse",
      "cash intensive business",
      "commingling of funds", "commingling funds",
      "proceeds of crime", "criminal proceeds", "illicit proceeds",
      "slush fund",
    ],
  },
  {
    group: "bribery-corruption",
    label: "Bribery & corruption",
    terms: [
      "bribe", "bribery", "corrupt", "corruption",
      "abuse of power", "conflict of interest", "misuse of funds",
      "kleptocracy", "state capture",
      "facilitation payment", "grease payment",
      "nepotism", "cronyism", "patronage network",
      "bid rigging", "collusion", "cartel behaviour", "cartel behavior",
      "graft", "embezzlement of public funds", "misappropriation of public funds",
      "diversion of funds", "diversion of public funds",
      "influence peddling", "pay-to-play", "pay to play",
      "kickback scheme",
      "slush fund",
      "backhander", "baksheesh", "mordida", "sweetener payment",
      "procurement fraud", "public procurement fraud",
      "tender rigging", "tender fraud", "contract fraud",
      "brown envelope",
      "illicit enrichment", "unexplained wealth", "unexplained wealth order",
      "politically motivated payment",
    ],
  },
  {
    group: "terrorism-financing",
    label: "Terrorism & CFT",
    terms: [
      "terrorism", "terrorist", "terrorist financing",
      "financing of terrorism", "terror funding",
      "extremist", "radicalisation", "radicalization",
      "designated terrorist", "militant",
      // Terror networks — avoid bare "isis" (substring of "crisis")
      "islamic state", "daesh", "isil", "al-qaeda", "al qaeda",
      "hezbollah", "hamas", "al-shabaab", "boko haram", "ltte",
      "jihadist", "jihad network",
      "terror cell", "terror network", "sleeper cell",
      "foreign terrorist fighter", "foreign fighter",
      "hawala network", "hawaldar",
      "terror financing network", "terrorist financing network",
      "radicalised", "radicalized individual",
      "extremist cell", "extremist network", "extremist funding",
      "violent extremism", "support for terrorism",
      "jihadist financing", "jihad funding",
      "suicide bomb", "suicide attack",
      "bomb plot", "bomb making",
    ],
  },
  {
    group: "proliferation-wmd",
    label: "Proliferation financing & WMD",
    terms: [
      "proliferation financing",
      "weapons of mass destruction", "wmd",
      "dual-use", "dual use",
      "sanctions evasion", "sanction evasion",
      "arms trafficking", "weapons smuggling",
      "nuclear", "chemical weapons", "biological weapons",
      // Wave 4 — export-control / dual-use diversion typologies.
      "missile technology", "end-user diversion", "end user diversion",
      "export control violation", "trans-shipment", "transhipment",
      // Wave 5 — arms trade / broker / embargo terms missing from prior waves.
      "arms dealer", "arms trade", "arms broker", "arms embargo",
      "gunrunning", "gun dealer", "gun runner", "gun trafficking",
      "illicit arms", "illegal arms", "weapons dealer", "weapons trade",
      "weapons broker", "small arms", "light weapons", "salw",
      "conventional weapons", "munitions", "explosives trafficking",
      "military equipment", "defense export", "defence export",
      "weapons of mass", "dirty bomb", "radiological weapon",
      "cbrn", "cbrn weapon",
      "ballistic missile", "cruise missile", "hypersonic weapon",
      "nuclear material smuggling", "radioactive material smuggling",
    ],
  },
  {
    group: "organised-crime",
    label: "Organised crime & narcotics",
    terms: [
      "organised crime", "organized crime",
      "drug trafficking", "narcotics", "cartel", "mafia",
      "criminal network", "criminal enterprise", "criminal organisation", "criminal organization",
      "criminal syndicate", "syndicate", "underworld",
      "cocaine", "heroin", "fentanyl", "methamphetamine", "amphetamine",
      "drug lord", "drug kingpin", "drug baron", "drug dealer",
      "extortion racket", "protection racket",
      "racketeering", "racketeer", "rico violation",
      "loan sharking", "loan shark",
      "illegal gambling", "unlicensed gambling", "gambling fraud",
      "transnational crime", "transnational criminal organisation",
      "human smuggling", "migrant smuggling",
      "gang member", "gang violence", "gang-related",
      // DPMS / precious-metals illicit trade — critical for UAE gold dealer context
      "gold smuggling", "gold traffick", "precious metals smuggling", "precious metal smuggling",
      "diamond smuggling", "diamond traffick", "gemstone smuggling",
      "illicit gold", "contraband gold", "illegal gold", "gold dealer arrested",
      "smuggling ring", "illicit trade", "contraband", "smuggled gold",
      // Factual descriptions of gold-transport offences (no "smuggling" word)
      "gold bars", "gold bar", "gold bullion", "gold bricks", "gold nugget",
      "pounds of gold", "kilos of gold", "kilograms of gold", "ounces of gold",
      "gold in luggage", "gold in their luggage", "gold in his luggage",
      "undeclared gold", "unreported gold", "undisclosed gold",
      "customs with gold", "airport with gold", "border with gold",
    ],
  },
  {
    group: "human-trafficking",
    label: "Human trafficking & slavery",
    terms: [
      "human trafficking", "people smuggling",
      "forced labour", "forced labor",
      "modern slavery", "child labor", "child labour",
      "wildlife trafficking",
      // Wave 4 — trafficking typologies split by exploitation mode.
      "sex trafficking", "labor trafficking", "labour trafficking",
      "debt bondage", "domestic servitude", "organ trafficking",
      "forced marriage",
      "child exploitation", "child sexual exploitation", "child abuse",
      "sexual exploitation", "sexual slavery",
      "exploitation of migrants", "exploitation of workers",
      "recruitment fraud", "deceptive recruitment",
      "irregular migration exploitation",
      "bonded labor", "bonded labour",
    ],
  },
  {
    group: "cybercrime",
    label: "Cybercrime",
    terms: [
      "cybercrime", "cyber crime", "ransomware", "darknet", "dark web",
      "cyber fraud", "wire fraud",
      // Wave 4 — high-volume cyber-enabled fraud predicates.
      "business email compromise", "sim swap", "sim-swap fraud",
      // Wave 5 — phishing, credential attacks, malware
      "phishing", "spear phishing", "whaling attack", "vishing",
      "credential theft", "credential stuffing", "credential harvesting",
      "malware", "spyware", "keylogger", "trojan horse malware",
      "unauthorized access", "unauthorized system access",
      "hacked", "data breach", "data leak", "data theft",
      "cyber attack", "cyberattack", "network intrusion",
      "email fraud",
      // Crypto-native scams
      "romance scam", "pig butchering", "pig butchering scam",
      "rug pull", "exit scam", "crypto scam", "crypto theft",
      "exchange hack", "exchange hacked", "wallet hack",
      "nft fraud", "defi exploit", "defi fraud",
      "rug pull scheme",
      // Advanced persistent threats
      "apt group", "state-sponsored hacking", "nation-state hack",
    ],
  },
  {
    group: "fraud-forgery",
    label: "Fraud & forgery",
    terms: [
      "fraud", "ponzi", "pyramid scheme",
      "accounting fraud", "forgery", "counterfeiting", "identity theft",
      // Wave 4 — synthetic / fabricated identity fraud typology.
      "synthetic identity", "synthetic identity fraud",
      "fabricated identity", "ghost identity", "identity stacking",
      // DPMS sector fraud
      "gold fraud", "gold scam", "fake gold", "gold bar fraud", "precious metals fraud",
      "jewellery fraud", "diamond fraud", "gem fraud", "counterfeit gold",
      "refinery fraud", "gold refinery fraud",
      "assay fraud", "assay manipulation", "assay falsification",
      "hallmark fraud", "hallmark forgery", "hallmark falsification",
      "tungsten bar", "tungsten-filled", "gold-plated bar", "salted bar",
      "investment scheme", "investment scam", "gold investment fraud",
      "gold certificate fraud", "gold lease fraud", "mint fraud",
      "bullion certificate fraud",
      // Common fraud typologies
      "advance fee fraud", "419 fraud", "advance fee scam",
      "invoice fraud", "mandate fraud", "payment fraud",
      "cheque fraud", "check fraud",
      "mortgage fraud", "property fraud",
      "insurance fraud", "insurance scam",
      "benefit fraud", "subsidy fraud", "grant fraud",
      "securities fraud",
      "ppp fraud", "covid fraud", "pandemic fraud",
      "healthcare fraud", "medicare fraud",
      "bank fraud", "loan fraud",
      "credit card fraud",
      "romance fraud",
      "charity fraud",
    ],
  },
  {
    group: "tax-crime",
    label: "Tax crime",
    terms: [
      "tax evasion", "tax fraud", "vat fraud",
      "tax haven", "tax shelter", "tax avoidance scheme",
      "offshore account", "offshore banking", "offshore assets",
      "undeclared income", "undeclared assets", "unreported assets", "undeclared funds",
      "transfer pricing abuse", "base erosion", "profit shifting", "beps violation",
      "fatca violation", "crs violation", "common reporting standard violation",
      "double taxation fraud", "tax amnesty evasion",
      "hidden assets", "concealed assets", "asset concealment",
      "false tax return", "fraudulent tax return", "false tax declaration",
      "aggressive tax avoidance", "abusive tax scheme",
      "tax shelter abuse", "prohibited tax shelter",
      "offshore tax evasion", "Panama papers", "Pandora papers", "Paradise papers",
      "secret account", "secret bank account",
    ],
  },
  {
    group: "market-abuse",
    label: "Market abuse",
    terms: [
      "insider trading", "market manipulation",
      "price manipulation", "price fixing",
      "front running", "front-running",
      "wash trading", "wash trade",
      "pump and dump", "pump-and-dump",
      "bear raid", "short squeeze manipulation",
      "spoofing order", "layering order",
      "gold price fixing", "gold price manipulation",
      "benchmark manipulation", "libor manipulation",
      "circular trading", "matched orders", "matched trade",
      "pre-arranged trade", "prearranged trading",
      "dark pool manipulation",
      "algorithmic market manipulation",
      "false market", "fictitious transaction",
      "market cornering", "cornering the market",
      "ramping", "ramping scheme",
    ],
  },
  {
    group: "law-enforcement",
    label: "Law-enforcement & judicial",
    terms: [
      "arrest", "arrested", "blackmail", "convict", "convicted",
      "court case", "felon", "felony", "fined", "guilty",
      "illegal", "imprisonment", "jail", "jailed",
      "litigate", "litigation",
      "murder", "prosecute", "prosecuted", "prosecution",
      "theft", "unlawful", "verdict",
      // Common enforcement synonyms missing from prior waves
      "detained", "detain", "apprehended", "apprehend",
      "charged with", "indicted", "indictment", "sentenced",
      "seized", "confiscated", "forfeited", "forfeiture",
      "searched", "raided", "raid", "under investigation",
      // "suspect" omitted — indexOf matches "unsuspected" (false positive).
      "prime suspect", "named as suspect", "person of interest",
      "suspected of", "suspects ", "fugitive", "warrant",
      "plea deal", "plea bargain", "pled guilty", "pleaded guilty",
      "extradited", "extradition", "interpol", "red notice",
      "taken into custody", "remanded in custody", "remand custody",
      "criminal complaint", "criminal charges filed",
      // Criminal history
      "criminal record", "criminal history",
      "previously convicted", "prior conviction", "prior convictions",
      "repeat offender", "habitual offender",
      // Court orders
      "restraining order", "freezing order", "mareva order",
      "court ordered", "injunction granted",
      "bail refused", "bail denied", "bail revoked",
      "parole violation", "probation violation",
      "asset confiscation order",
    ],
  },
  {
    group: "regulatory-action",
    label: "Regulatory action & sanctions",
    terms: [
      "sanctions", "sanctioned",
      "debarred", "debarment", "blacklisted", "blacklist",
      "regulatory breach", "breach",
      // Key regulators & watchlists
      "ofac", "fincen", "egmont", "goaml", "fatf blacklist", "fatf greylist",
      "specially designated", "specially designated national",
      // Asset-freezing enforcement
      "asset freeze", "frozen assets", "frozen account", "account frozen",
      "travel ban", "entry ban", "visa ban",
      // AML/compliance violations
      "aml violation", "aml breach", "aml failure", "aml fine",
      "kyc failure", "kyc violation", "cdd failure", "due diligence failure",
      "compliance failure", "compliance breach",
      "regulatory fine", "regulatory penalty", "financial penalty",
      // Suspicious transaction reporting
      "suspicious transaction", "suspicious activity",
      "str filed", "sar filed", "suspicious transaction report",
      // Licence/permit actions
      "licence revoked", "license revoked", "licence suspended", "license suspended",
      "operating licence withdrawn", "banned from operating",
      "financial services ban",
      // Enforcement instruments
      "enforcement action", "regulatory enforcement",
      "consent order", "cease and desist",
      "deferred prosecution", "deferred prosecution agreement",
      "corporate monitor", "independent monitor", "monitorship",
      "civil forfeiture",
      "disgorgement", "disgorgement order",
      "criminal referral",
      "non-compliant", "non-compliance",
      "remediation order", "remediation required",
      "warning notice", "final notice",
    ],
  },
  {
    group: "political-exposure",
    label: "Political exposure",
    terms: [
      "politic", "political", "politician",
      "politically exposed person",
      "oligarch", "oligarchy",
      "state-owned enterprise", "state owned enterprise",
      "senior government official", "senior public official",
      "government minister", "cabinet minister",
      "head of state",
      "member of parliament",
      "senior official",
      "public office",
      "cronies", "inner circle",
    ],
  },
  // Wave 4 — insider-threat typology (malicious-insider IP exfiltration,
  // privileged-access abuse). Distinct from cybercrime because many insider
  // cases are physical / policy-layer, not network intrusion.
  {
    group: "insider-threat",
    label: "Insider threat & IP exfiltration",
    terms: [
      "insider threat", "malicious insider", "rogue employee",
      "privileged access abuse", "privileged-access abuse",
      "data exfiltration", "intellectual property theft", "ip theft",
      "trade secret theft", "trade-secret theft",
      "corporate espionage", "industrial espionage",
      "whistleblower retaliation",
      "unauthorized disclosure", "confidential data stolen",
      "employee theft", "staff fraud",
      "internal fraud", "internal corruption",
      "rogue trader",
    ],
  },
  // Wave 4 — FATF-listed environmental-crime predicate offence (2021+):
  // illegal mining / logging / fishing / waste trafficking as ML predicates.
  {
    group: "environmental-crime",
    label: "Environmental crime",
    terms: [
      "environmental crime", "eco-crime", "eco crime",
      "illegal mining", "illegal logging", "illegal fishing",
      "iuu fishing", "illegal waste dumping", "illegal dumping",
      "waste trafficking", "pollution crime",
      // Conflict minerals — FATF predicate and DPMS sector red flag
      "conflict gold", "blood gold", "artisanal gold", "artisanal mining",
      "conflict mineral", "conflict minerals", "conflict diamond", "blood diamond",
      "rough diamond", "kimberley process violation", "illegal gold mining",
      "alluvial gold", "gold mine fraud", "galamsey",
      // Additional environmental crime typologies
      "wildlife poaching", "animal poaching", "poaching ring",
      "endangered species trafficking", "cites violation",
      "carbon credit fraud", "carbon offset fraud",
      "greenwashing", "false esg claims", "esg fraud",
      "mercury mining", "mercury pollution illegal",
      "cobalt mining illegal", "child miners",
      "deforestation crime", "illegal deforestation",
      "illegal logging ring",
    ],
  },
  // AI-misuse / algorithmic-harm floor, informed by Hartono et al., "The Dual
  // Persona of AI", ICIMCIS 2025. Fires on the concrete harms the paper's
  // Dilemma Persona anticipates: biased automated decisions, opaque models,
  // synthetic-media abuse, and AI-enabled fraud.
  {
    group: "ai-misuse",
    label: "AI misuse & algorithmic harm",
    terms: [
      "algorithmic bias", "algorithmic discrimination",
      "ai bias", "biased algorithm", "automated discrimination",
      "deepfake", "deep fake", "synthetic media abuse",
      "ai-generated disinformation", "generative ai abuse",
      "ai-enabled fraud", "ai impersonation", "voice cloning fraud",
      "facial recognition misuse", "ai surveillance abuse",
      "predictive policing bias", "black-box decision",
      // OWASP LLM Top 10 style attack surface — fires on news of live
      // AI-system compromise or misuse of unmanaged / agentic AI.
      "prompt injection", "jailbreak", "jailbroken model",
      "model inversion", "membership inference",
      "data poisoning", "training data poisoning",
      "adversarial attack",
      "model theft", "training data leak",
      "shadow ai", "unauthorized ai",
    ],
  },
];

export interface AdverseKeywordHit {
  group: AdverseKeywordGroup;
  groupLabel: string;
  term: string;
  offset: number;
}

export function classifyAdverseKeywords(
  text: string | null | undefined,
): AdverseKeywordHit[] {
  if (!text) return [];
  const hay = text.toLowerCase();
  const out: AdverseKeywordHit[] = [];
  const seen = new Set<string>();
  for (const rule of ADVERSE_KEYWORDS) {
    for (const term of rule.terms) {
      const idx = hay.indexOf(term);
      if (idx === -1) continue;
      const key = `${rule.group}:${term}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        group: rule.group,
        groupLabel: rule.label,
        term,
        offset: idx,
      });
    }
  }
  return out.sort((a, b) => a.offset - b.offset);
}

// Groups that fire in this set of hits, with their hit counts.
export function adverseKeywordGroupCounts(
  hits: readonly AdverseKeywordHit[],
): Array<{ group: AdverseKeywordGroup; label: string; count: number }> {
  const map = new Map<AdverseKeywordGroup, { label: string; count: number }>();
  for (const h of hits) {
    const prev = map.get(h.group);
    if (prev) prev.count += 1;
    else map.set(h.group, { label: h.groupLabel, count: 1 });
  }
  return Array.from(map.entries()).map(([group, v]) => ({
    group,
    label: v.label,
    count: v.count,
  }));
}
