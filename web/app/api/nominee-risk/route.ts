export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;import { NextResponse } from "next/server";

import { enforce } from "@/lib/server/enforce";
import { getAnthropicClient } from "@/lib/server/llm";
import { sanitizeField, sanitizeText } from "@/lib/server/sanitize-prompt";

export interface NomineeRiskResult {
  riskRating: "critical" | "high" | "medium" | "low";
  nomineeIndicators: string[];
  uboObscured: boolean;
  estimatedLayersToUbo: number;
  verificationRequired: string[];
  legalAction: string;
  regulatoryBasis: string;
}


export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: {
    companyName: string;
    directorName: string;
    incorporationDate: string;
    businessActivity: string;
    controllerDetails: string;
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
  if (!apiKey) return NextResponse.json({ ok: false, error: "nominee-risk temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  try {
    const client = getAnthropicClient(apiKey, 55_000);
    const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 700,
        system:
          "You are a UAE AML/CFT compliance expert specialising in nominee director and UBO obscuration risk. Assess nominee risk and UBO verification gaps under UAE FDL and FATF standards. Return valid JSON only matching the NomineeRiskResult interface.",
        messages: [
          {
            role: "user",
            content: `Assess nominee director and UBO obscuration risk.\n\nCompany: ${sanitizeField(body.companyName)}\nDirector: ${sanitizeField(body.directorName)}\nIncorporation Date: ${sanitizeField(body.incorporationDate)}\nBusiness Activity: ${sanitizeField(body.businessActivity)}\nController Details: ${sanitizeField(body.controllerDetails)}\nContext: ${sanitizeText(body.context)}\n\nReturn JSON with fields: riskRating, nomineeIndicators[], uboObscured, estimatedLayersToUbo, verificationRequired[], legalAction, regulatoryBasis.`,
          },
        ],
      });
    const raw =
      response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(
      raw.replace(/```json\n?|\n?```/g, "").trim()
    ) as NomineeRiskResult;
    if (!Array.isArray(result.nomineeIndicators)) result.nomineeIndicators = [];
    if (!Array.isArray(result.verificationRequired)) result.verificationRequired = [];
    return NextResponse.json({ ok: true, ...result }, { headers: gate.headers });
  } catch {
    return NextResponse.json({ ok: false, error: "nominee-risk temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
