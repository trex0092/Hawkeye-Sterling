export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Netlify Pro plan permits up to 60s per sync function. Country risk needs
// the room — Sonnet 4.6 with 3000 tokens routinely takes 30–45s.
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
import { enforce } from "@/lib/server/enforce";
import { sanitizeField } from "@/lib/server/sanitize-prompt";
import { isCahra, getCountryRisk } from "@/lib/server/high-risk-countries";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";

// ── Public API response shape ─────────────────────────────────────────────────

export interface CountryRiskResult {
  ok: true;
  countryCode: string;
  countryName: string;
  riskScore: number;                       // 0-100 composite
  riskLevel: "low" | "medium" | "high" | "critical";
  fatfStatus: "blacklist" | "greylist" | "monitored" | "compliant" | "member" | "grey_list" | "black_list" | "non_member";
  cahraListed: boolean;
  activeSanctionsRegimes: string[];        // e.g. ["US OFAC", "EU", "UN SC"]
  corruptionIndex?: number;               // TI CPI 0-100 (higher = cleaner)
  fragilityIndex?: number;               // FSI raw score 0-120 (higher = more fragile)
  riskDimensions: Record<string, number>; // per-dimension additive scores
  geopoliticalFlags: string[];            // e.g. ["recurring_grey_list","high_risk_neighbors"]
  recommendation: "standard_dd" | "enhanced_dd" | "senior_approval" | "prohibited";
  // Legacy display fields (optional, returned by LLM)
  country?: string;
  overallRisk?: "low" | "medium" | "high" | "critical";
  dimensions?: { amlRisk: number; baselScore: number; cpiScore: number; politicalRisk: number; sanctionsRisk: number; tfRisk: number };
  sanctionsProfile?: { ofac: boolean; eu: boolean; un: boolean; uk: boolean; details: string[] };
  keyRisks?: string[];
  recentDevelopments?: string[];
  regulatoryObligations?: Array<{ obligation: string; regulation: string }>;
  summary?: string;
}

// Legacy interface retained for backward compat (used by static fallback helper)
interface _LegacyCountryRiskResult {
  ok: true;
  country: string;
  overallRisk: "low" | "medium" | "high" | "critical";
  riskScore: number;
  dimensions: {
    amlRisk: number;
    baselScore: number;
    cpiScore: number;
    politicalRisk: number;
    sanctionsRisk: number;
    tfRisk: number;
  };
  fatfStatus: "member" | "grey_list" | "black_list" | "non_member";
  sanctionsProfile: {
    ofac: boolean;
    eu: boolean;
    un: boolean;
    uk: boolean;
    details: string[];
  };
  keyRisks: string[];
  recentDevelopments: string[];
  regulatoryObligations: Array<{ obligation: string; regulation: string }>;
  recommendation: "standard_dd" | "enhanced_dd" | "senior_approval" | "prohibited";
  summary: string;
}

// ── CPI / FSI static lookup table ─────────────────────────────────────────────
// 50 highest-risk jurisdictions — TI CPI 2023, Fund for Peace FSI 2023.
// CPI: 0-100, higher = cleaner. FSI: 0-120, higher = more fragile.
// FSI alert tier: Very High >90, High 80-90, Elevated 70-80.

interface CpiiFsiEntry {
  cpi: number;   // Transparency International CPI (0-100, higher=cleaner)
  fsi: number;   // Fund for Peace FSI raw score (0-120, higher=more fragile)
}

const CPI_FSI_DATA: Record<string, CpiiFsiEntry> = {
  // FATF blacklist
  IR:  { cpi: 24, fsi: 90.5 },
  KP:  { cpi: 11, fsi: 94.1 },
  MM:  { cpi: 23, fsi: 96.2 },
  // Active conflict / CAHRA
  AF:  { cpi: 20, fsi: 103.5 },
  SS:  { cpi: 13, fsi: 110.6 },
  SO:  { cpi: 11, fsi: 113.0 },
  YE:  { cpi: 16, fsi: 104.7 },
  SY:  { cpi: 13, fsi: 105.6 },
  SD:  { cpi: 22, fsi: 101.5 },
  CD:  { cpi: 22, fsi: 107.3 },
  CF:  { cpi: 24, fsi: 108.0 },
  LY:  { cpi: 18, fsi: 95.4 },
  ML:  { cpi: 31, fsi: 96.3 },
  BF:  { cpi: 36, fsi: 93.1 },
  SO2: { cpi: 11, fsi: 113.0 }, // alias guard
  HT:  { cpi: 17, fsi: 100.5 },
  // FATF greylist
  AL:  { cpi: 37, fsi: 56.3 },
  BB:  { cpi: 65, fsi: 40.2 },
  BJ:  { cpi: 43, fsi: 73.0 },
  CM:  { cpi: 27, fsi: 82.4 },
  GH:  { cpi: 43, fsi: 68.7 },
  JM:  { cpi: 44, fsi: 63.8 },
  JO:  { cpi: 46, fsi: 72.0 },
  KE:  { cpi: 31, fsi: 85.6 },
  MA:  { cpi: 38, fsi: 68.9 },
  MZ:  { cpi: 26, fsi: 88.2 },
  NA:  { cpi: 49, fsi: 62.1 },
  NI:  { cpi: 21, fsi: 74.4 },
  NG:  { cpi: 25, fsi: 93.4 },
  PK:  { cpi: 29, fsi: 97.2 },
  PA:  { cpi: 34, fsi: 56.4 },
  PH:  { cpi: 34, fsi: 70.6 },
  SN:  { cpi: 43, fsi: 71.5 },
  TN:  { cpi: 40, fsi: 68.1 },
  TZ:  { cpi: 36, fsi: 74.9 },
  UG:  { cpi: 27, fsi: 83.6 },
  VN:  { cpi: 41, fsi: 56.7 },
  // Elevated-risk / sanctions
  BY:  { cpi: 42, fsi: 68.2 },
  CU:  { cpi: 47, fsi: 63.4 },
  IQ:  { cpi: 23, fsi: 99.2 },
  LB:  { cpi: 24, fsi: 90.8 },
  RU:  { cpi: 26, fsi: 70.3 },
  VE:  { cpi: 13, fsi: 89.7 },
  ZW:  { cpi: 24, fsi: 79.8 },
  // Financial secrecy / offshore
  JE:  { cpi: 72, fsi: 31.0 },
  VG:  { cpi: 47, fsi: 36.5 },
  KY:  { cpi: 55, fsi: 35.8 },
  PA2: { cpi: 34, fsi: 56.4 },  // Panama duplicate guard
  // Other high-profile
  TR:  { cpi: 34, fsi: 68.3 },
  AE:  { cpi: 68, fsi: 45.2 },
};

// ── FATF historical data ─────────────────────────────────────────────────────
// Countries that have appeared on the FATF grey list multiple times.
const RECURRING_GREY_LIST = new Set<string>([
  "PK",  // Pakistan — multiple stints (2008-2010, 2012-2015, 2018-2022)
  "TN",  // Tunisia — (2017-2019, 2022-present)
  "TR",  // Turkey — (2021-2024)
  "HT",  // Haiti — (2010-2014, 2022-present)
  "NG",  // Nigeria — (2019, 2023-present)
  "AF",  // Afghanistan — recurring
  "MM",  // Myanmar — grey/black history
  "SY",  // Syria — recurring
  "YE",  // Yemen — recurring
  "PA",  // Panama — (2014-2016, 2023-present)
  "PH",  // Philippines — (2000-2005, 2021-2023)
  "AL",  // Albania — (2020-present)
  "BB",  // Barbados — recurring
  "JM",  // Jamaica — recurring
]);

// ── Neighbor risk map ─────────────────────────────────────────────────────────
// ISO2 → ISO2[] high-risk neighbors (blacklist + greylist + elevated).
// Only countries whose ≥3 neighbors are high-risk are pre-calculated.
const HIGH_RISK_NEIGHBOR_COUNTRIES = new Set<string>([
  "TR",  // Borders SY, IQ, IR, GE(elevated)
  "JO",  // Borders SY, IQ, territory considerations
  "IQ",  // Borders SY, IR, TR
  "EG",  // Borders LY, SD, proximity
  "TN",  // Borders LY, AL proximity
  "GH",  // Borders BF, NG, CI
  "NG",  // Borders CM, BF, NE
  "CM",  // Borders NG, CF, CD, SS
  "ET",  // Borders SS, SO, SD, ER
  "KE",  // Borders SO, SS, ET
  "TZ",  // Borders MZ, CD, UG
  "UG",  // Borders CD, SS, KE
  "SD",  // Borders SS, CF, LY, ET
  "NE",  // Borders ML, BF, NG, LY
  "ML",  // Borders BF, NE, MR
  "IN",  // Borders PK, MM, AF(proximity)
  "CN",  // Borders MM, AF, KP (proximity)
  "VN",  // Borders MM proximity
  "PH",  // Regional — sea borders
]);

// ── CAHRA UAE registry ────────────────────────────────────────────────────────
// UAE-specific CAHRA register for DPMS / gold sector purposes.
// Per UAE MoEI guidance and FATF Recommendation 10.
const UAE_CAHRA = new Set<string>([
  "AF",  // Afghanistan
  "BF",  // Burkina Faso
  "CF",  // Central African Republic
  "CD",  // DR Congo
  "ER",  // Eritrea
  "ET",  // Ethiopia
  "IQ",  // Iraq
  "LY",  // Libya
  "ML",  // Mali
  "MZ",  // Mozambique
  "MM",  // Myanmar
  "NE",  // Niger
  "NG",  // Nigeria (northern regions)
  "SD",  // Sudan
  "SO",  // Somalia
  "SS",  // South Sudan
  "SY",  // Syria
  "YE",  // Yemen
]);

// ── Financial secrecy jurisdictions ──────────────────────────────────────────
// Offshore centres with FSI (Tax Justice Network Financial Secrecy Index) > 60
// or well-known secrecy-haven status.
const FINANCIAL_SECRECY_JURISDICTIONS = new Set<string>([
  "JE",  // Jersey
  "VG",  // British Virgin Islands
  "KY",  // Cayman Islands
  "PA",  // Panama (Mossack Fonseca)
  "LB",  // Lebanon (banking secrecy history)
  "LI",  // Liechtenstein
  "MC",  // Monaco
  "AD",  // Andorra
  "MV",  // Maldives
  "WS",  // Samoa
  "VU",  // Vanuatu
]);

// ── Active sanctions regime data ─────────────────────────────────────────────
// Static mapping of ISO-2 → active sanctions programs.
// Programs: "US OFAC", "EU", "UN SC", "UK OFSI", "AU DFAT", "CA OSFI"
type SanctionProgram = "US OFAC" | "EU" | "UN SC" | "UK OFSI" | "AU DFAT" | "CA OSFI";

const ACTIVE_SANCTIONS: Record<string, SanctionProgram[]> = {
  IR:  ["US OFAC", "EU", "UN SC", "UK OFSI", "AU DFAT", "CA OSFI"],
  KP:  ["US OFAC", "EU", "UN SC", "UK OFSI", "AU DFAT", "CA OSFI"],
  MM:  ["US OFAC", "EU", "UK OFSI", "AU DFAT", "CA OSFI"],
  SY:  ["US OFAC", "EU", "UN SC", "UK OFSI"],
  RU:  ["US OFAC", "EU", "UK OFSI", "AU DFAT", "CA OSFI"],
  BY:  ["US OFAC", "EU", "UK OFSI", "AU DFAT", "CA OSFI"],
  CU:  ["US OFAC"],
  VE:  ["US OFAC", "EU"],
  LB:  ["US OFAC"],
  SD:  ["US OFAC", "UN SC"],
  SS:  ["US OFAC", "EU", "UN SC"],
  CF:  ["EU", "UN SC"],
  CD:  ["US OFAC", "EU", "UN SC"],
  ML:  ["EU", "UN SC"],
  LY:  ["US OFAC", "EU", "UN SC", "UK OFSI"],
  YE:  ["US OFAC", "EU", "UN SC"],
  SO:  ["UN SC"],
  IQ:  ["US OFAC", "UN SC"],
  ZW:  ["US OFAC", "EU", "UK OFSI"],
  HT:  ["US OFAC"],
  NI:  ["US OFAC"],
  AF:  ["US OFAC", "EU", "UN SC"],
  KE:  [],
  NG:  [],
  PK:  [],
};

// ── Static dataset ────────────────────────────────────────────────────────────
// Covers all FATF grey/black list jurisdictions + GCC/UAE + major global
// economies. Updated to reflect FATF February 2026 plenary outcomes.

interface StaticCountryEntry {
  iso2: string;
  iso3: string;
  name: string;
  fatfStatus: "blacklist" | "greylist" | "monitored" | "compliant" | "member";
  dpmsRiskTier: "low" | "medium" | "high" | "critical";
  lastUpdated: string;
}

const STATIC_COUNTRY_DATASET: StaticCountryEntry[] = [
  // FATF Blacklist — Feb 2026
  { iso2: "IR", iso3: "IRN", name: "Iran",              fatfStatus: "blacklist",  dpmsRiskTier: "critical", lastUpdated: "2026-02-14" },
  { iso2: "KP", iso3: "PRK", name: "North Korea",       fatfStatus: "blacklist",  dpmsRiskTier: "critical", lastUpdated: "2026-02-14" },
  { iso2: "MM", iso3: "MMR", name: "Myanmar",           fatfStatus: "blacklist",  dpmsRiskTier: "critical", lastUpdated: "2026-02-14" },
  // FATF Greylist — May 2026
  { iso2: "AF", iso3: "AFG", name: "Afghanistan",       fatfStatus: "greylist",   dpmsRiskTier: "critical", lastUpdated: "2026-02-14" },
  { iso2: "AL", iso3: "ALB", name: "Albania",           fatfStatus: "greylist",   dpmsRiskTier: "high",     lastUpdated: "2026-02-14" },
  { iso2: "AE", iso3: "ARE", name: "United Arab Emirates", fatfStatus: "member",   dpmsRiskTier: "medium",  lastUpdated: "2026-05-01" },
  { iso2: "BB", iso3: "BRB", name: "Barbados",          fatfStatus: "greylist",   dpmsRiskTier: "medium",   lastUpdated: "2026-02-14" },
  { iso2: "BF", iso3: "BFA", name: "Burkina Faso",      fatfStatus: "greylist",   dpmsRiskTier: "high",     lastUpdated: "2026-02-14" },
  { iso2: "BJ", iso3: "BEN", name: "Benin",             fatfStatus: "greylist",   dpmsRiskTier: "high",     lastUpdated: "2026-05-01" },
  { iso2: "CM", iso3: "CMR", name: "Cameroon",          fatfStatus: "greylist",   dpmsRiskTier: "high",     lastUpdated: "2026-02-14" },
  { iso2: "CF", iso3: "CAF", name: "Central African Republic", fatfStatus: "greylist", dpmsRiskTier: "critical", lastUpdated: "2026-02-14" },
  { iso2: "CD", iso3: "COD", name: "DR Congo",          fatfStatus: "greylist",   dpmsRiskTier: "critical", lastUpdated: "2026-02-14" },
  { iso2: "GH", iso3: "GHA", name: "Ghana",             fatfStatus: "greylist",   dpmsRiskTier: "high",     lastUpdated: "2026-05-01" },
  { iso2: "GI", iso3: "GIB", name: "Gibraltar",         fatfStatus: "greylist",   dpmsRiskTier: "medium",   lastUpdated: "2026-02-14" },
  { iso2: "HT", iso3: "HTI", name: "Haiti",             fatfStatus: "greylist",   dpmsRiskTier: "critical", lastUpdated: "2026-02-14" },
  { iso2: "JM", iso3: "JAM", name: "Jamaica",           fatfStatus: "greylist",   dpmsRiskTier: "medium",   lastUpdated: "2026-02-14" },
  { iso2: "JO", iso3: "JOR", name: "Jordan",            fatfStatus: "greylist",   dpmsRiskTier: "medium",   lastUpdated: "2026-02-14" },
  { iso2: "KE", iso3: "KEN", name: "Kenya",             fatfStatus: "greylist",   dpmsRiskTier: "high",     lastUpdated: "2026-05-01" },
  { iso2: "LY", iso3: "LBY", name: "Libya",             fatfStatus: "greylist",   dpmsRiskTier: "critical", lastUpdated: "2026-05-01" },
  { iso2: "ML", iso3: "MLI", name: "Mali",              fatfStatus: "greylist",   dpmsRiskTier: "critical", lastUpdated: "2026-02-14" },
  { iso2: "MA", iso3: "MAR", name: "Morocco",           fatfStatus: "greylist",   dpmsRiskTier: "high",     lastUpdated: "2026-05-01" },
  { iso2: "MZ", iso3: "MOZ", name: "Mozambique",        fatfStatus: "greylist",   dpmsRiskTier: "high",     lastUpdated: "2026-02-14" },
  { iso2: "NA", iso3: "NAM", name: "Namibia",           fatfStatus: "greylist",   dpmsRiskTier: "medium",   lastUpdated: "2026-02-14" },
  { iso2: "NI", iso3: "NIC", name: "Nicaragua",         fatfStatus: "greylist",   dpmsRiskTier: "high",     lastUpdated: "2026-02-14" },
  { iso2: "NG", iso3: "NGA", name: "Nigeria",           fatfStatus: "greylist",   dpmsRiskTier: "high",     lastUpdated: "2026-02-14" },
  { iso2: "PK", iso3: "PAK", name: "Pakistan",          fatfStatus: "greylist",   dpmsRiskTier: "high",     lastUpdated: "2026-02-14" },
  { iso2: "PA", iso3: "PAN", name: "Panama",            fatfStatus: "greylist",   dpmsRiskTier: "high",     lastUpdated: "2026-02-14" },
  { iso2: "PH", iso3: "PHL", name: "Philippines",       fatfStatus: "greylist",   dpmsRiskTier: "high",     lastUpdated: "2026-02-14" },
  { iso2: "SN", iso3: "SEN", name: "Senegal",           fatfStatus: "greylist",   dpmsRiskTier: "high",     lastUpdated: "2026-05-01" },
  { iso2: "SO", iso3: "SOM", name: "Somalia",           fatfStatus: "greylist",   dpmsRiskTier: "critical", lastUpdated: "2026-05-01" },
  { iso2: "SS", iso3: "SSD", name: "South Sudan",       fatfStatus: "greylist",   dpmsRiskTier: "critical", lastUpdated: "2026-02-14" },
  { iso2: "SY", iso3: "SYR", name: "Syria",             fatfStatus: "greylist",   dpmsRiskTier: "critical", lastUpdated: "2026-02-14" },
  { iso2: "TN", iso3: "TUN", name: "Tunisia",           fatfStatus: "greylist",   dpmsRiskTier: "high",     lastUpdated: "2026-05-01" },
  { iso2: "TZ", iso3: "TZA", name: "Tanzania",          fatfStatus: "greylist",   dpmsRiskTier: "high",     lastUpdated: "2026-02-14" },
  { iso2: "UG", iso3: "UGA", name: "Uganda",            fatfStatus: "greylist",   dpmsRiskTier: "high",     lastUpdated: "2026-02-14" },
  { iso2: "VN", iso3: "VNM", name: "Vietnam",           fatfStatus: "greylist",   dpmsRiskTier: "medium",   lastUpdated: "2026-02-14" },
  { iso2: "YE", iso3: "YEM", name: "Yemen",             fatfStatus: "greylist",   dpmsRiskTier: "critical", lastUpdated: "2026-02-14" },
  // Monitored / Elevated
  { iso2: "TR", iso3: "TUR", name: "Turkey",            fatfStatus: "monitored",  dpmsRiskTier: "high",     lastUpdated: "2024-06-28" },
  { iso2: "BY", iso3: "BLR", name: "Belarus",           fatfStatus: "monitored",  dpmsRiskTier: "critical", lastUpdated: "2026-02-14" },
  { iso2: "IQ", iso3: "IRQ", name: "Iraq",              fatfStatus: "monitored",  dpmsRiskTier: "critical", lastUpdated: "2026-02-14" },
  { iso2: "RU", iso3: "RUS", name: "Russia",            fatfStatus: "monitored",  dpmsRiskTier: "critical", lastUpdated: "2026-02-14" },
  { iso2: "SD", iso3: "SDN", name: "Sudan",             fatfStatus: "monitored",  dpmsRiskTier: "critical", lastUpdated: "2026-02-14" },
  { iso2: "ZW", iso3: "ZWE", name: "Zimbabwe",          fatfStatus: "monitored",  dpmsRiskTier: "high",     lastUpdated: "2026-02-14" },
  // GCC
  { iso2: "SA", iso3: "SAU", name: "Saudi Arabia",      fatfStatus: "compliant",  dpmsRiskTier: "medium",   lastUpdated: "2026-02-14" },
  { iso2: "KW", iso3: "KWT", name: "Kuwait",            fatfStatus: "compliant",  dpmsRiskTier: "medium",   lastUpdated: "2026-02-14" },
  { iso2: "QA", iso3: "QAT", name: "Qatar",             fatfStatus: "compliant",  dpmsRiskTier: "medium",   lastUpdated: "2026-02-14" },
  { iso2: "BH", iso3: "BHR", name: "Bahrain",           fatfStatus: "compliant",  dpmsRiskTier: "medium",   lastUpdated: "2026-02-14" },
  { iso2: "OM", iso3: "OMN", name: "Oman",              fatfStatus: "compliant",  dpmsRiskTier: "medium",   lastUpdated: "2026-02-14" },
  // Key economies
  { iso2: "US", iso3: "USA", name: "United States",     fatfStatus: "compliant",  dpmsRiskTier: "low",      lastUpdated: "2026-02-14" },
  { iso2: "GB", iso3: "GBR", name: "United Kingdom",    fatfStatus: "compliant",  dpmsRiskTier: "low",      lastUpdated: "2026-02-14" },
  { iso2: "DE", iso3: "DEU", name: "Germany",           fatfStatus: "compliant",  dpmsRiskTier: "low",      lastUpdated: "2026-02-14" },
  { iso2: "FR", iso3: "FRA", name: "France",            fatfStatus: "compliant",  dpmsRiskTier: "low",      lastUpdated: "2026-02-14" },
  { iso2: "CN", iso3: "CHN", name: "China",             fatfStatus: "compliant",  dpmsRiskTier: "medium",   lastUpdated: "2026-02-14" },
  { iso2: "IN", iso3: "IND", name: "India",             fatfStatus: "compliant",  dpmsRiskTier: "medium",   lastUpdated: "2026-02-14" },
  { iso2: "CH", iso3: "CHE", name: "Switzerland",       fatfStatus: "compliant",  dpmsRiskTier: "low",      lastUpdated: "2026-02-14" },
  { iso2: "SG", iso3: "SGP", name: "Singapore",         fatfStatus: "compliant",  dpmsRiskTier: "low",      lastUpdated: "2026-02-14" },
  { iso2: "LB", iso3: "LBN", name: "Lebanon",           fatfStatus: "monitored",  dpmsRiskTier: "critical", lastUpdated: "2026-02-14" },
  { iso2: "VE", iso3: "VEN", name: "Venezuela",         fatfStatus: "monitored",  dpmsRiskTier: "critical", lastUpdated: "2026-02-14" },
  { iso2: "CU", iso3: "CUB", name: "Cuba",              fatfStatus: "monitored",  dpmsRiskTier: "high",     lastUpdated: "2026-02-14" },
];

// ── Country aliases ───────────────────────────────────────────────────────────
const COUNTRY_ALIASES: Record<string, string> = {
  "uae": "AE",
  "u.a.e.": "AE",
  "u.a.e": "AE",
  "emirates": "AE",
  "uk": "GB",
  "u.k.": "GB",
  "britain": "GB",
  "great britain": "GB",
  "us": "US",
  "u.s.": "US",
  "u.s.a.": "US",
  "usa": "US",
  "america": "US",
  "drc": "CD",
  "dr congo": "CD",
  "north korea": "KP",
  "south korea": "KR",
  "ksa": "SA",
  "kingdom of saudi arabia": "SA",
  "dprk": "KP",
  "burma": "MM",
  "russia": "RU",
  "russian federation": "RU",
  "bvi": "VG",
  "british virgin islands": "VG",
  "cayman": "KY",
  "cayman islands": "KY",
  "jersey": "JE",
  "turkiye": "TR",
  "turkey": "TR",
};

function lookupStaticCountry(country: string): StaticCountryEntry | undefined {
  const q = country.toLowerCase().trim();
  const alias = COUNTRY_ALIASES[q];
  const aliasIso2 = alias ? alias.toLowerCase() : null;
  return STATIC_COUNTRY_DATASET.find(
    (e) =>
      e.name.toLowerCase() === q ||
      e.iso2.toLowerCase() === q ||
      e.iso3.toLowerCase() === q ||
      (aliasIso2 !== null && e.iso2.toLowerCase() === aliasIso2),
  );
}

// ── Multi-dimensional scoring engine ─────────────────────────────────────────

function buildRiskDimensions(iso2: string, entry: StaticCountryEntry): {
  dimensions: Record<string, number>;
  geopoliticalFlags: string[];
} {
  const iso = iso2.toUpperCase();
  const dimensions: Record<string, number> = {};
  const geopoliticalFlags: string[] = [];

  // 1. FATF compliance dimension
  const fatfScore =
    entry.fatfStatus === "blacklist"  ? 50 :
    entry.fatfStatus === "greylist"   ? 30 :
    entry.fatfStatus === "monitored"  ? 15 : 0;
  if (fatfScore > 0) dimensions.fatf = fatfScore;

  // 2. CPI dimension
  const cpiData = CPI_FSI_DATA[iso];
  if (cpiData) {
    const cpiScore =
      cpiData.cpi < 20  ? 30 :
      cpiData.cpi < 40  ? 20 :
      cpiData.cpi < 50  ? 10 : 0;
    if (cpiScore > 0) dimensions.corruption = cpiScore;
  }

  // 3. FSI dimension
  if (cpiData) {
    const fsiScore =
      cpiData.fsi >= 90 ? 30 :
      cpiData.fsi >= 80 ? 20 :
      cpiData.fsi >= 70 ? 10 : 0;
    if (fsiScore > 0) dimensions.fragility = fsiScore;
  }

  // 4. Political stability / conflict zone
  const isConflictZone = new Set(["AF", "SY", "YE", "SS", "SO", "LY", "ML", "CF", "CD", "MM", "IQ", "SD"]).has(iso);
  const isPostConflict = new Set(["IQ", "LB", "ET", "NE", "BF"]).has(iso);
  if (isConflictZone) {
    dimensions.political = 25;
    geopoliticalFlags.push("conflict_zone");
  } else if (isPostConflict) {
    dimensions.political = 15;
    geopoliticalFlags.push("post_conflict");
  }

  // 5. Financial secrecy
  if (FINANCIAL_SECRECY_JURISDICTIONS.has(iso)) {
    dimensions.financial_secrecy = 15;
    geopoliticalFlags.push("financial_secrecy_jurisdiction");
  }

  // 6. UAE CAHRA
  if (UAE_CAHRA.has(iso)) {
    dimensions.cahra = 40;
    geopoliticalFlags.push("uae_cahra_listed");
  }

  // 7. Active sanctions dimension — score based on number of regimes
  const sanctions = ACTIVE_SANCTIONS[iso] ?? [];
  if (sanctions.length >= 4) {
    dimensions.sanctions = 30;
  } else if (sanctions.length >= 2) {
    dimensions.sanctions = 20;
  } else if (sanctions.length === 1) {
    dimensions.sanctions = 10;
  }

  // 8. Recurring grey list flag
  if (RECURRING_GREY_LIST.has(iso)) {
    dimensions.recurring_fatf = 10;
    geopoliticalFlags.push("recurring_grey_list");
  }

  // 9. High-risk neighbors flag
  if (HIGH_RISK_NEIGHBOR_COUNTRIES.has(iso)) {
    dimensions.neighbor_risk = 10;
    geopoliticalFlags.push("high_risk_neighbors");
  }

  return { dimensions, geopoliticalFlags };
}

function computeCompositeScore(dimensions: Record<string, number>): number {
  const raw = Object.values(dimensions).reduce((sum, v) => sum + v, 0);
  return Math.min(100, raw);
}

function scoreToLevel(score: number): "low" | "medium" | "high" | "critical" {
  if (score >= 75) return "critical";
  if (score >= 55) return "high";
  if (score >= 30) return "medium";
  return "low";
}

function levelToRecommendation(
  level: "low" | "medium" | "high" | "critical",
  fatfStatus: string,
  sanctionsCount: number,
): "standard_dd" | "enhanced_dd" | "senior_approval" | "prohibited" {
  if (level === "critical" || fatfStatus === "blacklist" || fatfStatus === "black_list" || sanctionsCount >= 4) return "prohibited";
  if (level === "high" || sanctionsCount >= 2) return "senior_approval";
  if (level === "medium" || fatfStatus === "greylist" || fatfStatus === "grey_list" || fatfStatus === "monitored") return "enhanced_dd";
  return "standard_dd";
}

function staticEntryToResult(entry: StaticCountryEntry): CountryRiskResult {
  const iso = entry.iso2.toUpperCase();
  const { dimensions, geopoliticalFlags } = buildRiskDimensions(iso, entry);

  const cpiData = CPI_FSI_DATA[iso];
  const activeSanctions = ACTIVE_SANCTIONS[iso] ?? [];
  const cahraListed = UAE_CAHRA.has(iso) || isCahra(iso);

  const riskScore = computeCompositeScore(dimensions);
  const riskLevel = scoreToLevel(riskScore);
  const recommendation = levelToRecommendation(riskLevel, entry.fatfStatus, activeSanctions.length);

  // Normalize fatfStatus to underscore-separated format for API consumers.
  const fatfStatus: CountryRiskResult["fatfStatus"] =
    entry.fatfStatus === "blacklist" ? "black_list" :
    entry.fatfStatus === "greylist"  ? "grey_list"  :
    entry.fatfStatus as CountryRiskResult["fatfStatus"];

  return {
    ok: true,
    countryCode: iso,
    countryName: entry.name,
    country: entry.name,       // legacy alias
    overallRisk: riskLevel,    // legacy alias
    riskScore,
    riskLevel,
    fatfStatus,
    cahraListed,
    activeSanctionsRegimes: activeSanctions,
    corruptionIndex: cpiData?.cpi,
    fragilityIndex: cpiData?.fsi,
    riskDimensions: dimensions,
    geopoliticalFlags,
    recommendation,
  };
}

// ── Fallback result (UAE) ─────────────────────────────────────────────────────
// UAE was removed from the FATF grey list in February 2024; status reverts to member.
const UAE_ENTRY: StaticCountryEntry = {
  iso2: "AE", iso3: "ARE", name: "United Arab Emirates",
  fatfStatus: "member", dpmsRiskTier: "medium", lastUpdated: "2026-05-01",
};

// GET /api/country-risk?country=XX
export async function GET(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const url = new URL(req.url);
  const country = (url.searchParams.get("country") ?? "").trim();
  if (!country) {
    return NextResponse.json(
      { ok: false, error: "country query param is required. Example: ?country=UAE" },
      { status: 400, headers: gate.headers },
    );
  }
  const staticEntry = lookupStaticCountry(country);
  if (staticEntry) {
    return NextResponse.json(
      { ...staticEntryToResult(staticEntry), source: "static_cache" },
      { headers: gate.headers },
    );
  }
  // Also try getCountryRisk from high-risk-countries.ts for broader coverage
  const hrEntry = getCountryRisk(country);
  if (hrEntry) {
    // Build a synthetic StaticCountryEntry from the high-risk entry
    const synth: StaticCountryEntry = {
      iso2: hrEntry.iso2,
      iso3: hrEntry.iso2 + "X",
      name: hrEntry.name,
      fatfStatus:
        hrEntry.tier === "blacklist" ? "blacklist" :
        hrEntry.tier === "greylist"  ? "greylist"  :
        hrEntry.tier === "elevated"  ? "monitored" : "compliant",
      dpmsRiskTier:
        hrEntry.tier === "blacklist" ? "critical" :
        hrEntry.tier === "greylist"  ? "high"     :
        hrEntry.tier === "elevated"  ? "medium"   : "low",
      lastUpdated: "2026-05-01",
    };
    return NextResponse.json(
      { ...staticEntryToResult(synth), source: "static_cache" },
      { headers: gate.headers },
    );
  }
  return NextResponse.json(
    {
      ok: false,
      error: `No static profile for "${country}". Use POST /api/country-risk with body { "country": "${country}" } for full AI assessment.`,
      hint: "POST body: { country: string; analysisDepth?: 'quick' | 'full' }",
    },
    { status: 404, headers: gate.headers },
  );
}

// ── POST — full AI-powered assessment ────────────────────────────────────────
export async function POST(req: Request) {
  const t0 = Date.now();
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: { country?: string; analysisDepth?: "quick" | "full" };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400, headers: gate.headers });
  }

  const country = (body.country ?? "").trim();
  if (!country) {
    return NextResponse.json({ ok: false, error: "country is required" }, { status: 400, headers: gate.headers });
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    const staticEntry = lookupStaticCountry(country);
    if (staticEntry) {
      return NextResponse.json(
        { ...staticEntryToResult(staticEntry), source: "static_fallback" },
        { status: 200, headers: gate.headers },
      );
    }
    return NextResponse.json(
      {
        ...staticEntryToResult(UAE_ENTRY),
        countryName: country || UAE_ENTRY.name,
        source: "static_fallback",
        simulationWarning: "ANTHROPIC_API_KEY not configured — this is a simulated template for UAE, NOT a real country risk assessment. All scores and risk ratings are illustrative examples only. Obtain a real AI-generated assessment before making any compliance decisions.",
      },
      { status: 200, headers: gate.headers },
    );
  }

  const depth = body.analysisDepth ?? "quick";
  const detailInstruction =
    depth === "full"
      ? "Provide analysis with context for each dimension, regulatory obligations, and 3-5 recent developments."
      : "Provide a concise but complete analysis covering all required fields.";

  const sdkTimeoutMs = 4_500;

  // Build the static context to inject into the prompt
  const staticEntry = lookupStaticCountry(country);
  const staticContext = staticEntry
    ? `\n\nStaticContext (pre-computed, authoritative — use as baseline):
${JSON.stringify(staticEntryToResult(staticEntry), null, 2)}`
    : "";

  try {
    const client = getAnthropicClient(apiKey, sdkTimeoutMs);
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: depth === "full" ? 1800 : 1200,
      system: [
        {
          type: "text",
          text: `You are a Country Risk Intelligence expert specialising in AML/CFT, sanctions, and financial crime compliance.

Your analysis must produce a multi-dimensional country risk score using the following exact schema.

## Scoring dimensions (additive, capped at 100 total):
- fatf: FATF compliance — blacklist +50, greylist +30, monitored +15, compliant 0
- corruption: CPI (Transparency International) — CPI<20 →+30, CPI 20-40 →+20, CPI 40-50 →+10
- fragility: FSI (Fund for Peace) — Very High (>=90) →+30, High (80-89) →+20, Elevated (70-79) →+10
- political: conflict zone →+25, post-conflict →+15
- financial_secrecy: offshore/secrecy haven (FSI Tax Justice >60) →+15
- cahra: UAE CAHRA listed →+40
- sanctions: >=4 programs →+30, 2-3 programs →+20, 1 program →+10
- recurring_fatf: recurring FATF grey list history →+10
- neighbor_risk: borders 3+ high-risk jurisdictions →+10

## fatfStatus values: "blacklist" | "greylist" | "monitored" | "compliant"

## activeSanctionsRegimes: enumerate from ["US OFAC", "EU", "UN SC", "UK OFSI", "AU DFAT", "CA OSFI"]

## recommendation logic:
- prohibited: riskScore>=75 OR fatfStatus=blacklist OR sanctionsRegimes>=4
- senior_approval: riskScore>=55 OR sanctionsRegimes>=2
- enhanced_dd: riskScore>=30 OR fatfStatus=greylist OR fatfStatus=monitored
- standard_dd: otherwise

${detailInstruction}

Return ONLY valid JSON with this exact structure (no markdown fences):
{
  "ok": true,
  "countryCode": "ISO2",
  "countryName": "string",
  "riskScore": number,
  "riskLevel": "low"|"medium"|"high"|"critical",
  "fatfStatus": "blacklist"|"greylist"|"monitored"|"compliant",
  "cahraListed": boolean,
  "activeSanctionsRegimes": ["string"],
  "corruptionIndex": number,
  "fragilityIndex": number,
  "riskDimensions": { "fatf": number, "corruption": number, ... },
  "geopoliticalFlags": ["string"],
  "recommendation": "standard_dd"|"enhanced_dd"|"senior_approval"|"prohibited"
}`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `Analyse country risk for: ${sanitizeField(country, 100)}

Analysis depth: ${depth}${staticContext}

Provide a complete country risk intelligence assessment covering AML/CFT risk, FATF status, sanctions exposure (US OFAC, EU, UN SC, UK OFSI, AU DFAT, CA OSFI), political stability, UAE CAHRA listing, and all geopolitical risk factors that would apply to a UAE-based DNFBP (gold trader/refinery) engaging with counterparties in or from this country.`,
        },
      ],
    });

    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const cleaned = raw.replace(/```json\n?|\n?```/g, "").trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : cleaned;
    let result: CountryRiskResult;
    try {
      result = JSON.parse(jsonStr) as CountryRiskResult;
    } catch (parseErr) {
      console.warn("[country-risk] JSON parse failed:", parseErr instanceof Error ? parseErr.message : parseErr, "raw:", cleaned.slice(0, 200));
      return NextResponse.json(
        { ok: false, error: "Country-risk analysis returned invalid data. Retry, or escalate if persistent." },
        { status: 502, headers: gate.headers },
      );
    }
    // Normalize arrays
    if (!Array.isArray(result.activeSanctionsRegimes)) result.activeSanctionsRegimes = [];
    if (!Array.isArray(result.geopoliticalFlags)) result.geopoliticalFlags = [];
    if (!result.riskDimensions || typeof result.riskDimensions !== "object") result.riskDimensions = {};
    const latencyMs = Date.now() - t0;
    if (latencyMs > 5000) console.warn(`[country-risk] slow response latencyMs=${latencyMs}`);
    void writeAuditChainEntry(
      { event: "country_risk.assessed", actor: gate.keyId, riskLevel: result.riskLevel, riskScore: result.riskScore, recommendation: result.recommendation },
      tenantIdFromGate(gate),
    ).catch((e: unknown) => console.warn("[audit] write failed:", e instanceof Error ? e.message : String(e)));
    return NextResponse.json({ ...result, latencyMs }, { headers: gate.headers });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[country-risk] LLM call failed:", err);
    const isTimeout = detail.includes("timeout");
    const isRateLimit = detail.includes("rate");
    const staticFallback = lookupStaticCountry(country);
    if (staticFallback) {
      console.warn(`[country-risk] serving static_fallback for ${country} after LLM failure`);
      return NextResponse.json(
        {
          ...staticEntryToResult(staticFallback),
          source: "static_fallback",
          degraded: true,
          degradedReason: isTimeout ? "LLM timeout" : isRateLimit ? "LLM rate limit" : "LLM unavailable",
          latencyMs: Date.now() - t0,
        },
        { status: 200, headers: gate.headers },
      );
    }
    return NextResponse.json(
      {
        ok: false,
        error: isTimeout
          ? "Country-risk analysis timed out. Try again or use a shorter analysis depth."
          : isRateLimit
            ? "Country-risk temporarily rate-limited. Wait 60s and retry."
            : "Real-time country-risk analysis temporarily unavailable. Please retry.",
        latencyMs: Date.now() - t0,
      },
      { status: 503, headers: gate.headers },
    );
  }
}
