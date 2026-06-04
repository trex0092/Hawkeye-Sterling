export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";

// ── Top 20 highest-risk countries (hardcoded, static data) ────────────────────
// Scores derived from the composite scoring engine in the parent route.
// Sources: FATF Feb 2026 plenary, OFAC SDN, UN SC, UAE CAHRA registry,
// Transparency International CPI 2023, Fund for Peace FSI 2023.
// Updated: May 2026.

interface TopRiskCountry {
  iso2: string;
  name: string;
  score: number;
}

const TOP_RISK_COUNTRIES: TopRiskCountry[] = [
  { iso2: "SO", name: "Somalia",                  score: 100 },
  { iso2: "SS", name: "South Sudan",              score: 100 },
  { iso2: "CF", name: "Central African Republic", score: 100 },
  { iso2: "CD", name: "DR Congo",                 score: 100 },
  { iso2: "AF", name: "Afghanistan",              score: 100 },
  { iso2: "SY", name: "Syria",                    score: 100 },
  { iso2: "YE", name: "Yemen",                    score: 100 },
  { iso2: "IR", name: "Iran",                     score: 100 },
  { iso2: "KP", name: "North Korea",              score: 100 },
  { iso2: "MM", name: "Myanmar",                  score: 100 },
  { iso2: "ML", name: "Mali",                     score: 90 },
  { iso2: "SD", name: "Sudan",                    score: 90 },
  { iso2: "LY", name: "Libya",                    score: 88 },
  { iso2: "IQ", name: "Iraq",                     score: 85 },
  { iso2: "HT", name: "Haiti",                    score: 83 },
  { iso2: "LB", name: "Lebanon",                  score: 80 },
  { iso2: "RU", name: "Russia",                   score: 80 },
  { iso2: "BY", name: "Belarus",                  score: 78 },
  { iso2: "VE", name: "Venezuela",                score: 75 },
  { iso2: "NG", name: "Nigeria",                  score: 72 },
];

// ── Global risk distribution (hardcoded, derived from full dataset analysis) ───
// Distribution across all ~195 sovereign countries/territories.
const GLOBAL_DISTRIBUTION = {
  total: 195,
  byTier: {
    low:      132,   // FATF-compliant, stable economies
    medium:    25,   // GCC, monitored-but-compliant, some greylist exits
    high:      24,   // Active greylist, elevated sanctions exposure
    critical:  14,   // Blacklist, active conflict + CAHRA, heavy sanctions
  },
};

// ── GET /api/country-risk/summary ─────────────────────────────────────────────

export async function GET(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  void writeAuditChainEntry(
    { event: "country_risk.summary_read", actor: gate.keyId },
    tenantIdFromGate(gate),
  ).catch(() => undefined);

  return NextResponse.json(
    {
      ok: true,
      total: GLOBAL_DISTRIBUTION.total,
      byTier: GLOBAL_DISTRIBUTION.byTier,
      topRiskCountries: TOP_RISK_COUNTRIES,
    },
    { headers: gate.headers },
  );
}
