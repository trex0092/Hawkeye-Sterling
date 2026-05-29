export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
import { enforce } from "@/lib/server/enforce";
import { sanitizeField } from "@/lib/server/sanitize-prompt";

// ─── LLM-path types (existing) ──────────────────────────────────────────────

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

// ─── Deterministic TBML detection types (new flat schema) ───────────────────

export type TbmlFlagCode =
  | "invoice_discrepancy"
  | "high_risk_commodity"
  | "high_risk_trade_route"
  | "advance_payment_high_risk_country"
  | "cash_in_advance_sanctioned_country"
  | "vague_goods_description"
  | "potential_shell_counterparty";

export interface TbmlFlag {
  code: TbmlFlagCode;
  description: string;
  score: number;
}

export interface TbmlDetectionResult {
  ok: true;
  mode: "deterministic";
  riskScore: number;
  riskLevel: "low" | "medium" | "high" | "critical";
  flags: TbmlFlag[];
  tbmlPatterns: string[];
  recommendation: string;
  regulatoryBasis: string[];
}

// ─── TBML red-flag knowledge base ───────────────────────────────────────────

/** High-risk HS chapter prefixes per FATF TBML guidance */
const HIGH_RISK_HS_PREFIXES: { prefix: string; label: string }[] = [
  { prefix: "71", label: "precious metals / gems (HS 71xx)" },
  { prefix: "93", label: "arms / military equipment (HS 93xx)" },
  { prefix: "84", label: "dual-use machinery (HS 84xx)" },
  { prefix: "85", label: "dual-use electronics (HS 85xx)" },
  { prefix: "28", label: "inorganic chemicals (HS 28xx)" },
  { prefix: "29", label: "organic chemicals (HS 29xx)" },
];

/**
 * High-risk origin→destination trade route pairs (ISO 3166-1 alpha-2).
 * Sources: FATF TBML typologies, OFAC SDN designations, UN Security Council
 * sanctions, CBUAE AML Standards.
 */
const HIGH_RISK_ROUTES: { origin: string; destination: string; label: string }[] = [
  { origin: "IR", destination: "AE", label: "Iran → UAE (sanctions circumvention route)" },
  { origin: "KP", destination: "CN", label: "DPRK → China (proliferation finance route)" },
  { origin: "RU", destination: "TR", label: "Russia → Turkey (sanctions evasion route)" },
  { origin: "VE", destination: "PA", label: "Venezuela → Panama (proceeds of corruption route)" },
  { origin: "BY", destination: "PL", label: "Belarus → Poland (dual-use goods evasion route)" },
];

/** Sanctioned countries for heightened payment-term checks (ISO 3166-1 alpha-2) */
const SANCTIONED_COUNTRIES = new Set(["IR", "KP", "SY", "CU", "RU", "BY", "VE"]);

/** High-risk countries for advance-payment flag */
const HIGH_RISK_COUNTRIES = new Set([
  "IR", "KP", "SY", "CU", "AF", "MM", "SO", "YE", "LY", "SD",
  "VE", "HT", "NI", "PK", "NG", "UA",
]);

/** Vague goods-description patterns per FATF phantom-shipment typology */
const VAGUE_GOODS_PATTERNS = [
  /general\s+merchandise/i,
  /various\s+goods/i,
  /miscellaneous\s+items/i,
  /assorted\s+products/i,
  /mixed\s+goods/i,
  /sundry\s+items/i,
  /general\s+cargo/i,
  /various\s+items/i,
];

/** Shell-company name suffixes (simple heuristic) */
const SHELL_SUFFIXES = [
  /\bLLC\b/,
  /\bLtd\b/i,
  /\bHoldings\b/i,
  /\bInvestments\b/i,
  /\bInternational\s+Trading\b/i,
  /\bGlobal\s+Resources\b/i,
  /\bCapital\s+Group\b/i,
];

// ─── Deterministic TBML scoring engine ──────────────────────────────────────

interface FlatTbmlInput {
  invoiceValue: number;
  declaredValue?: number;
  goodsDescription: string;
  originCountry: string;
  destinationCountry: string;
  commodityCode?: string;
  paymentTerms?: string;
  counterpartyName?: string;
  shipmentDate?: string;
  letterOfCredit?: boolean;
}

function runDeterministicTbml(input: FlatTbmlInput): TbmlDetectionResult {
  const flags: TbmlFlag[] = [];
  const tbmlPatterns: string[] = [];

  const origin = (input.originCountry ?? "").trim().toUpperCase();
  const destination = (input.destinationCountry ?? "").trim().toUpperCase();
  const paymentTerms = (input.paymentTerms ?? "").toLowerCase();
  const goodsDesc = (input.goodsDescription ?? "").trim();
  const counterparty = (input.counterpartyName ?? "").trim();
  const commodityCode = (input.commodityCode ?? "").trim().replace(/\./g, "");

  // ── (a) Over/under-invoicing: >30% variance between invoiceValue and declaredValue
  if (
    input.declaredValue !== undefined &&
    input.declaredValue !== null &&
    input.declaredValue > 0 &&
    input.invoiceValue > 0
  ) {
    const variance =
      Math.abs(input.invoiceValue - input.declaredValue) / input.declaredValue;
    if (variance > 0.3) {
      const pct = Math.round(variance * 100);
      flags.push({
        code: "invoice_discrepancy",
        description: `Invoice value deviates ${pct}% from declared value — exceeds FATF 30% over/under-invoicing threshold.`,
        score: 35,
      });
      tbmlPatterns.push("Over/under-invoicing (FATF TBML Typology 1)");
    }
  }

  // ── (b) High-risk commodity codes: match HS chapter prefix
  if (commodityCode.length >= 2) {
    for (const { prefix, label } of HIGH_RISK_HS_PREFIXES) {
      if (commodityCode.startsWith(prefix)) {
        flags.push({
          code: "high_risk_commodity",
          description: `Commodity code ${input.commodityCode} falls within high-risk HS chapter — ${label}.`,
          score: 20,
        });
        tbmlPatterns.push(`High-risk commodity: ${label}`);
        break; // one flag per transaction
      }
    }
  }

  // ── (c) High-risk trade routes
  for (const route of HIGH_RISK_ROUTES) {
    if (origin === route.origin && destination === route.destination) {
      flags.push({
        code: "high_risk_trade_route",
        description: `Trade route ${route.label} is a known TBML / sanctions-circumvention corridor.`,
        score: 25,
      });
      tbmlPatterns.push(`High-risk route: ${route.label}`);
      break;
    }
  }

  // ── (d) Payment timing anomalies
  const isAdvancePayment =
    paymentTerms.includes("advance payment") ||
    paymentTerms.includes("cash in advance") ||
    paymentTerms.includes("prepayment") ||
    paymentTerms.includes("upfront");

  if (isAdvancePayment && SANCTIONED_COUNTRIES.has(destination)) {
    flags.push({
      code: "cash_in_advance_sanctioned_country",
      description: `Cash/advance payment to sanctioned destination country ${destination} — potential sanctions evasion via trade.`,
      score: 40,
    });
    tbmlPatterns.push("Advance payment to sanctioned country (FATF Typology — proliferation/sanctions finance)");
  } else if (isAdvancePayment && HIGH_RISK_COUNTRIES.has(destination)) {
    flags.push({
      code: "advance_payment_high_risk_country",
      description: `Advance payment terms to high-risk country ${destination} — elevated TBML and fraud risk per FATF guidance.`,
      score: 15,
    });
    tbmlPatterns.push("Advance payment to high-risk country");
  }

  // ── (e) Phantom shipment indicators — vague goods description
  const hasVagueGoods = VAGUE_GOODS_PATTERNS.some((rx) => rx.test(goodsDesc));
  if (hasVagueGoods) {
    flags.push({
      code: "vague_goods_description",
      description: `Goods description "${goodsDesc}" uses vague terminology consistent with phantom shipment typology.`,
      score: 20,
    });
    tbmlPatterns.push("Phantom shipment indicator — vague goods description (FATF TBML Typology 4)");
  }

  // ── (f) Potential shell company counterparty
  if (counterparty.length > 0) {
    const shellMatch = SHELL_SUFFIXES.some((rx) => rx.test(counterparty));
    if (shellMatch) {
      flags.push({
        code: "potential_shell_counterparty",
        description: `Counterparty name "${counterparty}" matches shell-company naming patterns — no verifiable public digital footprint indicators.`,
        score: 15,
      });
      tbmlPatterns.push("Potential shell company counterparty (FATF Typology — layering via trade)");
    }
  }

  // ── Aggregate score and risk level
  const riskScore = Math.min(
    100,
    flags.reduce((sum, f) => sum + f.score, 0),
  );

  let riskLevel: TbmlDetectionResult["riskLevel"];
  if (riskScore >= 70) riskLevel = "critical";
  else if (riskScore >= 45) riskLevel = "high";
  else if (riskScore >= 20) riskLevel = "medium";
  else riskLevel = "low";

  // ── Recommendation
  let recommendation: string;
  if (riskScore >= 70) {
    recommendation =
      "Refuse or suspend transaction pending MLRO review. File STR with UAE FIU (goAML) if reasonable grounds exist. Independent goods valuation required.";
  } else if (riskScore >= 45) {
    recommendation =
      "Escalate to MLRO. Obtain independent valuation, enhanced due diligence on counterparty, and documentary verification before proceeding.";
  } else if (riskScore >= 20) {
    recommendation =
      "Request additional documentation: certified invoice, bill of lading, certificate of origin. Conduct counterparty CDD refresh.";
  } else {
    recommendation =
      "Standard monitoring. Retain documentary evidence per UAE FDL 10/2025 record-keeping obligations.";
  }

  return {
    ok: true,
    mode: "deterministic",
    riskScore,
    riskLevel,
    flags,
    tbmlPatterns,
    recommendation,
    regulatoryBasis: [
      "FATF TBML Report (2006, updated 2020)",
      "UAE FDL 10/2025 Art.14",
      "Wolfsberg Trade Finance Principles (2019/2023)",
      "CBUAE AML Standards — Trade Finance Chapter",
    ],
  };
}

// ─── Route handler ───────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400, headers: gate.headers });
  }

  // ── Route: deterministic TBML detection (new flat schema) ─────────────────
  // Triggered when `invoiceValue` + `originCountry` + `destinationCountry` are present.
  if (
    body.invoiceValue !== undefined &&
    body.originCountry !== undefined &&
    body.destinationCountry !== undefined
  ) {
    const invoiceValue = Number(body.invoiceValue);
    if (!isFinite(invoiceValue) || invoiceValue < 0) {
      return NextResponse.json(
        { ok: false, error: "invoiceValue must be a non-negative number" },
        { status: 400, headers: gate.headers },
      );
    }

    const input: FlatTbmlInput = {
      invoiceValue,
      declaredValue: body.declaredValue !== undefined ? Number(body.declaredValue) : undefined,
      goodsDescription: String(body.goodsDescription ?? ""),
      originCountry: String(body.originCountry ?? ""),
      destinationCountry: String(body.destinationCountry ?? ""),
      commodityCode: body.commodityCode !== undefined ? String(body.commodityCode) : undefined,
      paymentTerms: body.paymentTerms !== undefined ? String(body.paymentTerms) : undefined,
      counterpartyName: body.counterpartyName !== undefined ? String(body.counterpartyName) : undefined,
      shipmentDate: body.shipmentDate !== undefined ? String(body.shipmentDate) : undefined,
      letterOfCredit: body.letterOfCredit !== undefined ? Boolean(body.letterOfCredit) : undefined,
    };

    const result = runDeterministicTbml(input);
    return NextResponse.json(result, { headers: gate.headers });
  }

  // ── Route: LLM-based deep TBML analysis (existing schema) ─────────────────
  const llmBody = body as {
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

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey)
    return NextResponse.json(
      { ok: false, error: "trade-finance-risk temporarily unavailable - please retry." },
      { status: 503, headers: gate.headers },
    );

  try {
    const client = getAnthropicClient(apiKey, 4_500);
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 800,
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
- UAE FDL 10/2025 (AML Law, in force 14 Oct 2025)
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

Transaction Type: ${sanitizeField(llmBody.transactionType, 100) || "not specified"}
Exporter: ${JSON.stringify(llmBody.exporter ?? {})}
Importer: ${JSON.stringify(llmBody.importer ?? {})}
Goods Description: ${sanitizeField(llmBody.goods, 500) || "not specified"}
HS Code: ${sanitizeField(llmBody.hsCode, 50) || "not specified"}
Declared Value: ${sanitizeField(llmBody.declaredValue, 100) || "not specified"}
Quantity: ${llmBody.quantity ?? "not specified"}
Shipping Route: ${llmBody.shippingRoute ?? "not specified"}
Financing Bank: ${llmBody.financingBank ?? "not specified"}
Document Flags: ${JSON.stringify(llmBody.documentFlags ?? {})}
Sanctioned Party Flags: ${llmBody.sanctionedPartyFlags ?? false}
Dual-Use Goods: ${llmBody.dualUseGoods ?? false}
Additional Context: ${llmBody.context ?? "none"}

Perform a comprehensive TBML risk assessment. Identify all applicable FATF typologies, conduct price analysis against market benchmarks, assess physical plausibility, evaluate counterparty risk, and provide regulatory obligations with immediate action steps.`,
        },
      ],
    });

    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as TradeFinanceRiskResult;
    if (!Array.isArray(result.identifiedSchemes)) result.identifiedSchemes = [];
    if (!Array.isArray(result.documentaryRisk)) result.documentaryRisk = [];
    if (!Array.isArray(result.redFlags)) result.redFlags = [];
    if (!Array.isArray(result.immediateActions)) result.immediateActions = [];
    if (!Array.isArray(result.regulatoryObligations)) result.regulatoryObligations = [];
    return NextResponse.json(result, { headers: gate.headers });
  } catch (err) {
    console.warn("[hawkeye] route handler failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json(
      { ok: false, error: "trade-finance-risk temporarily unavailable - please retry." },
      { status: 503, headers: gate.headers },
    );
  }
}
