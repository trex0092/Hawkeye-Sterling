export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";
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
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 , headers: gate.headers });
  }
  if (!body.invoiceDetails?.trim()) return NextResponse.json({ ok: false, error: "invoiceDetails required" }, { status: 400 , headers: gate.headers });

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "trade-invoice-analyzer temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });

  try {
    const client = getAnthropicClient(apiKey, 4_500);
    const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 700,
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
    if (!Array.isArray(result.indicators)) result.indicators = [];
    if (!Array.isArray(result.requiredDocumentation)) result.requiredDocumentation = [];
    void writeAuditChainEntry(
      {
        event: "trade_invoice_analyzed",
        actor: gate.keyId,
        tbmlRisk: result.tbmlRisk,
        recommendedAction: result.recommendedAction,
        indicatorCount: result.indicators.length,
      },
      tenantIdFromGate(gate),
    ).catch((e: unknown) => console.warn("[audit] write failed:", e instanceof Error ? e.message : String(e)));
    return NextResponse.json({ ok: true, ...result }, { headers: gate.headers });
  } catch (err) {
    console.warn("[hawkeye] route handler failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false, error: "trade-invoice-analyzer temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
