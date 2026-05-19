export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { getAnthropicClient } from "@/lib/server/llm";
import { sanitizeField, sanitizeText } from "@/lib/server/sanitize-prompt";

export interface EwraResult {
  overallRisk: "critical" | "high" | "medium" | "low";
  riskNarrative: string;
  customerRisk: {
    rating: "high" | "medium" | "low";
    narrative: string;
    keyFactors: string[];
  };
  productRisk: {
    rating: "high" | "medium" | "low";
    narrative: string;
    keyFactors: string[];
  };
  geographicRisk: {
    rating: "high" | "medium" | "low";
    narrative: string;
    keyFactors: string[];
  };
  channelRisk: {
    rating: "high" | "medium" | "low";
    narrative: string;
    keyFactors: string[];
  };
  controlEffectiveness: "strong" | "adequate" | "weak";
  residualRisk: "high" | "medium" | "low";
  mitigationMeasures: string[];
  annualReviewDate: string;
  boardApprovalRequired: boolean;
  regulatoryBasis: string;
  executiveSummary: string;
}


export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: {
    institutionType: string;
    productsServices?: string;
    customerBase?: string;
    geographicFootprint?: string;
    transactionVolume?: string;
    existingControls?: string;
    context?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 , headers: gate.headers });
  }
  if (!body.institutionType?.trim()) return NextResponse.json({ ok: false, error: "institutionType required" }, { status: 400 , headers: gate.headers });

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "ewra-generator temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });

  try {
    const client = getAnthropicClient(apiKey, 55_000);
    const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 700,
        system: `You are a UAE Enterprise-Wide Risk Assessment (EWRA) specialist with expertise in CBUAE guidelines, FATF Recommendation 1 risk-based approach, and sector-specific ML/TF/CPF risk profiling. Generate comprehensive EWRAs assessing four risk dimensions: customer, product/service, geographic, and channel risks. Apply UAE national risk assessment findings, FATF grey-list/blacklist status, sector typologies, and CBUAE-specific requirements. Determine inherent risk, control effectiveness, and residual risk. Include realistic mitigation measures and Board approval requirements.\n\nIMPORTANT — CPF (Counter-Proliferation Financing) is a STANDALONE risk domain alongside AML and TF, mandated by UAE FDL 10/2025 Art.1 and FATF R.7. Assess CPF risk separately: dual-use goods exposure, sanctions evasion for WMD programs, front company indicators, and proliferation network red flags. Include CPF-specific mitigations such as UNSC Resolution 1540 compliance checks and dual-use goods controls. Respond ONLY with valid JSON matching the EwraResult interface — no markdown fences.`,
        messages: [{
          role: "user",
          content: `Institution Type: ${sanitizeField(body.institutionType, 500)}
Products/Services: ${sanitizeText(body.productsServices, 2000) ?? "not specified"}
Customer Base Description: ${sanitizeText(body.customerBase, 2000) ?? "not described"}
Geographic Footprint: ${sanitizeText(body.geographicFootprint, 2000) ?? "not specified"}
Transaction Volume: ${sanitizeField(body.transactionVolume, 500) ?? "not provided"}
Existing Controls: ${sanitizeText(body.existingControls, 2000) ?? "not described"}
Additional Context: ${sanitizeText(body.context, 2000) ?? "none"}

Generate a comprehensive EWRA for this institution. Return complete EwraResult JSON.`,
        }],
      });
    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as EwraResult;
    if (!Array.isArray(result.mitigationMeasures)) result.mitigationMeasures = [];
    if (result.customerRisk && !Array.isArray(result.customerRisk.keyFactors)) result.customerRisk.keyFactors = [];
    if (result.productRisk && !Array.isArray(result.productRisk.keyFactors)) result.productRisk.keyFactors = [];
    if (result.geographicRisk && !Array.isArray(result.geographicRisk.keyFactors)) result.geographicRisk.keyFactors = [];
    if (result.channelRisk && !Array.isArray(result.channelRisk.keyFactors)) result.channelRisk.keyFactors = [];
    // FATF R.1 / FDL 10/2025 Art.4 — EWRA generation is a compliance-critical
    // event that must appear on the tamper-evident audit chain.
    void writeAuditChainEntry(
      {
        event: "ewra.generated",
        actor: gate.keyId,
        institutionType: body.institutionType,
        overallRisk: result.overallRisk,
        controlEffectiveness: result.controlEffectiveness,
        residualRisk: result.residualRisk,
      },
      tenantIdFromGate(gate),
    ).catch((err) =>
      console.warn("[ewra-generator] audit chain write failed:", err instanceof Error ? err.message : String(err)),
    );
    return NextResponse.json({ ok: true, ...result }, { headers: gate.headers });
  } catch {
    return NextResponse.json({ ok: false, error: "ewra-generator temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
