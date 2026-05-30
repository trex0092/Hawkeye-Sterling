export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;import { NextResponse } from "next/server";

import { enforce } from "@/lib/server/enforce";
import { getAnthropicClient } from "@/lib/server/llm";
import { sanitizeField, sanitizeText } from "@/lib/server/sanitize-prompt";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";

export interface PepScreeningEnhanceResult {
  pepClassification: "PEP-1" | "PEP-2" | "PEP-3" | "Former-PEP" | "Not-PEP";
  riskRating: "critical" | "high" | "medium";
  pepRole: string;
  corruptionExposure: string;
  eddChecklist: string[];
  monitoringPlan: string;
  exitCriteria: string;
  regulatoryBasis: string;
}


export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: {
    subjectName: string;
    currentRole: string;
    jurisdiction: string;
    wealthEstimate: string;
    knownConnections: string;
    context: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON" },
      { status: 400, headers: gate.headers }
    );
  }
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "pep-screening-enhance temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  try {
    const client = getAnthropicClient(apiKey, 4_500);
    const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 700,
        system:
          "You are a UAE AML/CFT compliance expert specialising in enhanced PEP screening and EDD. Classify PEP status and generate EDD requirements under UAE FDL and FATF standards. Return valid JSON only matching the PepScreeningEnhanceResult interface.",
        messages: [
          {
            role: "user",
            content: `Perform enhanced PEP screening and classification.\n\nSubject: ${sanitizeField(body.subjectName)}\nCurrent Role: ${sanitizeField(body.currentRole)}\nJurisdiction: ${sanitizeField(body.jurisdiction)}\nWealth Estimate: ${sanitizeField(body.wealthEstimate)}\nKnown Connections: ${sanitizeField(body.knownConnections)}\nContext: ${sanitizeText(body.context)}\n\nReturn JSON with fields: pepClassification, riskRating, pepRole, corruptionExposure, eddChecklist[], monitoringPlan, exitCriteria, regulatoryBasis.`,
          },
        ],
      });
    const raw =
      response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(
      raw.replace(/```json\n?|\n?```/g, "").trim()
    ) as PepScreeningEnhanceResult;
    if (!Array.isArray(result.eddChecklist)) result.eddChecklist = [];
    void writeAuditChainEntry(
      { event: "pep_screening_enhanced", actor: gate.keyId, pepClassification: result.pepClassification, riskRating: result.riskRating, eddChecklistCount: result.eddChecklist.length },
      tenantIdFromGate(gate),
    ).catch((e: unknown) => console.warn("[audit] write failed:", e instanceof Error ? e.message : String(e)));
    return NextResponse.json({ ok: true, ...result }, { headers: gate.headers });
  } catch (err) {
    console.warn("[hawkeye] route handler failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false, error: "pep-screening-enhance temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
