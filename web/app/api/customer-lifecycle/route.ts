export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;import { NextResponse } from "next/server";

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

const FALLBACK: CustomerLifecycleResult = {
  currentStage: "active",
  riskTrajectory: "increasing",
  stageRisks: [
    {
      stage: "Onboarding",
      risks: [
        "Identity verification relied on certified copy — original not seen",
      ],
      controls: [
        "Document authenticated via third-party KYC service",
        "Video verification conducted 2023-04-15",
      ],
    },
    {
      stage: "Active (24 months)",
      risks: [
        "Transaction volume increased 340% vs onboarding profile",
        "3 new jurisdictions added to payment destinations (1 FATF grey-list)",
        "New beneficial owner not yet verified",
      ],
      controls: [
        "Monthly TM alerts reviewed — 2 cleared, 1 escalated to MLRO",
        "Enhanced monitoring applied since Jan 2025",
      ],
    },
    {
      stage: "Current risk elevation",
      risks: [
        "Adverse media hit April 2025 — unverified allegation",
        "Cash transaction pattern emerging — 4 deposits below AED 55K in 30 days",
      ],
      controls: [],
    },
  ],
  nextReviewTriggers: [
    "Adverse media resolution — confirm or clear hit by 15 May 2025",
    "New UBO verification — obtain confirmation of new beneficial owner identity by 30 May 2025",
    "Cash pattern review — if 5th structured deposit: file STR immediately",
  ],
  cddRefreshRequired: true,
  exitRiskIndicators: [
    "Customer may pre-empt exit attempt by moving funds — monitor for large outflows",
    "If CDD refresh rejected by customer: exit within 30 days per FDL Art.7(4)",
  ],
  regulatoryBasis:
    "FATF R.10 (ongoing monitoring), UAE FDL 10/2025 Art.10-11 (CDD updates), CBUAE AML Standards §3.7",
};

export async function POST(req: Request) {
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
      { status: 400 }
    );
  }
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "customer-lifecycle temporarily unavailable - please retry." }, { status: 503 });
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
          "You are a UAE AML/CFT compliance expert specialising in customer lifecycle risk management. Assess AML risk across the full customer lifecycle under UAE FDL and FATF standards. Return valid JSON only matching the CustomerLifecycleResult interface.",
        messages: [
          {
            role: "user",
            content: `Assess AML risk across the customer lifecycle.\n\nCustomer: ${body.customerName}\nOnboarding Date: ${body.onboardingDate}\nCurrent Risk Rating: ${body.currentRiskRating}\nRecent Changes: ${body.recentChanges}\nTransaction Volume: ${body.transactionVolume}\nContext: ${body.context}\n\nReturn JSON with fields: currentStage, riskTrajectory, stageRisks[] (each with stage, risks[], controls[]), nextReviewTriggers[], cddRefreshRequired, exitRiskIndicators[], regulatoryBasis.`,
          },
        ],
      }),
    });
    if (!response.ok) return NextResponse.json({ ok: false, error: "customer-lifecycle temporarily unavailable - please retry." }, { status: 503 });
    const data = (await response.json()) as {
      content: Array<{ type: string; text: string }>;
    };
    const raw =
      data.content[0]?.type === "text" ? data.content[0].text : "{}";
    const result = JSON.parse(
      raw.replace(/```json\n?|\n?```/g, "").trim()
    ) as CustomerLifecycleResult;
    return NextResponse.json({ ok: true, ...result });
  } catch {
    return NextResponse.json({ ok: false, error: "customer-lifecycle temporarily unavailable - please retry." }, { status: 503 });
  }
}
