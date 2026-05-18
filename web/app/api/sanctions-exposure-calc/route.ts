export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;import { NextResponse } from "next/server";

import { enforce } from "@/lib/server/enforce";
import { getAnthropicClient } from "@/lib/server/llm";
import { sanitizeField, sanitizeText } from "@/lib/server/sanitize-prompt";

export interface SanctionsExposureCalcResult {
  overallExposure: "critical" | "high" | "medium" | "low";
  listExposures: Array<{
    list: string;
    matchType: "exact" | "fuzzy" | "ownership" | "control";
    entity: string;
    confidence: number;
  }>;
  penaltyEstimate: string;
  immediateActions: string[];
  voluntaryDisclosureDeadline: string;
  debarmentRisk: boolean;
  regulatoryBasis: string;
}

const FALLBACK: SanctionsExposureCalcResult = {
  overallExposure: "high",
  listExposures: [
    {
      list: "OFAC SDN",
      matchType: "ownership",
      entity:
        "Al-Baraka Trading LLC (50% owned by SDN-listed Tariq Al-Hassan)",
      confidence: 87,
    },
    {
      list: "EU CFSP Annex II",
      matchType: "control",
      entity: "Same entity — EU designation mirrors OFAC",
      confidence: 87,
    },
    {
      list: "UNSCR 2253",
      matchType: "fuzzy",
      entity:
        "Tariq Al-Hassan — 79% name match to listed individual Ahmad Al-Hassan. Further verification required.",
      confidence: 72,
    },
  ],
  penaltyEstimate:
    "OFAC civil penalty (strict liability): up to USD 356,579 per transaction. Criminal exposure if wilful: up to USD 1M + 20 years. UAE penalty: AED 500K–10M per FDL Art.34. Aggregate exposure estimate: USD 2–5M assuming 6 transactions.",
  immediateActions: [
    "Freeze all accounts associated with entity immediately",
    "Do NOT process any pending transactions — hold in suspense",
    "Report to OFAC FBAR within 10 days (if US nexus)",
    "Report to CBUAE within 24 hours mandatory",
    "Engage OFAC-specialist legal counsel within 2 hours",
  ],
  voluntaryDisclosureDeadline:
    "OFAC: voluntary self-disclosure within 60 days of discovery typically reduces penalty by 50%. UAE: immediate mandatory disclosure — no discretion.",
  debarmentRisk: true,
  regulatoryBasis:
    "OFAC regulations 31 CFR Part 501, EU Regulation 269/2014, UAE Exec. Order 2023 (sanctions), UAE FDL 10/2025 Art.14",
};

export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: {
    entityName: string;
    entityType: string;
    jurisdictions: string;
    transactionCount: string;
    totalValueUsd: string;
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
  if (!apiKey) return NextResponse.json({ ok: false, error: "sanctions-exposure-calc temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  try {
    const client = getAnthropicClient(apiKey, 55_000);
    const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 700,
        system:
          "You are a UAE AML/CFT compliance expert specialising in sanctions exposure assessment and penalty calculation. Calculate sanctions list exposure and penalty estimates under OFAC, EU, UN, and UAE regulatory frameworks. Return valid JSON only matching the SanctionsExposureCalcResult interface.",
        messages: [
          {
            role: "user",
            content: `Calculate sanctions exposure and penalty estimate.\n\nEntity: ${sanitizeField(body.entityName)}\nEntity Type: ${sanitizeField(body.entityType)}\nJurisdictions: ${sanitizeField(body.jurisdictions)}\nTransaction Count: ${sanitizeField(body.transactionCount)}\nTotal Value (USD): ${sanitizeField(body.totalValueUsd)}\nContext: ${sanitizeText(body.context)}\n\nReturn JSON with fields: overallExposure, listExposures[] (each with list, matchType, entity, confidence), penaltyEstimate, immediateActions[], voluntaryDisclosureDeadline, debarmentRisk, regulatoryBasis.`,
          },
        ],
      });
    const raw =
      response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(
      raw.replace(/```json\n?|\n?```/g, "").trim()
    ) as SanctionsExposureCalcResult;
    if (!Array.isArray(result.listExposures)) result.listExposures = [];
    if (!Array.isArray(result.immediateActions)) result.immediateActions = [];
    return NextResponse.json({ ok: true, ...result }, { headers: gate.headers });
  } catch {
    return NextResponse.json({ ok: false, error: "sanctions-exposure-calc temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
