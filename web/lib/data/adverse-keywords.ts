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
  | "illicit-trade";

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
      // Mining crimes
      "illegal gold mining", "artisanal gold mining crime",
      "galamsey", "conflict gold", "blood gold",
      "gold mine fraud", "mining licence fraud",
      "illegal alluvial gold", "unregistered gold mine",
      // Cash-for-gold and scrap-gold
      "cash for gold fraud", "cash for gold scheme",
      "scrap gold fraud", "gold dealer arrested", "gold dealer raided",
      "gold dealer seized", "gold dealer investigation",
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
