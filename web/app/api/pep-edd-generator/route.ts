export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";

import { getAnthropicClient } from "@/lib/server/llm";
import { sanitizeField, sanitizeText } from "@/lib/server/sanitize-prompt";

export interface PepEddResult {
  pepClassification: "domestic_pep" | "foreign_pep" | "international_organisation_pep" | "former_pep" | "pep_family" | "pep_associate" | "not_pep";
  pepRole: string;
  pepJurisdiction: string;
  riskRating: "very_high" | "high" | "medium";
  seniorManagementApproval: boolean;
  approvalLevel: string;
  eddQuestionnaire: Array<{
    category: string;
    question: string;
    purpose: string;
    documentaryEvidence?: string;
  }>;
  sourceOfWealthAssessment: string;
  sourceOfFundsAssessment: string;
  requiredDocumentation: string[];
  ongoingMonitoringFrequency: string;
  ongoingMonitoringMeasures: string[];
  screeningRequirements: string[];
  pepMemo: string;
  recommendedAction: "onboard_with_enhanced_measures" | "refer_senior_management" | "decline" | "exit_relationship";
  actionRationale: string;
  regulatoryBasis: string;
}


export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: {
    pepName: string;
    pepRole?: string;
    pepJurisdiction?: string;
    pepClassification?: string;
    relationshipType?: string;
    proposedProducts?: string;
    knownWealth?: string;
    context?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 , headers: gate.headers });
  }
  if (!body.pepName?.trim()) return NextResponse.json({ ok: false, error: "pepName required" }, { status: 400 , headers: gate.headers });

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "pep-edd-generator temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });

  try {
    const client = getAnthropicClient(apiKey, 4_500);
    const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 700,
        system: `You are a UAE PEP (Politically Exposed Person) EDD specialist. Generate a comprehensive PEP enhanced due diligence package under UAE FDL 10/2025 Art.14(2) and FATF R.12.

PEP categories (UAE definition per FDL 10/2025):
- Domestic PEP: UAE heads of state, ministers, senior officials, judges, military generals, senior executives of state-owned enterprises
- Foreign PEP: Equivalent positions in foreign governments
- International Organisation PEP: Senior officials of IOs (UN, World Bank, IMF, etc.)
- Former PEP: Within 12 months of leaving office (UAE approach — some FIs maintain 2+ years)
- PEP Family: Spouse, parents, children, siblings of PEP
- PEP Associate: Known close business/personal associate of PEP

FATF R.12 key requirements:
- Senior management approval BEFORE establishing relationship
- Source of wealth (SOW) AND source of funds (SOF) — both mandatory, distinct
- Enhanced ongoing monitoring — frequency based on risk
- Family and close associates — must screen separately

UAE-specific: FDL 10/2025 Art.14(2)(b) — mandatory senior management approval for ALL PEPs (domestic and foreign). No threshold on transactions.

Respond ONLY with valid JSON — no markdown fences matching the PepEddResult interface structure.`,
        messages: [{
          role: "user",
          content: `PEP Name: ${sanitizeField(body.pepName, 500)}
PEP Role/Position: ${sanitizeField(body.pepRole, 200) || "not specified"}
PEP Jurisdiction: ${sanitizeField(body.pepJurisdiction, 100) || "not specified"}
PEP Classification: ${sanitizeField(body.pepClassification, 100) || "to be determined"}
Proposed Relationship Type: ${sanitizeField(body.relationshipType, 100) || "not specified"}
Proposed Products/Services: ${sanitizeField(body.proposedProducts, 200) || "not specified"}
Known Wealth/Income: ${sanitizeField(body.knownWealth, 200) || "not disclosed"}
Additional Context: ${sanitizeText(body.context, 2000) || "none"}

Generate a complete PEP EDD package for this individual.`,
        }],
      });
    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as PepEddResult;
    if (!Array.isArray(result.eddQuestionnaire)) result.eddQuestionnaire = [];
    if (!Array.isArray(result.requiredDocumentation)) result.requiredDocumentation = [];
    if (!Array.isArray(result.ongoingMonitoringMeasures)) result.ongoingMonitoringMeasures = [];
    if (!Array.isArray(result.screeningRequirements)) result.screeningRequirements = [];
    return NextResponse.json({ ok: true, ...result }, { headers: gate.headers });
  } catch (err) {
    console.warn("[hawkeye] route handler failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false, error: "pep-edd-generator temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
