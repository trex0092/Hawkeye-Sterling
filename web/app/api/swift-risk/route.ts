// POST /api/swift-risk
// SWIFT / cross-border payment risk assessment.
// Implements FATF Recommendation 16 (Wire Transfers), UAE Federal Decree-Law No. 10 of 2025 Art.14,
// and SWIFT gpi Compliance Analytics checks.

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SwiftMt = "MT103" | "MT202" | "MT202COV" | "MT101";
type RiskLevel = "critical" | "high" | "medium" | "low";

interface SwiftRiskBody {
  uetr?: string;
  swiftMt?: SwiftMt;
  senderBic: string;
  receiverBic: string;
  senderCountry: string;
  receiverCountry: string;
  amount: number;
  currency: string;
  purposeCode?: string;
  remittanceInfo?: string;
  orderingCustomer?: string;
  beneficiaryName?: string;
  beneficiaryAccount?: string;
  corrBankBics?: string[];
  isNostroVostro?: boolean;
}

interface SwiftRiskResult {
  ok: true;
  riskScore: number;
  riskLevel: RiskLevel;
  flags: string[];
  fatfR16Coverage: string[];
  recommendation: string;
  regulatoryBasis: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Countries subject to comprehensive or significant sectoral sanctions. */
const SANCTIONED_COUNTRIES = new Set(["IR", "KP", "SY", "RU", "BY", "VE", "CU"]);

/** BIC country prefixes (first 2 chars) that map to sanctioned jurisdictions. */
const SANCTIONED_BIC_PREFIXES = new Set(["IR", "SY", "KP"]);

/** FATF R.16 coverage items emitted for every response. */
const FATF_R16_ITEMS = [
  "Originator information completeness (FATF R.16 §1)",
  "Beneficiary information completeness (FATF R.16 §2)",
  "Intermediary/correspondent bank obligations (FATF R.16 §4)",
  "Cover payment transparency (FATF R.16 §9)",
  "Threshold-agnostic full-chain traceability",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** UUID v4 pattern: 8-4-4-4-12 lower-hex with correct variant bits. */
const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUetr(uetr: string): boolean {
  return UUID_V4_RE.test(uetr);
}

function scoreToRiskLevel(score: number): RiskLevel {
  if (score >= 70) return "critical";
  if (score >= 45) return "high";
  if (score >= 20) return "medium";
  return "low";
}

function buildRecommendation(level: RiskLevel, flags: string[]): string {
  switch (level) {
    case "critical":
      return (
        "BLOCK AND ESCALATE: Freeze payment pending MLRO review. " +
        "File STR/SAR if suspicion is confirmed. " +
        `Key concerns: ${flags.slice(0, 3).join("; ")}.`
      );
    case "high":
      return (
        "HOLD FOR REVIEW: Do not release payment without senior compliance approval. " +
        "Conduct enhanced due diligence on counterparties and correspondent chain. " +
        `Key concerns: ${flags.slice(0, 3).join("; ")}.`
      );
    case "medium":
      return (
        "ENHANCED MONITORING: Process with manual review. " +
        "Obtain additional originator/beneficiary documentation before settlement. " +
        `Flags noted: ${flags.join("; ")}.`
      );
    default:
      return "STANDARD PROCESSING: Payment passes automated SWIFT risk checks. Proceed under routine STP controls.";
  }
}

// ---------------------------------------------------------------------------
// Rule-based scoring
// ---------------------------------------------------------------------------

interface ScoringResult {
  score: number;
  flags: string[];
}

function computeSwiftRiskScore(body: SwiftRiskBody): ScoringResult {
  let score = 0;
  const flags: string[] = [];

  // (a) MT202 cover payment without MT202COV — FATF R.16 concern
  if (body.swiftMt === "MT202") {
    score += 25;
    flags.push("cover_payment_opacity:+25 (MT202 without MT202COV hides originator info — FATF R.16 §9)");
  }

  // (b) Missing originator information — FATF R.16 mandatory
  if (!body.orderingCustomer) {
    score += 20;
    flags.push("missing_originator_info:+20 (FATF R.16 mandates full originator data on all wire transfers)");
  }

  // (c) Missing beneficiary information
  if (!body.beneficiaryName && !body.beneficiaryAccount) {
    score += 15;
    flags.push("missing_beneficiary_info:+15 (no beneficiary name or account provided)");
  }

  // (d) High-risk sanctioned corridor
  const senderSanctioned = SANCTIONED_COUNTRIES.has(body.senderCountry.toUpperCase());
  const receiverSanctioned = SANCTIONED_COUNTRIES.has(body.receiverCountry.toUpperCase());
  if (senderSanctioned || receiverSanctioned) {
    score += 30;
    const sanctionedSide: string[] = [];
    if (senderSanctioned) sanctionedSide.push(`sender=${body.senderCountry}`);
    if (receiverSanctioned) sanctionedSide.push(`receiver=${body.receiverCountry}`);
    flags.push(`sanctioned_corridor:+30 (${sanctionedSide.join(", ")} — OFAC/UN/EU sanctions regime)`);
  }

  // (e) Round-amount structuring indicator
  if (body.amount > 50_000 && body.amount % 10_000 === 0) {
    score += 15;
    flags.push(`round_amount_structuring:+15 (amount=${body.amount} ${body.currency} — exactly divisible by 10,000 and >50,000)`);
  }

  // (f) Purpose code SALA (salary) with amount > 100,000 USD
  if (
    body.purposeCode?.toUpperCase() === "SALA" &&
    body.currency.toUpperCase() === "USD" &&
    body.amount > 100_000
  ) {
    score += 20;
    flags.push(`unusual_salary_amount:+20 (SALA purpose code but amount=${body.amount} USD exceeds plausible salary threshold)`);
  }

  // (g) Correspondent chain length > 3 — multi-hop layering
  if (Array.isArray(body.corrBankBics) && body.corrBankBics.length > 3) {
    score += 20;
    flags.push(`correspondent_chain_layering:+20 (${body.corrBankBics.length} correspondent hops detected — exceeds 3-hop threshold)`);
  }

  // (h) Nostro/vostro internal booking through sanctioned country
  if (body.isNostroVostro && (senderSanctioned || receiverSanctioned)) {
    score += 40;
    flags.push("nostro_vostro_sanctioned_country:+40 (internal Nostro/Vostro booking involving a sanctioned jurisdiction)");
  }

  // (i) UETR validation (UUID v4 format) — flag only, no score
  if (body.uetr !== undefined && !isValidUetr(body.uetr)) {
    flags.push("invalid_uetr (UETR does not conform to UUID v4 format — gpi Compliance Analytics flag)");
  }

  // (j) Known high-risk BIC prefixes: IR (Iran), SY (Syria), KP (DPRK)
  const senderPrefix = body.senderBic.slice(0, 2).toUpperCase();
  const receiverPrefix = body.receiverBic.slice(0, 2).toUpperCase();
  const highRiskBics: string[] = [];
  if (SANCTIONED_BIC_PREFIXES.has(senderPrefix)) highRiskBics.push(`senderBic=${body.senderBic}`);
  if (SANCTIONED_BIC_PREFIXES.has(receiverPrefix)) highRiskBics.push(`receiverBic=${body.receiverBic}`);
  if (Array.isArray(body.corrBankBics)) {
    for (const bic of body.corrBankBics) {
      const prefix = bic.slice(0, 2).toUpperCase();
      if (SANCTIONED_BIC_PREFIXES.has(prefix)) highRiskBics.push(`corrBic=${bic}`);
    }
  }
  if (highRiskBics.length > 0) {
    score += 40;
    flags.push(`high_risk_bic_prefix:+40 (${highRiskBics.join(", ")} — Iran/Syria/DPRK BIC prefix detected)`);
  }

  // Cap at 100
  score = Math.min(score, 100);

  return { score, flags };
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req, { cost: 5 });
  if (!gate.ok) return gate.response;

  let body: SwiftRiskBody;
  try {
    body = (await req.json()) as SwiftRiskBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid JSON body" },
      { status: 400, headers: gate.headers },
    );
  }

  // Basic required-field validation
  if (!body.senderBic || !body.receiverBic || !body.senderCountry || !body.receiverCountry) {
    return NextResponse.json(
      { ok: false, error: "senderBic, receiverBic, senderCountry, and receiverCountry are required" },
      { status: 400, headers: gate.headers },
    );
  }
  if (typeof body.amount !== "number" || body.amount < 0) {
    return NextResponse.json(
      { ok: false, error: "amount must be a non-negative number" },
      { status: 400, headers: gate.headers },
    );
  }
  if (!body.currency) {
    return NextResponse.json(
      { ok: false, error: "currency is required" },
      { status: 400, headers: gate.headers },
    );
  }

  const { score, flags } = computeSwiftRiskScore(body);
  const riskLevel = scoreToRiskLevel(score);
  const recommendation = buildRecommendation(riskLevel, flags);

  void writeAuditChainEntry(
    {
      event: "swift.risk_assessed",
      actor: gate.keyId,
      senderBic: body.senderBic,
      receiverBic: body.receiverBic,
      senderCountry: body.senderCountry,
      receiverCountry: body.receiverCountry,
      amount: body.amount,
      currency: body.currency,
      swiftMt: body.swiftMt ?? null,
      uetr: body.uetr ?? null,
      riskScore: score,
      riskLevel,
      flagCount: flags.length,
    },
    tenantIdFromGate(gate),
  ).catch((err) =>
    console.warn(
      "[swift-risk] audit chain write failed:",
      err instanceof Error ? err.message : String(err),
    ),
  );

  const result: SwiftRiskResult = {
    ok: true,
    riskScore: score,
    riskLevel,
    flags,
    fatfR16Coverage: FATF_R16_ITEMS,
    recommendation,
    regulatoryBasis: [
      "FATF R.16",
      "UAE Federal Decree-Law No. 10 of 2025 Art.14",
      "SWIFT gpi Compliance Analytics",
    ],
  };

  return NextResponse.json(result, { headers: gate.headers });
}
