export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { isCahra, getCountryRisk } from "@/lib/server/high-risk-countries";

// ── Static data mirrors from parent route ─────────────────────────────────────
// These data structures are inlined here to avoid circular imports since the
// parent route.ts is not a plain module (it's a Next.js route file with exports
// that Next would misinterpret if imported).

type FatfStatus = "blacklist" | "greylist" | "monitored" | "compliant" | "member" | "grey_list" | "black_list" | "non_member";
type RiskTier = "low" | "medium" | "high" | "critical";

interface StaticCountryEntry {
  iso2: string;
  iso3: string;
  name: string;
  fatfStatus: "blacklist" | "greylist" | "monitored" | "compliant" | "member";
  dpmsRiskTier: RiskTier;
}

const STATIC_COUNTRY_DATASET: StaticCountryEntry[] = [
  // FATF Blacklist
  { iso2: "IR", iso3: "IRN", name: "Iran",                      fatfStatus: "blacklist",  dpmsRiskTier: "critical" },
  { iso2: "KP", iso3: "PRK", name: "North Korea",               fatfStatus: "blacklist",  dpmsRiskTier: "critical" },
  { iso2: "MM", iso3: "MMR", name: "Myanmar",                   fatfStatus: "blacklist",  dpmsRiskTier: "critical" },
  // FATF Greylist / May 2026
  { iso2: "AF", iso3: "AFG", name: "Afghanistan",               fatfStatus: "greylist",   dpmsRiskTier: "critical" },
  { iso2: "AL", iso3: "ALB", name: "Albania",                   fatfStatus: "greylist",   dpmsRiskTier: "high" },
  { iso2: "AE", iso3: "ARE", name: "United Arab Emirates",      fatfStatus: "member",     dpmsRiskTier: "medium" },
  { iso2: "BB", iso3: "BRB", name: "Barbados",                  fatfStatus: "greylist",   dpmsRiskTier: "medium" },
  { iso2: "BF", iso3: "BFA", name: "Burkina Faso",              fatfStatus: "greylist",   dpmsRiskTier: "high" },
  { iso2: "BJ", iso3: "BEN", name: "Benin",                     fatfStatus: "greylist",   dpmsRiskTier: "high" },
  { iso2: "CM", iso3: "CMR", name: "Cameroon",                  fatfStatus: "greylist",   dpmsRiskTier: "high" },
  { iso2: "CF", iso3: "CAF", name: "Central African Republic",  fatfStatus: "greylist",   dpmsRiskTier: "critical" },
  { iso2: "CD", iso3: "COD", name: "DR Congo",                  fatfStatus: "greylist",   dpmsRiskTier: "critical" },
  { iso2: "GH", iso3: "GHA", name: "Ghana",                     fatfStatus: "greylist",   dpmsRiskTier: "high" },
  { iso2: "GI", iso3: "GIB", name: "Gibraltar",                 fatfStatus: "greylist",   dpmsRiskTier: "medium" },
  { iso2: "HT", iso3: "HTI", name: "Haiti",                     fatfStatus: "greylist",   dpmsRiskTier: "critical" },
  { iso2: "JM", iso3: "JAM", name: "Jamaica",                   fatfStatus: "greylist",   dpmsRiskTier: "medium" },
  { iso2: "JO", iso3: "JOR", name: "Jordan",                    fatfStatus: "greylist",   dpmsRiskTier: "medium" },
  { iso2: "KE", iso3: "KEN", name: "Kenya",                     fatfStatus: "greylist",   dpmsRiskTier: "high" },
  { iso2: "LY", iso3: "LBY", name: "Libya",                     fatfStatus: "greylist",   dpmsRiskTier: "critical" },
  { iso2: "ML", iso3: "MLI", name: "Mali",                      fatfStatus: "greylist",   dpmsRiskTier: "critical" },
  { iso2: "MA", iso3: "MAR", name: "Morocco",                   fatfStatus: "greylist",   dpmsRiskTier: "high" },
  { iso2: "MZ", iso3: "MOZ", name: "Mozambique",                fatfStatus: "greylist",   dpmsRiskTier: "high" },
  { iso2: "NA", iso3: "NAM", name: "Namibia",                   fatfStatus: "greylist",   dpmsRiskTier: "medium" },
  { iso2: "NI", iso3: "NIC", name: "Nicaragua",                 fatfStatus: "greylist",   dpmsRiskTier: "high" },
  { iso2: "NG", iso3: "NGA", name: "Nigeria",                   fatfStatus: "greylist",   dpmsRiskTier: "high" },
  { iso2: "PK", iso3: "PAK", name: "Pakistan",                  fatfStatus: "greylist",   dpmsRiskTier: "high" },
  { iso2: "PA", iso3: "PAN", name: "Panama",                    fatfStatus: "greylist",   dpmsRiskTier: "high" },
  { iso2: "PH", iso3: "PHL", name: "Philippines",               fatfStatus: "greylist",   dpmsRiskTier: "high" },
  { iso2: "SN", iso3: "SEN", name: "Senegal",                   fatfStatus: "greylist",   dpmsRiskTier: "high" },
  { iso2: "SO", iso3: "SOM", name: "Somalia",                   fatfStatus: "greylist",   dpmsRiskTier: "critical" },
  { iso2: "SS", iso3: "SSD", name: "South Sudan",               fatfStatus: "greylist",   dpmsRiskTier: "critical" },
  { iso2: "SY", iso3: "SYR", name: "Syria",                     fatfStatus: "greylist",   dpmsRiskTier: "critical" },
  { iso2: "TN", iso3: "TUN", name: "Tunisia",                   fatfStatus: "greylist",   dpmsRiskTier: "high" },
  { iso2: "TZ", iso3: "TZA", name: "Tanzania",                  fatfStatus: "greylist",   dpmsRiskTier: "high" },
  { iso2: "UG", iso3: "UGA", name: "Uganda",                    fatfStatus: "greylist",   dpmsRiskTier: "high" },
  { iso2: "VN", iso3: "VNM", name: "Vietnam",                   fatfStatus: "greylist",   dpmsRiskTier: "medium" },
  { iso2: "YE", iso3: "YEM", name: "Yemen",                     fatfStatus: "greylist",   dpmsRiskTier: "critical" },
  // Monitored / Elevated
  { iso2: "TR", iso3: "TUR", name: "Turkey",                    fatfStatus: "monitored",  dpmsRiskTier: "high" },
  { iso2: "BY", iso3: "BLR", name: "Belarus",                   fatfStatus: "monitored",  dpmsRiskTier: "critical" },
  { iso2: "IQ", iso3: "IRQ", name: "Iraq",                      fatfStatus: "monitored",  dpmsRiskTier: "critical" },
  { iso2: "RU", iso3: "RUS", name: "Russia",                    fatfStatus: "monitored",  dpmsRiskTier: "critical" },
  { iso2: "SD", iso3: "SDN", name: "Sudan",                     fatfStatus: "monitored",  dpmsRiskTier: "critical" },
  { iso2: "ZW", iso3: "ZWE", name: "Zimbabwe",                  fatfStatus: "monitored",  dpmsRiskTier: "high" },
  // GCC
  { iso2: "SA", iso3: "SAU", name: "Saudi Arabia",              fatfStatus: "compliant",  dpmsRiskTier: "medium" },
  { iso2: "KW", iso3: "KWT", name: "Kuwait",                    fatfStatus: "compliant",  dpmsRiskTier: "medium" },
  { iso2: "QA", iso3: "QAT", name: "Qatar",                     fatfStatus: "compliant",  dpmsRiskTier: "medium" },
  { iso2: "BH", iso3: "BHR", name: "Bahrain",                   fatfStatus: "compliant",  dpmsRiskTier: "medium" },
  { iso2: "OM", iso3: "OMN", name: "Oman",                      fatfStatus: "compliant",  dpmsRiskTier: "medium" },
  // Key economies
  { iso2: "US", iso3: "USA", name: "United States",             fatfStatus: "compliant",  dpmsRiskTier: "low" },
  { iso2: "GB", iso3: "GBR", name: "United Kingdom",            fatfStatus: "compliant",  dpmsRiskTier: "low" },
  { iso2: "DE", iso3: "DEU", name: "Germany",                   fatfStatus: "compliant",  dpmsRiskTier: "low" },
  { iso2: "FR", iso3: "FRA", name: "France",                    fatfStatus: "compliant",  dpmsRiskTier: "low" },
  { iso2: "CN", iso3: "CHN", name: "China",                     fatfStatus: "compliant",  dpmsRiskTier: "medium" },
  { iso2: "IN", iso3: "IND", name: "India",                     fatfStatus: "compliant",  dpmsRiskTier: "medium" },
  { iso2: "CH", iso3: "CHE", name: "Switzerland",               fatfStatus: "compliant",  dpmsRiskTier: "low" },
  { iso2: "SG", iso3: "SGP", name: "Singapore",                 fatfStatus: "compliant",  dpmsRiskTier: "low" },
  { iso2: "LB", iso3: "LBN", name: "Lebanon",                   fatfStatus: "monitored",  dpmsRiskTier: "critical" },
  { iso2: "VE", iso3: "VEN", name: "Venezuela",                 fatfStatus: "monitored",  dpmsRiskTier: "critical" },
  { iso2: "CU", iso3: "CUB", name: "Cuba",                      fatfStatus: "monitored",  dpmsRiskTier: "high" },
];

const ACTIVE_SANCTIONS: Record<string, string[]> = {
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
};

// ── Scoring helpers ────────────────────────────────────────────────────────────

function computeScore(entry: StaticCountryEntry): number {
  let score = 0;

  // FATF
  if (entry.fatfStatus === "blacklist") score += 50;
  else if (entry.fatfStatus === "greylist") score += 30;
  else if (entry.fatfStatus === "monitored") score += 15;

  // CAHRA
  if (isCahra(entry.iso2)) score += 40;

  // Sanctions
  const sanctions = ACTIVE_SANCTIONS[entry.iso2] ?? [];
  if (sanctions.length >= 4) score += 30;
  else if (sanctions.length >= 2) score += 20;
  else if (sanctions.length === 1) score += 10;

  return Math.min(100, score);
}

function scoreToTier(score: number): RiskTier {
  if (score >= 75) return "critical";
  if (score >= 55) return "high";
  if (score >= 30) return "medium";
  return "low";
}

function normalizeFatfStatus(raw: StaticCountryEntry["fatfStatus"]): FatfStatus {
  if (raw === "blacklist") return "black_list";
  if (raw === "greylist") return "grey_list";
  return raw;
}

function resolveCountry(iso2Upper: string): { score: number; tier: string; fatfStatus: string; sanctionsLists: string[] } | null {
  const entry = STATIC_COUNTRY_DATASET.find((e) => e.iso2 === iso2Upper);
  if (entry) {
    const score = computeScore(entry);
    return {
      score,
      tier: scoreToTier(score),
      fatfStatus: normalizeFatfStatus(entry.fatfStatus),
      sanctionsLists: ACTIVE_SANCTIONS[iso2Upper] ?? [],
    };
  }

  // Fall back to high-risk-countries.ts for broader coverage
  const hrEntry = getCountryRisk(iso2Upper);
  if (hrEntry) {
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
    };
    const score = computeScore(synth);
    return {
      score,
      tier: scoreToTier(score),
      fatfStatus: normalizeFatfStatus(synth.fatfStatus),
      sanctionsLists: ACTIVE_SANCTIONS[iso2Upper] ?? [],
    };
  }

  return null;
}

// ── POST /api/country-risk/bulk ────────────────────────────────────────────────

export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  let body: { countries?: unknown };
  try {
    body = (await req.json()) as { countries?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400, headers: gate.headers });
  }

  if (!Array.isArray(body.countries)) {
    return NextResponse.json(
      { ok: false, error: "countries must be an array of ISO-2 codes" },
      { status: 400, headers: gate.headers },
    );
  }

  const raw = body.countries as unknown[];
  if (raw.length > 100) {
    return NextResponse.json(
      { ok: false, error: "Maximum 100 country codes per request" },
      { status: 400, headers: gate.headers },
    );
  }

  const results: Record<string, { score: number; tier: string; fatfStatus: string; sanctionsLists: string[] }> = {};

  for (const item of raw) {
    if (typeof item !== "string") continue;
    const iso2 = item.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(iso2)) continue;
    const resolved = resolveCountry(iso2);
    if (resolved) {
      results[iso2] = resolved;
    } else {
      // Return a default low-risk entry for unknown countries
      results[iso2] = {
        score: 0,
        tier: "low",
        fatfStatus: "compliant",
        sanctionsLists: [],
      };
    }
  }

  return NextResponse.json({ ok: true, results }, { headers: gate.headers });
}
