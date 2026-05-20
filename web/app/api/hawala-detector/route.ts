export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;import { NextResponse } from "next/server";

import { enforce } from "@/lib/server/enforce";
import { getAnthropicClient } from "@/lib/server/llm";
import { sanitizeField, sanitizeText } from "@/lib/server/sanitize-prompt";

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
      { status: 400, headers: gate.headers }
    );
  }
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "hawala-detector temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  try {
    const client = getAnthropicClient(apiKey, 55_000);
    const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 700,
        system:
          "You are a UAE AML/CFT compliance expert specialising in informal value transfer systems (IVTS/hawala) detection. Analyse transaction patterns for hawala indicators under UAE and FATF standards. Return valid JSON only matching the HawalaDetectorResult interface.",
        messages: [
          {
            role: "user",
            content: `Analyse for hawala/IVTS indicators.\n\nSubject: ${sanitizeField(body.subjectName)}\nBusiness Type: ${sanitizeField(body.businessType)}\nTransaction Pattern: ${sanitizeField(body.transactionPattern)}\nCounterparties: ${sanitizeField(body.counterparties)}\nCash Volume: ${sanitizeField(body.cashVolume)}\nContext: ${sanitizeText(body.context)}\n\nReturn JSON with fields: riskRating, ivtsIndicators[], settlementMechanism, estimatedVolume, counterpartiesIdentified[], regulatoryAction, reportingRequired, regulatoryBasis.`,
          },
        ],
      });
    const raw =
      response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(
      raw.replace(/```json\n?|\n?```/g, "").trim()
    ) as HawalaDetectorResult;
    if (!Array.isArray(result.ivtsIndicators)) result.ivtsIndicators = [];
    if (!Array.isArray(result.counterpartiesIdentified)) result.counterpartiesIdentified = [];
    return NextResponse.json({ ok: true, ...result }, { headers: gate.headers });
  } catch (err) {
    console.warn("[hawkeye] route handler failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false, error: "hawala-detector temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
