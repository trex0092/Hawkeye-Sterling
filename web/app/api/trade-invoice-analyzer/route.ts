export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";

import { getAnthropicClient } from "@/lib/server/llm";
import { sanitizeField, sanitizeText } from "@/lib/server/sanitize-prompt";

export interface TradeInvoiceResult {
  tbmlRisk: "critical" | "high" | "medium" | "low" | "clear";
  overInvoicing: boolean;
  underInvoicing: boolean;
  priceDeviationPct?: number;
  worldPriceBenchmark?: string;
  hsCodeConsistency: "consistent" | "inconsistent" | "unknown";
  quantityValueMismatch: boolean;
  indicators: Array<{
    indicator: string;
    severity: "critical" | "high" | "medium" | "low";
    category: "pricing" | "quantity" | "documentation" | "routing" | "commodity";
    fatfRef: string;
    detail: string;
  }>;
  recommendedAction: "reject_transaction" | "file_str" | "escalate_mlro" | "enhanced_dd" | "clear";
  actionRationale: string;
  requiredDocumentation: string[];
  regulatoryBasis: string;
}

const FALLBACK: TradeInvoiceResult = {
  tbmlRisk: "high",
  overInvoicing: false,
  underInvoicing: true,
  priceDeviationPct: -40,
  worldPriceBenchmark: "Gold bullion (XAU): London Bullion Market Association (LBMA) spot benchmark USD 1,980/troy oz. Invoice declares USD 1,188/troy oz — 40% below prevailing world price.",
  hsCodeConsistency: "inconsistent",
  quantityValueMismatch: true,
  indicators: [
    {
      indicator: "Under-invoicing of gold bullion by 40% vs LBMA benchmark",
      severity: "critical",
      category: "pricing",
      fatfRef: "FATF Trade-Based ML Typologies (2006, updated 2020) §3.1; FATF R.4",
      detail: "Invoice price of USD 1,188/troy oz for 500 troy oz gold consignment is 40% below LBMA spot of USD 1,980/troy oz at transaction date. Under-invoicing allows value transfer from importer to exporter jurisdiction without corresponding fund movement — classic TBML mechanism.",
    },
    {
      indicator: "HS code inconsistency — declared vs actual commodity",
      severity: "high",
      category: "commodity",
      fatfRef: "FATF TBML Typologies §4.2; WCO HS Convention",
      detail: "Invoice declares HS 7108.12 (non-monetary gold in semi-manufactured form) but accompanying shipping documents reference 7113.19 (articles of jewellery). HS code manipulation is used to obscure commodity nature and exploit differential duty/reporting regimes.",
    },
    {
      indicator: "Routing through UAE free zone with no apparent commercial nexus",
      severity: "high",
      category: "routing",
      fatfRef: "FATF TBML Typologies §5.3; FATF R.22",
      detail: "Consignment originating in West Africa routed through UAE free zone before onward to final destination — free zone intermediary with no manufacturing or value-add function has characteristics of a transit layering point.",
    },
    {
      indicator: "Quantity-value mismatch — weight vs declared value",
      severity: "high",
      category: "quantity",
      fatfRef: "FATF TBML Indicators §2.4",
      detail: "Declared weight of 15.55 kg (500 troy oz) with invoice value of USD 594,000 implies USD 38.2/g vs gold spot of USD 63.6/g. Physical and financial parameters are internally inconsistent beyond normal commercial variance.",
    },
    {
      indicator: "High-risk destination jurisdiction",
      severity: "medium",
      category: "routing",
      fatfRef: "FATF R.19; CBUAE Geographic Risk Classification",
      detail: "Final import destination is jurisdiction currently under FATF enhanced follow-up (grey-list). Precious metals flows to grey-list jurisdictions require enhanced due diligence and potential STR filing.",
    },
  ],
  recommendedAction: "escalate_mlro",
  actionRationale: "Gold under-invoicing of 40% combined with HS code mismatch and high-risk jurisdiction routing presents clear TBML indicators. MLRO to assess STR obligation under FDL 10/2025 Art.17. Transaction should be held pending review.",
  requiredDocumentation: [
    "Original commercial invoice with seller's LBMA-certified pricing basis",
    "Bill of lading / airway bill (original)",
    "Certificate of origin for gold consignment",
    "Assay certificate confirming fineness (karat) and weight",
    "Export customs declaration from country of origin",
    "UAE import customs declaration",
    "DMCC/DAFZA free zone entry documentation (if applicable)",
    "Beneficial ownership of importer and exporter entities",
    "Source of commodity — mine-to-market documentation",
    "Correspondence explaining pricing basis deviation from LBMA",
  ],
  regulatoryBasis: "UAE FDL 10/2025 Art.12 (DNFBP — gold/precious metals dealers); Art.17 (STR); FATF R.4 (TBML); FATF Trade-Based ML Typologies; DMCC Precious Metals AML Requirements; CR 134/2025 Art.14; WCO Safe Framework on Trade Facilitation",
};

export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: {
    invoiceDetails: string;
    commodityType?: string;
    hsCode?: string;
    exporterCountry?: string;
    importerCountry?: string;
    invoiceValue?: string;
    quantity?: string;
    unitPrice?: string;
    context?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 , headers: gate.headers});
  }
  if (!body.invoiceDetails?.trim()) return NextResponse.json({ ok: false, error: "invoiceDetails required" }, { status: 400 , headers: gate.headers});

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "trade-invoice-analyzer temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers});

  try {
    const client = getAnthropicClient(apiKey, 55000);
    const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1500,
        system: `You are a trade-based money laundering (TBML) specialist with expertise in FATF trade-based ML typologies, HS code analysis, and world commodity price benchmarks. Analyse trade invoices and documents for over/under-invoicing, quantity-value mismatches, HS code manipulation, and suspicious routing patterns. Reference LBMA (gold), LME (metals), and other recognised world price benchmarks when assessing price deviations. Apply UAE AML obligations for DNFBPs involved in trade finance. Respond ONLY with valid JSON matching the TradeInvoiceResult interface — no markdown fences.`,
        messages: [{
          role: "user",
          content: `Invoice Details: ${sanitizeText(body.invoiceDetails, 2000)}
Commodity Type: ${sanitizeField(body.commodityType, 100) ?? "not specified"}
HS Code Declared: ${sanitizeField(body.hsCode, 50) ?? "not provided"}
Exporter Country: ${sanitizeField(body.exporterCountry, 100) ?? "not specified"}
Importer Country: ${sanitizeField(body.importerCountry, 100) ?? "not specified"}
Invoice Value: ${sanitizeField(body.invoiceValue, 100) ?? "not provided"}
Quantity: ${sanitizeField(body.quantity, 100) ?? "not provided"}
Unit Price: ${sanitizeField(body.unitPrice, 100) ?? "not provided"}
Additional Context: ${sanitizeText(body.context, 2000) ?? "none"}

Analyse this trade invoice for TBML indicators. Return complete TradeInvoiceResult JSON.`,
        }],
      });
    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as TradeInvoiceResult;
    return NextResponse.json({ ok: true, ...result }, { headers: gate.headers });
  } catch {
    return NextResponse.json({ ok: false, error: "trade-invoice-analyzer temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers});
  }
}
