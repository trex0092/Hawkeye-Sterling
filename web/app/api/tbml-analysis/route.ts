export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";

import { getAnthropicClient } from "@/lib/server/llm";
import { sanitizeField, sanitizeText } from "@/lib/server/sanitize-prompt";

export interface TbmlIndicator {
  indicator: string;
  severity: "critical" | "high" | "medium" | "low";
  category: "pricing" | "documentation" | "routing" | "counterparty" | "quantity" | "pattern";
  fatfRef: string;
  detail: string;
}

export interface TbmlAnalysis {
  tbmlRisk: "critical" | "high" | "medium" | "low" | "clear";
  tbmlTypology: string;
  tbmlTypologyRef: string;
  overInvoicingRisk: "high" | "medium" | "low" | "none";
  underInvoicingRisk: "high" | "medium" | "low" | "none";
  phantomShipmentRisk: "high" | "medium" | "low" | "none";
  multipleInvoicingRisk: "high" | "medium" | "low" | "none";
  indicators: TbmlIndicator[];
  recommendedAction: "block" | "escalate_mlro" | "file_str" | "enhanced_dd" | "request_docs" | "clear";
  actionRationale: string;
  documentationGaps: string[];
  investigativeSteps: string[];
  regulatoryBasis: string;
  oecdStep: string;
}


export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: {
    invoiceDescription: string;
    supplierCountry?: string;
    buyerCountry?: string;
    declaredValue?: string;
    commodity?: string;
    paymentRoute?: string;
    additionalContext?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 , headers: gate.headers });
  }
  const invoiceDescription = sanitizeText(body.invoiceDescription, 2000);
  const supplierCountry = sanitizeField(body.supplierCountry, 100);
  const buyerCountry = sanitizeField(body.buyerCountry, 100);
  const declaredValue = sanitizeField(body.declaredValue, 100);
  const commodity = sanitizeField(body.commodity, 200);
  const paymentRoute = sanitizeField(body.paymentRoute, 200);
  const additionalContext = sanitizeText(body.additionalContext, 1000);
  if (!invoiceDescription?.trim()) {
    return NextResponse.json({ ok: false, error: "invoiceDescription required" }, { status: 400 , headers: gate.headers });
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "tbml-analysis temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }

  const systemPrompt = `You are a UAE TBML (Trade-Based Money Laundering) specialist with deep expertise in gold/precious metals trade finance, DPMS/LBMA standards, OECD CAHRA 5-step due diligence, and FATF typologies.

Analyse the trade document details provided for TBML risk. Focus on:
1. Over/under-invoicing vs LBMA AM/PM Fix reference prices
2. Phantom shipment indicators (vague descriptions, missing transport docs, implausible routes)
3. Multiple invoicing risk (round-tripping, re-invoicing through intermediaries)
4. Routing anomalies (CAHRA jurisdictions, grey-list transit countries)
5. Counterparty risk (sanctions exposure, opacity, FATF grey-list domicile)
6. Documentation gaps (missing assay certs, bill of lading, RMAP/CMRT certificates)

Respond ONLY with valid JSON — no markdown fences, no explanation outside the JSON:
{
  "tbmlRisk": "critical"|"high"|"medium"|"low"|"clear",
  "tbmlTypology": "<TBML typology name>",
  "tbmlTypologyRef": "<FATF/OECD citation>",
  "overInvoicingRisk": "high"|"medium"|"low"|"none",
  "underInvoicingRisk": "high"|"medium"|"low"|"none",
  "phantomShipmentRisk": "high"|"medium"|"low"|"none",
  "multipleInvoicingRisk": "high"|"medium"|"low"|"none",
  "indicators": [
    {
      "indicator": "<specific indicator>",
      "severity": "critical"|"high"|"medium"|"low",
      "category": "pricing"|"documentation"|"routing"|"counterparty"|"quantity"|"pattern",
      "fatfRef": "<FATF/OECD citation>",
      "detail": "<detailed explanation>"
    }
  ],
  "recommendedAction": "block"|"escalate_mlro"|"file_str"|"enhanced_dd"|"request_docs"|"clear",
  "actionRationale": "<paragraph rationale>",
  "documentationGaps": ["<missing document>"],
  "investigativeSteps": ["<step>"],
  "regulatoryBasis": "<full citation>",
  "oecdStep": "<relevant OECD step>"
}`;

  try {
    const client = getAnthropicClient(apiKey, 55_000);
    const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 700,
        system: systemPrompt,
        messages: [{
          role: "user",
          content: `Trade Document Details:
Invoice / Document Description: ${invoiceDescription}${commodity ? `\nCommodity: ${commodity}` : ""}${supplierCountry ? `\nSupplier Country: ${supplierCountry}` : ""}${buyerCountry ? `\nBuyer Country: ${buyerCountry}` : ""}${declaredValue ? `\nDeclared Value: ${declaredValue}` : ""}${paymentRoute ? `\nPayment Route: ${paymentRoute}` : ""}${additionalContext ? `\nAdditional Context: ${additionalContext}` : ""}

Perform TBML risk analysis.`,
        }],
      });


    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const cleaned = raw.replace(/```json\n?|\n?```/g, "").trim();
    const result = JSON.parse(cleaned) as TbmlAnalysis;
    if (!Array.isArray(result.indicators)) result.indicators = [];
    if (!Array.isArray(result.documentationGaps)) result.documentationGaps = [];
    if (!Array.isArray(result.investigativeSteps)) result.investigativeSteps = [];
    return NextResponse.json({ ok: true, ...result }, { headers: gate.headers });
  } catch (err) {
    console.warn("[hawkeye] route handler failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false, error: "tbml-analysis temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
