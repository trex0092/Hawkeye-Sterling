export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;import { NextResponse } from "next/server";

import { enforce } from "@/lib/server/enforce";
export interface NomineeRiskResult {
  riskRating: "critical" | "high" | "medium" | "low";
  nomineeIndicators: string[];
  uboObscured: boolean;
  estimatedLayersToUbo: number;
  verificationRequired: string[];
  legalAction: string;
  regulatoryBasis: string;
}

const FALLBACK: NomineeRiskResult = {
  riskRating: "high",
  nomineeIndicators: [
    "Director appointed 3 days before gold purchase — suspicious timing",
    "Director is a professional nominee (same individual listed as director of 47 other UAE companies)",
    "Director has no relevant industry experience and is not present at meetings",
    "Company address is registered agent office — no physical presence",
    "All instructions for account come from a third party not named on corporate documents",
  ],
  uboObscured: true,
  estimatedLayersToUbo: 3,
  verificationRequired: [
    "Independent verification of beneficial owner identity via regulated third party",
    "Source of instructions — obtain written authority from purported UBO confirming director relationship",
    "Cross-check director against professional nominee service provider databases",
    "Company search in all relevant jurisdictions for connected entities under same director",
    "Require personal meeting with UBO (in-person or video-verified) before proceeding",
  ],
  legalAction:
    "Place account under enhanced monitoring. Request UBO declaration signed by natural person within 5 business days. If UBO cannot be confirmed, initiate CDD failure exit process per FDL Art.7(4).",
  regulatoryBasis:
    "UAE FDL 10/2025 Art.7 (UBO verification), Cabinet Resolution 132/2023 (UBO register), FATF R.24 (legal persons), CBUAE AML Standards §3.5",
};

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
      { status: 400 }
    );
  }
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "nominee-risk temporarily unavailable - please retry." }, { status: 503 });
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      signal: AbortSignal.timeout(55_000),
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1500,
        system:
          "You are a UAE AML/CFT compliance expert specialising in nominee director and UBO obscuration risk. Assess nominee risk and UBO verification gaps under UAE FDL and FATF standards. Return valid JSON only matching the NomineeRiskResult interface.",
        messages: [
          {
            role: "user",
            content: `Assess nominee director and UBO obscuration risk.\n\nCompany: ${body.companyName}\nDirector: ${body.directorName}\nIncorporation Date: ${body.incorporationDate}\nBusiness Activity: ${body.businessActivity}\nController Details: ${body.controllerDetails}\nContext: ${body.context}\n\nReturn JSON with fields: riskRating, nomineeIndicators[], uboObscured, estimatedLayersToUbo, verificationRequired[], legalAction, regulatoryBasis.`,
          },
        ],
      }),
    });
    if (!response.ok) return NextResponse.json({ ok: false, error: "nominee-risk temporarily unavailable - please retry." }, { status: 503 });
    const data = (await response.json()) as {
      content: Array<{ type: string; text: string }>;
    };
    const raw =
      data.content[0]?.type === "text" ? data.content[0].text : "{}";
    const result = JSON.parse(
      raw.replace(/```json\n?|\n?```/g, "").trim()
    ) as NomineeRiskResult;
    return NextResponse.json({ ok: true, ...result });
  } catch {
    return NextResponse.json({ ok: false, error: "nominee-risk temporarily unavailable - please retry." }, { status: 503 });
  }
}
