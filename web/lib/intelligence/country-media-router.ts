// Hawkeye Sterling — worldwide per-country adverse-media query routing.
//
// First wiring of the 195-country jurisdiction risk registry
// (web/lib/data/jurisdictions.ts) into adverse-media coverage. Builds the
// query plan the deep scan executes: a global pass (all adapters, default
// language) followed by targeted per-country passes in each country's
// primary press language.
//
// Target set = subject's own countries (nationality / jurisdiction)
//            ∪ FATF call-for-action ∪ FATF increased-monitoring
//            ∪ EU AMLD high-risk third countries ∪ Basel very_high tier.
// This is the "smart worldwide" profile: global sources (GDELT, LLM recall,
// RSS wires) already sweep worldwide press; the per-country passes add
// local-language depth exactly where the risk registries say it matters.
//
// HAWKEYE_DEEP_SCAN_MAX_COUNTRIES (0 = unlimited) caps the fan-out;
// countries are prioritised subject-first, then by risk severity.

import { JURISDICTION_RISK, type JurisdictionRisk } from "@/lib/data/jurisdictions";

// Primary press language per country (ISO 639-1). Countries not listed
// default to English — most national press in unlisted jurisdictions has an
// English-language wire presence, and the global pass covers the rest.
const COUNTRY_PRIMARY_LANGUAGE: Record<string, string> = {
  // Middle East / North Africa
  AE: "ar", SA: "ar", IQ: "ar", SY: "ar", YE: "ar", JO: "ar", LB: "ar",
  EG: "ar", LY: "ar", DZ: "ar", MA: "ar", TN: "ar", SD: "ar", QA: "ar",
  KW: "ar", BH: "ar", OM: "ar", PS: "ar", MR: "ar",
  IR: "fa", AF: "fa", PK: "ur", TR: "tr",
  // Europe / CIS
  RU: "ru", BY: "ru", KZ: "ru", KG: "ru", TJ: "ru", UA: "uk",
  DE: "de", AT: "de", CH: "de", FR: "fr", BE: "fr", LU: "fr", MC: "fr",
  ES: "es", IT: "it", PT: "pt", NL: "nl", UZ: "ru", TM: "ru", AM: "ru",
  AZ: "ru", GE: "ru", MD: "ro", RO: "ro", BG: "bg", RS: "sr", AL: "sq",
  HR: "hr", BA: "bs", MK: "mk", ME: "sr", GR: "el", PL: "pl", CZ: "cs",
  SK: "sk", HU: "hu", SE: "sv", NO: "no", DK: "da", FI: "fi",
  // Asia-Pacific
  CN: "zh", TW: "zh", HK: "zh", MO: "zh", JP: "ja", KR: "ko", KP: "ko",
  VN: "vi", TH: "th", ID: "id", MY: "ms", MM: "my", KH: "km", LA: "lo",
  IN: "hi", BD: "bn", NP: "ne", LK: "si", MN: "mn", PH: "en", SG: "en",
  // Americas
  MX: "es", AR: "es", CO: "es", VE: "es", PE: "es", CL: "es", EC: "es",
  BO: "es", PY: "es", UY: "es", CU: "es", DO: "es", GT: "es", HN: "es",
  SV: "es", NI: "es", PA: "es", CR: "es", BR: "pt", HT: "ht",
  // Africa (sub-Saharan, non-arabophone)
  ET: "am", ER: "ti", SO: "so", CD: "fr", CG: "fr", CI: "fr", SN: "fr",
  ML: "fr", BF: "fr", NE: "fr", TD: "fr", CM: "fr", GA: "fr", GN: "fr",
  BJ: "fr", TG: "fr", RW: "fr", BI: "fr", DJ: "fr", MG: "fr", CF: "fr",
  AO: "pt", MZ: "pt", GW: "pt", CV: "pt", ST: "pt", TZ: "sw", KE: "sw",
};

export interface CountryMediaQuery {
  /** ISO 3166-1 alpha-2 (undefined = global pass). */
  country?: string;
  /** Country display name for reporting. */
  countryName?: string;
  /** ISO 639-1 language for the pass (undefined = adapter default, "en"). */
  language?: string;
  /** Why this country is in the plan. */
  reason: "global" | "subject_country" | "fatf_call_for_action" | "fatf_increased_monitoring" | "eu_high_risk" | "basel_very_high";
}

export interface WorldwideQueryPlanSubject {
  name: string;
  nationality?: string;
  jurisdiction?: string;
  /** Additional countries the caller knows are relevant (residence, incorporation, transaction corridors). */
  extraCountries?: string[];
}

const RISK_BY_ISO2 = new Map<string, JurisdictionRisk>(
  JURISDICTION_RISK.map((j) => [j.iso2, j]),
);

function languageFor(iso2: string): string | undefined {
  const lang = COUNTRY_PRIMARY_LANGUAGE[iso2];
  // English passes are covered by the global pass — no separate query needed.
  return lang === "en" ? undefined : lang;
}

function riskReason(j: JurisdictionRisk): CountryMediaQuery["reason"] | null {
  if (j.fatf === "call_for_action") return "fatf_call_for_action";
  if (j.fatf === "increased_monitoring") return "fatf_increased_monitoring";
  if (j.eu === "high_risk_third_country") return "eu_high_risk";
  if (j.baselTier === "very_high") return "basel_very_high";
  return null;
}

/**
 * Build the worldwide adverse-media query plan for a subject.
 *
 * Order: global pass first (broadest, cheapest, already multilingual via
 * GDELT/RSS/LLM), then the subject's own countries, then registry high-risk
 * countries by severity. `maxCountries` (0 = unlimited) trims from the tail
 * so subject countries are never dropped.
 */
export function buildWorldwideQueryPlan(
  subject: WorldwideQueryPlanSubject,
  maxCountries = 0,
): CountryMediaQuery[] {
  const plan: CountryMediaQuery[] = [{ reason: "global" }];
  const seen = new Set<string>();

  const pushCountry = (iso2raw: string, reason: CountryMediaQuery["reason"]) => {
    const iso2 = iso2raw.trim().toUpperCase();
    if (iso2.length !== 2 || seen.has(iso2)) return;
    seen.add(iso2);
    const risk = RISK_BY_ISO2.get(iso2);
    const language = languageFor(iso2);
    plan.push({
      country: iso2,
      ...(risk ? { countryName: risk.name } : {}),
      ...(language ? { language } : {}),
      reason,
    });
  };

  // 1. Subject's own countries — always first, never trimmed.
  for (const c of [subject.nationality, subject.jurisdiction, ...(subject.extraCountries ?? [])]) {
    if (c) pushCountry(c, "subject_country");
  }

  // 2. Registry high-risk countries, ordered FATF black → grey → EU → Basel.
  const ranked: Array<{ j: JurisdictionRisk; reason: CountryMediaQuery["reason"]; rank: number }> = [];
  for (const j of JURISDICTION_RISK) {
    const reason = riskReason(j);
    if (!reason) continue;
    const rank =
      reason === "fatf_call_for_action" ? 0 :
      reason === "fatf_increased_monitoring" ? 1 :
      reason === "eu_high_risk" ? 2 : 3;
    ranked.push({ j, reason, rank });
  }
  ranked.sort((a, b) => a.rank - b.rank || a.j.iso2.localeCompare(b.j.iso2));
  for (const { j, reason } of ranked) pushCountry(j.iso2, reason);

  if (maxCountries > 0 && plan.length > maxCountries + 1) {
    // +1: the global pass doesn't count against the country cap. Subject
    // countries sit at the head of the array, so trimming drops only the
    // lowest-ranked registry countries.
    plan.length = maxCountries + 1;
  }
  return plan;
}

/** All registry countries considered high-risk (for tests / reporting). */
export function highRiskCountryCount(): number {
  return JURISDICTION_RISK.filter((j) => riskReason(j) !== null).length;
}

/** True when the ISO2 country is FATF-listed, EU AMLD high-risk, or Basel very-high. */
export function isHighRiskCountry(iso2: string | undefined): boolean {
  if (!iso2) return false;
  const j = RISK_BY_ISO2.get(iso2.trim().toUpperCase());
  return j ? riskReason(j) !== null : false;
}
