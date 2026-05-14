export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;import { NextResponse } from "next/server";

import { enforce } from "@/lib/server/enforce";
import { getAnthropicClient } from "@/lib/server/llm";

export interface HawalaDetectorResult {
  riskRating: "critical" | "high" | "medium" | "low";
  ivtsIndicators: string[];
  settlementMechanism: string;
  estimatedVolume: string;
  counterpartiesIdentified: string[];
  regulatoryAction: string;
  reportingRequired: boolean;
  regulatoryBasis: string;
}

const FALLBACK: HawalaDetectorResult = {
  riskRating: "high",
  ivtsIndicators: [
    "Frequent round-sum cash receipts matched by equivalent outbound wire transfers to Pakistan within 48 hours",
    "Customer operates a money exchange business but is not registered as a Hawaladar with CBUAE",
    "Multiple unrelated individuals paying cash to same account referencing 'family support' — classic IVTS placement",
    "No invoice, contract, or trade documentation for any payment — purely value transfer",
    "Counterpart in Karachi sends confirmation messages via encrypted WhatsApp",
  ],
  settlementMechanism:
    "Classic hawala — broker in UAE receives cash from diaspora customers and notifies correspondent broker in Pakistan, who pays local beneficiaries. Settlement via periodic over/under-invoiced trade transactions. No formal fund transfer.",
  estimatedVolume:
    "AED 380,000/month estimated based on 90-day transaction pattern",
  counterpartiesIdentified: [
    "Karachi broker — identity unknown (referred to as 'Al-Malik' in messages)",
    "15 individual UAE payers (names available from account records)",
    "3 Pakistani beneficiaries referenced in transfer notes",
  ],
  regulatoryAction:
    "File STR immediately. Consider SAR escalation to Public Prosecution. Report unregistered IVTS to CBUAE Financial Crime Supervision. Do NOT alert customer — tipping-off prohibition applies.",
  reportingRequired: true,
  regulatoryBasis:
    "UAE FDL 10/2025 Art.15 (licensing of money services), CBUAE Circular 24/2022 (IVTS registration), FATF R.14 (money or value transfer services)",
};

export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: {
    subjectName: string;
    businessType: string;
    transactionPattern: string;
    counterparties: string;
    cashVolume: string;
    context: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON" },
      { status: 400 }
    );
  }
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "hawala-detector temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers});
  try {
    const client = getAnthropicClient(apiKey, 55000);
    const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1500,
        system:
          "You are a UAE AML/CFT compliance expert specialising in informal value transfer systems (IVTS/hawala) detection. Analyse transaction patterns for hawala indicators under UAE and FATF standards. Return valid JSON only matching the HawalaDetectorResult interface.",
        messages: [
          {
            role: "user",
            content: `Analyse for hawala/IVTS indicators.\n\nSubject: ${body.subjectName}\nBusiness Type: ${body.businessType}\nTransaction Pattern: ${body.transactionPattern}\nCounterparties: ${body.counterparties}\nCash Volume: ${body.cashVolume}\nContext: ${body.context}\n\nReturn JSON with fields: riskRating, ivtsIndicators[], settlementMechanism, estimatedVolume, counterpartiesIdentified[], regulatoryAction, reportingRequired, regulatoryBasis.`,
          },
        ],
      });
    const data = (await response.json()) as {
      content: Array<{ type: string; text: string }>;
    };
    const raw =
      response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(
      raw.replace(/```json\n?|\n?```/g, "").trim()
    ) as HawalaDetectorResult;
    return NextResponse.json({ ok: true, ...result }, { headers: gate.headers });
  } catch {
    return NextResponse.json({ ok: false, error: "hawala-detector temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers});
  }
}
