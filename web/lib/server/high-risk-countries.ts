// High-risk country classification for AML/CFT risk assessment.
// Sources:
//   - FATF blacklist (High-Risk Jurisdictions Subject to a Call for Action) — 2025
//   - FATF greylist (Jurisdictions Under Increased Monitoring) — updated Feb 2025
//   - UAE Cabinet Resolution 74/2020 designated high-risk list
//   - UAE Cabinet Decision 74/2023 CAHRA countries
//   - UN Security Council sanctions list nexus jurisdictions
//   - CAHRA: Conflict-Affected and High-Risk Areas (FATF Rec.10 / LBMA responsible sourcing)
//   - Transparency International CPI 2023
//   - ACLED / IISS Armed Conflict Survey 2024 (conflict zones)
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
  // ── FATF Blacklist (High-Risk / Call for Action) — 2025 ──────────────────
  ["KP", { iso2: "KP", name: "North Korea", tier: "blacklist", basis: ["FATF blacklist 2025", "UN sanctions"] }],
  ["IR", { iso2: "IR", name: "Iran", tier: "blacklist", basis: ["FATF blacklist 2025", "OFAC SDN"] }],
  ["MM", { iso2: "MM", name: "Myanmar", tier: "blacklist", basis: ["FATF blacklist 2025"] }],

  // ── FATF Greylist (Increased Monitoring) — Feb 2025 ──────────────────────
  ["DZ", { iso2: "DZ", name: "Algeria", tier: "greylist", basis: ["FATF greylist 2025"] }],
  ["AO", { iso2: "AO", name: "Angola", tier: "greylist", basis: ["FATF greylist 2025"] }],
  ["BG", { iso2: "BG", name: "Bulgaria", tier: "greylist", basis: ["FATF greylist 2025"] }],
  ["BF", { iso2: "BF", name: "Burkina Faso", tier: "greylist", basis: ["FATF greylist 2025"] }],
  ["CM", { iso2: "CM", name: "Cameroon", tier: "greylist", basis: ["FATF greylist 2025"] }],
  ["CI", { iso2: "CI", name: "Côte d'Ivoire", tier: "greylist", basis: ["FATF greylist 2025"] }],
  ["HR", { iso2: "HR", name: "Croatia", tier: "greylist", basis: ["FATF greylist 2025"] }],
  ["CD", { iso2: "CD", name: "Democratic Republic of Congo", tier: "greylist", basis: ["FATF greylist 2025"] }],
  ["HT", { iso2: "HT", name: "Haiti", tier: "greylist", basis: ["FATF greylist 2025"] }],
  ["KE", { iso2: "KE", name: "Kenya", tier: "greylist", basis: ["FATF greylist 2025"] }],
  ["LA", { iso2: "LA", name: "Laos", tier: "greylist", basis: ["FATF greylist 2025"] }],
  ["LB", { iso2: "LB", name: "Lebanon", tier: "greylist", basis: ["FATF greylist 2025"] }],
  ["ML", { iso2: "ML", name: "Mali", tier: "greylist", basis: ["FATF greylist 2025"] }],
  ["MC", { iso2: "MC", name: "Monaco", tier: "greylist", basis: ["FATF greylist 2025"] }],
  ["MZ", { iso2: "MZ", name: "Mozambique", tier: "greylist", basis: ["FATF greylist 2025"] }],
  ["NA", { iso2: "NA", name: "Namibia", tier: "greylist", basis: ["FATF greylist 2025"] }],
  ["NG", { iso2: "NG", name: "Nigeria", tier: "greylist", basis: ["FATF greylist 2025"] }],
  ["PH", { iso2: "PH", name: "Philippines", tier: "greylist", basis: ["FATF greylist 2025"] }],
  ["ZA", { iso2: "ZA", name: "South Africa", tier: "greylist", basis: ["FATF greylist 2025"] }],
  ["SY", { iso2: "SY", name: "Syria", tier: "greylist", basis: ["FATF greylist 2025", "UN sanctions"] }],
  ["TZ", { iso2: "TZ", name: "Tanzania", tier: "greylist", basis: ["FATF greylist 2025"] }],
  ["VE", { iso2: "VE", name: "Venezuela", tier: "greylist", basis: ["FATF greylist 2025", "OFAC"] }],
  ["VN", { iso2: "VN", name: "Vietnam", tier: "greylist", basis: ["FATF greylist 2025"] }],
  ["YE", { iso2: "YE", name: "Yemen", tier: "greylist", basis: ["FATF greylist 2025", "UN sanctions"] }],

  // ── Additional elevated-risk jurisdictions (FATF greylist historical / AML nexus) ──
  ["AE", { iso2: "AE", name: "United Arab Emirates", tier: "elevated", basis: ["FATF greylist (exited 2024)"] }],
  ["AF", { iso2: "AF", name: "Afghanistan", tier: "elevated", basis: ["UN sanctions", "CAHRA"] }],
  ["AL", { iso2: "AL", name: "Albania", tier: "elevated", basis: ["FATF greylist (exited 2023)"] }],
  ["BB", { iso2: "BB", name: "Barbados", tier: "elevated", basis: ["FATF greylist (exited 2023)"] }],
  ["BJ", { iso2: "BJ", name: "Benin", tier: "elevated", basis: ["FATF greylist (exited 2023)"] }],
  ["GH", { iso2: "GH", name: "Ghana", tier: "elevated", basis: ["FATF greylist (exited 2023)"] }],
  ["JM", { iso2: "JM", name: "Jamaica", tier: "elevated", basis: ["FATF greylist (exited 2023)"] }],
  ["LY", { iso2: "LY", name: "Libya", tier: "elevated", basis: ["UN sanctions", "CAHRA"] }],
  ["MA", { iso2: "MA", name: "Morocco", tier: "elevated", basis: ["FATF greylist (exited 2023)"] }],
  ["PA", { iso2: "PA", name: "Panama", tier: "elevated", basis: ["FATF greylist (exited 2023)"] }],
  ["PK", { iso2: "PK", name: "Pakistan", tier: "elevated", basis: ["FATF greylist (exited 2022)"] }],
  ["SN", { iso2: "SN", name: "Senegal", tier: "elevated", basis: ["FATF greylist (exited 2023)"] }],
  ["SO", { iso2: "SO", name: "Somalia", tier: "elevated", basis: ["FATF greylist (exited 2023)", "UN sanctions"] }],
  ["SS", { iso2: "SS", name: "South Sudan", tier: "elevated", basis: ["UN sanctions", "CAHRA"] }],
  ["TN", { iso2: "TN", name: "Tunisia", tier: "elevated", basis: ["FATF greylist (exited 2023)"] }],
  ["TR", { iso2: "TR", name: "Turkey", tier: "elevated", basis: ["FATF greylist (exited 2024)", "CAHRA"] }],
  ["UG", { iso2: "UG", name: "Uganda", tier: "elevated", basis: ["FATF greylist (exited 2023)"] }],

  // ── UAE CR 74/2020 + Russia/Belarus sanctions — elevated risk ─────────────
  ["BY", { iso2: "BY", name: "Belarus", tier: "elevated", basis: ["EU/OFAC sanctions", "UAE CR 74/2020"] }],
  ["CF", { iso2: "CF", name: "Central African Republic", tier: "elevated", basis: ["CAHRA", "UN sanctions"] }],
  ["CU", { iso2: "CU", name: "Cuba", tier: "elevated", basis: ["UAE CR 74/2020", "OFAC"] }],
  ["IQ", { iso2: "IQ", name: "Iraq", tier: "elevated", basis: ["UAE CR 74/2020", "UN sanctions nexus"] }],
  ["RU", { iso2: "RU", name: "Russia", tier: "elevated", basis: ["EU/OFAC/UK sanctions", "UAE CR 74/2020"] }],
  ["SD", { iso2: "SD", name: "Sudan", tier: "elevated", basis: ["UAE CR 74/2020", "UN sanctions", "CAHRA"] }],
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
  "democratic republic of congo": "CD", "drc": "CD", "dr congo": "CD",
  "uae": "AE", "emirates": "AE", "united arab emirates": "AE",
  "russia": "RU", "russian federation": "RU",
  "belarus": "BY", "byelorussia": "BY",
  "morocco": "MA", "maroc": "MA",
  "turkey": "TR", "turkiye": "TR",
  "ivory coast": "CI", "cote d'ivoire": "CI", "côte d'ivoire": "CI",
  "laos": "LA", "lao pdr": "LA",
  "south africa": "ZA",
  "venezuela": "VE",
  "vietnam": "VN", "viet nam": "VN",
  "algeria": "DZ",
  "angola": "AO",
  "bulgaria": "BG",
  "burkina faso": "BF",
  "cameroon": "CM",
  "croatia": "HR",
  "haiti": "HT",
  "kenya": "KE",
  "lebanon": "LB",
  "mali": "ML",
  "monaco": "MC",
  "mozambique": "MZ",
  "namibia": "NA",
  "nigeria": "NG",
  "philippines": "PH",
  "syria": "SY", "syrian arab republic": "SY",
  "tanzania": "TZ",
  "yemen": "YE",
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

// ── Conflict Zone Registry ────────────────────────────────────────────────────
// Intensity levels sourced from ACLED / IISS Armed Conflict Survey 2024,
// UN OCHA situation reports, and FATF/FATF-Style Regional Body guidance.
// Used for enhanced due diligence triggers on customers, counterparties,
// and gold/precious-metal supply-chain provenance risk assessment.
export type ConflictIntensity = "active_war" | "civil_conflict" | "post_conflict" | "fragile";

export const CONFLICT_ZONES: Record<string, ConflictIntensity> = {
  AF: "active_war",      // Afghanistan — Taliban control, ongoing insurgency
  SY: "active_war",      // Syria — multi-front conflict persists
  YE: "active_war",      // Yemen — Houthi/coalition conflict
  SS: "active_war",      // South Sudan — renewed civil war
  ET: "civil_conflict",  // Ethiopia — Tigray/Amhara regional conflicts
  ML: "active_war",      // Mali — Sahel jihadist insurgency
  BF: "active_war",      // Burkina Faso — Sahel jihadist insurgency
  NE: "civil_conflict",  // Niger — post-coup instability
  CF: "active_war",      // Central African Republic — ongoing armed groups
  CD: "civil_conflict",  // DRC — eastern Congo armed conflict
  SO: "active_war",      // Somalia — Al-Shabaab insurgency
  NG: "civil_conflict",  // Nigeria — North-East Boko Haram / ISWAP
  SD: "civil_conflict",  // Sudan — RSF/SAF civil war
  LY: "civil_conflict",  // Libya — fragmented militia control
  MM: "civil_conflict",  // Myanmar — post-coup armed resistance
  UA: "active_war",      // Ukraine — Russian full-scale invasion
  PS: "active_war",      // Palestine/Gaza — active military operations
  IQ: "post_conflict",   // Iraq — stabilising, residual ISIS activity
  LB: "fragile",         // Lebanon — economic collapse, Hezbollah tensions
  HT: "fragile",         // Haiti — gang control, political vacuum
};

/** Returns the conflict intensity for a country, or undefined if not in the registry. */
export function getConflictIntensity(iso2: string | undefined | null): ConflictIntensity | undefined {
  if (!iso2) return undefined;
  return CONFLICT_ZONES[iso2.toUpperCase().trim() as keyof typeof CONFLICT_ZONES];
}

/** Returns true if the country has active-war or civil-conflict status. */
export function isActiveConflict(iso2: string | undefined | null): boolean {
  const intensity = getConflictIntensity(iso2);
  return intensity === "active_war" || intensity === "civil_conflict";
}

// ── Transparency International CPI 2023 ──────────────────────────────────────
// Corruption Perceptions Index 2023 scores (0 = highly corrupt, 100 = very clean).
// Listed: 30 highest-risk countries with CPI < 40.
// Source: Transparency International CPI 2023 (published Jan 2024).
// Used to calibrate corruption-risk component of composite AML risk scoring.
export const CPI_SCORES: Record<string, number> = {
  SO: 11,   // Somalia
  SY: 13,   // Syria
  SS: 13,   // South Sudan
  VE: 13,   // Venezuela
  YE: 16,   // Yemen
  LY: 18,   // Libya
  KP: 17,   // North Korea
  HT: 17,   // Haiti
  GQ: 17,   // Equatorial Guinea
  SD: 22,   // Sudan
  AF: 20,   // Afghanistan
  NI: 22,   // Nicaragua
  MM: 23,   // Myanmar (Burma)
  ER: 22,   // Eritrea
  TJ: 22,   // Tajikistan
  CD: 20,   // DR Congo
  GN: 25,   // Guinea
  CF: 20,   // Central African Republic
  MR: 28,   // Mauritania
  ZW: 23,   // Zimbabwe
  MG: 26,   // Madagascar
  CG: 23,   // Republic of Congo
  BI: 23,   // Burundi
  IR: 25,   // Iran
  KM: 28,   // Comoros
  KH: 24,   // Cambodia
  NG: 25,   // Nigeria
  ML: 28,   // Mali
  TM: 18,   // Turkmenistan
  UZ: 33,   // Uzbekistan
};

/** Returns the CPI 2023 score for a country, or undefined if not in the index. */
export function getCpiScore(iso2: string | undefined | null): number | undefined {
  if (!iso2) return undefined;
  return CPI_SCORES[iso2.toUpperCase().trim() as keyof typeof CPI_SCORES];
}

/** Returns true if the country has a CPI score below the specified threshold (default 40). */
export function isHighCorruptionRisk(iso2: string | undefined | null, threshold = 40): boolean {
  const score = getCpiScore(iso2);
  return score !== undefined && score < threshold;
}

// ── CAHRA — Conflict-Affected and High-Risk Areas ─────────────────────────────
// Relevant for DPMS (gold/precious metals) sourcing under OECD Due Diligence
// Guidance for Responsible Supply Chains of Minerals from Conflict-Affected
// and High-Risk Areas (3rd Ed.), LBMA Responsible Sourcing Guidance,
// and UAE MoEI/CBUAE guidance on DPMS customer risk.
// Per UAE Cabinet Decision 74/2023 — updated Feb 2025.
// ISO 3166-1 alpha-2 codes.
export const CAHRA_COUNTRIES = new Set<string>([
  "AF",  // Afghanistan — Taliban regime, conflict-affected mining
  "BF",  // Burkina Faso — Sahel conflict zone
  "CD",  // DR Congo (DRC) — primary CAHRA designation, artisanal mining conflict
  "CF",  // Central African Republic — armed group mineral exploitation
  "CI",  // Côte d'Ivoire — historical CAHRA, residual risk
  "ER",  // Eritrea — authoritarian regime, opaque mining sector
  "ET",  // Ethiopia — Tigray/Amhara conflict-affected regions
  "GN",  // Guinea — political instability, artisanal mining
  "HT",  // Haiti — gang control, weak governance
  "IQ",  // Iraq — post-conflict, residual armed group activity
  "LB",  // Lebanon — fragile state, Hezbollah gold trafficking risk
  "LY",  // Libya — militia control of southern gold routes
  "ML",  // Mali — jihadist insurgency, artisanal gold mining
  "MM",  // Myanmar — military junta, conflict-affected jade/gemstones
  "MZ",  // Mozambique — northern Cabo Delgado conflict
  "NE",  // Niger — post-coup instability, Sahel mining
  "NG",  // Nigeria — Boko Haram/ISWAP zones, artisanal mining
  "PS",  // Palestine/Gaza — active conflict
  "SD",  // Sudan — RSF/SAF civil war, Darfur gold trafficking
  "SO",  // Somalia — Al-Shabaab revenue from charcoal/minerals
  "SS",  // South Sudan — civil conflict, oil/mineral revenue diversion
  "SY",  // Syria — post-conflict mineral extraction, sanctions nexus
  "UA",  // Ukraine — active war zone, occupied territory resource extraction
  "YE",  // Yemen — active war zone, Houthi mineral revenue
  "ZW",  // Zimbabwe — ZANU-PF controlled mining, sanctions risk
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
