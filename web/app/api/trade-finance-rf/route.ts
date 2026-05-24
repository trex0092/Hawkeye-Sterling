export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;import { NextResponse } from "next/server";

import { enforce } from "@/lib/server/enforce";
import { getAnthropicClient } from "@/lib/server/llm";
import { sanitizeField, sanitizeText } from "@/lib/server/sanitize-prompt";

export interface TradeFinanceRfResult {
  riskRating: "critical" | "high" | "medium" | "low";
  tbmlScore: number;
  redFlags: string[];
  documentaryDiscrepancies: string[];
  commodityRisk: string;
  counterpartyRisk: string;
  recommendedAction: "proceed" | "request-docs" | "escalate" | "decline";
  regulatoryBasis: string;
}


export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: {
    transactionType: string;
    commodity: string;
    importerName: string;
    exporterName: string;
    invoiceValue: string;
    marketValue: string;
    shippingRoute: string;
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
  if (!apiKey) return NextResponse.json({ ok: false, error: "trade-finance-rf temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  try {
    const client = getAnthropicClient(apiKey, 4_500);
    const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 700,
        system:
          "You are a UAE AML/CFT compliance expert specialising in trade-based money laundering (TBML) and trade finance red flags. Assess trade finance transactions for TBML indicators under FATF and UAE standards. Return valid JSON only matching the TradeFinanceRfResult interface.",
        messages: [
          {
            role: "user",
            content: `Assess this trade finance transaction for TBML red flags.\n\nTransaction Type: ${sanitizeField(body.transactionType)}\nCommodity: ${sanitizeField(body.commodity)}\nImporter: ${sanitizeField(body.importerName)}\nExporter: ${sanitizeField(body.exporterName)}\nInvoice Value: ${sanitizeField(body.invoiceValue)}\nMarket Value: ${sanitizeField(body.marketValue)}\nShipping Route: ${sanitizeField(body.shippingRoute)}\nContext: ${sanitizeText(body.context)}\n\nReturn JSON with fields: riskRating, tbmlScore (0-100), redFlags[], documentaryDiscrepancies[], commodityRisk, counterpartyRisk, recommendedAction, regulatoryBasis.`,
          },
        ],
      });
    const raw =
      response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(
      raw.replace(/```json\n?|\n?```/g, "").trim()
    ) as TradeFinanceRfResult;
    if (!Array.isArray(result.redFlags)) result.redFlags = [];
    if (!Array.isArray(result.documentaryDiscrepancies)) result.documentaryDiscrepancies = [];
    return NextResponse.json({ ok: true, ...result }, { headers: gate.headers });
  } catch (err) {
    console.warn("[hawkeye] route handler failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false, error: "trade-finance-rf temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
