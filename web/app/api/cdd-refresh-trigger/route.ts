export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";

export interface CddRefreshTriggerResult {
  refreshRequired: boolean;
  urgency: "immediate" | "within_30_days" | "within_90_days" | "scheduled" | "none";
  triggerEvents: Array<{
    event: string;
    triggered: boolean;
    legalBasis: string;
    deadline?: string;
    severity: "mandatory" | "recommended" | "advisory";
  }>;
  currentRiskTier: "high" | "medium" | "low" | "unknown";
  recommendedCddLevel: "full_edd" | "standard_cdd" | "simplified_cdd";
  eddRequired: boolean;
  eddReason?: string;
  riskReviewRequired: boolean;
  fieldsToReverify: string[];
  additionalDocumentsRequired: string[];
  accountActionPending?: string;
  actionRationale: string;
  reviewDeadline?: string;
  regulatoryBasis: string;
}

const FALLBACK: CddRefreshTriggerResult = {
  refreshRequired: true,
  urgency: "within_30_days",
  triggerEvents: [
    { event: "Customer transaction pattern materially inconsistent with onboarding profile (volume 3x expected)", triggered: true, legalBasis: "UAE FDL 10/2025 Art.15(2) — ongoing monitoring obligation", deadline: "Review within 30 days of detection", severity: "mandatory" },
    { event: "Adverse media hit — director named in regulatory investigation", triggered: true, legalBasis: "UAE FDL 10/2025 Art.14(1)(c) — material change in risk profile", deadline: "Immediate review required", severity: "mandatory" },
    { event: "Annual review cycle due (high-risk customer)", triggered: true, legalBasis: "UAE FDL 10/2025 Art.15(1) — periodic CDD review; CBUAE Guidelines §4.3 (annual for high-risk)", severity: "mandatory" },
    { event: "Change of beneficial ownership reported", triggered: false, legalBasis: "UAE Cabinet Resolution 109/2023 Art.8 — UBO change notification", severity: "mandatory" },
  ],
  currentRiskTier: "high",
  recommendedCddLevel: "full_edd",
  eddRequired: true,
  eddReason: "Transaction pattern deviation + adverse media = material change in risk rating. EDD required before relationship continuation under FATF R.10 and FDL 10/2025 Art.14(2).",
  riskReviewRequired: true,
  fieldsToReverify: [
    "Source of funds — re-obtain and verify supporting documents",
    "Beneficial ownership — confirm current UBO register extract",
    "Business activity — obtain current evidence of genuine operations",
    "Expected transaction profile — update for current business scale",
    "PEP status — re-screen (may have changed since onboarding)",
  ],
  additionalDocumentsRequired: [
    "Current audited financial statements or management accounts",
    "Updated UBO declaration and register extract",
    "Explanation of transaction volume increase from senior officer",
    "Corporate structure chart as of current date",
  ],
  accountActionPending: "Consider restricting account activity pending completion of refresh CDD under FDL 10/2025 Art.15(3) — relationship must be terminated if CDD cannot be completed.",
  actionRationale: "Three independent triggers have activated simultaneously, all mandatory. MLRO should approve account restriction pending refresh. If customer cannot provide documentation within 30 days, relationship must be terminated and exit STR considered.",
  reviewDeadline: "30 days from trigger date — FDL 10/2025 Art.15 ongoing monitoring obligation",
  regulatoryBasis: "UAE FDL 10/2025 Art.14, 15 (CDD and ongoing monitoring); Art.15(3) (inability to complete CDD — terminate relationship); FATF R.10; UAE Cabinet Resolution 109/2023 (UBO); CBUAE AML/CFT Guidelines 2021 §4.3",
};

export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: {
    customerName?: string;
    customerType?: string;
    currentRiskTier?: string;
    lastCddDate?: string;
    triggerEvents?: string;
    transactionPatternChange?: string;
    adverseMediaHit?: string;
    ownershipChange?: string;
    context?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 , headers: gate.headers});
  }
  if (!body.triggerEvents?.trim() && !body.adverseMediaHit?.trim() && !body.transactionPatternChange?.trim()) {
    return NextResponse.json({ ok: false, error: "At least one trigger event, adverseMediaHit, or transactionPatternChange required" }, { status: 400 , headers: gate.headers});
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: true, degraded: true, ...FALLBACK }, { headers: gate.headers });

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      signal: AbortSignal.timeout(55_000),
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1200,
        system: `You are a UAE CDD/EDD specialist determining whether a customer due diligence refresh is legally required under UAE FDL 10/2025.

CDD refresh triggers (UAE law):
1. MANDATORY: Material change in customer risk profile — FDL 10/2025 Art.15(2)
2. MANDATORY: Transaction pattern materially inconsistent with stated profile — Art.15(2)
3. MANDATORY: Adverse media hit materially affecting risk rating — Art.14(1)(c)
4. MANDATORY: Change in beneficial ownership — Cabinet Resolution 109/2023 Art.8
5. MANDATORY: Annual review for high-risk customers — CBUAE Guidelines §4.3
6. MANDATORY: Biennial review for medium-risk customers — CBUAE Guidelines §4.3
7. MANDATORY: Failure to complete CDD → must terminate relationship — Art.15(3)
8. ADVISORY: New product/service uptake inconsistent with profile
9. ADVISORY: Jurisdiction change to higher-risk country

EDD requirement: triggered for high-risk customers, PEPs, FATF high-risk jurisdictions, complex structures.

Respond ONLY with valid JSON — no markdown fences:
{
  "refreshRequired": <bool>,
  "urgency": "immediate"|"within_30_days"|"within_90_days"|"scheduled"|"none",
  "triggerEvents": [{"event":"<text>","triggered":<bool>,"legalBasis":"<citation>","deadline":"<if any>","severity":"mandatory"|"recommended"|"advisory"}],
  "currentRiskTier": "high"|"medium"|"low"|"unknown",
  "recommendedCddLevel": "full_edd"|"standard_cdd"|"simplified_cdd",
  "eddRequired": <bool>,
  "eddReason": "<if applicable>",
  "riskReviewRequired": <bool>,
  "fieldsToReverify": ["<field>"],
  "additionalDocumentsRequired": ["<document>"],
  "accountActionPending": "<if applicable>",
  "actionRationale": "<paragraph>",
  "reviewDeadline": "<if applicable>",
  "regulatoryBasis": "<full citation>"
}`,
        messages: [{
          role: "user",
          content: `Customer Name: ${body.customerName ?? "not specified"}
Customer Type: ${body.customerType ?? "not specified"}
Current Risk Tier: ${body.currentRiskTier ?? "not specified"}
Last CDD Date: ${body.lastCddDate ?? "not specified"}
Reported Trigger Events: ${body.triggerEvents ?? "none specified"}
Transaction Pattern Change: ${body.transactionPatternChange ?? "none noted"}
Adverse Media Hit: ${body.adverseMediaHit ?? "none"}
Ownership Change: ${body.ownershipChange ?? "none reported"}
Additional Context: ${body.context ?? "none"}

Determine if CDD refresh is required.`,
        }],
      }),
    });
    if (!response.ok) return NextResponse.json({ ok: false, error: "cdd-refresh-trigger temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers});
    const data = (await response.json()) as { content: Array<{ type: string; text: string }> };
    const raw = data.content[0]?.type === "text" ? data.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as CddRefreshTriggerResult;
    return NextResponse.json({ ok: true, ...result }, { headers: gate.headers });
  } catch {
    return NextResponse.json({ ok: false, error: "cdd-refresh-trigger temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers});
  }
}
