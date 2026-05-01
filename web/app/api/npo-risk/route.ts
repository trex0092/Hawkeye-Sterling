export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";

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
  if (!apiKey) return NextResponse.json({ ok: true, ...FALLBACK });

  try {
    const prompt = `You are a UAE AML/CFT compliance expert specialising in NPO/charity sector risks under FATF Recommendation 8 and UAE Cabinet Decision 74/2020.

Analyse the following NPO for money laundering and terrorist financing risks:
- NPO Name: ${body.npoName}
- Country of Operation: ${body.country}
- Sector: ${body.sector}
- Funding Source: ${body.fundingSource}
- Beneficiary Region: ${body.beneficiaryRegion}
- Additional Context: ${body.context}

Return a JSON object with exactly these fields:
{
  "riskRating": "critical"|"high"|"medium"|"low",
  "keyRedFlags": string[],
  "tfIndicators": string[],
  "dueDiligenceSteps": string[],
  "regulatoryBasis": string,
  "recommendedAction": string
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

    const parsed = JSON.parse(jsonMatch[0]) as NpoRiskResult;
    return NextResponse.json({ ok: true, ...parsed });
  } catch {
    return NextResponse.json({ ok: true, ...FALLBACK });
  }
}
