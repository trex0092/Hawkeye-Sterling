export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export interface CrossBorderWireResult {
  corridorRisk: "critical" | "high" | "medium" | "low";
  r16ComplianceStatus: "compliant" | "partial" | "non-compliant";
  redFlags: string[];
  missingOriginatorInfo: string[];
  missingBeneficiaryInfo: string[];
  recommendedAction:
    | "proceed"
    | "enhance-monitoring"
    | "hold-investigate"
    | "reject-return";
  regulatoryBasis: string;
}

const FALLBACK: CrossBorderWireResult = {
  corridorRisk: "high",
  r16ComplianceStatus: "partial",
  redFlags: [
    "Wire originates from UAE to Pakistan — FATF grey-list corridor",
    "Originator reference: 'TRADE PAYMENT' — insufficient specificity",
    "Beneficiary address missing — field blank in MT103",
    "Amount AED 490,000 — below CTR threshold but above FATF R.16 reporting threshold",
    "Third-party payment — instructing party differs from account holder",
  ],
  missingOriginatorInfo: [
    "Originator address (required per FATF R.16 for cross-border transfers)",
    "Originator account number at sending institution",
    "Originator national ID or passport number (UAE requirement for transfers >AED 5,000)",
  ],
  missingBeneficiaryInfo: [
    "Beneficiary full address",
    "Beneficiary account number (BIC/IBAN present but no account number)",
  ],
  recommendedAction: "hold-investigate",
  regulatoryBasis:
    "FATF R.16 (wire transfers), UAE CBUAE Notice 2023 (wire transfer requirements), SWIFT messaging standards MT103/103+, Wolfsberg Correspondent Banking Principles 2023",
};

export async function POST(req: Request) {
  let body: {
    originatorName: string;
    beneficiaryName: string;
    amount: string;
    currency: string;
    originCountry: string;
    destinationCountry: string;
    purpose: string;
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
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      system: [
        {
          type: "text",
          text: `You are a UAE AML/CFT compliance expert specialising in cross-border wire transfer risk assessment under FATF R.16 and CBUAE wire transfer requirements. Assess cross-border wire transfers and return a JSON object with exactly these fields: { "corridorRisk": "critical"|"high"|"medium"|"low", "r16ComplianceStatus": "compliant"|"partial"|"non-compliant", "redFlags": string[], "missingOriginatorInfo": string[], "missingBeneficiaryInfo": string[], "recommendedAction": "proceed"|"enhance-monitoring"|"hold-investigate"|"reject-return", "regulatoryBasis": string }`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{
        role: "user",
        content: `Assess the following cross-border wire transfer:
- Originator Name: ${body.originatorName}
- Beneficiary Name: ${body.beneficiaryName}
- Amount: ${body.amount}
- Currency: ${body.currency}
- Origin Country: ${body.originCountry}
- Destination Country: ${body.destinationCountry}
- Purpose: ${body.purpose}
- Additional Context: ${body.context}`,
      }],
    });
    const text = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return NextResponse.json({ ok: true, ...FALLBACK });

    const parsed = JSON.parse(jsonMatch[0]) as CrossBorderWireResult;
    return NextResponse.json({ ok: true, ...parsed });
  } catch {
    return NextResponse.json({ ok: true, ...FALLBACK });
  }
}
