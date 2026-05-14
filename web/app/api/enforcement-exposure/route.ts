export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
import { enforce } from "@/lib/server/enforce";
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
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.violation?.trim()) return NextResponse.json({ ok: false, error: "violation required" }, { status: 400 });

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "enforcement-exposure temporarily unavailable - please retry." }, { status: 503 });

  try {
    const client = getAnthropicClient(apiKey, 55_000);
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1450,
      system: [
        {
          type: "text",
          text: `You are a UAE AML enforcement specialist with expertise in CBUAE penalty framework, UAE FDL 10/2025 sanctions provisions, personal MLRO liability, criminal exposure thresholds, and self-reporting benefits. Assess AML compliance violations for penalty exposure (range in AED), mitigating and aggravating factors, precedent cases from UAE and comparable jurisdictions, criminal and personal liability exposure, and remedial action recommendations. Reference UAE FDL 10/2025 criminal penalty articles and CBUAE administrative sanctions framework. Respond ONLY with valid JSON matching the EnforcementExposureResult interface — no markdown fences.`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{
        role: "user",
        content: `Violation Description: ${body.violation}
Institution Type: ${body.institutionType ?? "UAE licensed financial institution"}
Violation Period: ${body.violationPeriod ?? "not specified"}
Self-Reported: ${body.selfReported ?? "not yet"}
Prior Enforcement History: ${body.priorHistory ?? "none known"}
Additional Context: ${body.context ?? "none"}

Assess regulatory enforcement exposure for this AML violation. Return complete EnforcementExposureResult JSON.`,
      }],
    });
    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as EnforcementExposureResult;
    return NextResponse.json({ ok: true, ...result });
  } catch {
    return NextResponse.json({ ok: false, error: "enforcement-exposure temporarily unavailable - please retry." }, { status: 503 });
  }
}
