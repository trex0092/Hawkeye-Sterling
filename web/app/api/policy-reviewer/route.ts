export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";

import { getAnthropicClient } from "@/lib/server/llm";
import { sanitizeField, sanitizeText } from "@/lib/server/sanitize-prompt";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";

export interface PolicyReviewResult {
  overallCompliance: "compliant" | "partially_compliant" | "non_compliant";
  complianceScore: number;
  missingProvisions: Array<{
    provision: string;
    legalBasis: string;
    severity: "critical" | "high" | "medium" | "low";
    suggestedText: string;
  }>;
  outdatedReferences: Array<{
    reference: string;
    currentLaw: string;
    detail: string;
  }>;
  strengths: string[];
  recommendations: string[];
  nextReviewDate: string;
  regulatoryBasis: string;
}


export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: {
    policyText: string;
    policyType?: string;
    institutionType?: string;
    lastReviewDate?: string;
    context?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 , headers: gate.headers });
  }
  if (!body.policyText?.trim()) return NextResponse.json({ ok: false, error: "policyText required" }, { status: 400 , headers: gate.headers });

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "policy-reviewer temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });

  try {
    const client = getAnthropicClient(apiKey, 4_500);
    const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 700,
        system: `You are a UAE AML policy specialist with expertise in UAE Federal Decree-Law No. 10 of 2025 requirements, CBUAE AML/CFT Guidelines, and FATF Recommendations. Review AML/CFT policy documents for compliance with current UAE law, identify missing mandatory provisions (especially PF, UBO, EWRA, tipping off), flag outdated regulatory references (Federal Decree-Law No. (10) of 2025 → Federal Decree-Law No. 10 of 2025), and provide specific suggested text for gaps. Score overall compliance on a 0-100 scale. Identify both strengths and weaknesses. Respond ONLY with valid JSON matching the PolicyReviewResult interface — no markdown fences.`,
        messages: [{
          role: "user",
          content: `Policy Text: ${sanitizeText(body.policyText, 2000)}
Policy Type: ${sanitizeField(body.policyType ?? "AML/CFT Policy", 100)}
Institution Type: ${sanitizeField(body.institutionType ?? "UAE licensed financial institution", 100)}
Last Review Date: ${sanitizeField(body.lastReviewDate ?? "not specified", 50)}
Additional Context: ${sanitizeText(body.context ?? "none", 2000)}

Review this AML policy for compliance with UAE Federal Decree-Law No. 10 of 2025. Return complete PolicyReviewResult JSON.`,
        }],
      });
    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as PolicyReviewResult;
    if (!Array.isArray(result.missingProvisions)) result.missingProvisions = [];
    if (!Array.isArray(result.outdatedReferences)) result.outdatedReferences = [];
    if (!Array.isArray(result.strengths)) result.strengths = [];
    if (!Array.isArray(result.recommendations)) result.recommendations = [];
    void writeAuditChainEntry(
      { event: "policy_reviewed", actor: gate.keyId, overallCompliance: result.overallCompliance, complianceScore: result.complianceScore, missingProvisionCount: result.missingProvisions.length },
      tenantIdFromGate(gate),
    ).catch((e: unknown) => console.warn("[audit] write failed:", e instanceof Error ? e.message : String(e)));
    return NextResponse.json({ ok: true, ...result }, { headers: gate.headers });
  } catch (err) {
    console.warn("[hawkeye] route handler failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false, error: "policy-reviewer temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
