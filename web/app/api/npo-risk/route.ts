export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
export interface NpoRiskResult {
  riskRating: "critical" | "high" | "medium" | "low";
  keyRedFlags: string[];
  tfIndicators: string[];
  dueDiligenceSteps: string[];
  regulatoryBasis: string;
  recommendedAction: string;
}

const FALLBACK: NpoRiskResult = {
  riskRating: "high",
  keyRedFlags: [
    "Operates in conflict-affected jurisdiction (Syria, Yemen, Somalia)",
    "Cash-based funding model — no banking trail",
    "Anonymous donor base — no KYC on >10% of funders",
    "Beneficiaries include sanctioned region (OFAC SDN active)",
  ],
  tfIndicators: [
    "Historical link to entity on UNSCR 1267 list (Al-Qaeda)",
    "Wire transfers routed via jurisdiction with known TF nexus",
    "Programme activities inconsistent with stated charitable purpose",
  ],
  dueDiligenceSteps: [],
  regulatoryBasis:
    "FATF R.8 (NPO), UAE Cabinet Decision 74/2020 (Non-profit orgs), CBUAE AML Standards §4.3",
  recommendedAction: "",
};

export async function POST(req: Request) {
  let body: {
    npoName: string;
    country: string;
    sector: string;
    fundingSource: string;
    beneficiaryRegion: string;
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
  if (!apiKey) return NextResponse.json({ ok: false, error: "npo-risk temporarily unavailable - please retry." }, { status: 503 });

  try {
    const client = getAnthropicClient(apiKey, 55_000);
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      system: [
        {
          type: "text",
          text: `You are a UAE AML/CFT compliance expert specialising in NPO/charity sector risks under FATF Recommendation 8 and UAE Cabinet Decision 74/2020. Analyse NPOs for money laundering and terrorist financing risks. Return a JSON object with exactly these fields: { "riskRating": "critical"|"high"|"medium"|"low", "keyRedFlags": string[], "tfIndicators": string[], "dueDiligenceSteps": string[], "regulatoryBasis": string, "recommendedAction": string }`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{
        role: "user",
        content: `Analyse the following NPO for money laundering and terrorist financing risks:
- NPO Name: ${body.npoName}
- Country of Operation: ${body.country}
- Sector: ${body.sector}
- Funding Source: ${body.fundingSource}
- Beneficiary Region: ${body.beneficiaryRegion}
- Additional Context: ${body.context}`,
      }],
    });
    const text = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return NextResponse.json({ ok: false, error: "npo-risk temporarily unavailable - please retry." }, { status: 503 });

    const parsed = JSON.parse(jsonMatch[0]) as NpoRiskResult;
    return NextResponse.json({ ok: true, ...parsed });
  } catch {
    return NextResponse.json({ ok: false, error: "npo-risk temporarily unavailable - please retry." }, { status: 503 });
  }
}
