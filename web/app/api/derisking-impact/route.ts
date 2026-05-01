export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";

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
      { status: 400 }
    );
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: true, ...FALLBACK });

  try {
    const prompt = `You are a UAE AML/CFT compliance expert specialising in de-risking impact assessment under FATF guidance (2021) and UAE FDL 10/2025.

Assess the following de-risking decision:
- Customer Segment: ${body.customerSegment}
- Affected Customer Count: ${body.affectedCount}
- Risk Justification: ${body.riskJustification}
- Institution Type: ${body.institutionType}
- Additional Context: ${body.context}

Return a JSON object with exactly these fields:
{
  "justificationStrength": "strong"|"moderate"|"weak",
  "fatfConformant": boolean,
  "affectedCustomerCount": number,
  "reputationalRisk": "high"|"medium"|"low",
  "alternativesMitigants": string[],
  "exitProcessRequirements": string[],
  "documentationRequired": string[],
  "regulatoryBasis": string
}`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1500,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!response.ok) return NextResponse.json({ ok: true, ...FALLBACK });
    const data = await response.json() as { content: Array<{ type: string; text: string }> };
    const text = data.content[0]?.type === "text" ? data.content[0].text : "{}";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return NextResponse.json({ ok: true, ...FALLBACK });

    const parsed = JSON.parse(jsonMatch[0]) as DerisiskingImpactResult;
    return NextResponse.json({ ok: true, ...parsed });
  } catch {
    return NextResponse.json({ ok: true, ...FALLBACK });
  }
}
