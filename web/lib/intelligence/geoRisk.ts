// Hawkeye Sterling — geographic + sectoral risk overlay.
//
// CAHRA (Conflict-Affected and High-Risk Areas), FATF black/grey list,
// EU AML high-risk list, and inherent-sector-risk scoring (FATF 2024
// typology). When a subject's jurisdiction or sector triggers, the
// reasoning panel surfaces it and adds an inherent-risk floor to the
// unified score.

export interface GeoRiskAssessment {
  countryCode: string;
  cahra: boolean;
  fatfBlack: boolean;
  fatfGrey: boolean;
  euHighRisk: boolean;
  ofacComprehensive: boolean;
  sanctionsRegime: string | null;
  inherentRiskScore: number;     // 0..100 (geographic component only)
  band: "low" | "elevated" | "high" | "critical";
  signal: string;
}

// Comprehensive sanctions jurisdictions — full embargo
const COMPREHENSIVE = new Set(["IR", "KP", "SY", "CU"]);

// CAHRA — derived from EU AML CFT high-risk list + FATF black/grey + active conflict zones
const CAHRA = new Set([
  "AF", "MM", "DZ", "ER", "ET", "HT", "IQ", "LB", "LY", "ML", "MZ",
  "NE", "PK", "PS", "SO", "SS", "SD", "SY", "TJ", "VE", "YE", "BY",
  "RU",   // Russia post-2022 designations
  "UA",   // partial — Crimea, Donetsk, Luhansk
]);

// FATF black list (Feb 2024 cohort)
const FATF_BLACK = new Set(["KP", "IR", "MM"]);

// FATF grey list (Feb 2024 cohort) — partial; full list updated quarterly
const FATF_GREY = new Set([
  "AL", "BB", "BF", "CM", "CD", "GI", "HT", "JM", "JO", "ML", "MZ",
  "NG", "PA", "PH", "SN", "SS", "SY", "TZ", "TR", "UG", "AE", "VN", "YE",
  "BG", "HR", "MC", "VE",
]);

// EU AML high-risk third-country list (Commission Delegated Reg)
const EU_HIGH_RISK = new Set([
  "AF", "BB", "BF", "KH", "KY", "DR", "GH", "HT", "JM", "JO", "ML",
  "MA", "MM", "NG", "PA", "PK", "PH", "SN", "SY", "TZ", "TT", "UG",
  "VU", "YE", "ZW", "AE", "VE",
]);

// Inherent sector risk — FATF + UAE typology
const SECTOR_RISK: Record<string, { score: number; family: string; reason: string }> = {
  "DPMS": { score: 80, family: "Financial-crime hot spot", reason: "Dealers in Precious Metals & Stones — top-tier FATF AML risk; cash-for-gold + LBMA chain-of-custody concerns" },
  "GOLD": { score: 80, family: "Financial-crime hot spot", reason: "Refined precious metals — same as DPMS" },
  "REAL_ESTATE": { score: 70, family: "Layering & integration", reason: "Real-estate purchase widely used for layering / integration of illicit proceeds" },
  "VASP": { score: 75, family: "Crypto / virtual assets", reason: "Virtual-asset service provider — FATF Travel Rule applies; chain-of-custody required" },
  "EXCHANGE_HOUSE": { score: 70, family: "Money services", reason: "MVTS / hawala risk; high cash-handling volume" },
  "ART_ANTIQUITIES": { score: 65, family: "Inherently opaque", reason: "Art & antiquities — inherently opaque pricing, common laundering vehicle" },
  "CASINO": { score: 70, family: "Cash-intensive", reason: "Casino / gaming — high cash-throughput, common smurfing vector" },
  "TBML": { score: 75, family: "Trade-based ML", reason: "Trade-finance — over/under-invoicing, multi-invoicing, phantom shipment risks" },
  "FREE_ZONE": { score: 60, family: "Layering risk", reason: "Free-zone entity — limited beneficial-ownership transparency in some jurisdictions" },
  "NPO": { score: 55, family: "TF risk", reason: "Non-profit organisation — terrorist-financing risk per FATF R.8" },
  "MSB": { score: 65, family: "Money services", reason: "Money services business — same family as exchange house" },
  "BANK": { score: 35, family: "Regulated", reason: "Licensed bank — regulated counterparty; standard CDD applies" },
  "PROFESSIONAL_SERVICES": { score: 50, family: "Gatekeeper", reason: "Lawyer/accountant — gatekeeper professional, required to apply CDD per FATF R.22" },
};

export function assessGeographicRisk(countryCode: string | undefined): GeoRiskAssessment {
  const cc = (countryCode ?? "").trim().toUpperCase();
  if (!cc || cc.length !== 2) {
    return {
      countryCode: cc, cahra: false, fatfBlack: false, fatfGrey: false,
      euHighRisk: false, ofacComprehensive: false, sanctionsRegime: null,
      inherentRiskScore: 0, band: "low",
      signal: "No jurisdiction provided — unable to apply CAHRA / FATF overlay.",
    };
  }

  const cahra = CAHRA.has(cc);
  const fatfBlack = FATF_BLACK.has(cc);
  const fatfGrey = FATF_GREY.has(cc);
  const euHighRisk = EU_HIGH_RISK.has(cc);
  const ofacComprehensive = COMPREHENSIVE.has(cc);

  let score = 5;        // baseline
  if (cahra) score += 25;
  if (fatfGrey) score += 30;
  if (fatfBlack) score += 50;
  if (euHighRisk) score += 25;
  if (ofacComprehensive) score = 100;
  score = Math.min(100, score);

  let band: GeoRiskAssessment["band"];
  if (score >= 80) band = "critical";
  else if (score >= 50) band = "high";
  else if (score >= 25) band = "elevated";
  else band = "low";

  let sanctionsRegime: string | null = null;
  if (ofacComprehensive) sanctionsRegime = "OFAC-comprehensive";
  else if (fatfBlack) sanctionsRegime = "FATF-blacklist";
  else if (fatfGrey) sanctionsRegime = "FATF-greylist";
  else if (euHighRisk) sanctionsRegime = "EU-AML-high-risk";

  let signal: string;
  if (band === "critical") {
    signal = `CRITICAL jurisdiction ${cc}: ${sanctionsRegime ?? "comprehensive sanctions"} apply. Decline / EDD-only.`;
  } else if (band === "high") {
    signal = `HIGH-risk jurisdiction ${cc}: ${sanctionsRegime ?? "FATF-listed"}. EDD mandatory; senior management approval recommended.`;
  } else if (band === "elevated") {
    signal = `Elevated jurisdiction ${cc}${cahra ? " (CAHRA)" : ""}. Apply tier-2 CDD with enhanced source-of-wealth verification.`;
  } else {
    signal = `Standard jurisdiction ${cc} — baseline CDD applies.`;
  }

  return {
    countryCode: cc, cahra, fatfBlack, fatfGrey, euHighRisk, ofacComprehensive,
    sanctionsRegime, inherentRiskScore: score, band, signal,
  };
}

export interface SectorRiskAssessment {
  sector: string;
  score: number;
  family: string;
  reason: string;
  band: "low" | "moderate" | "high" | "critical";
}

export function assessSectorRisk(sector: string | undefined): SectorRiskAssessment {
  const key = (sector ?? "").trim().toUpperCase();
  const entry = SECTOR_RISK[key];
  if (!entry) {
    return { sector: key || "UNSPECIFIED", score: 30, family: "Unspecified", reason: "Sector not classified; default-moderate baseline applies.", band: "moderate" };
  }
  let band: SectorRiskAssessment["band"];
  if (entry.score >= 80) band = "critical";
  else if (entry.score >= 60) band = "high";
  else if (entry.score >= 40) band = "moderate";
  else band = "low";
  return { sector: key, score: entry.score, family: entry.family, reason: entry.reason, band };
}
