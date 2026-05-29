// POST /api/geo-intelligence
//
// Enriches any jurisdiction with current geopolitical AML risk context:
//   - FATF grey/black list status
//   - UAE EOCN recent designation activity
//   - Active conflict zones and CAHRA classification
//   - Correspondent banking de-risking status
//   - Recent enforcement actions in the jurisdiction
//   - Upcoming regulatory changes
//
// Designed to be injected into MLRO Advisor context automatically so
// the brain always has current geopolitical state without manual research.

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { getAnthropicClient } from "@/lib/server/llm";
import { sanitizeField } from "@/lib/server/sanitize-prompt";
import {
  CONFLICT_ZONES,
  CPI_SCORES,
  getCountryRisk,
  type ConflictIntensity,
} from "@/lib/server/high-risk-countries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Static FATF grey/black list — Feb 2025 cycle
// Blacklist: Myanmar (MM), North Korea (KP), Iran (IR)
const FATF_BLACK_LIST = new Set([
  "Iran", "North Korea", "Myanmar",
]);

// Greylist — 24 countries as of Feb 2025
const FATF_GREY_LIST = new Set([
  "Algeria", "Angola", "Bulgaria", "Burkina Faso", "Cameroon", "Côte d'Ivoire",
  "Croatia", "Democratic Republic of Congo", "Haiti", "Kenya", "Laos",
  "Lebanon", "Mali", "Monaco", "Mozambique", "Namibia", "Nigeria",
  "Philippines", "South Africa", "Syria",
  "Tanzania", "Venezuela", "Vietnam", "Yemen",
]);

// CAHRA (Conflict-Affected and High-Risk Areas) — UAE Cabinet Decision 74/2023
// Per OECD 5-Step Guidance & LBMA Responsible Sourcing
const CAHRA_ZONES = new Set([
  "Afghanistan", "Burkina Faso", "Central African Republic",
  "Côte d'Ivoire", "Democratic Republic of Congo", "Eritrea",
  "Ethiopia", "Guinea", "Haiti", "Iraq", "Lebanon", "Libya",
  "Mali", "Mozambique", "Myanmar", "Niger", "Nigeria",
  "Palestine", "Gaza", "Sudan", "Somalia", "South Sudan",
  "Syria", "Ukraine", "Yemen", "Zimbabwe",
]);

const HIGH_RISK_JURISDICTIONS = new Set([
  "British Virgin Islands", "Cayman Islands", "Panama", "Seychelles",
  "Vanuatu", "Marshall Islands", "Palau", "Samoa",
]);

// ISO-2 name map for conflict/CPI lookups from jurisdiction names
const JURISDICTION_TO_ISO2: Record<string, string> = {
  "afghanistan": "AF", "syria": "SY", "yemen": "YE", "south sudan": "SS",
  "ethiopia": "ET", "mali": "ML", "burkina faso": "BF", "niger": "NE",
  "central african republic": "CF", "democratic republic of congo": "CD", "drc": "CD",
  "somalia": "SO", "nigeria": "NG", "sudan": "SD", "libya": "LY",
  "myanmar": "MM", "burma": "MM", "ukraine": "UA", "palestine": "PS", "gaza": "PS",
  "iraq": "IQ", "lebanon": "LB", "haiti": "HT",
  "iran": "IR", "north korea": "KP", "dprk": "KP",
  "venezuela": "VE", "vietnam": "VN", "south africa": "ZA",
  "algeria": "DZ", "angola": "AO", "bulgaria": "BG",
  "cameroon": "CM", "côte d'ivoire": "CI", "ivory coast": "CI",
  "croatia": "HR", "kenya": "KE", "laos": "LA",
  "monaco": "MC", "mozambique": "MZ", "namibia": "NA",
  "philippines": "PH", "tanzania": "TZ",
};

function resolveIso2(jurisdiction: string): string | undefined {
  const lower = jurisdiction.trim().toLowerCase();
  if (lower in JURISDICTION_TO_ISO2) return JURISDICTION_TO_ISO2[lower];
  // Try the high-risk-countries module lookup (handles aliases)
  const entry = getCountryRisk(jurisdiction);
  return entry?.iso2;
}

function getStaticProfile(jurisdiction: string): Record<string, unknown> {
  const j = jurisdiction.trim();
  const iso2 = resolveIso2(j);

  // Conflict zone data
  const conflictIntensity: ConflictIntensity | undefined =
    iso2 ? CONFLICT_ZONES[iso2 as keyof typeof CONFLICT_ZONES] : undefined;

  // CPI 2023 data
  const cpiScore: number | undefined =
    iso2 ? CPI_SCORES[iso2 as keyof typeof CPI_SCORES] : undefined;
  const corruptionRiskTier: string =
    cpiScore === undefined ? "unknown"
    : cpiScore < 20 ? "very_high"
    : cpiScore < 30 ? "high"
    : cpiScore < 40 ? "elevated"
    : "standard";

  const isFatfBlack = FATF_BLACK_LIST.has(j);
  const isFatfGrey = FATF_GREY_LIST.has(j);
  const isCahra = CAHRA_ZONES.has(j);
  const isHighRiskOfc = HIGH_RISK_JURISDICTIONS.has(j);
  const isConflict = conflictIntensity === "active_war" || conflictIntensity === "civil_conflict";

  return {
    iso2: iso2 ?? null,
    fatfGreyList: isFatfGrey,
    fatfBlackList: isFatfBlack,
    cahraZone: isCahra,
    highRiskOFC: isHighRiskOfc,
    conflictZone: conflictIntensity ?? null,
    conflictStatus: conflictIntensity ?? "none",
    cpiScore2023: cpiScore ?? null,
    corruptionRiskTier,
    baseRiskTier: isFatfBlack ? "critical"
      : isFatfGrey || isCahra || conflictIntensity === "active_war" ? "high"
      : conflictIntensity === "civil_conflict" || isConflict ? "high"
      : conflictIntensity === "post_conflict" || (cpiScore !== undefined && cpiScore < 30) ? "elevated"
      : isHighRiskOfc ? "medium"
      : "standard",
    uaeCbuaeEnhancedDueDiligence: isFatfGrey || isFatfBlack || isCahra,
    fatfReference: isFatfBlack
      ? "FATF Public Statement — Call for Action (2025)"
      : isFatfGrey
      ? "FATF Increased Monitoring List / Grey List (Feb 2025)"
      : "Not on FATF monitoring list as of Feb 2025",
    cahraReference: isCahra
      ? "UAE Cabinet Decision 74/2023 — CAHRA designated jurisdiction"
      : null,
  };
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  let body: { jurisdiction: string; includeAiEnrichment?: boolean };
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400, headers: gate.headers });
  }
  if (!body.jurisdiction?.trim()) {
    return NextResponse.json({ ok: false, error: "jurisdiction required" }, { status: 400, headers: gate.headers });
  }

  const staticProfile = getStaticProfile(body.jurisdiction);

  // AI enrichment with current-knowledge context
  if (body.includeAiEnrichment === false) {
    return NextResponse.json({ ok: true, jurisdiction: body.jurisdiction, ...staticProfile, aiEnriched: false }, { headers: gate.headers });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ ok: true, jurisdiction: body.jurisdiction, ...staticProfile, aiEnriched: false }, { headers: gate.headers });
  }

  const client = getAnthropicClient(apiKey, 4_500, "geo-intelligence");
  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 800,
    system: `You are a geopolitical AML risk analyst with current knowledge of global sanctions, conflict zones, and regulatory enforcement. Provide a concise intelligence briefing for a UAE gold trader's compliance team.

Return ONLY valid JSON:
{
  "riskNarrative": "<2-3 sentence current risk assessment>",
  "keyRisks": ["<specific AML/TF/PF risk>"],
  "recentEnforcementActions": ["<notable case or regulatory action>"],
  "correspondentBankingRisk": "low|medium|high|very_high",
  "recommendedDueDiligenceLevel": "standard|enhanced|prohibition",
  "uaeSpecificObligations": ["<FDL/CBUAE obligation>"],
  "validUntil": "<suggest when to refresh this assessment>"
}`,
    messages: [{
      role: "user",
      content: `Provide AML geopolitical intelligence for: ${sanitizeField(body.jurisdiction, 100)}\n\nKnown static profile: ${JSON.stringify(staticProfile, null, 2)}`,
    }],
  });

  const raw = response.content[0]?.type === "text" ? (response.content[0] as { type: "text"; text: string }).text : "{}";
  try {
    const aiResult = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "{}") as Record<string, unknown>;
    if (!Array.isArray(aiResult["keyRisks"])) aiResult["keyRisks"] = [];
    if (!Array.isArray(aiResult["recentEnforcementActions"])) aiResult["recentEnforcementActions"] = [];
    if (!Array.isArray(aiResult["uaeSpecificObligations"])) aiResult["uaeSpecificObligations"] = [];
    return NextResponse.json({
      ok: true,
      jurisdiction: body.jurisdiction,
      ...staticProfile,
      ...aiResult,
      aiEnriched: true,
      generatedAt: new Date().toISOString(),
    }, { headers: gate.headers });
  } catch (err) {
    console.warn("[geo-intelligence] AI enrichment failed, serving static profile:", err);
    return NextResponse.json({ ok: true, jurisdiction: body.jurisdiction, ...staticProfile, aiEnriched: false, degraded: true }, { headers: gate.headers });
  }
}
