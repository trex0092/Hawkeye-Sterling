import { NextResponse } from "next/server";
import { writeAuditEvent } from "@/lib/audit";
import { enforce } from "@/lib/server/enforce";

import { getAnthropicClient } from "@/lib/server/llm";
import { sanitizeField } from "@/lib/server/sanitize-prompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface UboEntry {
  name: string;
  dob: string;
  nationality: string;
  gender: string;
  ownershipPct: string;
  role: string;
}

interface RequestBody {
  entity: string;
  registered: string;
  ubos: UboEntry[];
}

interface UboRiskResult {
  overallRisk: "critical" | "high" | "medium" | "low";
  riskNarrative: string;
  ownershipStructureRisk: string;
  pepRiskFlags: string[];
  nationalityRisks: string[];
  cddGaps: string[];
  recommendedActions: string[];
  regulatoryBasis: string;
  eddRequired: boolean;
  sanctionsScreeningRequired: boolean;
}

const FALLBACK: UboRiskResult = {
  overallRisk: "medium",
  riskNarrative: "API key not configured — manual review required.",
  ownershipStructureRisk: "",
  pepRiskFlags: [],
  nationalityRisks: [],
  cddGaps: [],
  recommendedActions: [],
  regulatoryBasis: "",
  eddRequired: false,
  sanctionsScreeningRequired: false,
};

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 , headers: gate.headers });
    }

  const { entity, registered, ubos } = body;

  try { writeAuditEvent("analyst", "ubo.ai-risk-assessment", entity); }
  catch (err) { console.warn("[hawkeye] ubo-risk writeAuditEvent failed:", err); }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "ubo-risk temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }

  try {
    const client = getAnthropicClient(apiKey, 55_000);
    const res = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 700,
        system:
          "You are a UAE AML/CFT specialist in beneficial ownership and UBO risk assessment under FDL 10/2025 Art.10 and Cabinet Decision 58/2020. Assess this UBO declaration for money laundering risk, PEP exposure, ownership structure concerns, and CDD gaps. Output JSON (ONLY valid JSON, no markdown).",
        messages: [
          {
            role: "user",
            content: `Entity: ${sanitizeField(entity)}. Registered in: ${sanitizeField(registered)}. UBOs: ${JSON.stringify(ubos)}. Return ONLY this JSON: { "overallRisk": "critical"|"high"|"medium"|"low", "riskNarrative": "string", "ownershipStructureRisk": "string", "pepRiskFlags": ["string"], "nationalityRisks": ["string"], "cddGaps": ["string"], "recommendedActions": ["string"], "regulatoryBasis": "string", "eddRequired": boolean, "sanctionsScreeningRequired": boolean }`,
          },
        ],
      });


    const text = res.content[0]?.type === "text" ? res.content[0].text : "";
    const stripped = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    const parsed = JSON.parse(stripped) as UboRiskResult;
    // Normalize arrays — LLM occasionally returns null/string instead of [].
    if (!Array.isArray(parsed.pepRiskFlags)) parsed.pepRiskFlags = [];
    if (!Array.isArray(parsed.nationalityRisks)) parsed.nationalityRisks = [];
    if (!Array.isArray(parsed.cddGaps)) parsed.cddGaps = [];
    if (!Array.isArray(parsed.recommendedActions)) parsed.recommendedActions = [];
    return NextResponse.json({ ok: true, ...parsed }, { headers: gate.headers });
  } catch {
    return NextResponse.json({ ok: false, error: "ubo-risk temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
