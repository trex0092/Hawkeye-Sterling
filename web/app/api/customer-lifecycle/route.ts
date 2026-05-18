export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;import { NextResponse } from "next/server";

import { enforce } from "@/lib/server/enforce";
import { getAnthropicClient } from "@/lib/server/llm";
import { sanitizeField, sanitizeText } from "@/lib/server/sanitize-prompt";

export interface CustomerLifecycleResult {
  currentStage: "onboarding" | "active" | "dormant" | "exit";
  riskTrajectory: "increasing" | "stable" | "decreasing";
  stageRisks: Array<{
    stage: string;
    risks: string[];
    controls: string[];
  }>;
  nextReviewTriggers: string[];
  cddRefreshRequired: boolean;
  exitRiskIndicators: string[];
  regulatoryBasis: string;
}


export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: {
    customerName: string;
    onboardingDate: string;
    currentRiskRating: string;
    recentChanges: string;
    transactionVolume: string;
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
  if (!apiKey) return NextResponse.json({ ok: false, error: "customer-lifecycle temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  try {
    const client = getAnthropicClient(apiKey, 55_000);
    const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 700,
        system:
          "You are a UAE AML/CFT compliance expert specialising in customer lifecycle risk management. Assess AML risk across the full customer lifecycle under UAE FDL and FATF standards. Return valid JSON only matching the CustomerLifecycleResult interface.",
        messages: [
          {
            role: "user",
            content: `Assess AML risk across the customer lifecycle.\n\nCustomer: ${sanitizeField(body.customerName)}\nOnboarding Date: ${sanitizeField(body.onboardingDate)}\nCurrent Risk Rating: ${sanitizeField(body.currentRiskRating)}\nRecent Changes: ${sanitizeField(body.recentChanges)}\nTransaction Volume: ${sanitizeField(body.transactionVolume)}\nContext: ${sanitizeText(body.context)}\n\nReturn JSON with fields: currentStage, riskTrajectory, stageRisks[] (each with stage, risks[], controls[]), nextReviewTriggers[], cddRefreshRequired, exitRiskIndicators[], regulatoryBasis.`,
          },
        ],
      });
    const raw =
      response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(
      raw.replace(/```json\n?|\n?```/g, "").trim()
    ) as CustomerLifecycleResult;
    if (!Array.isArray(result.stageRisks)) result.stageRisks = [];
    else for (const s of result.stageRisks) { if (!Array.isArray(s.risks)) s.risks = []; if (!Array.isArray(s.controls)) s.controls = []; }
    if (!Array.isArray(result.nextReviewTriggers)) result.nextReviewTriggers = [];
    if (!Array.isArray(result.exitRiskIndicators)) result.exitRiskIndicators = [];
    return NextResponse.json({ ok: true, ...result }, { headers: gate.headers });
  } catch {
    return NextResponse.json({ ok: false, error: "customer-lifecycle temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
