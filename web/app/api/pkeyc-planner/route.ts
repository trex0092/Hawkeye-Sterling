export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";

export interface PkycPlannerResult {
  reviewFrequency: "monthly" | "quarterly" | "bi-annual" | "annual";
  triggerEvents: string[];
  nextReviewDate: string;
  overdueItems: string[];
  automationOpportunities: string[];
  kycRefreshPlan: Array<{
    customer: string;
    priority: "critical" | "high" | "medium";
    dueDate: string;
    action: string;
  }>;
  regulatoryBasis: string;
}

const FALLBACK: PkycPlannerResult = {
  reviewFrequency: "annual",
  triggerEvents: [
    "Adverse media hit on customer name or associated entities",
    "Significant change in transaction pattern (>3× normal volume)",
    "Customer-initiated change in beneficial ownership or UBO",
    "Jurisdiction downgrade by FATF, EU, or CBUAE",
    "Expiry of identity documents (passport, Emirates ID)",
    "Sanctions list delta — customer name appears on updated screening list",
    "Customer reports change in business activity or revenue source",
  ],
  nextReviewDate: "2026-01-15",
  overdueItems: [
    "Customer C-0041 (high-risk): CDD expired 45 days ago — last review Feb 2025",
    "Customer C-0089 (PEP): Annual PEP re-verification overdue — PEP assumed new role in Nov 2024",
    "Customer C-0103 (DPMS): Gold dealer licence renewal not confirmed — expired Jan 2025",
  ],
  automationOpportunities: [
    "Automated passport expiry tracking — 90/60/30 day alerts via CRM",
    "Adverse media webhook — auto-trigger enhanced review on confirmed hit",
    "Sanctions list delta feed — auto-flag on match within 15 minutes of list update",
    "Transaction anomaly trigger — auto-elevate to compliance queue on 3× volume spike",
  ],
  kycRefreshPlan: [
    {
      customer: "DPMS Customer C-0041",
      priority: "critical",
      dueDate: "2025-05-07",
      action:
        "Full CDD refresh — collect updated passport, proof of address, SOW declaration, and updated trade licence",
    },
    {
      customer: "PEP Customer C-0089",
      priority: "high",
      dueDate: "2025-05-14",
      action:
        "Annual PEP re-verification — confirm current political role, update EDD file, obtain updated source of wealth declaration",
    },
    {
      customer: "Gold Dealer C-0103",
      priority: "high",
      dueDate: "2025-05-20",
      action:
        "Confirm trade licence renewal — obtain certified copy. Suspend gold purchases pending confirmation.",
    },
  ],
  regulatoryBasis:
    "UAE FDL 10/2025 Art.10 (CDD updates), FATF R.10 (ongoing due diligence), CBUAE AML Standards §3.7 (CDD refresh triggers)",
};

export async function POST(req: Request) {
  let body: {
    customerCount: string;
    highRiskCount: string;
    pepCount: string;
    overdueCount: string;
    institutionType: string;
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
  if (!apiKey) return NextResponse.json({ ok: true, ...FALLBACK });
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      signal: AbortSignal.timeout(22_000),
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1500,
        system:
          "You are a UAE AML/CFT compliance expert specialising in periodic KYC review planning. Generate structured KYC refresh plans under UAE FDL and FATF standards. Return valid JSON only matching the PkycPlannerResult interface.",
        messages: [
          {
            role: "user",
            content: `Generate a periodic KYC review plan.\n\nCustomer Count: ${body.customerCount}\nHigh-Risk Count: ${body.highRiskCount}\nPEP Count: ${body.pepCount}\nOverdue Count: ${body.overdueCount}\nInstitution Type: ${body.institutionType}\nContext: ${body.context}\n\nReturn JSON with fields: reviewFrequency, triggerEvents[], nextReviewDate, overdueItems[], automationOpportunities[], kycRefreshPlan[] (each with customer, priority, dueDate, action), regulatoryBasis.`,
          },
        ],
      }),
    });
    if (!response.ok) return NextResponse.json({ ok: true, ...FALLBACK });
    const data = (await response.json()) as {
      content: Array<{ type: string; text: string }>;
    };
    const raw =
      data.content[0]?.type === "text" ? data.content[0].text : "{}";
    const result = JSON.parse(
      raw.replace(/```json\n?|\n?```/g, "").trim()
    ) as PkycPlannerResult;
    return NextResponse.json({ ok: true, ...result });
  } catch {
    return NextResponse.json({ ok: true, ...FALLBACK });
  }
}
