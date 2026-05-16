export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
import { enforce } from "@/lib/server/enforce";
export interface DerisiskingImpactResult {
  justificationStrength: "strong" | "moderate" | "weak";
  fatfConformant: boolean;
  affectedCustomerCount: number;
  reputationalRisk: "high" | "medium" | "low";
  alternativesMitigants: string[];
  exitProcessRequirements: string[];
  documentationRequired: string[];
  regulatoryBasis: string;
}

const FALLBACK: DerisiskingImpactResult = {
  justificationStrength: "moderate",
  fatfConformant: true,
  affectedCustomerCount: 47,
  reputationalRisk: "medium",
  alternativesMitigants: [
    "Enhanced monitoring instead of exit for low-volume, long-standing customers",
    "Restrict to non-cash transactions only rather than full exit",
    "Require additional documentation as condition of continued service",
    "Refer low-risk customers within segment to another compliant provider",
  ],
  exitProcessRequirements: [
    "30-day written notice to affected customers (Consumer Protection requirements)",
    "Return of all customer property and assets before account closure",
    "Maintain records for 10 years post-exit (FDL Art.24)",
    "Do not file STR solely because customer is in de-risked segment — this is inappropriate de-risking",
    "Document risk-based justification for each individual exit decision",
  ],
  documentationRequired: [
    "Board-approved de-risking policy with risk-based rationale",
    "Individual customer risk assessments justifying exit decision",
    "Evidence that alternatives were considered and rejected with reasons",
    "Communication templates approved by Legal",
  ],
  regulatoryBasis:
    "FATF Guidance on De-Risking (2021), UAE CBUAE Notice 2022 (proportionate CDD), UAE Consumer Protection Law, FDL 10/2025 Art.4-8",
};

export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: {
    customerSegment: string;
    affectedCount: string;
    riskJustification: string;
    institutionType: string;
    context: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON" },
      { status: 400, headers: gate.headers }
    );
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "derisking-impact temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });

  try {
    const client = getAnthropicClient(apiKey, 55_000);
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1500,
      system: [
        {
          type: "text",
          text: `You are a UAE AML/CFT compliance expert specialising in de-risking impact assessment under FATF guidance (2021) and UAE FDL 10/2025. Assess de-risking decisions and return a JSON object with exactly these fields: { "justificationStrength": "strong"|"moderate"|"weak", "fatfConformant": boolean, "affectedCustomerCount": number, "reputationalRisk": "high"|"medium"|"low", "alternativesMitigants": string[], "exitProcessRequirements": string[], "documentationRequired": string[], "regulatoryBasis": string }`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{
        role: "user",
        content: `Assess the following de-risking decision:
- Customer Segment: ${body.customerSegment}
- Affected Customer Count: ${body.affectedCount}
- Risk Justification: ${body.riskJustification}
- Institution Type: ${body.institutionType}
- Additional Context: ${body.context}`,
      }],
    });
    const text = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return NextResponse.json({ ok: false, error: "derisking-impact temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });

    const parsed = JSON.parse(jsonMatch[0]) as DerisiskingImpactResult;
    if (!Array.isArray(parsed.alternativesMitigants)) parsed.alternativesMitigants = [];
    if (!Array.isArray(parsed.exitProcessRequirements)) parsed.exitProcessRequirements = [];
    if (!Array.isArray(parsed.documentationRequired)) parsed.documentationRequired = [];
    return NextResponse.json({ ok: true, ...parsed , headers: gate.headers });
  } catch {
    return NextResponse.json({ ok: false, error: "derisking-impact temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
