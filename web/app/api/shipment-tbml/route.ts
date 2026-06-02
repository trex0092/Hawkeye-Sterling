import { NextResponse } from "next/server";
import { writeAuditEvent } from "@/lib/audit";
import { enforce } from "@/lib/server/enforce";

import { getAnthropicClient } from "@/lib/server/llm";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { sanitizeField } from "@/lib/server/sanitize-prompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface ConsignmentInput {
  reference: string;
  status: string;
  origin: string;
  originCountry: string;
  refinery: string;
  refineryLbmaId: string;
  grossWeightKg: number;
  weightGms: number;
  fineness: number;
  bars: number;
  valueUsd: number;
  counterparty: string;
  counterpartyCountry: string;
  paymentMethod?: string;
  declaredVsMarketDeviation?: number;
  flags?: string[];
}

interface RequestBody {
  consignments: ConsignmentInput[];
}

interface FlaggedShipment {
  reference: string;
  tbmlIndicators: string[];
  fatfTypologies: string[];
  riskLevel: "critical" | "high" | "medium" | "low";
  recommendedAction: "hold" | "enhanced_dd" | "file_str" | "monitor" | "clear";
  rationale: string;
}

interface TbmlResult {
  portfolioTbmlRisk: "critical" | "high" | "medium" | "low";
  portfolioNarrative: string;
  flaggedShipments: FlaggedShipment[];
  systemicRisks: string[];
  lbmaGaps: string[];
  immediateHolds: string[];
  regulatoryExposure: string;
}


export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 , headers: gate.headers });
    }

  const rawConsignments = body.consignments ?? [];
  const consignments = rawConsignments.map((c) => ({
    ...c,
    reference: sanitizeField(c.reference, 100),
    status: sanitizeField(c.status, 50),
    origin: sanitizeField(c.origin, 200),
    originCountry: sanitizeField(c.originCountry, 100),
    refinery: sanitizeField(c.refinery, 200),
    refineryLbmaId: sanitizeField(c.refineryLbmaId, 50),
    counterparty: sanitizeField(c.counterparty, 300),
    counterpartyCountry: sanitizeField(c.counterpartyCountry, 100),
    paymentMethod: c.paymentMethod ? sanitizeField(c.paymentMethod, 100) : undefined,
    flags: c.flags?.map((f) => sanitizeField(f, 200)),
  }));

  try { writeAuditEvent("compliance_assistant", "shipments.ai-tbml-scan", "consignment-portfolio"); }
  catch (err) { console.warn("[hawkeye] shipment-tbml writeAuditEvent failed:", err); }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "shipment-tbml temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }

  try {
    const client = getAnthropicClient(apiKey, 4_500);
    const res = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 700,
        system:
          "You are a UAE AML/CFT specialist in Trade-Based Money Laundering (TBML) detection for precious metals and bullion shipments. Analyze these consignments against FATF TBML typologies, LBMA RGG v9 chain-of-custody requirements, and UAE MoE Circular 2/2024 (conflict minerals). Output JSON (ONLY valid JSON, no markdown).",
        messages: [
          {
            role: "user",
            content: `Consignments: ${JSON.stringify(consignments)}. Return ONLY this JSON: { "portfolioTbmlRisk": "critical"|"high"|"medium"|"low", "portfolioNarrative": "string", "flaggedShipments": [{ "reference": "string", "tbmlIndicators": ["string"], "fatfTypologies": ["string"], "riskLevel": "critical"|"high"|"medium"|"low", "recommendedAction": "hold"|"enhanced_dd"|"file_str"|"monitor"|"clear", "rationale": "string" }], "systemicRisks": ["string"], "lbmaGaps": ["string"], "immediateHolds": ["string"], "regulatoryExposure": "string" }`,
          },
        ],
      });


    const text = res.content[0]?.type === "text" ? res.content[0].text : "";
    const stripped = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    const parsed = JSON.parse(stripped) as TbmlResult;
    if (!Array.isArray(parsed.flaggedShipments)) parsed.flaggedShipments = [];
    else for (const s of parsed.flaggedShipments) {
      if (!Array.isArray(s.tbmlIndicators)) s.tbmlIndicators = [];
      if (!Array.isArray(s.fatfTypologies)) s.fatfTypologies = [];
    }
    if (!Array.isArray(parsed.systemicRisks)) parsed.systemicRisks = [];
    if (!Array.isArray(parsed.lbmaGaps)) parsed.lbmaGaps = [];
    if (!Array.isArray(parsed.immediateHolds)) parsed.immediateHolds = [];
    void writeAuditChainEntry(
      {
        event: "tbml.shipment_assessed",
        actor: gate.keyId,
        portfolioTbmlRisk: parsed.portfolioTbmlRisk,
        flaggedShipmentCount: parsed.flaggedShipments?.length ?? 0,
      },
      tenantIdFromGate(gate),
    ).catch((err) =>
      console.warn("[shipment-tbml] audit chain write failed:", err instanceof Error ? err.message : String(err)),
    );
    return NextResponse.json({ ok: true, ...parsed }, { headers: gate.headers });
  } catch (err) {
    console.warn("[hawkeye] route handler failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false, error: "shipment-tbml temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
