// POST /api/trade-doc-intel
//
// Trade document intelligence engine for UAE gold and precious metals traders.
// Analyses trade documents (invoices, bills of lading, letters of credit,
// packing lists) for TBML indicators, commodity mis-invoicing, and
// CAHRA supply-chain flags.
//
// Extracts: commodity, HS code, quantity, unit price, declared vs. benchmark
// price gap, routing flags, CAHRA zones, sanctions nexus, counterparty risk.
// Returns a structured TBML risk assessment ready for compliance review.

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { getAnthropicClient } from "@/lib/server/llm";
import { sanitizeField, sanitizeText } from "@/lib/server/sanitize-prompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 45;

interface TradeDocRequest {
  documentType: "invoice" | "bill_of_lading" | "letter_of_credit" | "packing_list" | "certificate_of_origin" | "other";
  documentText: string;     // Full OCR / extracted text of the document
  // Optional structured fields (if caller has pre-parsed)
  commodity?: string;
  declaredValue?: number;
  currency?: string;
  quantity?: string;
  unitPrice?: number;
  originCountry?: string;
  destinationCountry?: string;
  shipper?: string;
  consignee?: string;
  routingCountries?: string[];
  date?: string;
}

// Gold/precious metals commodity benchmark prices (approximate, for TBML detection)
const COMMODITY_BENCHMARKS: Record<string, { unit: string; usdPerUnit: number; tolerance: number }> = {
  "gold": { unit: "troy_oz", usdPerUnit: 2000, tolerance: 0.15 },         // ±15% from spot
  "silver": { unit: "troy_oz", usdPerUnit: 25, tolerance: 0.20 },
  "platinum": { unit: "troy_oz", usdPerUnit: 1000, tolerance: 0.20 },
  "palladium": { unit: "troy_oz", usdPerUnit: 950, tolerance: 0.25 },
  "diamond": { unit: "carat", usdPerUnit: 5000, tolerance: 0.40 },
  "rough_diamond": { unit: "carat", usdPerUnit: 200, tolerance: 0.50 },
};

// High-risk routing countries for precious metals
const HIGH_RISK_ROUTING = new Set([
  "Iran", "North Korea", "Syria", "Russia", "Belarus",
  "Sudan", "Zimbabwe", "Venezuela", "Myanmar",
  "Democratic Republic of Congo", "Central African Republic",
]);

// CAHRA zones for supply chain
const CAHRA_SUPPLY_CHAIN = new Set([
  "Democratic Republic of Congo", "Central African Republic", "Mali",
  "Sudan", "South Sudan", "Somalia", "Afghanistan", "Myanmar",
  "Zimbabwe", "Colombia", "Peru",
]);

function detectDocumentRedFlags(doc: TradeDocRequest): string[] {
  const flags: string[] = [];
  const text = doc.documentText.toLowerCase();

  // Round-number pricing
  if (doc.unitPrice && doc.unitPrice % 1000 === 0) {
    flags.push("Unit price is a suspiciously round number — possible mis-invoicing indicator");
  }

  // High-risk routing
  for (const country of (doc.routingCountries ?? [])) {
    if (HIGH_RISK_ROUTING.has(country)) {
      flags.push(`Routing through high-risk jurisdiction: ${country}`);
    }
    if (CAHRA_SUPPLY_CHAIN.has(country)) {
      flags.push(`CAHRA supply-chain jurisdiction detected: ${country} — due diligence required under OECD 5-Step Guidance`);
    }
  }

  // Origin CAHRA check
  if (doc.originCountry && CAHRA_SUPPLY_CHAIN.has(doc.originCountry)) {
    flags.push(`Origin country ${doc.originCountry} is a CAHRA zone — Kimberley Process / RMAP certification required`);
  }

  // Document text signals
  if (text.includes("bearer") || text.includes("to order")) {
    flags.push("Negotiable 'to order' or bearer instrument — elevated ML/TF layering risk");
  }
  if (text.includes("free zone") || text.includes("freezone")) {
    flags.push("Free zone routing mentioned — common TBML layering mechanism in UAE context");
  }
  if (text.includes("gold") && text.includes("scrap")) {
    flags.push("Gold scrap classification — frequently used to obscure provenance; requires assay certificate");
  }
  if (text.includes("dore") || text.includes("doré")) {
    flags.push("Gold dore bar transaction — high CAHRA supply chain risk; requires chain of custody verification");
  }

  return flags;
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  let body: TradeDocRequest;
  try { body = await req.json() as TradeDocRequest; } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400, headers: gate.headers });
  }
  if (!body.documentText?.trim()) {
    return NextResponse.json({ ok: false, error: "documentText required" }, { status: 400, headers: gate.headers });
  }
  if (!body.documentType) {
    return NextResponse.json({ ok: false, error: "documentType required" }, { status: 400, headers: gate.headers });
  }

  const staticFlags = detectDocumentRedFlags(body);

  // Commodity benchmark check
  let benchmarkAssessment: Record<string, unknown> | null = null;
  if (body.commodity && body.unitPrice) {
    const commodityKey = body.commodity.toLowerCase().replace(/\s+/g, "_");
    const benchmark = COMMODITY_BENCHMARKS[commodityKey];
    if (benchmark) {
      const deviation = Math.abs(body.unitPrice - benchmark.usdPerUnit) / benchmark.usdPerUnit;
      benchmarkAssessment = {
        commodity: body.commodity,
        declaredUnitPrice: body.unitPrice,
        benchmarkUnitPrice: benchmark.usdPerUnit,
        benchmarkUnit: benchmark.unit,
        deviationPercent: Math.round(deviation * 100),
        withinTolerance: deviation <= benchmark.tolerance,
        tbmlFlag: deviation > benchmark.tolerance,
        tbmlSeverity: deviation > benchmark.tolerance * 2 ? "high" : deviation > benchmark.tolerance ? "medium" : "none",
      };
    }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      ok: true,
      documentType: body.documentType,
      staticRedFlags: staticFlags,
      benchmarkAssessment,
      aiEnriched: false,
      overallRisk: staticFlags.length >= 3 ? "high" : staticFlags.length >= 1 ? "medium" : "low",
      summary: "Set ANTHROPIC_API_KEY for full AI trade document intelligence.",
    }, { headers: gate.headers });
  }

  const client = getAnthropicClient(apiKey, 22_000, "trade-doc-intel");
  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1200,
    system: `You are a TBML (Trade-Based Money Laundering) intelligence specialist with expertise in precious metals, gold trading, and UAE DPMS compliance under FDL 10/2025 and FATF R.14.

Analyse the trade document for:
1. TBML indicators: price manipulation, over/under-invoicing, multiple-invoicing, phantom shipments
2. Commodity mis-declaration: wrong HS codes, vague descriptions, incorrect weights/purity
3. CAHRA supply chain: artisanal/conflict minerals, missing certifications (Kimberley, RMAP, OECD)
4. Counterparty risk: shell companies, high-risk jurisdictions, free zone structures
5. Payment risk: L/C terms, bearer instruments, third-party payments

Return ONLY valid JSON:
{
  "extractedFields": {
    "commodity": "<extracted>",
    "hsCode": "<HS code if identifiable>",
    "quantity": "<extracted>",
    "unitPrice": <number or null>,
    "currency": "<extracted>",
    "totalValue": <number or null>,
    "originCountry": "<extracted>",
    "destinationCountry": "<extracted>",
    "shipper": "<extracted>",
    "consignee": "<extracted>",
    "routingCountries": ["<country>"],
    "paymentTerms": "<extracted>",
    "certifications": ["<cert>"]
  },
  "tbmlIndicators": [
    { "indicator": "<type>", "severity": "high|medium|low", "description": "<specific detail from document>" }
  ],
  "missingDocuments": ["<required document not present>"],
  "sanctionsNexus": ["<potential sanctions link>"],
  "cahraAssessment": {
    "supplychainRisk": "high|medium|low|none",
    "certificationGaps": ["<gap>"],
    "requiredActions": ["<action>"]
  },
  "overallRisk": "critical|high|medium|low",
  "recommendedActions": ["<action>"],
  "complianceNotes": "<FDL/FATF article references>"
}`,
    messages: [{
      role: "user",
      content: `Document Type: ${sanitizeField(body.documentType, 100)}

Document Text:
${sanitizeText(body.documentText, 2000)}

${body.commodity ? `Declared Commodity: ${sanitizeField(body.commodity, 100)}` : ""}
${body.declaredValue ? `Declared Value: ${body.declaredValue} ${sanitizeField(body.currency, 10) ?? ""}` : ""}
${body.unitPrice ? `Unit Price: ${body.unitPrice} ${sanitizeField(body.currency, 10) ?? ""}` : ""}
${body.originCountry ? `Origin: ${sanitizeField(body.originCountry, 100)}` : ""}
${body.destinationCountry ? `Destination: ${sanitizeField(body.destinationCountry, 100)}` : ""}

Pre-identified static flags: ${JSON.stringify(staticFlags)}
Benchmark assessment: ${JSON.stringify(benchmarkAssessment)}

Analyse for TBML risk.`,
    }],
  });

  const raw = response.content[0]?.type === "text" ? (response.content[0] as { type: "text"; text: string }).text : "{}";
  try {
    const aiResult = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "{}");
    return NextResponse.json({
      ok: true,
      documentType: body.documentType,
      staticRedFlags: staticFlags,
      benchmarkAssessment,
      ...aiResult,
      aiEnriched: true,
      analyzedAt: new Date().toISOString(),
    }, { headers: gate.headers });
  } catch {
    return NextResponse.json({
      ok: true,
      documentType: body.documentType,
      staticRedFlags: staticFlags,
      benchmarkAssessment,
      aiEnriched: false,
      overallRisk: staticFlags.length >= 3 ? "high" : staticFlags.length >= 1 ? "medium" : "low",
    }, { headers: gate.headers });
  }
}
