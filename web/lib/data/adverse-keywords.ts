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
  | "environmental-crime"
  | "precious-metals-crime"
  | "real-estate-crime"
  | "crypto-asset-crime"
  | "counterfeiting"
  | "illicit-trade"
  | "banking-crime"
  | "insurance-crime"
  | "healthcare-pharma-crime"
  | "immigration-border-crime"
  | "sports-crime"
  | "charity-npo-abuse"
  | "gambling-crime"
  | "war-crimes-human-rights"
  | "extortion-kidnapping"
  | "energy-crime"
  | "pension-benefits-fraud"
  | "bankruptcy-insolvency-fraud"
  | "aviation-shipping-crime"
  | "food-agriculture-crime"
  | "education-credential-crime"
  | "labour-employment-crime"
  | "media-defamation-crime"
  | "privacy-data-crime"
  | "corporate-governance-crime"
  | "sanctions-circumvention";

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
      // Cross-border value movement
      "black market peso exchange", "bmpe",
      "capital flight", "illicit financial flows",
      "undeclared currency", "currency smuggling",
      "cash declaration violation",
      "asset stripping", "value extraction",
      "third-party payment scheme", "third party payer scheme",
      "layered transactions", "complex layering",
      // Trade finance exploitation
      "trade finance fraud", "letter of credit fraud",
      "pre-export finance fraud",
      "real estate through shell", "property through nominee",
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
      "vote buying", "election fraud", "electoral fraud",
      "corrupt practices", "secret commission",
      "regulatory capture", "revolving door corruption",
      "undue advantage", "improper benefit",
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
      // Terror organisation specifics
      "aqap", "jabhat al-nusra", "haqqani network",
      "taliban financing", "taliban funded",
      "financing violent extremism",
      "charity front group", "ngo front", "charity used for terrorism",
      "zakat diversion", "mosque fund diversion",
      "islamic jihad financing",
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
      "enriched uranium", "uranium enrichment illicit",
      "centrifuge technology export",
      "nuclear weapons program",
      "nerve agent", "sarin attack", "novichok",
      "chemical attack", "chemical agent release",
      "biological agent weaponised", "anthrax attack",
      "north korea missile", "north korea weapons",
      "iran nuclear deal violation",
      // Proliferation financing — specific financial mechanisms
      "proliferation finance", "pf risk", "pf financing",
      "wmd financing", "wmd fund", "weapons program funding",
      "nuclear program financing", "missile program financing",
      "state-sponsored proliferation", "state sponsored weapons",
      "proliferation network", "proliferation ring",
      "procurement network", "front company procurement",
      "dual-use goods diversion", "dual-use technology diversion",
      "export control bypass", "export control circumvention",
      "re-export diversion", "re-export fraud",
      "procurement agent proliferation", "intermediary proliferation",
      "strategic goods smuggling", "controlled goods smuggling",
      "technology transfer illicit", "technology smuggling",
      "proliferation-financing typology", "PF typology",
      "FATF recommendation 7", "R.7 compliance failure",
      "targeted financial sanctions proliferation",
      "proliferation sanctions evasion",
      "IAEA violation", "NPT violation", "CWC violation", "BWC violation",
      "UN Security Council 1540", "UNSCR 1540",
      "missile technology control regime", "mtcr violation",
      "nuclear suppliers group violation", "nsg violation",
      "australia group violation",
      "wassenaar arrangement violation",
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
      // Named criminal organisations (safe — compound or unique terms)
      "yakuza", "chinese triads", "triad gang", "triad member",
      "camorra", "ndrangheta", "cosa nostra", "bratva",
      "ms-13", "mara salvatrucha",
      // Narcotics (more specific to avoid false positives)
      "drug mule", "drug courier", "drug smuggling",
      "narco-trafficking", "narco cartel",
      "opium trafficking", "opium production illegal",
      "heroin trafficking", "cocaine trafficking",
      "cannabis trafficking", "hashish trafficking",
      "ecstasy trafficking", "mdma trafficking",
      // Violent crime with financial motive
      "kidnapping for ransom", "kidnap for ransom",
      "hostage taking", "extortion by kidnapping",
      "maritime piracy", "piracy at sea", "piracy attack",
      "armed robbery",
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
      "trafficking network", "trafficking victim",
      "sex worker exploitation",
      "escort fraud", "escort scam",
      "child marriage",
      "underage exploitation",
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
      "nft money laundering", "nft wash trading", "nft laundering",
      "defi laundering", "defi hack",
      "flash loan attack", "flash loan exploit", "flash loan manipulation",
      "smart contract exploit", "smart contract hack",
      "vasp violation", "virtual asset fraud",
      // Infrastructure attacks
      "ddos attack", "distributed denial of service",
      "botnet", "botnet attack", "botnet fraud",
      "account takeover", "account takeover fraud",
      "card skimming", "atm fraud", "atm skimmer",
      "swift fraud", "swift heist", "swift network fraud",
      "zero-day exploit", "zero-day vulnerability exploited",
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
      // Document and identity fraud
      "document forgery", "identity document fraud",
      "passport forgery", "passport fraud",
      "visa fraud", "visa forgery",
      "birth certificate fraud",
      "diploma mill", "fake credentials", "fake degree",
      "false representation", "misrepresentation",
      // High-yield / boiler room
      "boiler room fraud", "boiler room scheme",
      "high yield investment fraud", "hyip fraud",
      "affinity fraud",
      // Vulnerable victim fraud
      "elder fraud", "elder financial abuse", "elder financial exploitation",
      "social security fraud",
      // Payroll / employee fraud
      "payroll fraud", "ghost employee",
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
      "customs duty evasion", "customs fraud", "import duty fraud",
      "export duty fraud", "customs declaration fraud",
      "unreported income", "unreported earnings",
      "ghost employee" , "payroll tax fraud",
      "fictitious employee",
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
      "naked short selling", "naked short",
      "quote stuffing", "momentum ignition",
      "layering and spoofing", "spoofing scheme",
      "pre-arranged trade", "prearranged trading",
      "algorithmic trading manipulation",
      "high-frequency trading fraud",
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
      "arraigned", "arraignment",
      "grand jury indictment",
      "convicted felon",
      "prison sentence", "prison term", "years in prison", "years imprisonment",
      "life sentence",
      "fugitive from justice",
      "international arrest warrant",
      "deportation order",
      "asset recovery order",
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
      // Regulator-specific enforcement actions
      "sec enforcement", "sec fine", "sec settlement",
      "fca fine", "fca enforcement", "fca action",
      "central bank fine", "central bank penalty",
      "cftc fine", "cftc enforcement",
      "finra fine", "finra enforcement",
      "occ enforcement",
      "transaction monitoring failure", "transaction monitoring breach",
      "suspicious activity monitoring failure",
      // Sanctions evasion techniques (vessel / trade / finance)
      "sanctions circumvention", "sanctions busting",
      "sanctions violation", "sanctions breach",
      "secondary sanctions",
      "deceptive shipping practices",
      "shadow fleet tanker", "dark fleet tanker",
      "vessel ais manipulation", "ais turned off",
      "ship-to-ship transfer sanctions",
      "flag of convenience abuse", "flag hopping",
      "illicit oil transfer", "iranian oil sanctions",
      "north korea sanctions evasion",
      "russian sanctions evasion", "russia sanctions violation",
      "belarus sanctions",
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
      "dictator", "autocrat", "despot",
      "military general", "military commander",
      "ambassador bribery",
      "governor corruption",
      "senator corruption", "congressman corruption",
      "judge bribery", "judicial corruption",
      "procurement official",
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
      "unauthorized trading", "hiding trading losses",
      "concealing losses",
      "front-running trades",
      "misuse of client funds", "misuse of customer funds",
      "misappropriation of client assets",
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
      "e-waste dumping", "electronic waste illegal",
      "hazardous waste dumping", "toxic waste dumping",
      "asbestos dumping illegal",
      "ivory trade", "ivory trafficking",
      "rhino horn trafficking", "rhino horn trade",
      "pangolin trafficking",
      "shark fin illegal", "illegal shark fin",
      "illegal whaling",
      "coral trafficking",
      "endangered species trade",
      "cites violation"  ,
      "illegal pesticide",
      "acid mine drainage violation",
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
  // UAE DPMS critical category: gold, diamonds and precious metals/stones
  // crimes. Dedicated group so hits always surface under their own label
  // rather than being buried inside money-laundering or organised-crime.
  // Covers the full trade chain: mining → refinery → export → retail.
  {
    group: "precious-metals-crime",
    label: "Precious metals & stones crime",
    terms: [
      // Gold — refinery and processing crimes
      "gold refinery", "gold refinery operation", "gold refinery raid",
      "gold refinery arrested", "gold refinery seized", "gold refinery fraud",
      "illegal gold refinery", "unlicensed refinery",
      "gold smelting illegal", "illegal gold smelting",
      "gold assay fraud", "assay fraud", "assay falsification",
      "gold hallmark fraud", "hallmark forgery",
      "tungsten-filled gold", "fake gold bar", "counterfeit gold bar",
      "gold-plated tungsten", "salted gold bar",
      // Gold trading and transportation
      "gold smuggling", "smuggled gold", "gold traffick", "gold trafficking",
      "illegal gold trade", "illicit gold trade", "black market gold",
      "undeclared gold", "unreported gold", "concealed gold",
      "gold in luggage", "gold hidden in luggage", "gold at airport",
      "gold at border", "customs gold seizure", "gold bar seizure",
      "gold vault fraud", "gold storage fraud",
      "gold certificate fraud", "gold lease fraud",
      "gold investment fraud", "gold investment scam",
      "gold ponzi", "gold scheme fraud",
      // Mining crimes — artisanal, small-scale and industrial
      "illegal gold mining", "artisanal gold mining crime",
      "galamsey", "conflict gold", "blood gold",
      "gold mine fraud", "mining licence fraud",
      "illegal alluvial gold", "unregistered gold mine",
      "illegal mining operation", "unlicensed mining",
      "illegal mining concession", "mining permit fraud",
      "artisanal mining crime", "small-scale mining crime",
      "asgm crime", "asgm fraud", "asgm laundering",
      "informal gold mining", "clandestine gold mining",
      "gold mine takeover", "mining site seizure",
      "illegal pit mining", "illegal open-cast mining",
      "conflict mineral mining", "conflict minerals",
      "mineral smuggling", "mineral trafficking",
      "mining revenue fraud", "royalty evasion mining",
      "mercury poisoning mining illegal", "cyanide mining illegal",
      "illegal copper mining", "illegal cobalt mining",
      "illegal coltan mining", "coltan conflict",
      "illegal tin mining", "illegal tungsten mining",
      "illegal tantalum mining",
      "3TG minerals conflict", "conflict minerals 3TG",
      "dodd-frank minerals violation",
      "mine safety violation", "illegal mine collapse",
      "mining company bribery", "mining concession bribery",
      "mining licence corruption", "mine permit corruption",
      "resource curse", "resource extraction crime",
      "mining money laundering", "mining sector laundering",
      "gold production fraud", "gold output manipulation",
      "underreported gold production", "undeclared mineral production",
      // Gold export documentation and certification fraud
      "gold export licence fraud", "gold export permit fraud",
      "gold origin certificate fraud", "gold provenance fraud",
      "lbma accreditation fraud", "dubai gold refinery fraud",
      "gold chain of custody fraud",
      "refinery weight fraud", "gold weight falsification",
      "gold karat fraud", "gold purity fraud",
      "gold certification false",
      // Cash-for-gold and scrap-gold
      "cash for gold fraud", "cash for gold scheme",
      "scrap gold fraud", "gold dealer arrested", "gold dealer raided",
      "gold dealer seized", "gold dealer investigation",
      // Gold import/export schemes
      "gold import fraud", "gold export fraud",
      "gold over-invoicing", "gold under-invoicing",
      "gold mis-declaration", "gold customs fraud",
      "gold declared as jewellery", "gold disguised as jewellery",
      "gold in industrial shipment", "gold hidden in cargo",
      "gold transit fraud", "gold in transit",
      // UAE-specific gold market
      "uae gold market fraud", "dubai gold fraud",
      "gold souk fraud", "gold souk money laundering",
      "dpms gold fraud", "gold trader uae arrested",
      "emirates gold fraud",
      // Diamonds and precious stones
      "diamond smuggling", "diamond trafficking", "illegal diamond trade",
      "blood diamond", "conflict diamond", "kimberley process violation",
      "rough diamond smuggling", "diamond fraud", "diamond certificate fraud",
      "diamond grading fraud",
      "gemstone smuggling", "gem trafficking", "illicit gemstone",
      "ruby smuggling", "emerald smuggling", "sapphire smuggling",
      "precious stone fraud", "counterfeit gemstone",
      // Precious metals — broader
      "silver smuggling", "platinum smuggling",
      "precious metals trafficking", "precious metals seizure",
      "precious metals seized", "precious metals arrested",
      "precious metal fraud", "precious metal scam",
      "palladium theft", "rhodium theft",
      // Jewellery as ML vehicle
      "jewellery laundering", "jewellery fraud", "fake jewellery fraud",
      "jewellery as payment illegal",
    ],
  },
  // Real estate is the second-largest global ML sector after cash.
  // UAE property market is a documented high-risk ML environment per
  // FATF UAE mutual evaluation 2020 and MER 2024 update.
  {
    group: "real-estate-crime",
    label: "Real estate crime & property laundering",
    terms: [
      // Core ML through property
      "real estate laundering", "property laundering", "property money laundering",
      "real estate money laundering", "property-based laundering",
      "real estate fraud", "property fraud", "land fraud",
      "title fraud", "deed fraud", "property title fraud",
      "mortgage fraud", "property mortgage fraud",
      // Shell and nominee structures
      "real estate through shell", "property through shell company",
      "shell company property", "nominee property",
      "beneficial owner concealed property", "hidden property ownership",
      "trust property concealment", "offshore property ownership",
      // UAE and Dubai specific
      "dubai property fraud", "uae real estate fraud",
      "off-plan fraud", "off plan scam",
      "developer fraud", "property developer fraud",
      // Valuation manipulation
      "property over-valuation", "property under-valuation",
      "inflated property price", "property price manipulation",
      "false property appraisal", "fake property valuation",
      // Foreclosure and rental fraud
      "foreclosure fraud", "rental fraud", "rent fraud",
      "landlord fraud", "tenant fraud",
      // Land and title crimes
      "land grabbing", "illegal land acquisition",
      "property confiscation illegal", "land registry fraud",
      "duplicate title deed", "forged title deed",
      // High-value property as ML
      "luxury property laundering", "high-end property fraud",
      "mansion money laundering", "offshore villa",
      // Real estate investment fraud
      "reit fraud", "real estate investment fraud",
      "property crowdfunding fraud",
    ],
  },
  // Virtual assets and DeFi have become primary ML/TF vectors since
  // FATF Recommendation 15 (2019) and UAE VASP regulations (2023).
  // Dedicated group ensures crypto crimes aren't buried in cybercrime.
  {
    group: "crypto-asset-crime",
    label: "Crypto asset crime & VASP violations",
    terms: [
      // Unregistered / unlicensed VASP
      "unlicensed crypto exchange", "unregistered crypto exchange",
      "unlicensed vasp", "unregistered vasp",
      "crypto exchange shut down", "crypto exchange raided",
      "crypto exchange arrested", "crypto exchange seized",
      // Crypto laundering techniques
      "crypto money laundering", "bitcoin laundering", "crypto laundering",
      "crypto tumbler", "crypto mixer", "bitcoin mixer",
      "tornado cash", "chain hopping", "chain-hopping",
      "crypto obfuscation", "layering crypto",
      "peer-to-peer crypto fraud", "p2p crypto fraud",
      // Crypto fraud and scams
      "crypto fraud", "bitcoin fraud", "crypto scam",
      "rug pull", "exit scam crypto", "crypto ponzi",
      "pig butchering", "pig butchering scam", "sha zhu pan",
      "crypto romance scam", "crypto investment fraud",
      "fake crypto exchange", "fake crypto wallet",
      "initial coin offering fraud", "ico fraud",
      "token fraud", "altcoin scam",
      // Crypto theft and hacking
      "crypto theft", "bitcoin theft", "exchange hacked",
      "exchange hack", "wallet stolen", "wallet hack",
      "private key stolen", "crypto heist",
      "defi exploit", "defi hack", "flash loan attack",
      "smart contract exploit", "nft fraud",
      // Dark web crypto
      "dark web crypto", "darknet market crypto",
      "silk road", "alphabay", "darknet marketplace",
      "drug payment crypto", "crypto drug payment",
      // Sanctions / VASP compliance
      "crypto sanctions violation", "vasp sanctions breach",
      "crypto sanctions evasion", "bitcoin sanctions evasion",
      "monero sanctions", "privacy coin sanctions",
      // Ransomware and extortion
      "ransomware payment", "ransom crypto", "bitcoin ransom",
      "extortion crypto", "crypto extortion",
      // Stablecoins and CBDC crime
      "stablecoin fraud", "stablecoin laundering", "tether fraud",
      "usdt laundering", "usdc fraud",
    ],
  },
  // Counterfeiting covers two distinct ML predicates under FATF R.3:
  // (1) currency counterfeiting (FATF Art.3(e)) and
  // (2) counterfeiting/piracy of products (FATF Art.3(f)).
  {
    group: "counterfeiting",
    label: "Counterfeiting & product piracy",
    terms: [
      // Currency counterfeiting
      "counterfeit currency", "counterfeit banknote", "counterfeit money",
      "forged banknote", "forged currency", "fake banknote",
      "fake money", "fake bills", "counterfeit bills",
      "currency forgery", "currency fraud",
      "passing counterfeit", "circulating counterfeit",
      "counterfeit dollar", "counterfeit euro", "counterfeit dirham",
      "counterfeit pound", "counterfeit yen",
      "printing press money", "illegal printing press",
      // Product counterfeiting
      "counterfeit goods", "counterfeit product", "fake goods",
      "fake product", "counterfeit brand", "counterfeit luxury",
      "fake luxury goods", "fake watches", "fake handbags",
      "counterfeit electronics", "counterfeit medicines",
      "fake medicines", "counterfeit pharmaceuticals",
      "fake drugs", "counterfeit drugs",
      "pirated software", "software piracy",
      "counterfeit clothing", "fake designer",
      "intellectual property theft",
      "trademark infringement", "copyright infringement",
      "brand counterfeiting", "logo counterfeiting",
      // Certificates and documents
      "counterfeit certificate", "fake certificate",
      "counterfeit passport", "fake passport",
      "counterfeit visa", "fake visa",
      "document forgery", "identity document forgery",
      "forged documents", "fake identity document",
      // Specific goods
      "counterfeit gold coin", "fake gold coin",
      "counterfeit precious metals certificate",
      "fake assay certificate",
    ],
  },
  // Illicit trade covers smuggling of goods subject to export controls,
  // trade embargoes, or prohibition — distinct from drug trafficking and
  // weapons smuggling which have their own groups.
  {
    group: "illicit-trade",
    label: "Illicit trade & smuggling",
    terms: [
      // General smuggling
      "smuggling", "smuggle", "contraband",
      "illicit trade", "illegal trade", "black market",
      "grey market", "parallel import", "grey import",
      "illicit goods", "illegal goods", "prohibited goods",
      // Tobacco and alcohol
      "tobacco smuggling", "cigarette smuggling", "illicit tobacco",
      "illicit cigarettes", "alcohol smuggling", "illicit alcohol",
      // Food and agricultural
      "food fraud", "food adulteration", "counterfeit food",
      "agricultural goods smuggling",
      // Cultural property and antiquities
      "antiquities smuggling", "antiquities trafficking",
      "cultural property theft", "looted antiquities",
      "illicit antiquities", "illegal antiquities trade",
      "artifact smuggling", "archaeological theft",
      "looted artefact", "stolen heritage",
      // Fuel and energy
      "fuel smuggling", "petrol smuggling", "oil smuggling",
      "fuel fraud", "fuel adulteration", "oil theft",
      "petroleum smuggling",
      // Textiles and garments
      "textiles smuggling", "garment fraud",
      // Hazardous and controlled substances
      "chemical smuggling", "hazardous goods smuggling",
      "precursor chemical smuggling", "controlled substance smuggling",
      // Trade diversion and embargo evasion
      "embargo evasion", "embargo violation", "trade embargo breach",
      "export control evasion", "export ban violation",
      "re-export fraud", "transshipment fraud", "transit fraud",
      "false country of origin", "origin fraud",
      "false declaration customs", "customs fraud",
      "undervalued imports", "undervalued goods customs",
      // Specific high-risk sectors
      "timber smuggling", "illegal timber", "illegal lumber",
      "fish smuggling", "illegal fish trade",
      "waste trafficking", "e-waste trafficking",
      "recycling fraud",
    ],
  },
  // Rogue banking, correspondent banking abuse, and bank-level financial crime.
  // Banks are the largest ML gateway; dedicated group ensures bank-specific
  // misconduct surfaces under its own label.
  {
    group: "banking-crime",
    label: "Banking crime & rogue finance",
    terms: [
      "rogue banker", "rogue trader", "rogue bank",
      "bank fraud", "bank robbery", "bank heist",
      "correspondent banking abuse", "correspondent bank misuse",
      "payable-through account", "nested account abuse",
      "ghost account", "phantom account", "fictitious account",
      "unauthorised bank account", "unauthorized bank account",
      "offshore bank account fraud", "secret bank account",
      "bank manager bribery", "bank officer bribery",
      "loan fraud", "loan application fraud", "credit fraud",
      "false loan application", "fraudulent loan",
      "credit default swap fraud", "structured finance fraud",
      "sub-prime fraud", "mortgage-backed securities fraud",
      "bank collapse fraud", "bank insolvency fraud",
      "ponzi bank", "pyramid bank",
      "lender fraud", "borrower fraud",
      "overdraft fraud", "cheque kiting", "check kiting",
      "SWIFT fraud", "SWIFT heist", "SWIFT network attack",
      "interbank fraud", "wire transfer fraud",
      "nostro account fraud", "vostro account abuse",
      "trade finance abuse", "letter of credit fraud",
      "bank secrecy violation", "banking secrecy breach",
      "undisclosed bank account", "hidden bank account",
      "shell bank", "brass plate bank",
      "unlicensed bank", "illegal banking",
      "banking licence fraud", "banking licence revoked",
    ],
  },
  // Insurance fraud is a primary ML predicate and a major UAE financial
  // sector risk. Life-insurance premium laundering and false claims are
  // both included.
  {
    group: "insurance-crime",
    label: "Insurance crime & fraud",
    terms: [
      "insurance fraud", "insurance scam", "insurance claim fraud",
      "false insurance claim", "fake insurance claim",
      "staged accident fraud", "staged accident",
      "arson for insurance", "arson insurance fraud",
      "vehicle insurance fraud", "car insurance fraud",
      "property insurance fraud", "home insurance fraud",
      "life insurance fraud", "life insurance scam",
      "life insurance laundering", "insurance policy laundering",
      "fake death insurance", "ghost policyholder",
      "medical insurance fraud", "health insurance fraud",
      "workers compensation fraud", "workers comp fraud",
      "marine insurance fraud", "cargo insurance fraud",
      "ghost ship insurance", "vessel insurance fraud",
      "premium fraud", "insurance premium evasion",
      "re-insurance fraud", "reinsurance fraud",
      "insurance broker fraud", "insurance agent fraud",
      "disability fraud", "fake injury claim",
      "multiple insurance fraud", "double insurance fraud",
      "phantom medical claim", "ghost treatment",
    ],
  },
  // Healthcare and pharmaceutical crime — drug diversion, medical billing
  // fraud, fake medicines. FATF has flagged pharma as a growing ML sector.
  {
    group: "healthcare-pharma-crime",
    label: "Healthcare & pharmaceutical crime",
    terms: [
      "healthcare fraud", "medicare fraud", "medicaid fraud",
      "medical billing fraud", "phantom billing", "ghost patient",
      "upcoding fraud", "healthcare upcoding",
      "unnecessary medical procedure fraud",
      "prescription fraud", "prescription drug fraud",
      "drug diversion", "pharmaceutical diversion",
      "opioid diversion", "painkiller diversion",
      "controlled drug theft", "pharmacy theft",
      "counterfeit medicine", "fake medicine", "fake drugs",
      "substandard medicine", "falsified medicine",
      "illegal pharmaceutical trade", "illegal drug trade pharmaceutical",
      "medical device fraud", "fake medical device",
      "health tourism fraud", "medical tourism fraud",
      "organ trafficking", "illegal organ trade",
      "blood trafficking", "illegal blood trade",
      "clinical trial fraud", "false clinical trial",
      "pharmaceutical bribery", "doctor bribery",
      "hospital corruption", "medical kickback",
      "health regulatory fraud", "fake health certification",
      "unlicensed medical practice", "illegal medical practice",
      "supplement fraud", "fake supplement",
    ],
  },
  // Immigration and border crime — visa fraud, asylum fraud, smuggling
  // of migrants (distinct from human trafficking which involves exploitation).
  {
    group: "immigration-border-crime",
    label: "Immigration & border crime",
    terms: [
      "visa fraud", "visa application fraud", "visa forgery",
      "fake visa", "counterfeit visa",
      "immigration fraud", "immigration scam",
      "asylum fraud", "fake asylum claim", "fraudulent asylum",
      "refugee fraud", "fake refugee",
      "border crossing fraud", "border fraud",
      "migrant smuggling", "smuggling migrants",
      "people smuggling network", "coyote smuggler",
      "human smuggling ring", "smuggling ring",
      "false identity immigration", "fake passport immigration",
      "immigration document fraud", "forged immigration document",
      "illegal border crossing", "border corruption",
      "border officer bribery", "customs officer bribery",
      "visa broker fraud", "visa agent fraud",
      "work permit fraud", "work visa fraud",
      "student visa fraud", "fake student visa",
      "nationality fraud", "citizenship fraud",
      "fake citizenship", "illegal citizenship",
      "naturalisation fraud", "false naturalisation",
      "immigration lawyer fraud", "immigration consultant fraud",
      "residency fraud", "permanent residency fraud",
      "illegal immigration network",
    ],
  },
  // Match-fixing, doping, sports betting fraud — FATF and UNODC identify
  // sport as a growing ML channel, particularly via illegal betting markets.
  {
    group: "sports-crime",
    label: "Sports crime & match-fixing",
    terms: [
      "match fixing", "match-fixing", "game fixing",
      "spot fixing", "spot-fixing",
      "result fixing", "bout fixing",
      "sports betting fraud", "illegal sports betting",
      "sports corruption", "referee bribery",
      "referee corruption", "official bribery sport",
      "umpire bribery", "judge bribery sport",
      "doping", "performance enhancing drugs", "ped violation",
      "doping scandal", "anti-doping violation",
      "blood doping", "epo doping", "steroid abuse",
      "horse racing fraud", "race fixing",
      "jockey bribery", "trainer bribery",
      "football corruption", "cricket fixing",
      "tennis fixing", "boxing corruption",
      "sports agent fraud", "transfer fraud",
      "illegal transfer", "player contract fraud",
      "sports club money laundering", "football club laundering",
      "illegal gambling sports", "unlicensed sports betting",
      "fantasy sport fraud", "esports match fixing",
    ],
  },
  // Charities and NPOs (non-profit organisations) are a documented
  // terrorism-financing channel (FATF Recommendation 8 and Special
  // Recommendation VIII). Dedicated group surfaces NPO misuse.
  {
    group: "charity-npo-abuse",
    label: "Charity & NPO abuse",
    terms: [
      "charity fraud", "charity scam", "fake charity",
      "charitable organisation fraud", "ngo fraud",
      "non-profit fraud", "nonprofit fraud",
      "charity money laundering", "charity used for money laundering",
      "charity terrorism financing", "ngo terrorism financing",
      "charity front group", "ngo front group",
      "fake donation", "donation fraud",
      "charity embezzlement", "charity misappropriation",
      "diversion of aid", "humanitarian aid fraud",
      "relief fund fraud", "disaster fund fraud",
      "zakat diversion", "mosque fund diversion", "mosque money laundering",
      "religious charity fraud", "church fraud",
      "foundation fraud", "foundation money laundering",
      "political charity abuse", "political donation fraud",
      "shell charity", "phantom charity",
      "crowdfunding fraud", "online fundraising fraud",
      "charity tax fraud", "false charitable deduction",
      "NPO registration fraud",
    ],
  },
  // Casinos and gambling are a classic ML placement vehicle — cash-intensive,
  // cross-border, and difficult to trace. Online gambling adds VASP-like risks.
  {
    group: "gambling-crime",
    label: "Gambling crime & casino fraud",
    terms: [
      "casino money laundering", "casino laundering",
      "casino fraud", "casino cheating",
      "card counting fraud", "chip fraud", "chip theft",
      "illegal casino", "unlicensed casino",
      "illegal gambling", "unlicensed gambling",
      "gambling fraud", "gambling scam",
      "online gambling fraud", "online casino fraud",
      "poker fraud", "poker scam",
      "slot machine fraud", "slot machine tampering",
      "betting fraud", "bookmaker fraud", "illegal bookmaker",
      "sports betting corruption",
      "gambling debt collection", "illegal debt collection gambling",
      "casino chip laundering", "casino cash laundering",
      "high roller laundering", "junket operator fraud",
      "VIP gambling fraud", "gambling commission bribery",
      "lottery fraud", "lottery scam", "fake lottery",
      "scratch card fraud", "raffle fraud",
      "gambling addiction exploitation", "predatory gambling",
    ],
  },
  // War crimes, genocide, crimes against humanity, and human-rights
  // violations that generate proceeds subject to ML/sanctions scrutiny.
  {
    group: "war-crimes-human-rights",
    label: "War crimes & human rights violations",
    terms: [
      "war crime", "war crimes", "war criminal",
      "crimes against humanity", "crime against humanity",
      "genocide", "ethnic cleansing",
      "torture", "torture regime",
      "extrajudicial killing", "extrajudicial execution",
      "forced disappearance", "enforced disappearance",
      "political prisoner", "arbitrary detention",
      "human rights violation", "human rights abuse",
      "civilian massacre", "massacre",
      "chemical weapon use", "chemical weapon attack",
      "cluster bomb use", "cluster munitions",
      "mass atrocity", "atrocity crime",
      "unlawful detention", "detention without trial",
      "apartheid", "systematic discrimination",
      "child soldier", "child combatant",
      "siege warfare", "starvation as weapon",
      "medical facility attack", "hospital bombing",
      "journalist persecution", "journalist killed",
      "activist persecution", "dissident persecution",
      "religious persecution", "minority persecution",
      "forced displacement", "population displacement",
      "occupation crimes", "annexation crimes",
    ],
  },
  // Extortion and kidnapping are both ML predicates and stand-alone
  // high-risk crime indicators for compliance screening.
  {
    group: "extortion-kidnapping",
    label: "Extortion, kidnapping & ransom",
    terms: [
      "extortion", "extortion ring", "extortion scheme",
      "extortion racket", "extortion network",
      "protection money", "protection racket",
      "kidnapping", "kidnap", "abduction",
      "kidnapping for ransom", "kidnap for ransom",
      "hostage taking", "hostage crisis",
      "ransom demand", "ransom payment",
      "ransom laundering", "ransom proceeds",
      "express kidnapping", "virtual kidnapping",
      "tiger kidnapping", "tiger kidnap",
      "blackmail", "blackmail scheme", "sextortion",
      "cyber extortion", "online extortion",
      "ransomware extortion",
      "business extortion", "corporate extortion",
      "extort", "extorted", "extorting",
      "threatening demand", "threat money",
      "coercion fraud", "coercion scheme",
    ],
  },
  // Energy sector crime — oil theft, fuel subsidy fraud, energy sanctions
  // evasion. A major FATF typology for resource-rich jurisdictions.
  {
    group: "energy-crime",
    label: "Energy crime & oil fraud",
    terms: [
      "oil theft", "oil smuggling", "petroleum theft",
      "fuel theft", "fuel fraud", "petrol fraud",
      "fuel subsidy fraud", "subsidy theft energy",
      "oil bunkering", "illegal oil bunkering", "crude oil theft",
      "pipeline theft", "pipeline tap", "pipeline vandalism",
      "oil refinery fraud", "oil refinery corruption",
      "petroleum fraud", "crude oil fraud",
      "energy sanctions evasion", "oil sanctions evasion",
      "iranian oil sanctions violation", "russian oil sanctions",
      "shadow fleet oil", "dark fleet oil tanker",
      "ship-to-ship oil transfer illegal",
      "natural gas theft", "gas meter fraud",
      "electricity theft", "power theft",
      "carbon credit fraud", "emissions trading fraud",
      "carbon offset scam", "fake carbon credit",
      "green energy fraud", "renewable energy fraud",
      "solar panel subsidy fraud", "wind energy fraud",
      "energy contract fraud", "utility fraud",
      "coal mining fraud", "mining royalty fraud",
      "mineral extraction fraud", "resource extraction fraud",
    ],
  },
  // Pension, welfare and social-benefits fraud — a growing ML predicate
  // as pension funds hold large pools of institutional capital.
  {
    group: "pension-benefits-fraud",
    label: "Pension, benefits & social fraud",
    terms: [
      "pension fraud", "pension scam", "pension theft",
      "pension fund fraud", "pension fund misappropriation",
      "pension liberation fraud", "pension liberation scam",
      "pension administration fraud",
      "retirement fund fraud", "retirement scam",
      "ghost pensioner", "deceased pensioner fraud",
      "false pension claim", "fraudulent pension claim",
      "welfare fraud", "benefits fraud", "social security fraud",
      "disability fraud", "fake disability claim",
      "unemployment fraud", "unemployment benefit fraud",
      "housing benefit fraud", "housing allowance fraud",
      "state benefit fraud", "government benefit fraud",
      "social assistance fraud", "subsidy fraud welfare",
      "child benefit fraud", "tax credit fraud",
      "furlough fraud", "covid support fraud",
      "emergency relief fraud", "disaster relief fraud",
      "payroll tax fraud", "national insurance fraud",
    ],
  },
  // Bankruptcy and insolvency fraud — deliberate asset-stripping, phoenix
  // companies and fraudulent trading are FATF-recognised ML predicates.
  {
    group: "bankruptcy-insolvency-fraud",
    label: "Bankruptcy & insolvency fraud",
    terms: [
      "bankruptcy fraud", "bankruptcy scam",
      "fraudulent bankruptcy", "false bankruptcy",
      "insolvency fraud", "insolvency abuse",
      "phoenix company", "phoenix scheme", "phoenix fraud",
      "asset stripping fraud", "asset stripping insolvency",
      "fraudulent trading", "wrongful trading",
      "creditor fraud", "defrauding creditors",
      "preferential payment fraud", "fraudulent preference",
      "hiding assets bankruptcy", "concealing assets bankruptcy",
      "false declaration insolvency", "fraudulent insolvency declaration",
      "administrator fraud", "liquidator fraud",
      "receivership fraud", "trustee in bankruptcy fraud",
      "false accounting insolvency", "books destroyed insolvency",
      "antecedent transaction fraud", "undervalue transaction",
      "debt avoidance scheme", "fraudulent debt avoidance",
      "voluntary arrangement fraud", "CVA fraud", "IVA fraud",
    ],
  },
  // Aviation and shipping crime beyond sanctions — aircraft fraud, flag
  // state abuse, stowaways used in smuggling operations.
  {
    group: "aviation-shipping-crime",
    label: "Aviation & shipping crime",
    terms: [
      "aircraft fraud", "aviation fraud",
      "airline fraud", "airline ticket fraud",
      "air cargo fraud", "cargo theft aviation",
      "aircraft lease fraud", "aircraft financing fraud",
      "aviation fuel fraud", "jet fuel fraud",
      "airport corruption", "airport smuggling",
      "stowaways", "stowaway criminal",
      "maritime fraud", "shipping fraud",
      "vessel registration fraud", "flag state fraud",
      "flag of convenience fraud",
      "ship name change fraud", "vessel identity fraud",
      "AIS manipulation", "AIS spoofing", "AIS transponder off",
      "dark vessel", "dark shipping",
      "cargo manifest fraud", "bill of lading fraud",
      "container fraud", "container smuggling",
      "port corruption", "port official bribery",
      "stevedore fraud", "dock fraud",
      "maritime insurance fraud", "shipwreck fraud",
      "phantom cargo", "ghost shipment fraud",
      "seafarer exploitation", "crew exploitation",
      "piracy", "maritime piracy", "sea piracy",
    ],
  },
  // Food and agriculture crime — adulteration, subsidy fraud, and
  // mislabelling are growing ML predicates per Interpol OPSON operations.
  {
    group: "food-agriculture-crime",
    label: "Food, agriculture & supply-chain crime",
    terms: [
      "food fraud", "food adulteration", "food mislabelling",
      "horsemeat scandal", "meat fraud",
      "olive oil fraud", "honey fraud", "wine fraud",
      "alcohol adulteration", "illegal alcohol",
      "counterfeit food", "fake food product",
      "organic food fraud", "false organic label",
      "halal fraud", "fake halal certificate",
      "kosher fraud", "fake kosher certificate",
      "agricultural subsidy fraud", "farm subsidy fraud",
      "crop insurance fraud", "harvest fraud",
      "pesticide fraud", "illegal pesticide use",
      "fertiliser fraud", "seed fraud",
      "food safety bribery", "food inspector bribery",
      "food import fraud", "food export fraud",
      "fishing quota fraud", "fishing licence fraud",
      "illegal fish catch", "illegal catch",
      "aquaculture fraud", "livestock fraud",
      "abattoir fraud", "slaughterhouse fraud",
      "meat processing fraud", "food processing fraud",
    ],
  },
  // Education and credential crime — diploma mills, university fraud,
  // and fake professional certifications used in identity/employment fraud.
  {
    group: "education-credential-crime",
    label: "Education & credential fraud",
    terms: [
      "diploma mill", "diploma fraud", "fake diploma",
      "degree fraud", "fake degree", "fake university degree",
      "counterfeit certificate", "forged certificate",
      "fake credentials", "false credentials",
      "fake qualification", "false qualification",
      "professional licence fraud", "fake professional licence",
      "fake medical degree", "fake legal degree",
      "fake engineering degree", "accreditation fraud",
      "fake university", "ghost university",
      "unaccredited university fraud",
      "academic fraud", "exam fraud",
      "exam cheating scheme", "exam paper theft",
      "student visa fraud", "student loan fraud",
      "scholarship fraud", "bursary fraud",
      "research fraud", "research misconduct",
      "plagiarism scheme", "contract cheating",
      "ghost-writing fraud", "essay mill",
      "training certification fraud", "CPD fraud",
    ],
  },
  // Labour and employment crime — wage theft, illegal labour, forced
  // labour supply chains. Key for UAE DPMS given construction/domestic
  // worker exploitation risk in the region.
  {
    group: "labour-employment-crime",
    label: "Labour & employment crime",
    terms: [
      "wage theft", "wage fraud", "salary theft",
      "minimum wage violation", "unpaid wages",
      "labour exploitation", "worker exploitation",
      "illegal labour", "undocumented worker exploitation",
      "labour trafficking", "labour abuse",
      "forced labour supply chain", "supply chain forced labour",
      "child labour", "child labor",
      "bonded labour", "bonded labor", "debt bondage work",
      "recruitment fraud labour", "fake job offer",
      "illegal recruitment", "illegal recruitment agency",
      "kafala abuse", "kafala fraud",
      "domestic worker abuse", "maid exploitation",
      "construction worker fraud",
      "employment agency fraud", "labour broker fraud",
      "payroll fraud", "ghost worker", "ghost employee",
      "false timesheets", "timesheet fraud",
      "sick pay fraud", "maternity pay fraud",
      "trade union fraud", "union corruption",
      "strike violence", "labour intimidation",
    ],
  },
  // Media, defamation and reputation crimes used as financial-crime
  // instruments — fake news campaigns, reputation extortion, disinformation
  // for market manipulation.
  {
    group: "media-defamation-crime",
    label: "Media crime & reputation abuse",
    terms: [
      "fake news fraud", "disinformation campaign",
      "coordinated inauthentic behaviour", "astroturfing",
      "reputation extortion", "reputational blackmail",
      "defamation fraud", "defamation scheme",
      "smear campaign financial", "short and distort",
      "pump and dump media", "stock fraud media",
      "false press release fraud", "fake regulatory announcement",
      "media manipulation scheme", "media bribery",
      "journalist bribery", "press bribery",
      "paid fake news", "sponsored disinformation",
      "bot network manipulation", "social media bot fraud",
      "deepfake defamation", "deepfake fraud",
    ],
  },
  // Privacy and data crime — illegal data markets, unlawful surveillance,
  // GDPR/data-protection violations used in financial crime.
  {
    group: "privacy-data-crime",
    label: "Privacy, data crime & surveillance abuse",
    terms: [
      "data theft", "personal data theft", "personal data stolen",
      "data breach criminal", "data breach fraud",
      "illegal data sale", "selling personal data",
      "dark web data sale", "stolen data market",
      "identity data fraud", "personal information fraud",
      "illegal surveillance", "unlawful surveillance",
      "spyware installation illegal", "stalkerware",
      "illegal interception", "phone tapping illegal",
      "communications intercept illegal",
      "GDPR violation criminal", "data protection violation criminal",
      "healthcare data theft", "medical record theft",
      "financial data theft", "bank data stolen",
      "customer data theft", "consumer data fraud",
      "data broker fraud", "illegal data broker",
      "biometric data theft", "fingerprint data stolen",
      "facial recognition data abuse",
    ],
  },
  // Corporate governance crime — board-level fraud, false accounting,
  // shareholder fraud. Distinct from market-abuse which covers trading.
  {
    group: "corporate-governance-crime",
    label: "Corporate governance & accounting crime",
    terms: [
      "accounting fraud", "false accounting",
      "book cooking", "cooking the books",
      "earnings manipulation", "earnings fraud",
      "revenue fraud", "revenue manipulation",
      "financial statement fraud", "false financial statement",
      "audit fraud", "auditor fraud", "false audit",
      "board corruption", "director fraud",
      "director misconduct", "director disqualified",
      "shareholder fraud", "minority shareholder fraud",
      "corporate espionage", "industrial espionage",
      "false prospectus", "fraudulent prospectus",
      "IPO fraud", "listing fraud", "flotation fraud",
      "dividend fraud", "dividend stripping fraud",
      "related party fraud", "related party transaction fraud",
      "transfer pricing fraud", "intercompany fraud",
      "off-balance sheet fraud", "hidden liability fraud",
      "Enron-style fraud", "Wirecard fraud", "WorldCom fraud",
      "Ponzi corporate", "corporate ponzi",
      "executive compensation fraud", "options backdating",
    ],
  },
  // Granular sanctions-circumvention techniques that may not be covered by
  // the regulatory-action or proliferation groups — focused on methods used
  // to move value past asset-freeze controls.
  {
    group: "sanctions-circumvention",
    label: "Sanctions circumvention techniques",
    terms: [
      "sanctions circumvention", "sanctions evasion",
      "sanctions busting", "sanctions violation",
      "sanctions breach", "secondary sanctions",
      "front company sanctions", "shell company sanctions",
      "nominee sanctions", "proxy sanctions evasion",
      "ownership layering sanctions",
      "trust sanctions evasion", "offshore trust sanctions",
      "family member sanctions bypass", "associate sanctions bypass",
      "cryptocurrency sanctions evasion", "crypto sanctions bypass",
      "stablecoin sanctions", "bitcoin sanctions",
      "gold sanctions evasion", "precious metals sanctions",
      "luxury goods sanctions evasion",
      "asset transfer sanctions", "asset relocation sanctions",
      "jurisdiction shopping sanctions", "flag state sanctions",
      "false flag vessel sanctions", "renamed vessel sanctions",
      "deceptive shipping sanctions", "ship darkening sanctions",
      "third-country route sanctions", "transit country sanctions",
      "correspondent bank sanctions bypass",
      "trade finance sanctions evasion",
      "counter-valuation sanctions", "barter sanctions evasion",
      "SDN evasion", "OFAC evasion", "EU list evasion",
      "UK OFSI evasion", "UN sanctions evasion",
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
