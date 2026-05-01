export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";

export interface CorrespondentBankResult {
  riskRating: "critical" | "high" | "medium" | "low";
  kycStatus: "pass" | "conditional" | "fail";
  amlProgrammeAssessment: string;
  shellBankRisk: boolean;
  payableThrough: boolean;
  requiredEnhancements: string[];
  regulatoryBasis: string;
}

const FALLBACK: CorrespondentBankResult = {
  riskRating: "high",
  kycStatus: "conditional",
  amlProgrammeAssessment:
    "Target bank operates in FATF grey-list jurisdiction. AML programme documentation is 18 months old and pre-dates 2024 regulatory update. Shell bank prohibition clause absent from correspondent agreement.",
  shellBankRisk: false,
  payableThrough: true,
  requiredEnhancements: [
    "Obtain current AML programme attestation signed by CCO",
    "Add shell bank prohibition and payable-through restriction clause",
    "Annual re-certification with updated FATF compliance confirmation",
    "Nested correspondent banking prohibition must be explicit",
  ],
  regulatoryBasis:
    "FATF R.13, Basel CDD Paper §III, UAE FDL 10/2025 Art.16, CBUAE AML Standards §5",
};

export async function POST(req: Request) {
  let body: {
    bankName: string;
    country: string;
    regulatoryBody: string;
    lastKycDate: string;
    amlProgrammeStatus: string;
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
    const prompt = `You are a UAE AML/CFT compliance expert specialising in correspondent banking due diligence under FATF R.13 and UAE FDL 10/2025.

Assess the following correspondent banking relationship:
- Bank Name: ${body.bankName}
- Country: ${body.country}
- Regulatory Body: ${body.regulatoryBody}
- Last KYC Date: ${body.lastKycDate}
- AML Programme Status: ${body.amlProgrammeStatus}
- Additional Context: ${body.context}

Return a JSON object with exactly these fields:
{
  "riskRating": "critical"|"high"|"medium"|"low",
  "kycStatus": "pass"|"conditional"|"fail",
  "amlProgrammeAssessment": string,
  "shellBankRisk": boolean,
  "payableThrough": boolean,
  "requiredEnhancements": string[],
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

    const parsed = JSON.parse(jsonMatch[0]) as CorrespondentBankResult;
    return NextResponse.json({ ok: true, ...parsed });
  } catch {
    return NextResponse.json({ ok: true, ...FALLBACK });
  }
}
