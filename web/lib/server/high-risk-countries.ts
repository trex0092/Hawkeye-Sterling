// High-risk country classification for AML/CFT risk assessment.
// Sources:
//   - FATF blacklist (High-Risk Jurisdictions Subject to a Call for Action)
//   - FATF greylist (Jurisdictions Under Increased Monitoring) — last updated May 2026
//   - UAE Cabinet Resolution 74/2020 designated high-risk list
//   - UN Security Council sanctions list nexus jurisdictions
//   - CAHRA: Conflict-Affected and High-Risk Areas (FATF Rec.10 / LBMA responsible sourcing)
//
// ISO 3166-1 alpha-2 codes. Names accepted as aliases for common-name matching.

export type CountryRiskTier = "blacklist" | "greylist" | "elevated" | "standard";

export interface CountryRiskEntry {
  iso2: string;
  name: string;
  tier: CountryRiskTier;
  basis: string[];
}

// Canonical lookup keyed by ISO-2 (uppercased).
const COUNTRY_RISK_MAP = new Map<string, CountryRiskEntry>([
  // ── FATF Blacklist (High-Risk / Call for Action) ─────────────────────────
  ["KP", { iso2: "KP", name: "North Korea", tier: "blacklist", basis: ["FATF blacklist", "UN sanctions"] }],
  ["IR", { iso2: "IR", name: "Iran", tier: "blacklist", basis: ["FATF blacklist", "OFAC SDN"] }],
  ["MM", { iso2: "MM", name: "Myanmar", tier: "blacklist", basis: ["FATF blacklist"] }],

  // ── FATF Greylist (Increased Monitoring) May 2026 ────────────────────────
  ["AE", { iso2: "AE", name: "United Arab Emirates", tier: "greylist", basis: ["FATF greylist"] }],
  ["AF", { iso2: "AF", name: "Afghanistan", tier: "greylist", basis: ["FATF greylist"] }],
  ["AL", { iso2: "AL", name: "Albania", tier: "greylist", basis: ["FATF greylist"] }],
  ["BB", { iso2: "BB", name: "Barbados", tier: "greylist", basis: ["FATF greylist"] }],
  ["BF", { iso2: "BF", name: "Burkina Faso", tier: "greylist", basis: ["FATF greylist"] }],
  ["BJ", { iso2: "BJ", name: "Benin", tier: "greylist", basis: ["FATF greylist"] }],
  ["CM", { iso2: "CM", name: "Cameroon", tier: "greylist", basis: ["FATF greylist"] }],
  ["CD", { iso2: "CD", name: "DR Congo", tier: "greylist", basis: ["FATF greylist"] }],
  ["GH", { iso2: "GH", name: "Ghana", tier: "greylist", basis: ["FATF greylist"] }],
  ["HT", { iso2: "HT", name: "Haiti", tier: "greylist", basis: ["FATF greylist"] }],
  ["JM", { iso2: "JM", name: "Jamaica", tier: "greylist", basis: ["FATF greylist"] }],
  ["KE", { iso2: "KE", name: "Kenya", tier: "greylist", basis: ["FATF greylist"] }],
  ["LY", { iso2: "LY", name: "Libya", tier: "greylist", basis: ["FATF greylist", "UN sanctions"] }],
  ["ML", { iso2: "ML", name: "Mali", tier: "greylist", basis: ["FATF greylist"] }],
  ["MA", { iso2: "MA", name: "Morocco", tier: "greylist", basis: ["FATF greylist"] }],
  ["MZ", { iso2: "MZ", name: "Mozambique", tier: "greylist", basis: ["FATF greylist"] }],
  ["NA", { iso2: "NA", name: "Namibia", tier: "greylist", basis: ["FATF greylist"] }],
  ["NG", { iso2: "NG", name: "Nigeria", tier: "greylist", basis: ["FATF greylist"] }],
  ["PK", { iso2: "PK", name: "Pakistan", tier: "greylist", basis: ["FATF greylist"] }],
  ["PA", { iso2: "PA", name: "Panama", tier: "greylist", basis: ["FATF greylist"] }],
  ["PH", { iso2: "PH", name: "Philippines", tier: "greylist", basis: ["FATF greylist"] }],
  ["SN", { iso2: "SN", name: "Senegal", tier: "greylist", basis: ["FATF greylist"] }],
  ["SO", { iso2: "SO", name: "Somalia", tier: "greylist", basis: ["FATF greylist", "UN sanctions"] }],
  ["SS", { iso2: "SS", name: "South Sudan", tier: "greylist", basis: ["FATF greylist"] }],
  ["SY", { iso2: "SY", name: "Syria", tier: "greylist", basis: ["FATF greylist", "UN sanctions"] }],
  ["TN", { iso2: "TN", name: "Tunisia", tier: "greylist", basis: ["FATF greylist"] }],
  ["TR", { iso2: "TR", name: "Turkey", tier: "greylist", basis: ["FATF greylist"] }],
  ["TZ", { iso2: "TZ", name: "Tanzania", tier: "greylist", basis: ["FATF greylist"] }],
  ["UG", { iso2: "UG", name: "Uganda", tier: "greylist", basis: ["FATF greylist"] }],
  ["VN", { iso2: "VN", name: "Vietnam", tier: "greylist", basis: ["FATF greylist"] }],
  ["YE", { iso2: "YE", name: "Yemen", tier: "greylist", basis: ["FATF greylist", "UN sanctions"] }],

  // ── UAE CR 74/2020 + Russia/Belarus sanctions — elevated risk ─────────────
  ["BY", { iso2: "BY", name: "Belarus", tier: "elevated", basis: ["EU/OFAC sanctions", "UAE CR 74/2020"] }],
  ["CF", { iso2: "CF", name: "Central African Republic", tier: "elevated", basis: ["CAHRA", "UN sanctions"] }],
  ["CU", { iso2: "CU", name: "Cuba", tier: "elevated", basis: ["UAE CR 74/2020", "OFAC"] }],
  ["IQ", { iso2: "IQ", name: "Iraq", tier: "elevated", basis: ["UAE CR 74/2020", "UN sanctions nexus"] }],
  ["RU", { iso2: "RU", name: "Russia", tier: "elevated", basis: ["EU/OFAC/UK sanctions", "UAE CR 74/2020"] }],
  ["SD", { iso2: "SD", name: "Sudan", tier: "elevated", basis: ["UAE CR 74/2020", "UN sanctions"] }],
  ["VE", { iso2: "VE", name: "Venezuela", tier: "elevated", basis: ["UAE CR 74/2020", "OFAC"] }],
  ["ZW", { iso2: "ZW", name: "Zimbabwe", tier: "elevated", basis: ["UAE CR 74/2020"] }],
]);

// Name → ISO-2 index for fuzzy country-name lookups (lowercased).
const COUNTRY_NAME_INDEX = new Map<string, string>();
for (const [iso2, entry] of COUNTRY_RISK_MAP) {
  COUNTRY_NAME_INDEX.set(entry.name.toLowerCase(), iso2);
}
// Common aliases
const NAME_ALIASES: Record<string, string> = {
  "dprk": "KP", "north korea": "KP",
  "iran": "IR", "islamic republic of iran": "IR",
  "burma": "MM", "myanmar": "MM",
  "democratic republic of congo": "CD", "drc": "CD",
  "uae": "AE", "emirates": "AE",
  "russia": "RU", "russian federation": "RU",
  "belarus": "BY", "byelorussia": "BY",
  "morocco": "MA", "maroc": "MA",
  "turkey": "TR", "turkiye": "TR",
};

/** Look up a country by ISO-2 code or common name. Returns null for standard-risk. */
export function getCountryRisk(input: string | undefined | null): CountryRiskEntry | null {
  if (!input) return null;
  const s = input.trim();
  // Try ISO-2 first (case-insensitive, max 3 chars)
  if (s.length <= 3) {
    const entry = COUNTRY_RISK_MAP.get(s.toUpperCase());
    if (entry) return entry;
  }
  // Try alias map
  const aliasIso = NAME_ALIASES[s.toLowerCase()];
  if (aliasIso) return COUNTRY_RISK_MAP.get(aliasIso) ?? null;
  // Try name index
  const byName = COUNTRY_NAME_INDEX.get(s.toLowerCase());
  if (byName) return COUNTRY_RISK_MAP.get(byName) ?? null;
  return null;
}

export function isHighRisk(input: string | undefined | null): boolean {
  const entry = getCountryRisk(input);
  return entry !== null && entry.tier !== "standard";
}

// ── CAHRA — Conflict-Affected and High-Risk Areas ─────────────────────────────
// Relevant for DPMS (gold/precious metals) sourcing under OECD Due Diligence
// Guidance for Responsible Supply Chains of Minerals from Conflict-Affected
// and High-Risk Areas (3rd Ed.), LBMA Responsible Sourcing Guidance,
// and UAE MoEI/CBUAE guidance on DPMS customer risk.
// ISO 3166-1 alpha-2 codes — May 2026.
export const CAHRA_COUNTRIES = new Set<string>([
  "BF",  // Burkina Faso
  "CD",  // DR Congo (DRC) — primary CAHRA designation
  "CF",  // Central African Republic
  "ER",  // Eritrea
  "ET",  // Ethiopia
  "LY",  // Libya
  "ML",  // Mali
  "MZ",  // Mozambique
  "NE",  // Niger
  "SD",  // Sudan
  "SO",  // Somalia
  "SS",  // South Sudan
]);

/** Returns true if the country is a Conflict-Affected and High-Risk Area (CAHRA). */
export function isCahra(iso2: string | undefined | null): boolean {
  if (!iso2) return false;
  return CAHRA_COUNTRIES.has(iso2.toUpperCase().trim());
}

// ── UAE-specific elevated-risk country set ────────────────────────────────────
// Per CBUAE AML/CFT guidance and UAE Cabinet Resolution 74/2020.
// Used for enhanced customer due diligence triggers independent of FATF lists.
export const UAE_HIGH_RISK_COUNTRIES = new Set<string>([
  "BY",  // Belarus
  "CU",  // Cuba
  "IQ",  // Iraq
  "RU",  // Russia
  "SD",  // Sudan
  "SY",  // Syria
  "VE",  // Venezuela
  "ZW",  // Zimbabwe
]);

/** Returns true if the country is on the UAE-specific elevated-risk list. */
export function isUaeHighRisk(iso2: string | undefined | null): boolean {
  if (!iso2) return false;
  return UAE_HIGH_RISK_COUNTRIES.has(iso2.toUpperCase().trim());
}
