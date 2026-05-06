// Hawkeye Sterling — geographic risk database.
//
// Single source of truth for jurisdiction-level inherent risk: FATF black/
// grey lists, EU AML high-risk third countries, secrecy / tax-haven
// indicators, sanctions-comprehensive jurisdictions, and the UAE CAHRA
// register. Composed with industry + entity signals by the disposition
// engine — never read in isolation by a route.

export type JurisdictionTier =
  | "comprehensive_sanctions" // entire jurisdiction comprehensively sanctioned
  | "fatf_black"              // FATF call-for-action list
  | "fatf_grey"               // FATF increased monitoring list
  | "eu_aml_high_risk"        // EU 2015/849 Annex high-risk 3rd country
  | "secrecy_high"            // top-tier secrecy / financial-haven
  | "tax_haven"               // recognised low/no-tax with thin substance
  | "cahra"                   // conflict-affected and high-risk area
  | "moderate"                // increased scrutiny but not listed
  | "standard";               // baseline

export interface GeographicRiskEntry {
  iso2: string;
  name: string;
  tiers: JurisdictionTier[];
  /** 0..100 inherent-risk score before subject-specific signals. */
  inherentRisk: number;
  /** Active sanctions regimes targeting this jurisdiction. */
  activeRegimes: string[];
  /** Notes the MLRO should see in the dossier. */
  notes: string[];
}

// Comprehensive sanctions — entire jurisdiction restricted (US/EU/UN combined).
const COMPREHENSIVE: Record<string, string[]> = {
  IR: ["OFAC IRAN", "UN 2231", "EU CFSP/Iran", "UK SAMLA"],
  KP: ["OFAC NK", "UN 1718/2270/2371", "EU CFSP/DPRK", "UK SAMLA"],
  SY: ["OFAC SYRIA", "EU CFSP/Syria", "UK SAMLA"],
  CU: ["OFAC CUBA"],
  // Russia — sectoral / SSI / SDN-heavy but not "comprehensive" — handled
  // as a high-risk regime rather than blanket here.
  // Crimea / DPR / LPR / Zaporizhzhia / Kherson regions handled separately.
};

// FATF lists — kept up to date against FATF plenary statements. These
// move 2-3x per year; ops review on the next plenary.
const FATF_BLACK = ["IR", "KP", "MM"]; // call-for-action
const FATF_GREY = [
  "AL","BG","BF","CM","HR","CD","HT","KE","LA","LB","MZ","MC","NA","NG","PH","RU","SN","ZA","SS","SY","TR","VE","VN","YE",
];

// EU AML high-risk third countries (Commission Delegated Regulation
// 2016/1675 + amendments). Re-read against the Official Journal each year.
const EU_AML_HIGH_RISK = [
  "AF","AL","BB","BF","KH","CM","CD","CI","HR","GH","HT","IR","JM","KP","LA","LB","LY","MK","ML","MZ","MM","NI","NG","PA","PH","RU","SN","SY","TR","UG","VU","VE","VN","YE","ZW","SS",
];

// Secrecy / financial-haven jurisdictions — Tax Justice Network FSI top
// tier, OECD GFTEI substantial-non-compliance, plus historical havens.
const SECRECY_HIGH = ["CH","HK","SG","KY","BM","BVI","BS","PA","LU","CY","JE","GG","IM","LI","MC","AE"];

// Tax havens — OECD blacklist (low-tax, weak substance) + globally
// recognised offshore centres.
const TAX_HAVEN = [
  "AD","AG","AI","AW","BB","BS","BZ","BM","BVI","KY","CK","CW","DM","FJ","GD","GI","GG","HK","IM","JE","KN","LB","LC","LI","MH","MC","NR","NU","PA","PW","SC","SR","SX","TC","TT","TO","VU","VG","VI","WS",
];

// CAHRA — UAE Financial Crimes / OECD Conflict-Affected and High-Risk
// Areas list. Drives MoE Circular 6/2025 enhanced due diligence.
const CAHRA = [
  "AF","CD","CF","SS","SY","YE","SO","LY","SD","ML","BF","NG","ER","NE","TR","VE","BY","RU","UA","MM","HT","IQ","LB","PS",
];

// Friendly names for the list (used when the official ISO list has them).
const COUNTRY_NAMES: Record<string, string> = {
  AE: "United Arab Emirates", AF: "Afghanistan", AL: "Albania", BB: "Barbados",
  BF: "Burkina Faso", BG: "Bulgaria", BS: "Bahamas", BVI: "British Virgin Islands",
  BY: "Belarus", CD: "DR Congo", CF: "Central African Republic", CH: "Switzerland",
  CI: "Côte d'Ivoire", CM: "Cameroon", CU: "Cuba", CY: "Cyprus",
  ER: "Eritrea", GH: "Ghana", HK: "Hong Kong", HR: "Croatia",
  HT: "Haiti", IQ: "Iraq", IR: "Iran", JM: "Jamaica",
  KE: "Kenya", KP: "North Korea", KY: "Cayman Islands", LA: "Laos",
  LB: "Lebanon", LI: "Liechtenstein", LU: "Luxembourg", LY: "Libya",
  MC: "Monaco", MK: "North Macedonia", ML: "Mali", MM: "Myanmar",
  MZ: "Mozambique", NA: "Namibia", NG: "Nigeria", NI: "Nicaragua",
  PA: "Panama", PH: "Philippines", PS: "Palestine", RU: "Russia",
  SD: "Sudan", SG: "Singapore", SN: "Senegal", SO: "Somalia",
  SS: "South Sudan", SY: "Syria", TR: "Turkey", UA: "Ukraine",
  UG: "Uganda", VE: "Venezuela", VN: "Vietnam", YE: "Yemen",
  ZW: "Zimbabwe", ZA: "South Africa",
};

// Base inherent-risk score by tier — composed as the max across all tiers
// the jurisdiction belongs to.
const TIER_BASE_RISK: Record<JurisdictionTier, number> = {
  comprehensive_sanctions: 100,
  fatf_black: 95,
  fatf_grey: 70,
  eu_aml_high_risk: 65,
  cahra: 65,
  secrecy_high: 55,
  tax_haven: 50,
  moderate: 35,
  standard: 15,
};

// Notes per tier.
const TIER_NOTE: Record<JurisdictionTier, string> = {
  comprehensive_sanctions: "Comprehensive sanctions regime — direct dealings prohibited; relationship requires a specific licence.",
  fatf_black: "FATF call-for-action — counter-measures required; STR/SAR threshold lowered.",
  fatf_grey: "FATF increased monitoring — EDD mandatory; document strategic-deficiency remediation.",
  eu_aml_high_risk: "EU 2015/849 high-risk third country — EDD mandatory under Article 18a.",
  secrecy_high: "Top-tier secrecy / opacity jurisdiction — beneficial-ownership transparency limited.",
  tax_haven: "Recognised tax/offshore haven — apply enhanced UBO scrutiny and substance test.",
  cahra: "Conflict-Affected and High-Risk Area — OECD due diligence required (esp. minerals / DPMS).",
  moderate: "Elevated AML risk profile — apply enhanced ID verification and SoW review.",
  standard: "Standard inherent risk — baseline CDD applies.",
};

export function jurisdictionRisk(iso2: string | null | undefined): GeographicRiskEntry {
  const code = (iso2 ?? "").toUpperCase().trim();
  const tiers: JurisdictionTier[] = [];
  if (code in COMPREHENSIVE) tiers.push("comprehensive_sanctions");
  if (FATF_BLACK.includes(code)) tiers.push("fatf_black");
  if (FATF_GREY.includes(code)) tiers.push("fatf_grey");
  if (EU_AML_HIGH_RISK.includes(code)) tiers.push("eu_aml_high_risk");
  if (CAHRA.includes(code)) tiers.push("cahra");
  if (SECRECY_HIGH.includes(code)) tiers.push("secrecy_high");
  if (TAX_HAVEN.includes(code)) tiers.push("tax_haven");
  if (tiers.length === 0) tiers.push("standard");

  const inherentRisk = Math.max(...tiers.map((t) => TIER_BASE_RISK[t]));
  const notes = tiers.map((t) => TIER_NOTE[t]);
  const activeRegimes = code in COMPREHENSIVE ? COMPREHENSIVE[code]! : [];
  return {
    iso2: code,
    name: COUNTRY_NAMES[code] ?? code,
    tiers,
    inherentRisk,
    activeRegimes,
    notes,
  };
}

// Combined geography across origin + destination + counterparty hops —
// drives transaction-level geographic risk.
export interface GeographyChain {
  origin?: string | null;
  destination?: string | null;
  intermediaries?: Array<string | null | undefined>;
}

export function chainGeographyRisk(chain: GeographyChain): {
  inherentRisk: number;
  hops: GeographicRiskEntry[];
  worstTier: JurisdictionTier;
} {
  const codes = [chain.origin, chain.destination, ...(chain.intermediaries ?? [])]
    .map((c) => (c ?? "").toUpperCase().trim())
    .filter((c) => c.length > 0);
  const hops = codes.map(jurisdictionRisk);
  const inherentRisk = hops.length === 0 ? 0 : Math.max(...hops.map((h) => h.inherentRisk));
  const order: JurisdictionTier[] = [
    "standard","moderate","tax_haven","secrecy_high","cahra","eu_aml_high_risk","fatf_grey","fatf_black","comprehensive_sanctions",
  ];
  let worstTier: JurisdictionTier = "standard";
  for (const h of hops) {
    for (const t of h.tiers) {
      if (order.indexOf(t) > order.indexOf(worstTier)) worstTier = t;
    }
  }
  return { inherentRisk, hops, worstTier };
}
