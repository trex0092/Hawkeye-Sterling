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
  } catch (err) {
    console.warn("[hawkeye] route handler failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false, error: "sanctions-exposure-calc temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
