// High-risk country classification for AML/CFT risk assessment.
// Sources:
//   - FATF blacklist (High-Risk Jurisdictions Subject to a Call for Action)
//   - FATF greylist (Jurisdictions Under Increased Monitoring) — last updated Feb 2025
//   - UAE Cabinet Resolution 74/2020 designated high-risk list
//   - UN Security Council sanctions list nexus jurisdictions
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

  // ── FATF Greylist (Increased Monitoring) Feb 2025 ────────────────────────
  ["AF", { iso2: "AF", name: "Afghanistan", tier: "greylist", basis: ["FATF greylist"] }],
  ["AL", { iso2: "AL", name: "Albania", tier: "greylist", basis: ["FATF greylist"] }],
  ["BB", { iso2: "BB", name: "Barbados", tier: "greylist", basis: ["FATF greylist"] }],
  ["BF", { iso2: "BF", name: "Burkina Faso", tier: "greylist", basis: ["FATF greylist"] }],
  ["KH", { iso2: "KH", name: "Cambodia", tier: "greylist", basis: ["FATF greylist"] }],
  ["CM", { iso2: "CM", name: "Cameroon", tier: "greylist", basis: ["FATF greylist"] }],
  ["CD", { iso2: "CD", name: "DR Congo", tier: "greylist", basis: ["FATF greylist"] }],
  ["HT", { iso2: "HT", name: "Haiti", tier: "greylist", basis: ["FATF greylist"] }],
  ["JM", { iso2: "JM", name: "Jamaica", tier: "greylist", basis: ["FATF greylist"] }],
  ["MU", { iso2: "MU", name: "Mauritius", tier: "greylist", basis: ["FATF greylist"] }],
  ["MZ", { iso2: "MZ", name: "Mozambique", tier: "greylist", basis: ["FATF greylist"] }],
  ["NA", { iso2: "NA", name: "Namibia", tier: "greylist", basis: ["FATF greylist"] }],
  ["NG", { iso2: "NG", name: "Nigeria", tier: "greylist", basis: ["FATF greylist"] }],
  ["PK", { iso2: "PK", name: "Pakistan", tier: "greylist", basis: ["FATF greylist"] }],
  ["PA", { iso2: "PA", name: "Panama", tier: "greylist", basis: ["FATF greylist"] }],
  ["PH", { iso2: "PH", name: "Philippines", tier: "greylist", basis: ["FATF greylist"] }],
  ["SS", { iso2: "SS", name: "South Sudan", tier: "greylist", basis: ["FATF greylist"] }],
  ["SY", { iso2: "SY", name: "Syria", tier: "greylist", basis: ["FATF greylist", "UN sanctions"] }],
  ["TZ", { iso2: "TZ", name: "Tanzania", tier: "greylist", basis: ["FATF greylist"] }],
  ["TT", { iso2: "TT", name: "Trinidad and Tobago", tier: "greylist", basis: ["FATF greylist"] }],
  ["UG", { iso2: "UG", name: "Uganda", tier: "greylist", basis: ["FATF greylist"] }],
  ["AE", { iso2: "AE", name: "United Arab Emirates", tier: "greylist", basis: ["FATF greylist"] }],
  ["VN", { iso2: "VN", name: "Vietnam", tier: "greylist", basis: ["FATF greylist"] }],
  ["YE", { iso2: "YE", name: "Yemen", tier: "greylist", basis: ["FATF greylist", "UN sanctions"] }],

  // ── UAE CR 74/2020 additional elevated-risk jurisdictions ────────────────
  ["CU", { iso2: "CU", name: "Cuba", tier: "elevated", basis: ["UAE CR 74/2020", "OFAC"] }],
  ["IQ", { iso2: "IQ", name: "Iraq", tier: "elevated", basis: ["UAE CR 74/2020", "UN sanctions nexus"] }],
  ["LY", { iso2: "LY", name: "Libya", tier: "elevated", basis: ["UAE CR 74/2020", "UN sanctions"] }],
  ["SD", { iso2: "SD", name: "Sudan", tier: "elevated", basis: ["UAE CR 74/2020", "UN sanctions"] }],
  ["SO", { iso2: "SO", name: "Somalia", tier: "elevated", basis: ["UAE CR 74/2020", "UN sanctions"] }],
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
