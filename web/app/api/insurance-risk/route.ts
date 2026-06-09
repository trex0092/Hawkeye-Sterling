// POST /api/insurance-risk
// Insurance sector AML risk assessment.
// Implements FATF Report on Money Laundering Through the Insurance Sector,
// UAE Federal Decree-Law No. 10 of 2025 Art.14, and IAIS AML/CFT Guidance scoring logic covering
// cash premium payments, single-premium life policies, early redemption cycles,
// third-party premium payers, unrelated beneficiaries, high-risk nationalities,
// investment-linked high-premium policies, marine cargo TBML, and crypto premiums.

import { NextResponse } from "next/server";
import { writeAuditEvent } from "@/lib/audit";
import { enforce } from "@/lib/server/enforce";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PolicyType =
  | "life"
  | "annuity"
  | "property"
  | "motor"
  | "marine_cargo"
  | "credit_life"
  | "investment_linked";

type PaymentMethod = "cash" | "bank_transfer" | "cheque" | "crypto";

type BeneficiaryRelationship =
  | "spouse"
  | "child"
  | "parent"
  | "sibling"
  | "unrelated"
  | "company";

interface RequestBody {
  policyType: PolicyType;
  premiumAmount: number;
  currency: string;
  paymentMethod: PaymentMethod;
  policyHolderNationality: string;
  beneficiaryNationality?: string;
  benificiaryRelationship?: BeneficiaryRelationship;
  isSinglePremium?: boolean;
  earlyRedemption?: boolean;
  earlyRedemptionMonths?: number;
  isThirdPartyPayer?: boolean;
  thirdPartyRelationship?: string;
}

type RiskLevel = "critical" | "high" | "medium" | "low";

interface InsuranceRiskResult {
  ok: true;
  riskScore: number;
  riskLevel: RiskLevel;
  mlTypologies: string[];
  requiredChecks: string[];
  recommendation: string;
  regulatoryBasis: string[];
}

// ---------------------------------------------------------------------------
// Risk scoring constants
// ---------------------------------------------------------------------------

/**
 * FATF grey-list and black-list country codes (ISO 3166-1 alpha-2).
 * Sources: FATF Plenary outcomes (October 2024 / February 2025 updates),
 * MENAFATF regional assessments, and CBUAE AML Standards Annex.
 *
 * Black-list (FATF Call for Action — highest risk):
 *   IR (Iran), KP (North Korea), MM (Myanmar)
 * Grey-list (Increased Monitoring / Enhanced Follow-up):
 *   AF, AL, BB, BF, CM, CF, CG, HT, KH, LY, ML, MA, MZ, NG, PA,
 *   PH, PK, SA, SN, SY, TZ, TT, UG, VN, VU, YE, ZW, SD, SS, SO, VE
 */
const FATF_HIGH_RISK_NATIONALITIES = new Set<string>([
  // Black-list
  "IR", // Iran
  "KP", // North Korea
  "MM", // Myanmar
  // Grey-list
  "AF", // Afghanistan
  "AL", // Albania
  "BB", // Barbados
  "BF", // Burkina Faso
  "CM", // Cameroon
  "CF", // Central African Republic
  "CG", // Congo (Republic)
  "HT", // Haiti
  "KH", // Cambodia
  "LY", // Libya
  "ML", // Mali
  "MA", // Morocco
  "MZ", // Mozambique
  "NG", // Nigeria
  "PA", // Panama
  "PH", // Philippines
  "PK", // Pakistan
  "SA", // Saudi Arabia (monitoring)
  "SN", // Senegal
  "SY", // Syria
  "TZ", // Tanzania
  "TT", // Trinidad and Tobago
  "UG", // Uganda
  "VN", // Vietnam
  "VU", // Vanuatu
  "YE", // Yemen
  "ZW", // Zimbabwe
  "SD", // Sudan
  "SS", // South Sudan
  "SO", // Somalia
  "VE", // Venezuela
]);

// ---------------------------------------------------------------------------
// Scoring engine
// ---------------------------------------------------------------------------

interface ScoringResult {
  riskScore: number;
  flags: string[];
  mlTypologies: string[];
  requiredChecks: string[];
}

function computeInsuranceRisk(body: RequestBody): ScoringResult {
  let score = 0;
  const flags: string[] = [];
  const mlTypologies: string[] = [];
  const requiredChecks: string[] = [];

  // -------------------------------------------------------------------------
  // (a) Cash premium payment: +40
  //     Cash insurance premiums are a classic ML vehicle per FATF Insurance Report §3.2
  // -------------------------------------------------------------------------
  if (body.paymentMethod === "cash") {
    score += 40;
    flags.push("CASH_PREMIUM_PAYMENT:+40 — cash insurance premiums are a primary ML vehicle (FATF Insurance Report §3.2)");
    mlTypologies.push("Cash premium placement into insurance products (FATF Insurance Report §3.2)");
    requiredChecks.push("Source of funds verification for cash premium");
    requiredChecks.push("Cash transaction reporting under AML threshold rules");
  }

  // -------------------------------------------------------------------------
  // (b) Single premium life insurance: +25
  //     Lump-sum single premium = ML placement vehicle (FATF Insurance Report §3.3)
  // -------------------------------------------------------------------------
  if (body.isSinglePremium === true && body.policyType === "life") {
    score += 25;
    flags.push("SINGLE_PREMIUM_LIFE:+25 — single-premium life policy is a known ML lump-sum placement vehicle (FATF Insurance Report §3.3)");
    mlTypologies.push("Single-premium life insurance lump-sum placement (FATF Insurance Report §3.3)");
    requiredChecks.push("Enhanced source of wealth and source of funds documentation");
    requiredChecks.push("Verify legitimate financial planning rationale for single-premium structure");
  }

  // -------------------------------------------------------------------------
  // (c) Early surrender/redemption cycle:
  //     < 12 months: +35 (buy-surrender ML typology — FATF Insurance Report §3.4)
  //     12–24 months: +20
  // -------------------------------------------------------------------------
  if (body.earlyRedemption === true) {
    const months = typeof body.earlyRedemptionMonths === "number" ? body.earlyRedemptionMonths : null;
    if (months !== null && months < 12) {
      score += 35;
      flags.push(`EARLY_REDEMPTION_CRITICAL:+35 — policy surrendered within ${months} months; buy-surrender-cycle is a FATF-recognised AML typology (FATF Insurance Report §3.4)`);
      mlTypologies.push("Buy-and-surrender cycle — early redemption within 12 months (FATF Insurance Report §3.4)");
      requiredChecks.push("Suspicious Transaction Report (STR) assessment for buy-surrender cycle");
      requiredChecks.push("Investigate legitimate reason for early surrender");
    } else if (months !== null && months >= 12 && months <= 24) {
      score += 20;
      flags.push(`EARLY_REDEMPTION_HIGH:+20 — policy surrendered within ${months} months; elevated ML risk consistent with layering cycle (FATF Insurance Report §3.4)`);
      mlTypologies.push("Early redemption layering indicator — surrender within 12–24 months (FATF Insurance Report §3.4)");
      requiredChecks.push("Obtain written explanation for early redemption within 12–24 months");
    } else {
      // earlyRedemption true but no months provided — flag generically
      score += 20;
      flags.push("EARLY_REDEMPTION:+20 — early redemption flagged; months not specified, elevated ML layering risk (FATF Insurance Report §3.4)");
      mlTypologies.push("Early policy redemption — potential buy-and-surrender ML typology (FATF Insurance Report §3.4)");
      requiredChecks.push("Clarify and document the months to redemption for risk calibration");
    }
  }

  // -------------------------------------------------------------------------
  // (d) Third-party premium payer: +25
  //     Unrelated third party paying = classic ML indicator (FATF Insurance Report §3.5)
  // -------------------------------------------------------------------------
  if (body.isThirdPartyPayer === true) {
    score += 25;
    const rel = body.thirdPartyRelationship ? ` (relationship: ${body.thirdPartyRelationship})` : " (relationship not provided)";
    flags.push(`THIRD_PARTY_PAYER:+25 — third-party premium payment${rel} is a primary ML indicator (FATF Insurance Report §3.5)`);
    mlTypologies.push("Third-party premium payment structure — classic ML placement indicator (FATF Insurance Report §3.5)");
    requiredChecks.push("CDD on third-party premium payer: identity, source of funds, relationship to policyholder");
    requiredChecks.push("Obtain written consent and rationale for third-party payment arrangement");
  }

  // -------------------------------------------------------------------------
  // (e) Unrelated beneficiary: +20
  //     Naming an unrelated party as beneficiary is unusual and indicative of ML (FATF Insurance Report §3.6)
  // -------------------------------------------------------------------------
  if (body.benificiaryRelationship === "unrelated") {
    score += 20;
    flags.push("UNRELATED_BENEFICIARY:+20 — unrelated party named as beneficiary is a key ML red flag (FATF Insurance Report §3.6)");
    mlTypologies.push("Unrelated beneficiary designation — unusual structure indicating potential ML (FATF Insurance Report §3.6)");
    requiredChecks.push("CDD on beneficiary: establish identity, relationship justification, and source of benefit");
    requiredChecks.push("Assess whether beneficiary designation serves a legitimate insurance purpose");
  }

  // -------------------------------------------------------------------------
  // (f) High-risk nationality (FATF grey/black list): +30
  //     Applied to policyholder nationality
  // -------------------------------------------------------------------------
  const nationality = (body.policyHolderNationality ?? "").toUpperCase().trim();
  if (nationality && FATF_HIGH_RISK_NATIONALITIES.has(nationality)) {
    score += 30;
    flags.push(`HIGH_RISK_NATIONALITY:+30 — policyholder nationality ${nationality} is on the FATF grey/black list (FATF Insurance Report §2.3)`);
    mlTypologies.push(`Policyholder from FATF high-risk jurisdiction (${nationality}) — elevated ML/TF exposure (FATF Insurance Report §2.3)`);
    requiredChecks.push("Enhanced Due Diligence (EDD) required for FATF high-risk nationality");
    requiredChecks.push("FATF-aligned correspondent / PEP screening for policyholder");
  }

  // -------------------------------------------------------------------------
  // (g) Investment-linked high premium: +20
  //     policyType="investment_linked" + premiumAmount > 500,000 USD equivalent
  //     (FATF Insurance Report §3.7 — investment-linked policies as ML vehicles)
  // -------------------------------------------------------------------------
  if (body.policyType === "investment_linked" && body.premiumAmount > 500_000) {
    score += 20;
    flags.push(`INVESTMENT_LINKED_HIGH_PREMIUM:+20 — investment-linked policy with premium ${body.premiumAmount.toLocaleString()} ${body.currency} exceeds 500,000 USD threshold (FATF Insurance Report §3.7)`);
    mlTypologies.push("High-value investment-linked insurance as ML layering/integration vehicle (FATF Insurance Report §3.7)");
    requiredChecks.push("Source of wealth and source of funds documentation for high-value investment-linked premium");
    requiredChecks.push("Senior management approval for high-value investment-linked policy");
  }

  // -------------------------------------------------------------------------
  // (h) Marine cargo policy: +15
  //     Marine cargo insurance used in Trade-Based Money Laundering (TBML)
  //     per FATF TBML typologies and IAIS Guidance §4.2
  // -------------------------------------------------------------------------
  if (body.policyType === "marine_cargo") {
    score += 15;
    flags.push("MARINE_CARGO_TBML:+15 — marine cargo insurance is a vehicle for Trade-Based Money Laundering (TBML); high-risk route exposure (FATF TBML Typologies / IAIS AML/CFT Guidance §4.2)");
    mlTypologies.push("Marine cargo insurance — Trade-Based Money Laundering (TBML) vector (FATF TBML Typologies / IAIS §4.2)");
    requiredChecks.push("Verify trade documentation: invoices, bills of lading, and shipping manifests for consistency");
    requiredChecks.push("Assess cargo route for high-risk jurisdiction exposure (FATF TBML indicators)");
  }

  // -------------------------------------------------------------------------
  // (i) Crypto premium payment: +30
  //     Cryptocurrency used to pay insurance premiums = high ML/TF exposure
  //     (FATF R.15, IAIS AML/CFT Guidance §3.5)
  // -------------------------------------------------------------------------
  if (body.paymentMethod === "crypto") {
    score += 30;
    flags.push("CRYPTO_PREMIUM_PAYMENT:+30 — cryptocurrency premium payment carries high ML/TF risk; pseudonymous value transfer (FATF R.15 / IAIS AML/CFT Guidance §3.5)");
    mlTypologies.push("Cryptocurrency insurance premium — pseudonymous ML/TF placement vector (FATF R.15 / IAIS AML/CFT Guidance §3.5)");
    requiredChecks.push("Blockchain analytics / VASP due diligence on crypto payment source");
    requiredChecks.push("FATF Travel Rule compliance check for crypto premium transfer");
    requiredChecks.push("Verify whether paying VASP is registered and compliant");
  }

  // Cap at 100
  const riskScore = Math.min(score, 100);

  return { riskScore, flags, mlTypologies, requiredChecks };
}

// ---------------------------------------------------------------------------
// Risk tier mapping
// ---------------------------------------------------------------------------

function scoreToRiskLevel(score: number): RiskLevel {
  if (score >= 70) return "critical";
  if (score >= 45) return "high";
  if (score >= 20) return "medium";
  return "low";
}

function buildRecommendation(riskLevel: RiskLevel, flags: string[]): string {
  const parts: string[] = [];

  if (riskLevel === "critical") {
    parts.push(
      "IMMEDIATE ACTION REQUIRED: File a Suspicious Transaction Report (STR) with the UAE Financial Intelligence Unit (UAEFIU). Escalate to MLRO and senior compliance management. Place the policy under enhanced monitoring and consider suspending issuance pending AML review.",
    );
  } else if (riskLevel === "high") {
    parts.push(
      "Initiate Enhanced Due Diligence (EDD). Obtain source of funds and source of wealth documentation before policy issuance. Obtain MLRO sign-off. Consider STR filing if satisfactory explanation cannot be obtained.",
    );
  } else if (riskLevel === "medium") {
    parts.push(
      "Apply standard Customer Due Diligence (CDD) enhancements. Collect additional documentation on premium source and policy rationale. Maintain heightened transaction monitoring.",
    );
  } else {
    parts.push(
      "Standard CDD controls apply. Continue routine monitoring. No immediate escalation required.",
    );
  }

  if (flags.some((f) => f.startsWith("CASH_PREMIUM_PAYMENT"))) {
    parts.push(
      "Cash premium: Apply FATF Insurance Report §3.2 controls — obtain source of cash documentation and verify consistency with customer economic profile.",
    );
  }

  if (flags.some((f) => f.startsWith("THIRD_PARTY_PAYER"))) {
    parts.push(
      "Third-party payer: Full CDD must be completed on the paying party. Document the commercial rationale. Refer to FATF Insurance Report §3.5.",
    );
  }

  if (flags.some((f) => f.startsWith("EARLY_REDEMPTION"))) {
    parts.push(
      "Early redemption: Investigate the purpose of early surrender. If no legitimate explanation is obtained, treat as a SAR indicator per FATF Insurance Report §3.4 buy-surrender typology.",
    );
  }

  if (flags.some((f) => f.startsWith("MARINE_CARGO_TBML"))) {
    parts.push(
      "Marine cargo: Apply FATF TBML controls — verify all trade documents for consistency of value, quantity, and description. Refer to IAIS AML/CFT Guidance §4.2.",
    );
  }

  if (flags.some((f) => f.startsWith("CRYPTO_PREMIUM_PAYMENT"))) {
    parts.push(
      "Crypto premium: Conduct blockchain analytics and VASP due diligence. Ensure FATF Travel Rule compliance (FATF R.15). Escalate to Compliance before accepting crypto payment.",
    );
  }

  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req, { cost: 5 });
  if (!gate.ok) return gate.response;

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid JSON" },
      { status: 400, headers: gate.headers },
    );
  }

  // Basic validation
  if (!body.policyType || typeof body.policyType !== "string") {
    return NextResponse.json(
      { ok: false, error: "policyType is required" },
      { status: 422, headers: gate.headers },
    );
  }
  if (typeof body.premiumAmount !== "number" || body.premiumAmount < 0) {
    return NextResponse.json(
      { ok: false, error: "premiumAmount (non-negative number) is required" },
      { status: 422, headers: gate.headers },
    );
  }
  if (!body.currency || typeof body.currency !== "string") {
    return NextResponse.json(
      { ok: false, error: "currency is required" },
      { status: 422, headers: gate.headers },
    );
  }
  if (!body.paymentMethod || typeof body.paymentMethod !== "string") {
    return NextResponse.json(
      { ok: false, error: "paymentMethod is required" },
      { status: 422, headers: gate.headers },
    );
  }
  if (!body.policyHolderNationality || typeof body.policyHolderNationality !== "string") {
    return NextResponse.json(
      { ok: false, error: "policyHolderNationality is required" },
      { status: 422, headers: gate.headers },
    );
  }

  try {
    writeAuditEvent("compliance_assistant", "insurance.aml-risk-assessment", body.policyType);
  } catch (err) {
    console.warn("[hawkeye] insurance-risk writeAuditEvent failed:", err);
  }

  // Run the deterministic rule-based scoring engine.
  const scoring = computeInsuranceRisk(body);
  const riskLevel = scoreToRiskLevel(scoring.riskScore);
  const recommendation = buildRecommendation(riskLevel, scoring.flags);

  // Deduplicate arrays.
  const mlTypologies = [...new Set(scoring.mlTypologies)];
  const requiredChecks = [...new Set(scoring.requiredChecks)];

  const regulatoryBasis: string[] = [
    "FATF Report on Money Laundering Through the Insurance Sector",
    "UAE Federal Decree-Law No. 10 of 2025 Art.14",
    "IAIS AML/CFT Guidance",
  ];

  void writeAuditChainEntry(
    {
      event: "insurance.risk_assessed",
      actor: gate.keyId,
      policyType: body.policyType,
      paymentMethod: body.paymentMethod,
      currency: body.currency,
      premiumAmount: body.premiumAmount,
      policyHolderNationality: body.policyHolderNationality,
      riskScore: scoring.riskScore,
      riskLevel,
      flagCount: scoring.flags.length,
      flags: scoring.flags,
    },
    tenantIdFromGate(gate),
  ).catch((err) =>
    console.warn(
      "[insurance-risk] audit chain write failed:",
      err instanceof Error ? err.message : String(err),
    ),
  );

  const result: InsuranceRiskResult = {
    ok: true,
    riskScore: scoring.riskScore,
    riskLevel,
    mlTypologies,
    requiredChecks,
    recommendation,
    regulatoryBasis,
  };

  return NextResponse.json(result, { headers: gate.headers });
}
