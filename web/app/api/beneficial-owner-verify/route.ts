export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;import { NextResponse } from "next/server";

import { enforce } from "@/lib/server/enforce";
export interface BeneficialOwnerVerifyResult {
  uboConfirmed: boolean;
  ownershipChainDepth: number;
  controlPercentage: number;
  verificationStatus: "complete" | "partial" | "failed";
  gaps: string[];
  verificationSteps: string[];
  uboRegisterRequired: boolean;
  registrationDeadline: string;
  regulatoryBasis: string;
}

const FALLBACK: BeneficialOwnerVerifyResult = {
  uboConfirmed: false,
  ownershipChainDepth: 4,
  controlPercentage: 67,
  verificationStatus: "partial",
  gaps: [
    "Layer 3: Seychelles holding company — registered agent refuses to confirm UBO without court order",
    "Layer 4: Cayman trust — discretionary, no fixed beneficiaries, cannot identify natural person",
    "Indirect controller at 67% — above 25% UAE UBO registration threshold but cannot be named",
    "UBO declaration signed by corporate trustee, not natural person — not acceptable under Cabinet Res 132/2023",
  ],
  verificationSteps: [
    "Obtain certified copy of trust deed and all schedules for Cayman structure",
    "Require trustee to provide certified list of all discretionary beneficiaries (even if no fixed entitlement)",
    "Commission Cayman-qualified legal opinion on disclosure obligations",
    "If Seychelles company: request registered agent disclosure via formal legal channel",
    "If UBO cannot be confirmed within 30 days: decline to onboard (FDL Art.7(4) mandatory)",
  ],
  uboRegisterRequired: true,
  registrationDeadline:
    "UAE UBO Register filing required within 15 days of onboarding (Cabinet Resolution 132/2023 Art.4). Current filing: overdue — company established 6 months ago with no registration.",
  regulatoryBasis:
    "UAE Cabinet Resolution 132/2023 (UBO register), UAE FDL 10/2025 Art.7 (UBO verification), FATF R.24-25 (legal persons/arrangements), CBUAE AML Standards §3.5",
};

export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: {
    entityName: string;
    ownershipStructure: string;
    jurisdictions: string;
    layerCount: string;
    uboName: string;
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
  if (!apiKey) return NextResponse.json({ ok: false, error: "beneficial-owner-verify temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers});
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
          "You are a UAE AML/CFT compliance expert specialising in beneficial ownership verification and UBO register compliance. Assess UBO verification status and gaps under UAE Cabinet Resolution 132/2023 and FATF standards. Return valid JSON only matching the BeneficialOwnerVerifyResult interface.",
        messages: [
          {
            role: "user",
            content: `Assess beneficial ownership verification status.\n\nEntity: ${body.entityName}\nOwnership Structure: ${body.ownershipStructure}\nJurisdictions: ${body.jurisdictions}\nLayer Count: ${body.layerCount}\nUBO Name: ${body.uboName}\nContext: ${body.context}\n\nReturn JSON with fields: uboConfirmed, ownershipChainDepth, controlPercentage, verificationStatus, gaps[], verificationSteps[], uboRegisterRequired, registrationDeadline, regulatoryBasis.`,
          },
        ],
      }),
    });
    if (!response.ok) return NextResponse.json({ ok: false, error: "beneficial-owner-verify temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers});
    const data = (await response.json()) as {
      content: Array<{ type: string; text: string }>;
    };
    const raw =
      data.content[0]?.type === "text" ? data.content[0].text : "{}";
    const result = JSON.parse(
      raw.replace(/```json\n?|\n?```/g, "").trim()
    ) as BeneficialOwnerVerifyResult;
    return NextResponse.json({ ok: true, ...result }, { headers: gate.headers });
  } catch {
    return NextResponse.json({ ok: false, error: "beneficial-owner-verify temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers});
  }
}
