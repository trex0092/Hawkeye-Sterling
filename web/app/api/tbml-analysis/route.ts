export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";

import { getAnthropicClient } from "@/lib/server/llm";

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

const FALLBACK: TbmlAnalysis = {
  tbmlRisk: "high",
  tbmlTypology: "Trade-Based Money Laundering — Over-invoicing of gold bullion",
  tbmlTypologyRef: "FATF TBML Report 2006 (rev. 2020) §3.1; OECD CAHRA Step 3",
  overInvoicingRisk: "high",
  underInvoicingRisk: "low",
  phantomShipmentRisk: "medium",
  multipleInvoicingRisk: "low",
  indicators: [
    { indicator: "Invoice price significantly above LBMA AM Fix reference", severity: "critical", category: "pricing", fatfRef: "FATF TBML §3.1", detail: "Gold invoiced at >5% premium to LBMA spot — consistent with value transfer via over-invoicing." },
    { indicator: "Shipment route through CAHRA jurisdiction", severity: "high", category: "routing", fatfRef: "FATF R.19; OECD CAHRA Step 2", detail: "Transit via conflict-affected region increases risk of conflict mineral financing." },
    { indicator: "Counterparty in FATF grey-list jurisdiction", severity: "high", category: "counterparty", fatfRef: "FATF R.19", detail: "Counterparty domicile on current FATF grey list — enhanced scrutiny mandatory." },
    { indicator: "Vague goods description on commercial invoice", severity: "medium", category: "documentation", fatfRef: "FATF TBML §4.2", detail: "Invoice description does not specify purity, weight, assay certification — incomplete trade documentation." },
  ],
  recommendedAction: "escalate_mlro",
  actionRationale: "Pattern is consistent with TBML over-invoicing used to transfer value across jurisdictions. MLRO must review before releasing transaction.",
  documentationGaps: [
    "LBMA AM/PM Fix reference price on invoice date",
    "Assay certificate / bar list with serial numbers",
    "Bill of lading / airway bill",
    "RMAP / CMRT chain-of-custody certificate",
    "Counterparty KYC including UBO declaration",
  ],
  investigativeSteps: [
    "Compare invoice price against LBMA AM/PM Fix on invoice date — flag if >3% variance",
    "Request assay certificate and verify bar serial numbers",
    "Check counterparty against EOCN, UN, OFAC, EU, OFSI sanctions lists",
    "Request freight/insurance documents to confirm shipment is real",
    "Escalate to MLRO for STR consideration if documentation gaps cannot be resolved within 48 hours",
  ],
  regulatoryBasis: "FATF TBML Typologies Report (2006, rev. 2020); OECD CAHRA 5-Step Guidance Steps 2–3; UAE FDL 10/2025 Art.21; LBMA Responsible Gold Guidance Step 3; RMI RMAP",
  oecdStep: "Step 3 — Identify and assess risk in the supply chain",
};

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
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 , headers: gate.headers});
  }
  const { invoiceDescription, supplierCountry, buyerCountry, declaredValue, commodity, paymentRoute, additionalContext } = body;
  if (!invoiceDescription?.trim()) {
    return NextResponse.json({ ok: false, error: "invoiceDescription required" }, { status: 400 , headers: gate.headers});
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "tbml-analysis temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers});
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
    const client = getAnthropicClient(apiKey, 55000);
    const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1500,
        system: systemPrompt,
        messages: [{
          role: "user",
          content: `Trade Document Details:
Invoice / Document Description: ${invoiceDescription}${commodity ? `\nCommodity: ${commodity}` : ""}${supplierCountry ? `\nSupplier Country: ${supplierCountry}` : ""}${buyerCountry ? `\nBuyer Country: ${buyerCountry}` : ""}${declaredValue ? `\nDeclared Value: ${declaredValue}` : ""}${paymentRoute ? `\nPayment Route: ${paymentRoute}` : ""}${additionalContext ? `\nAdditional Context: ${additionalContext}` : ""}

Perform TBML risk analysis.`,
        }],
      });


    const data = (await response.json()) as { content: Array<{ type: string; text: string }> };
    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const cleaned = raw.replace(/```json\n?|\n?```/g, "").trim();
    const result = JSON.parse(cleaned) as TbmlAnalysis;
    return NextResponse.json({ ok: true, ...result }, { headers: gate.headers });
  } catch {
    return NextResponse.json({ ok: false, error: "tbml-analysis temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers});
  }
}
