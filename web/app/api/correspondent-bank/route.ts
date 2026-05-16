export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
import { enforce } from "@/lib/server/enforce";
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
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
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
      { status: 400, headers: gate.headers }
    );
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "correspondent-bank temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });

  try {
    const client = getAnthropicClient(apiKey, 55_000);
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 700,
      system: [
        {
          type: "text",
          text: `You are a UAE AML/CFT compliance expert specialising in correspondent banking due diligence under FATF R.13 and UAE FDL 10/2025. Assess correspondent banking relationships and return a JSON object with exactly these fields: { "riskRating": "critical"|"high"|"medium"|"low", "kycStatus": "pass"|"conditional"|"fail", "amlProgrammeAssessment": string, "shellBankRisk": boolean, "payableThrough": boolean, "requiredEnhancements": string[], "regulatoryBasis": string }`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{
        role: "user",
        content: `Assess the following correspondent banking relationship:
- Bank Name: ${body.bankName}
- Country: ${body.country}
- Regulatory Body: ${body.regulatoryBody}
- Last KYC Date: ${body.lastKycDate}
- AML Programme Status: ${body.amlProgrammeStatus}
- Additional Context: ${body.context}`,
      }],
    });
    const text = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return NextResponse.json({ ok: false, error: "correspondent-bank temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });

    const parsed = JSON.parse(jsonMatch[0]) as CorrespondentBankResult;
    if (!Array.isArray(parsed.requiredEnhancements)) parsed.requiredEnhancements = [];
    return NextResponse.json({ ok: true, ...parsed }, { headers: gate.headers });
  } catch {
    return NextResponse.json({ ok: false, error: "correspondent-bank temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
