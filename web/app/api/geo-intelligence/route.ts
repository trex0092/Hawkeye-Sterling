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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Static FATF grey/black list — updated periodically (Feb 2025 cycle)
const FATF_GREY_LIST = new Set([
  "Algeria", "Angola", "Bulgaria", "Burkina Faso", "Cameroon", "Côte d'Ivoire",
  "Croatia", "Democratic Republic of Congo", "Haiti", "Kenya", "Laos",
  "Lebanon", "Mali", "Monaco", "Mozambique", "Namibia", "Nigeria",
  "Philippines", "Senegal", "South Africa", "South Sudan", "Syria",
  "Tanzania", "Venezuela", "Vietnam", "Yemen",
]);

const FATF_BLACK_LIST = new Set([
  "Iran", "North Korea", "Myanmar",
]);

// CAHRA (Conflict-Affected and High-Risk Areas) — OECD 5-Step guidance
const CAHRA_ZONES = new Set([
  "Afghanistan", "Central African Republic", "Democratic Republic of Congo",
  "Ethiopia", "Haiti", "Libya", "Mali", "Myanmar", "Somalia", "South Sudan",
  "Sudan", "Syria", "Ukraine", "Yemen",
]);

const HIGH_RISK_JURISDICTIONS = new Set([
  "British Virgin Islands", "Cayman Islands", "Panama", "Seychelles",
  "Vanuatu", "Marshall Islands", "Palau", "Samoa",
]);

function getStaticProfile(jurisdiction: string): Record<string, unknown> {
  const j = jurisdiction.trim();
  return {
    fatfGreyList: FATF_GREY_LIST.has(j),
    fatfBlackList: FATF_BLACK_LIST.has(j),
    cahraZone: CAHRA_ZONES.has(j),
    highRiskOFC: HIGH_RISK_JURISDICTIONS.has(j),
    baseRiskTier: FATF_BLACK_LIST.has(j) ? "critical"
      : FATF_GREY_LIST.has(j) || CAHRA_ZONES.has(j) ? "high"
      : HIGH_RISK_JURISDICTIONS.has(j) ? "medium"
      : "standard",
    uaeCbuaeEnhancedDueDiligence: FATF_GREY_LIST.has(j) || FATF_BLACK_LIST.has(j),
    fatfReference: FATF_BLACK_LIST.has(j)
      ? "FATF Public Statement — Call for Action"
      : FATF_GREY_LIST.has(j)
      ? "FATF Increased Monitoring List (Grey List)"
      : "Not on FATF monitoring list as of Feb 2025",
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

  const client = getAnthropicClient(apiKey, 20_000, "geo-intelligence");
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
  } catch {
    return NextResponse.json({ ok: true, jurisdiction: body.jurisdiction, ...staticProfile, aiEnriched: false }, { headers: gate.headers });
  }
}
