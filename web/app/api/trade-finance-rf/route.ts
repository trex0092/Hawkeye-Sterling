export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;import { NextResponse } from "next/server";

import { enforce } from "@/lib/server/enforce";
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

const FALLBACK: TradeFinanceRfResult = {
  riskRating: "high",
  tbmlScore: 76,
  redFlags: [
    "Invoice value AED 4.2M vs comparable market price AED 2.1M — 100% over-valuation (TBML red flag)",
    "Commodity: pre-owned electronics — high-value, portable, convertible, difficult to value objectively",
    "Payment terms: 100% upfront before shipment — atypical for trade finance",
    "Counterparty in UAE is a newly incorporated entity (6 months) with no trade history",
    "Shipping route: UAE → Turkey → UAE — circular route with no clear commercial rationale",
    "Bill of lading: 3rd party shipper, no direct relationship with importer or exporter",
  ],
  documentaryDiscrepancies: [
    "Invoice commodity description 'Electronic components, assorted' — insufficient specificity for customs",
    "Certificate of origin inconsistent with shipping route",
    "Purchase order pre-dates company incorporation by 2 months — impossible",
  ],
  commodityRisk:
    "Pre-owned electronics are ideal TBML vehicle: subjective valuation, compact, high value-to-weight, easily misdescribed. FATF TBML Typologies Report identifies this as top-5 TBML commodity.",
  counterpartyRisk:
    "UAE importer has no verifiable trade history, premises visit inconclusive, directors unknown outside this transaction.",
  recommendedAction: "decline",
  regulatoryBasis:
    "FATF TBML Guidance (2020), FATF R.16 (wire transfers in trade context), UAE FDL 10/2025 Art.2 (ML predicate), World Customs Organization RILO TBML indicators",
};

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
      { status: 400 }
    );
  }
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "trade-finance-rf temporarily unavailable - please retry." }, { status: 503 });
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
          "You are a UAE AML/CFT compliance expert specialising in trade-based money laundering (TBML) and trade finance red flags. Assess trade finance transactions for TBML indicators under FATF and UAE standards. Return valid JSON only matching the TradeFinanceRfResult interface.",
        messages: [
          {
            role: "user",
            content: `Assess this trade finance transaction for TBML red flags.\n\nTransaction Type: ${body.transactionType}\nCommodity: ${body.commodity}\nImporter: ${body.importerName}\nExporter: ${body.exporterName}\nInvoice Value: ${body.invoiceValue}\nMarket Value: ${body.marketValue}\nShipping Route: ${body.shippingRoute}\nContext: ${body.context}\n\nReturn JSON with fields: riskRating, tbmlScore (0-100), redFlags[], documentaryDiscrepancies[], commodityRisk, counterpartyRisk, recommendedAction, regulatoryBasis.`,
          },
        ],
      }),
    });
    if (!response.ok) return NextResponse.json({ ok: false, error: "trade-finance-rf temporarily unavailable - please retry." }, { status: 503 });
    const data = (await response.json()) as {
      content: Array<{ type: string; text: string }>;
    };
    const raw =
      data.content[0]?.type === "text" ? data.content[0].text : "{}";
    const result = JSON.parse(
      raw.replace(/```json\n?|\n?```/g, "").trim()
    ) as TradeFinanceRfResult;
    return NextResponse.json({ ok: true, ...result });
  } catch {
    return NextResponse.json({ ok: false, error: "trade-finance-rf temporarily unavailable - please retry." }, { status: 503 });
  }
}
