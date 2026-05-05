// Hawkeye Sterling — industry / sector risk database.
//
// Per-sector inherent AML/CFT risk based on FATF typology reports (DPMS,
// real estate, art, NPO, MSB, casinos, virtual assets, gatekeepers) and
// UAE sector-specific guidance (MoE Circular 2/2024 DPMS, MoE Circular
// 6/2025 risk-based CDD, CBUAE banking guidance).

export type IndustrySegment =
  | "dpms"                  // dealers in precious metals & stones
  | "gold"                  // refined precious metals (subset of DPMS)
  | "real_estate"           // realtors, developers, conveyancers
  | "art_antiques"          // art / antiquities / collectibles
  | "npo"                   // non-profit / charitable / religious orgs
  | "msb"                   // money services business / hawala / IVTS
  | "crypto_vasp"           // virtual asset service provider
  | "banking"               // licensed banks / FIs
  | "lawyer_tcsp"           // gatekeeper professionals
  | "accountant"            // accountants / auditors
  | "casino"                // casinos / online gambling
  | "shipping"              // shipping / freight forwarding
  | "shell_company"         // shell / nominee structures
  | "trade_company"         // import/export trading
  | "construction"          // construction / infrastructure
  | "extractives"           // oil/gas/mining
  | "free_zone"             // FZE / FZCO entities
  | "trust"                 // trust / fiduciary
  | "cash_intensive"        // restaurants / car-wash / parking — cash-heavy
  | "luxury_goods"          // yachts / private aviation / luxury watches
  | "standard";             // baseline

export interface IndustryRiskEntry {
  segment: IndustrySegment;
  /** 0..100 inherent risk before subject signals. */
  inherentRisk: number;
  label: string;
  /** Why this sector is elevated. */
  rationale: string;
  /** Specific FATF typology references applicable to this sector. */
  typologyReferences: string[];
  /** Specific UAE / FATF documents the MLRO must produce / verify. */
  requiredEvidence: string[];
}

const REGISTRY: Record<IndustrySegment, IndustryRiskEntry> = {
  dpms: {
    segment: "dpms",
    inherentRisk: 70,
    label: "Dealer in Precious Metals & Stones",
    rationale: "Cash-intensive, high-value, portable; FATF flags DPMS sector for ML/TF/sanctions evasion.",
    typologyReferences: ["FATF 2024 Money Laundering Risks in the Gold Sector", "FATF 2015 Cash Smuggling"],
    requiredEvidence: [
      "MoE Circular 2/2024 responsible-sourcing attestation",
      "LBMA Responsible Gold position / Good Delivery accreditation",
      "OECD Due Diligence Guidance — Gold Supplement file",
      "Country-of-Origin / Conflict-Free certification per batch",
    ],
  },
  gold: {
    segment: "gold",
    inherentRisk: 80,
    label: "Refined precious metals (gold, silver, platinum)",
    rationale: "Top-tier DPMS sub-segment; LBMA / OECD chain-of-custody standards apply.",
    typologyReferences: ["FATF 2024 Gold Sector Risks", "OECD Due Diligence Guidance — Gold Supplement"],
    requiredEvidence: [
      "LBMA Responsible Gold Guidance v9 conformance",
      "OECD Step-1 to Step-5 due-diligence file",
      "Mine-of-origin / refiner / transport route documentation",
    ],
  },
  real_estate: {
    segment: "real_estate",
    inherentRisk: 65,
    label: "Real estate / property",
    rationale: "FATF 2022 update flags real-estate sector as principal ML conduit; CBUAE Real Estate Guidance 2023 applies.",
    typologyReferences: ["FATF 2022 Real Estate Risk Indicators", "CBUAE Real Estate Sector Guidance 2023"],
    requiredEvidence: [
      "Source-of-funds for the purchase (bank trail or notarised SoW)",
      "UBO of any corporate purchaser",
      "Verification that no PEP control beneficial ownership",
      "Legitimate-purpose statement for off-plan / cash transactions",
    ],
  },
  art_antiques: {
    segment: "art_antiques",
    inherentRisk: 70,
    label: "Art / antiquities / collectibles",
    rationale: "FATF 2023 art-market typology — opacity, subjective valuation, freeport storage.",
    typologyReferences: ["FATF 2023 Art Market", "Basel Art Trade AML Guidance"],
    requiredEvidence: [
      "Provenance documentation back to 1970 (UNESCO 1970 baseline)",
      "Independent valuation by accredited expert",
      "Confirmation no UNESCO / Interpol / WCO red-list match",
    ],
  },
  npo: {
    segment: "npo",
    inherentRisk: 60,
    label: "Non-profit / charitable / religious organisation",
    rationale: "FATF R.8 — NPOs vulnerable to terrorism-financing abuse; UAE Cabinet Resolution 38/2018 governs charity registrations.",
    typologyReferences: ["FATF R.8", "FATF NPO Risk Assessment 2015 (rev 2023)"],
    requiredEvidence: [
      "Registration with UAE General Authority of Islamic Affairs and Endowments (or equivalent)",
      "Beneficiary list and disbursement records",
      "Cross-border transfer documentation",
    ],
  },
  msb: {
    segment: "msb",
    inherentRisk: 75,
    label: "Money services business / hawala / IVTS",
    rationale: "FATF 2013 IVTS report — hawala particularly vulnerable; CBUAE registration regime applies.",
    typologyReferences: ["FATF R.14", "FATF 2013 IVTS Report"],
    requiredEvidence: [
      "CBUAE Hawaladar registration certificate",
      "Customer-acceptance and transaction-record systems",
      "Cross-border settlement counterparty list",
    ],
  },
  crypto_vasp: {
    segment: "crypto_vasp",
    inherentRisk: 75,
    label: "Virtual asset service provider (VASP) / crypto",
    rationale: "FATF R.15 + 2021 VASP guidance — travel-rule, custody, off-ramp risk.",
    typologyReferences: ["FATF R.15", "FATF 2021 VASP Guidance", "VARA Rulebook"],
    requiredEvidence: [
      "VARA / SCA / FSRA licence",
      "Travel-rule (FATF R.16) implementation evidence",
      "Wallet address register and on-chain analytics provider",
    ],
  },
  banking: {
    segment: "banking",
    inherentRisk: 50,
    label: "Licensed bank / financial institution",
    rationale: "Inherent risk lower than gatekeeper sectors but correspondent-banking exposure to high-risk jurisdictions adds risk.",
    typologyReferences: ["FATF R.13 (correspondent banking)"],
    requiredEvidence: [
      "Wolfsberg Correspondent Banking Due Diligence Questionnaire (CBDDQ)",
      "Most recent MLRO / Compliance Officer attestation",
      "Sanctions screening tooling and procedures",
    ],
  },
  lawyer_tcsp: {
    segment: "lawyer_tcsp",
    inherentRisk: 70,
    label: "Lawyer / Trust & Company Service Provider (gatekeeper)",
    rationale: "FATF R.22-23 designated gatekeeper; pooled-account and shell-formation risk.",
    typologyReferences: ["FATF R.22-23", "FATF Lawyers Guidance 2019"],
    requiredEvidence: [
      "Bar association / TCSP regulator licence",
      "Client-account / pooled-account segregation evidence",
      "Companies-formation register if forming legal persons",
    ],
  },
  accountant: {
    segment: "accountant",
    inherentRisk: 60,
    label: "Accountant / auditor",
    rationale: "FATF R.22-23 designated gatekeeper; tax-evasion + structuring exposure.",
    typologyReferences: ["FATF R.22-23", "FATF Accountants Guidance 2019"],
    requiredEvidence: ["Professional registration", "Client SoW / tax-residence files"],
  },
  casino: {
    segment: "casino",
    inherentRisk: 80,
    label: "Casino / online gambling operator",
    rationale: "FATF R.22 designated; chip-conversion + structuring + bonus-laundering vectors.",
    typologyReferences: ["FATF R.22", "FATF 2009 Casinos Vulnerabilities"],
    requiredEvidence: [
      "Operator licence",
      "Threshold-transaction reporting system",
      "Player-identity verification at currency-exchange triggers",
    ],
  },
  shipping: {
    segment: "shipping",
    inherentRisk: 60,
    label: "Shipping / freight / logistics",
    rationale: "TBML + sanctions-evasion (dark-fleet, AIS gap, ship-to-ship transfers).",
    typologyReferences: ["FATF 2020 TBML Update", "OFAC Maritime Advisory 2020"],
    requiredEvidence: [
      "Vessel IMO + MMSI register",
      "AIS-gap analysis for last 90 days",
      "Bills of lading + cargo manifests for high-risk routes",
    ],
  },
  shell_company: {
    segment: "shell_company",
    inherentRisk: 75,
    label: "Shell / nominee / holding structure",
    rationale: "FATF R.24-25 — beneficial-ownership opacity primary ML vehicle.",
    typologyReferences: ["FATF R.24-25", "FATF 2018 Concealment of Beneficial Ownership"],
    requiredEvidence: [
      "Group structure chart down to natural persons",
      "Operating-substance test (employees, premises, revenue)",
      "Commercial-purpose statement",
    ],
  },
  trade_company: {
    segment: "trade_company",
    inherentRisk: 60,
    label: "Trading company (import / export)",
    rationale: "TBML primary vector — over/under-invoicing, multi-invoicing, phantom shipments.",
    typologyReferences: ["FATF 2020 TBML Update"],
    requiredEvidence: [
      "Last 12 months of invoices, bills of lading, proof-of-delivery",
      "Top-5 trading partner due-diligence files",
    ],
  },
  construction: {
    segment: "construction",
    inherentRisk: 55,
    label: "Construction / infrastructure contractor",
    rationale: "Cash-intensive, sub-contracting opacity, public-procurement corruption risk.",
    typologyReferences: ["FATF 2011 Construction Sector"],
    requiredEvidence: ["Sub-contractor due-diligence files", "Public-tender win documentation"],
  },
  extractives: {
    segment: "extractives",
    inherentRisk: 70,
    label: "Oil / gas / mining / extractives",
    rationale: "Sanctions, PEP, corruption, environmental crime exposure.",
    typologyReferences: ["EITI Standard", "FATF 2021 Environmental Crime"],
    requiredEvidence: [
      "EITI compliance attestation",
      "Concession / licence ownership chain",
      "Sanctioned-counterparty avoidance evidence",
    ],
  },
  free_zone: {
    segment: "free_zone",
    inherentRisk: 55,
    label: "UAE Free Zone entity (FZE / FZCO)",
    rationale: "Lower substance threshold + tax-favoured regime + offshore-style ownership.",
    typologyReferences: ["FATF 2010 Free Trade Zones", "OECD Substance Test"],
    requiredEvidence: [
      "Free Zone licence",
      "Operating-substance attestation",
      "Beneficial-ownership filing with the registrar",
    ],
  },
  trust: {
    segment: "trust",
    inherentRisk: 75,
    label: "Trust / fiduciary structure",
    rationale: "FATF R.25 — settlor / trustee / beneficiary opacity; common ML / sanctions-evasion vehicle.",
    typologyReferences: ["FATF R.25", "FATF 2019 Best Practices on Beneficial Ownership for Legal Persons"],
    requiredEvidence: [
      "Trust deed",
      "Settlor / trustee / protector / beneficiary identity files",
      "Distribution history",
    ],
  },
  cash_intensive: {
    segment: "cash_intensive",
    inherentRisk: 55,
    label: "Cash-intensive business (food, parking, car-wash, retail)",
    rationale: "Volume of currency vs declared revenue — placement-stage ML risk.",
    typologyReferences: ["FATF 2015 Cash"],
    requiredEvidence: [
      "Audited financials reconciled to bank deposits",
      "Point-of-sale records vs cash-deposit pattern",
    ],
  },
  luxury_goods: {
    segment: "luxury_goods",
    inherentRisk: 60,
    label: "Luxury goods (yachts, private aviation, watches)",
    rationale: "High-value mobile assets; sanctions-evasion / oligarch-yacht typology.",
    typologyReferences: ["FATF 2024 Yacht / Aviation Sector", "OFAC Russia Yacht Advisory 2022"],
    requiredEvidence: [
      "Title-chain documentation",
      "Sanctions screening of beneficial owner and ultimate operator",
    ],
  },
  standard: {
    segment: "standard",
    inherentRisk: 25,
    label: "Standard sector",
    rationale: "Baseline AML risk profile.",
    typologyReferences: [],
    requiredEvidence: [],
  },
};

export function industryRisk(segment: IndustrySegment | string | null | undefined): IndustryRiskEntry {
  const s = (segment ?? "standard") as IndustrySegment;
  return REGISTRY[s] ?? REGISTRY.standard;
}

// Infer best-fit industry segment from name + aliases — small expansion of
// the inferIndustryHints in dispositionEngine. Returns the highest-risk
// match where multiple fire (e.g. "ABC Gold FZE" → "gold", not "free_zone").
export function inferIndustrySegment(name: string, aliases: string[] = []): IndustrySegment {
  const text = [name, ...aliases].join(" ").toLowerCase();

  // Order matters — most specific / highest-risk first.
  if (/\bgold\b|\bbullion\b|\brefiner|\brefin(?:ery|ing)\b/.test(text)) return "gold";
  if (/\bdiamond|jewel|gem(stone)?|precious\s+metal/.test(text)) return "dpms";
  if (/\b(crypto|bitcoin|ethereum|btc|eth|wallet|virtual\s+asset|vasp)\b/.test(text)) return "crypto_vasp";
  if (/\b(yacht|jet|aviat|private\s+plane|luxury\s+watch)\b/.test(text)) return "luxury_goods";
  if (/\bcasino|gambling|wager|lottery\b/.test(text)) return "casino";
  if (/\boil|gas|petrol|mining|mineral|extract/.test(text)) return "extractives";
  if (/\b(charity|foundation|trust|waqf|endowment|npo|non.?profit)\b/.test(text)) {
    if (/\btrust\b/.test(text) && !/\bcharity|foundation|waqf|endowment\b/.test(text)) return "trust";
    return "npo";
  }
  if (/\bbank|banking|financial\s+institution|fi\b/.test(text)) return "banking";
  if (/\b(law(yer)?|attorney|advocate|tcsp|trust.?company)\b/.test(text)) return "lawyer_tcsp";
  if (/\baccountant|audit(or|ing)\b/.test(text)) return "accountant";
  if (/\bhawala|exchange|remit|remittance|money.?transfer|msb\b/.test(text)) return "msb";
  if (/\b(real\s+estate|realt(or|y)|propert(y|ies)|develop(er|ment))\b/.test(text)) return "real_estate";
  if (/\bart|antiqu|gallery|auction\s+house\b/.test(text)) return "art_antiques";
  if (/\bship(per|ping)|tanker|maritime|cargo|freight\b/.test(text)) return "shipping";
  if (/\bconstruct(ion|or)|contractor|infrastructure\b/.test(text)) return "construction";
  if (/\b(holdings?|nominee|shell|sarl|invest|capital)\b/.test(text)) return "shell_company";
  if (/\b(trad(e|ing)|import|export|commerce)\b/.test(text)) return "trade_company";
  if (/\bfz-?[ae]\b|free\s+zone|dmcc|jafza/.test(text)) return "free_zone";
  if (/\b(restaurant|cafe|car.?wash|parking|laundry)\b/.test(text)) return "cash_intensive";
  return "standard";
}
