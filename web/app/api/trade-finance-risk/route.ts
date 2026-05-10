export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
import { enforce } from "@/lib/server/enforce";
export interface TbmlScheme {
  scheme: string;
  description: string;
  evidence: string;
  estimatedDiscrepancy: string;
  fatfRef: string;
}

export interface TbmlPriceAnalysis {
  declaredValue: string;
  benchmarkRange: string;
  variance: string;
  anomalyScore: number;
  interpretation: string;
}

export interface TbmlGoodsRisk {
  goodsDescription: string;
  dualUseRisk: boolean;
  sanctionedGoodsRisk: boolean;
  hsCodeFlags: string[];
  physicalPlausibility: string;
}

export interface TbmlCounterpartyRisk {
  exporterRisk: string;
  importerRisk: string;
  sharedBeneficialOwner: boolean;
  relatedPartyTransaction: boolean;
}

export interface TbmlRegulatoryObligation {
  obligation: string;
  regulation: string;
}

export interface TradeFinanceRiskResult {
  ok: true;
  tbmlRiskScore: number;
  riskTier: "low" | "medium" | "high" | "critical";
  identifiedSchemes: TbmlScheme[];
  priceAnalysis: TbmlPriceAnalysis;
  goodsRiskAssessment: TbmlGoodsRisk;
  counterpartyRisk: TbmlCounterpartyRisk;
  documentaryRisk: string[];
  sanctionedRouteRisk: string;
  regulatoryObligations: TbmlRegulatoryObligation[];
  redFlags: string[];
  recommendation: "clear" | "request_additional_docs" | "independent_valuation" | "file_str" | "refuse_transaction";
  immediateActions: string[];
  summary: string;
}

const FALLBACK: TradeFinanceRiskResult = {
  ok: true,
  tbmlRiskScore: 78,
  riskTier: "high",
  identifiedSchemes: [
    {
      scheme: "Over-invoicing",
      description: "Declared commodity value substantially exceeds known market benchmarks for the goods category, consistent with FATF TBML typology of price manipulation to transfer value across borders.",
      evidence: "Declared value per unit is 340% above ITC Trade Map benchmark for identical HS code in comparable trade lanes.",
      estimatedDiscrepancy: "USD 2.1M above fair market value",
      fatfRef: "FATF Trade-Based Money Laundering 2006 §3.2 — price manipulation",
    },
    {
      scheme: "Circular Routing",
      description: "Shipping route transits through three unnecessary intermediate ports with no geographic or commercial rationale, consistent with layering via trade documentation.",
      evidence: "Goods shipped Dubai → Singapore → Panama → final destination; no transhipment hub necessity identified.",
      estimatedDiscrepancy: "Estimated additional 18-day delay and USD 45,000 excess freight costs with no commercial explanation",
      fatfRef: "FATF 2020 TBML Update §4.5 — complex routing to obscure origin",
    },
  ],
  priceAnalysis: {
    declaredValue: "USD 3,450,000",
    benchmarkRange: "USD 800,000 – USD 1,100,000",
    variance: "+214% above benchmark upper bound",
    anomalyScore: 84,
    interpretation: "Extreme price anomaly. Declared value is inconsistent with any recognised market pricing for this commodity category in this trade lane. Indicative of value transfer via trade invoice manipulation.",
  },
  goodsRiskAssessment: {
    goodsDescription: "Industrial precision components",
    dualUseRisk: true,
    sanctionedGoodsRisk: false,
    hsCodeFlags: ["HS 8487.90 — dual-use machine parts, export licence required under EU Regulation 2021/821", "Potential application to ballistic guidance systems"],
    physicalPlausibility: "Declared quantity of 50,000 units would fill 14 standard 40ft containers. Single LC documents only 2 containers. Physical shipment cannot accommodate declared volume.",
  },
  counterpartyRisk: {
    exporterRisk: "HIGH — Exporter incorporated 6 months prior to transaction. No prior trade history. Beneficial owner not disclosed. Registered at virtual office address in JAFZA.",
    importerRisk: "MEDIUM — Importer operates in high-risk jurisdiction with endemic corruption. No audited financials available. Sector (industrial) inconsistent with declared end-use (consumer goods).",
    sharedBeneficialOwner: true,
    relatedPartyTransaction: true,
  },
  documentaryRisk: [
    "Three separate invoice versions presented with material value differences (USD 2.1M spread across revisions)",
    "Bill of lading issuer not affiliated with named shipping line",
    "Certificate of origin contradicts declared manufacture country on commercial invoice",
    "Packing list quantities inconsistent with bill of lading container count",
  ],
  sanctionedRouteRisk: "ELEVATED — Transit through Panama introduces exposure to OFAC-listed entities active in Central American trade lanes. Confirm no Panama-registered vessel or intermediary on OFAC SDN list.",
  regulatoryObligations: [
    { obligation: "File Suspicious Transaction Report with UAE FIU (goAML) within 35 days of suspicion", regulation: "UAE FDL 20/2018 Art.15; FDL 10/2025 Art.9" },
    { obligation: "Conduct enhanced due diligence on all named counterparties and beneficial owners", regulation: "CBUAE AML Standards §5.3 — high-risk customer EDD" },
    { obligation: "Assess dual-use goods export licence compliance before processing payment", regulation: "UAE Federal Decree-Law 13/2021 on dual-use goods; UAE Strategic Goods List" },
    { obligation: "Notify senior management and MLRO immediately; document escalation", regulation: "FATF R.18; CBUAE AML Standards §6.4" },
  ],
  redFlags: [
    "Price variance exceeds 200% above market benchmark — primary TBML indicator",
    "Multiple invoice revisions with material value changes",
    "Circular shipping route with no commercial rationale",
    "Exporter and importer share common beneficial owner (related-party transaction)",
    "Newly incorporated exporter with no trade history",
    "Physical quantity implausibility — declared volume cannot fit declared containers",
    "Dual-use goods without export licence documentation",
    "Virtual office incorporation in free zone with high anonymity risk",
  ],
  recommendation: "file_str",
  immediateActions: [
    "Suspend LC negotiation and payment immediately pending investigation",
    "Escalate to MLRO and senior management within 2 hours",
    "Obtain independent commodity valuation from accredited appraiser (ITC/UNCTAD methodology)",
    "Request full beneficial ownership disclosure for both counterparties",
    "Check OFAC SDN, UN, EU and UAE local lists for all named parties and vessels",
    "Assess dual-use export licence requirement with export controls authority",
    "File STR on goAML within statutory deadline",
    "Preserve all documentary evidence; do not tipping-off",
  ],
  summary: "This trade finance transaction presents a critical TBML risk profile. The combination of extreme price anomaly (+214% above benchmark), circular routing, multiple invoice revisions, related-party structure, physical implausibility, and dual-use goods creates a compelling constellation of red flags consistent with FATF typologies for trade-based value transfer. Immediate suspension and STR filing are required. Do not process payment or negotiate the LC pending full investigation.",
};

export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: {
    transactionType?: string;
    exporter?: { name: string; country: string; sector: string };
    importer?: { name: string; country: string; sector: string };
    goods?: string;
    hsCode?: string;
    declaredValue?: string;
    quantity?: string;
    shippingRoute?: string;
    financingBank?: string;
    documentFlags?: {
      multipleInvoiceRevisions: boolean;
      valueMismatch: boolean;
      phantomGoods: boolean;
      circularRouting: boolean;
      overUnderInvoicing: boolean;
    };
    sanctionedPartyFlags?: boolean;
    dualUseGoods?: boolean;
    context?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "trade-finance-risk temporarily unavailable - please retry." }, { status: 503 });

  try {
    const client = getAnthropicClient(apiKey, 55_000);
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 3000,
      system: [
        {
          type: "text",
          text: `You are a specialist UAE MLRO and trade finance AML expert with deep expertise in Trade-Based Money Laundering (TBML) detection. Your knowledge covers:

REGULATORY FRAMEWORKS:
- FATF "Trade-Based Money Laundering" guidance (2006 original + 2020 update) — all typologies
- Wolfsberg Trade Finance Principles (2019, 2023 update)
- BIS (Bank for International Settlements) trade finance guidance on ML/TF risk
- ICC (International Chamber of Commerce) Uniform Customs and Practice for Documentary Credits (UCP 600)
- ICC Uniform Rules for Collections (URC 522)
- UAE FDL 20/2018 (AML Law) and FDL 10/2025 (Updated AML Law)
- CBUAE AML Standards for Banks — trade finance chapter
- UAE Cabinet Decision on DNFBP obligations in trade finance
- UAE Strategic Goods Control & Dual-Use Goods regime
- OFAC, UN, EU, and UAE local sanctions lists as applied to trade
- Basel Committee on Banking Supervision — due diligence for banks (July 2004) trade finance annex

TBML TYPOLOGIES & SCHEMES:
1. Over-invoicing / Under-invoicing — price manipulation to transfer value; use ITC Trade Map and UNCTAD trade pricing as benchmarks
2. Multiple invoicing — same goods invoiced multiple times to extract additional payments
3. Falsely described goods — goods misrepresented by type, quality, grade, or quantity
4. Phantom shipments — payment for goods never shipped; fraudulent documentation
5. Round-tripping / circular routing — value exported and reimported to create artificial trade volume
6. Short-shipping — fewer goods shipped than invoiced; pocketing the difference
7. Over/under-shipping — quantity fraud combined with invoice manipulation
8. Connected party transactions — related-party TBML to move value within controlled entities

DOCUMENTARY RED FLAGS:
- SWIFT MT700/MT710/MT720 anomalies (field inconsistencies, non-standard terms)
- Multiple invoice revisions with material value changes
- Bill of lading discrepancies (issuer, vessel, port sequence)
- Certificate of origin contradictions
- Packing list / container count implausibility
- Rushed or amended documentation after initial presentation
- Unusual payment terms (advance payment for unknown counterparty)
- Guarantees issued by non-banking entities

HS CODE INTELLIGENCE:
- Dual-use goods (Chapter 84, 85, 88, 90) — export licence flags
- Precious metals & stones (HS 71) — gold/diamond TBML typology
- Weapons & ammunition (HS 93) — sanctions and dual-use
- Nuclear materials (HS 28, 84) — proliferation finance risk
- Luxury goods for re-export (HS 87, 90, 91) — sanctions circumvention
- Agricultural commodities (HS 01-24) — susceptible to quality/quantity fraud

UAE-SPECIFIC RISK FACTORS:
- Dubai as global re-export hub — transit TBML via Jebel Ali Free Zone (JAFZA), Dubai Airport Free Zone (DAFZA), Dubai Multi Commodities Centre (DMCC)
- Gold and diamond trade via Dubai Gold Souk and DMCC — LBMA chain of custody risks
- UAE strategic location for Iran sanctions circumvention via trade (OFAC risk)
- Free zone entity anonymity — beneficial ownership opacity
- SWIFT connectivity and correspondent banking relationships in UAE trade finance
- UAE Export Credit Agency (Etihad Credit Insurance) — legitimate vs. fraudulent trade insurance

PRICE ANALYSIS METHODOLOGY:
- Reference ITC Trade Map (trademap.org) unit value benchmarks
- UNCTAD COMTRADE statistical pricing
- World Bank commodity price data
- Flag variances >30% as medium risk, >100% as high risk, >200% as critical
- Consider currency of invoice vs. commodity pricing convention
- Assess transport cost plausibility against declared shipping route

Return ONLY valid JSON (no markdown fences) with this exact structure:
{
  "ok": true,
  "tbmlRiskScore": <0-100 integer>,
  "riskTier": "low"|"medium"|"high"|"critical",
  "identifiedSchemes": [{"scheme":"string","description":"string","evidence":"string","estimatedDiscrepancy":"string","fatfRef":"string"}],
  "priceAnalysis": {"declaredValue":"string","benchmarkRange":"string","variance":"string","anomalyScore":<0-100>,"interpretation":"string"},
  "goodsRiskAssessment": {"goodsDescription":"string","dualUseRisk":boolean,"sanctionedGoodsRisk":boolean,"hsCodeFlags":["string"],"physicalPlausibility":"string"},
  "counterpartyRisk": {"exporterRisk":"string","importerRisk":"string","sharedBeneficialOwner":boolean,"relatedPartyTransaction":boolean},
  "documentaryRisk": ["string"],
  "sanctionedRouteRisk": "string",
  "regulatoryObligations": [{"obligation":"string","regulation":"string"}],
  "redFlags": ["string"],
  "recommendation": "clear"|"request_additional_docs"|"independent_valuation"|"file_str"|"refuse_transaction",
  "immediateActions": ["string"],
  "summary": "string"
}`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `Analyse this trade finance transaction for TBML risk:

Transaction Type: ${body.transactionType ?? "not specified"}
Exporter: ${JSON.stringify(body.exporter ?? {})}
Importer: ${JSON.stringify(body.importer ?? {})}
Goods Description: ${body.goods ?? "not specified"}
HS Code: ${body.hsCode ?? "not specified"}
Declared Value: ${body.declaredValue ?? "not specified"}
Quantity: ${body.quantity ?? "not specified"}
Shipping Route: ${body.shippingRoute ?? "not specified"}
Financing Bank: ${body.financingBank ?? "not specified"}
Document Flags: ${JSON.stringify(body.documentFlags ?? {})}
Sanctioned Party Flags: ${body.sanctionedPartyFlags ?? false}
Dual-Use Goods: ${body.dualUseGoods ?? false}
Additional Context: ${body.context ?? "none"}

Perform a comprehensive TBML risk assessment. Identify all applicable FATF typologies, conduct price analysis against market benchmarks, assess physical plausibility, evaluate counterparty risk, and provide regulatory obligations with immediate action steps.`,
        },
      ],
    });

    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as TradeFinanceRiskResult;
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ ok: false, error: "trade-finance-risk temporarily unavailable - please retry." }, { status: 503 });
  }
}
