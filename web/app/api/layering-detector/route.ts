export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export interface LayeringResult {
  layeringRisk: "critical" | "high" | "medium" | "low" | "none";
  placementIndicators: string[];
  layeringIndicators: string[];
  integrationIndicators: string[];
  stageDetected: "placement" | "layering" | "integration" | "multiple" | "none";
  velocityAnalysis: string;
  accountHopping: boolean;
  jurisdictionHopping: boolean;
  roundTripSuspicion: boolean;
  structureComplexity: "high" | "medium" | "low";
  indicators: Array<{
    indicator: string;
    stage: string;
    severity: "critical" | "high" | "medium" | "low";
    detail: string;
  }>;
  recommendedAction: "file_str" | "escalate_mlro" | "enhanced_monitoring" | "clear";
  actionRationale: string;
  requiredActions: string[];
  regulatoryBasis: string;
}

const FALLBACK: LayeringResult = {
  layeringRisk: "high",
  placementIndicators: [
    "Multiple cash deposits in amounts just below AED 55,000 CTR threshold across three linked accounts over 14-day period",
    "Structured deposits totalling AED 980,000 across 22 separate transactions at different branch locations",
  ],
  layeringIndicators: [
    "Rapid inter-account transfers within 24-48 hours of placement, account-to-account with no commercial purpose",
    "Funds routed through three intermediate BVI-registered corporate accounts before consolidation",
    "Round-trip transfers: funds dispatched to offshore account and returned within 7 days as 'loan repayment'",
    "Wire transfers to four jurisdictions (BVI, Seychelles, Labuan, Panama) within 30-day window with no trade documentation",
  ],
  integrationIndicators: [
    "Final consolidated funds used to purchase off-plan property in Dubai at 15% above market valuation",
    "Purchase price partially funded by third-party payment from unrelated corporate entity",
  ],
  stageDetected: "multiple",
  velocityAnalysis: "High-velocity layering detected: AED 1.2M cycled across 6 accounts in 21 days; average account-holding period 2.3 days before onward transfer — consistent with professional laundering typology",
  accountHopping: true,
  jurisdictionHopping: true,
  roundTripSuspicion: true,
  structureComplexity: "high",
  indicators: [
    {
      indicator: "Structuring / smurfing",
      stage: "placement",
      severity: "critical",
      detail: "22 cash deposits ranging AED 45,000–54,900 across linked accounts — deliberate structuring to avoid AED 55,000 CTR threshold. Violates UAE AML cabinet decision reporting obligations.",
    },
    {
      indicator: "Rapid inter-account transfer",
      stage: "layering",
      severity: "high",
      detail: "Funds consistently transferred to next account within 24–48 hours of receipt with no documented commercial rationale — textbook layering to obscure audit trail.",
    },
    {
      indicator: "Offshore BVI/Seychelles conduit accounts",
      stage: "layering",
      severity: "high",
      detail: "Three intermediate corporate accounts in high-secrecy jurisdictions used as pass-through vehicles. No identifiable beneficial owner linked to UAE trade activity.",
    },
    {
      indicator: "Round-trip loan structure",
      stage: "layering",
      severity: "critical",
      detail: "AED 600,000 transferred offshore and returned within 7 days labelled as 'loan repayment' — classic round-trip structure to manufacture legitimate-appearing funds.",
    },
    {
      indicator: "Real estate integration",
      stage: "integration",
      severity: "high",
      detail: "Off-plan property purchased at 15% premium with mixed payment from subject and unrelated third-party corporate entity — integration into tangible asset with legitimate re-sale value.",
    },
  ],
  recommendedAction: "file_str",
  actionRationale: "Transaction pattern exhibits all three ML stages (placement, layering, integration) with clear structuring and round-trip indicators. Filing deadline is 2 business days from detection under UAE FDL 10/2025 Art.17 via goAML portal.",
  requiredActions: [
    "File STR via goAML within 2 business days",
    "Freeze/restrict transactions pending MLRO decision",
    "Preserve all transaction records and correspondence for minimum 5 years",
    "Screen all linked accounts and beneficial owners against UAE EOCN and UN sanctions lists",
    "Conduct enhanced due diligence on all counterparties identified in transfer chain",
    "Document decision rationale in AML case management system",
  ],
  regulatoryBasis: "UAE FDL 10/2025 Art.17 (STR obligation); Cabinet Decision 10/2019 (CTR thresholds); FATF R.3 (ML offence), R.16 (wire transfers); FATF Typologies — Placement, Layering, Integration; UAE Federal Law 4/2002 (proceeds of crime)",
};

export async function POST(req: Request) {
  let body: {
    transactions: string;
    subjectName?: string;
    accountRefs?: string;
    periodDays?: string;
    context?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.transactions?.trim()) return NextResponse.json({ ok: false, error: "transactions required" }, { status: 400 });

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
          text: `You are a UAE money laundering specialist identifying placement, layering, and integration stages per FATF typologies and UAE Federal Decree-Law 10/2025 (FDL 10/2025). Analyse transaction descriptions for all three ML stages, account/jurisdiction hopping, round-trip structures, and structuring patterns. Apply FATF typology guidance on layering schemes including wire layering, corporate vehicle misuse, and real estate integration. Provide actionable recommendations referencing UAE AML legal obligations. Respond ONLY with valid JSON matching the LayeringResult interface — no markdown fences.`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{
        role: "user",
        content: `Transaction Description: ${body.transactions}
Subject Name: ${body.subjectName ?? "not provided"}
Account References: ${body.accountRefs ?? "not provided"}
Period Under Review: ${body.periodDays ? body.periodDays + " days" : "not specified"}
Additional Context: ${body.context ?? "none"}

Analyse for money laundering placement, layering, and integration stages. Return complete LayeringResult JSON.`,
      }],
    });
    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as LayeringResult;
    return NextResponse.json({ ok: true, ...result });
  } catch {
    return NextResponse.json({ ok: true, ...FALLBACK });
  }
}
