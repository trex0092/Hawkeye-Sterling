export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
import { sanitizeField, sanitizeText } from "@/lib/server/sanitize-prompt";
import { enforce } from "@/lib/server/enforce";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";
export interface EnforcementExposureResult {
  violationCategory: string;
  penaltyRange: {
    min: string;
    max: string;
    currency: string;
  };
  likelyPenalty: string;
  mitigatingFactors: string[];
  aggravatingFactors: string[];
  precedentCases: Array<{
    jurisdiction: string;
    description: string;
    penalty: string;
    year: string;
  }>;
  criminalExposure: boolean;
  criminalBasis?: string;
  mlroPersonalLiability: boolean;
  mlroLiabilityBasis?: string;
  selfReportingBenefit: string;
  remedialActions: string[];
  regulatoryBasis: string;
}


export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const tenant = tenantIdFromGate(gate);

  let body: {
    violation: string;
    institutionType?: string;
    violationPeriod?: string;
    selfReported?: string;
    priorHistory?: string;
    context?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400, headers: gate.headers });
  }
  if (!body.violation?.trim()) return NextResponse.json({ ok: false, error: "violation required" }, { status: 400, headers: gate.headers });

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "enforcement-exposure temporarily unavailable - please retry." }, { status: 503, headers: gate.headers });

  try {
    const client = getAnthropicClient(apiKey, 4_500);
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 700,
      system: [
        {
          type: "text",
          text: `You are a UAE AML enforcement specialist with expertise in CBUAE penalty framework, UAE FDL 10/2025 sanctions provisions, personal MLRO liability, criminal exposure thresholds, and self-reporting benefits. Assess AML compliance violations for penalty exposure (range in AED), mitigating and aggravating factors, precedent cases from UAE and comparable jurisdictions, criminal and personal liability exposure, and remedial action recommendations. Reference UAE FDL 10/2025 criminal penalty articles and CBUAE administrative sanctions framework. Respond ONLY with valid JSON matching the EnforcementExposureResult interface — no markdown fences.`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{
        role: "user",
        content: `Violation Description: ${sanitizeText(body.violation, 2000)}
Institution Type: ${sanitizeField(body.institutionType, 500) ?? "UAE licensed financial institution"}
Violation Period: ${sanitizeField(body.violationPeriod, 100) ?? "not specified"}
Self-Reported: ${sanitizeField(body.selfReported, 100) ?? "not yet"}
Prior Enforcement History: ${sanitizeText(body.priorHistory, 2000) ?? "none known"}
Additional Context: ${sanitizeText(body.context, 2000) ?? "none"}

Assess regulatory enforcement exposure for this AML violation. Return complete EnforcementExposureResult JSON.`,
      }],
    });
    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as EnforcementExposureResult;
    if (!Array.isArray(result.mitigatingFactors)) result.mitigatingFactors = [];
    if (!Array.isArray(result.aggravatingFactors)) result.aggravatingFactors = [];
    if (!Array.isArray(result.precedentCases)) result.precedentCases = [];
    if (!Array.isArray(result.remedialActions)) result.remedialActions = [];
    void writeAuditChainEntry({ event: "enforcement_exposure.completed", actor: gate.keyId }, tenant).catch(() => {});
return NextResponse.json({ ok: true, ...result }, { headers: gate.headers });
  } catch (err) {
    console.warn("[hawkeye] route handler failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false, error: "enforcement-exposure temporarily unavailable - please retry." }, { status: 503, headers: gate.headers });
  }
}
