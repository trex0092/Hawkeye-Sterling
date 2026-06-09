// Hawkeye Sterling — correspondent bank risk scoring.
//
// BIC-based structural risk assessment for correspondent banking
// relationships under FATF Recommendation 13 and UAE Federal Decree-Law No. 10 of 2025.
//
// This module performs static, deterministic scoring from the BIC/
// SWIFT code alone. It does NOT make live API calls. For enriched
// assessments (KYC history, AML programme reviews, etc.) use the
// /api/correspondent-bank route which layers Claude over this base.

import { jurisdictionRisk } from "./geographicRisk";

export interface CorrespondentBankResult {
  bic: string;                    // normalised BIC (uppercase, trimmed)
  bankName: string;
  country: string;
  riskScore: number;              // 0–100
  riskTier: "low" | "medium" | "high" | "critical";
  fatfStatus: string;             // "compliant" | "grey_list" | "black_list" | "non_member"
  sanctionsExposure: boolean;
  pep: boolean;
  deRiskingRisk: boolean;
  flags: string[];
  recommendation: "approve" | "enhanced_due_diligence" | "decline";
}

// ── Hardcoded sanctioned bank BIC prefixes (first 4 chars = bank code) ──────
// Currently empty — populated via compliance ops review. Future entries follow
// OFAC/UN Security Council designations.
const SANCTIONED_BIC_PREFIXES: ReadonlySet<string> = new Set<string>([]);

// ── De-risking indicator: banks from jurisdictions historically subject
// to correspondent banking withdrawal pressures (Pacific island states,
// small Caribbean jurisdictions). Drives the de-risking risk flag.
// Source: IMF/World Bank de-risking research 2015-2024.
const DERISKING_COUNTRY_CODES: ReadonlySet<string> = new Set([
  "WS", "TO", "FJ", "VU", "PF", "KI", "MH", "FM", "PW", "NR", "TV",
  "CK", "NU", "AG", "DM", "GD", "KN", "LC", "VC", "BB",
  "BZ", "TT", "SR", "GY",
  "SB", "PG",
  "HT", "CU",
  "SO", "SS", "SD", "LY", "YE",
]);

// ── PEP-density indicator: jurisdictions with elevated state-owned bank
// prevalence or documented PEP ownership of financial institutions.
const PEP_DENSE_COUNTRY_CODES: ReadonlySet<string> = new Set([
  "VE", "CU", "BY", "RU", "IR", "KP", "SY", "MM", "ZW",
  "AZ", "TM", "KZ", "UZ", "TJ", "KG",
  "NG", "AO", "CD", "SS",
]);

// ── Country name lookup (supplement for codes not in geographicRisk) ─────────
const EXTRA_COUNTRY_NAMES: Record<string, string> = {
  US: "United States", GB: "United Kingdom", DE: "Germany",
  FR: "France", JP: "Japan", AU: "Australia", CA: "Canada",
  CH: "Switzerland", SG: "Singapore", HK: "Hong Kong",
  NL: "Netherlands", SE: "Sweden", NO: "Norway", DK: "Denmark",
  FI: "Finland", NZ: "New Zealand", AT: "Austria", BE: "Belgium",
  IE: "Ireland", LU: "Luxembourg", PT: "Portugal", ES: "Spain",
  IT: "Italy", GR: "Greece", PL: "Poland", CZ: "Czech Republic",
  SK: "Slovakia", HU: "Hungary", RO: "Romania", BG: "Bulgaria",
  HR: "Croatia", SI: "Slovenia", EE: "Estonia", LV: "Latvia",
  LT: "Lithuania", MT: "Malta", CY: "Cyprus",
  IN: "India", CN: "China", BR: "Brazil", MX: "Mexico",
  AR: "Argentina", CL: "Chile", CO: "Colombia", PE: "Peru",
  ZA: "South Africa", EG: "Egypt", MA: "Morocco", TN: "Tunisia",
  GH: "Ghana", KE: "Kenya", TZ: "Tanzania", UG: "Uganda",
  ET: "Ethiopia", SN: "Senegal", CI: "Côte d'Ivoire",
  AE: "United Arab Emirates", SA: "Saudi Arabia", QA: "Qatar",
  KW: "Kuwait", BH: "Bahrain", OM: "Oman", JO: "Jordan",
  LB: "Lebanon", IQ: "Iraq", TR: "Turkey", IL: "Israel",
  MY: "Malaysia", TH: "Thailand", PH: "Philippines", ID: "Indonesia",
  VN: "Vietnam", KR: "South Korea", TW: "Taiwan", PK: "Pakistan",
  BD: "Bangladesh", LK: "Sri Lanka",
};

function countryName(iso2: string): string {
  const geoEntry = jurisdictionRisk(iso2);
  const geoName = geoEntry.iso2 === iso2.toUpperCase() ? geoEntry.name : "";
  // geographicRisk returns the code itself when it has no friendly name.
  if (geoName && geoName !== iso2.toUpperCase()) return geoName;
  return EXTRA_COUNTRY_NAMES[iso2.toUpperCase()] ?? iso2.toUpperCase();
}

function fatfStatus(iso2: string): CorrespondentBankResult["fatfStatus"] {
  const entry = jurisdictionRisk(iso2);
  if (entry.tiers.includes("fatf_black")) return "black_list";
  if (entry.tiers.includes("fatf_grey")) return "grey_list";
  // FATF membership proxy: G20 + FATF member jurisdictions + FATF-style
  // regional bodies. Non-members bear heightened scrutiny.
  const FATF_MEMBERS: ReadonlySet<string> = new Set([
    "AR","AU","AT","BE","BR","CA","CN","DK","EU","FI","FR","DE","GR",
    "HK","IN","IE","IL","IT","JP","LU","MY","MX","NL","NZ","NO","PT",
    "RU","SA","SG","ZA","ES","SE","CH","TR","GB","US",
  ]);
  return FATF_MEMBERS.has(iso2.toUpperCase()) ? "compliant" : "non_member";
}

/**
 * Assess the risk of a correspondent banking relationship based solely
 * on the BIC/SWIFT code.
 *
 * BIC structure (ISO 9362):
 *   chars 1–4  : bank code
 *   chars 5–6  : ISO 3166-1 alpha-2 country code
 *   chars 7–8  : location code (optional)
 *   chars 9–11 : branch code (optional, "XXX" = primary)
 *
 * Scoring breakdown:
 *   40% country risk   (from geographicRisk.jurisdictionRisk inherentRisk 0–100)
 *   20% entity signals (PEP density, sanctions exposure)
 *   40% de-risking     (de-risking indicator, FATF black/grey)
 */
export function assessCorrespondentBank(bic: string): CorrespondentBankResult {
  const normalised = bic.toUpperCase().trim();

  // BIC must be 8 or 11 characters per ISO 9362.
  const bicClean = normalised.replace(/\s/g, "");
  const validLength = bicClean.length === 8 || bicClean.length === 11;
  const bankCode = bicClean.slice(0, 4);
  const countryCode = bicClean.slice(4, 6);

  const flags: string[] = [];

  if (!validLength || !/^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(bicClean)) {
    flags.push("invalid_bic_format");
  }

  // ── Country risk component (40% weight) ──────────────────────────────────
  const geoEntry = jurisdictionRisk(countryCode);
  const countryRiskRaw = geoEntry.inherentRisk; // 0–100

  if (geoEntry.tiers.includes("comprehensive_sanctions")) {
    flags.push("comprehensive_sanctions_jurisdiction");
  }
  if (geoEntry.tiers.includes("fatf_black")) {
    flags.push("fatf_black_list");
  }
  if (geoEntry.tiers.includes("fatf_grey")) {
    flags.push("fatf_grey_list");
  }
  if (geoEntry.tiers.includes("eu_aml_high_risk")) {
    flags.push("eu_aml_high_risk");
  }

  // ── Entity signals (20% weight) ──────────────────────────────────────────
  const isSanctioned = SANCTIONED_BIC_PREFIXES.has(bankCode);
  const pepDense = PEP_DENSE_COUNTRY_CODES.has(countryCode);

  if (isSanctioned) flags.push("sanctioned_bank");
  if (pepDense) flags.push("pep_dense_jurisdiction");

  // Entity risk 0–100: sanctioned = 100, PEP dense = 70, otherwise 0.
  const entityRisk = isSanctioned ? 100 : pepDense ? 70 : 0;

  // ── De-risking indicators (40% weight) ───────────────────────────────────
  const deRiskingFlag = DERISKING_COUNTRY_CODES.has(countryCode);
  const fatfBad = geoEntry.tiers.includes("fatf_black") || geoEntry.tiers.includes("fatf_grey");

  if (deRiskingFlag) flags.push("de_risking_pressure_jurisdiction");

  // De-risking risk 0–100: de-risking jurisdiction = 60, FATF bad = 80.
  const deRiskingRisk = isSanctioned
    ? 100
    : fatfBad
    ? 80
    : deRiskingFlag
    ? 60
    : 0;

  // ── Composite score ───────────────────────────────────────────────────────
  const riskScore = Math.min(
    100,
    Math.round(
      countryRiskRaw * 0.4 +
      entityRisk * 0.2 +
      deRiskingRisk * 0.4,
    ),
  );

  // ── Risk tier ─────────────────────────────────────────────────────────────
  let riskTier: CorrespondentBankResult["riskTier"];
  if (riskScore >= 80 || isSanctioned) {
    riskTier = "critical";
  } else if (riskScore >= 60) {
    riskTier = "high";
  } else if (riskScore >= 35) {
    riskTier = "medium";
  } else {
    riskTier = "low";
  }

  // ── Recommendation ────────────────────────────────────────────────────────
  let recommendation: CorrespondentBankResult["recommendation"];
  if (riskTier === "critical" || isSanctioned) {
    recommendation = "decline";
  } else if (riskTier === "high" || fatfBad || deRiskingFlag || pepDense) {
    recommendation = "enhanced_due_diligence";
  } else {
    recommendation = "approve";
  }

  const fStatus = fatfStatus(countryCode);

  return {
    bic: bicClean,
    bankName: `Bank ${bankCode}`,  // static assessment only; enriched name via KYC route
    country: countryName(countryCode),
    riskScore,
    riskTier,
    fatfStatus: fStatus,
    sanctionsExposure: isSanctioned || geoEntry.tiers.includes("comprehensive_sanctions"),
    pep: pepDense,
    deRiskingRisk: deRiskingFlag,
    flags,
    recommendation,
  };
}
