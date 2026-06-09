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

type WealthSource =
  | "employment"
  | "business"
  | "inheritance"
  | "investment"
  | "property"
  | "pension"
  | "gift"
  | "lottery"
  | "crypto"
  | "other";

interface RequestBody {
  subjectName: string;
  subjectType: "individual" | "corporate";
  pepStatus?: boolean;
  nationality: string;
  transactionValue: number;
  declaredWealth?: number;
  wealthSources?: WealthSource[];
  businessType?: string;
  yearsInBusiness?: number;
  annualRevenue?: number;
  jurisdictionsInvolved?: string[];
}

interface RequiredDocument {
  document: string;
  reason: string;
  deadline: string;
}

interface SowVerificationResult {
  verificationLevel: "standard" | "enhanced" | "intensive";
  requiredDocuments: RequiredDocument[];
  optionalDocuments: string[];
  estimatedCompletionDays: number;
  recommendation: string;
}

// ---------------------------------------------------------------------------
// High-risk jurisdiction lists
// ---------------------------------------------------------------------------

/**
 * FATF high-risk and other monitored jurisdictions requiring apostilled /
 * notarized documents. Source: FATF High-Risk Jurisdictions subject to a Call
 * for Action, combined with UAE MoE/CBUAE guidance.
 */
const HIGH_RISK_JURISDICTIONS = new Set([
  // FATF Call for Action (black list)
  "north korea",
  "dprk",
  "iran",
  "myanmar",
  // FATF Increased Monitoring (grey list) — selected high-concern
  "russia",
  "belarus",
  "venezuela",
  "syria",
  "yemen",
  "somalia",
  "sudan",
  "south sudan",
  "libya",
  "iraq",
  "afghanistan",
  "mali",
  "burkina faso",
  "haiti",
  "laos",
  "vietnam",
  "philippines",
  "nigeria",
  "cameroon",
  "tanzania",
  "mozambique",
  "kenya",
  "ethiopia",
]);

/**
 * Jurisdictions requiring embassy attestation (strictest tier).
 * UAE Cabinet Decision 58/2020, Annex 1 high-risk designations.
 */
const EMBASSY_ATTESTATION_REQUIRED = new Set([
  "iran",
  "russia",
  "belarus",
  "venezuela",
]);

// ---------------------------------------------------------------------------
// Risk-scoring helpers
// ---------------------------------------------------------------------------

function normalise(s: string): string {
  return s.toLowerCase().trim();
}

function isHighRiskJurisdiction(jurisdiction: string): boolean {
  return HIGH_RISK_JURISDICTIONS.has(normalise(jurisdiction));
}

function requiresEmbassyAttestation(jurisdiction: string): boolean {
  return EMBASSY_ATTESTATION_REQUIRED.has(normalise(jurisdiction));
}

type RiskTier = "standard" | "enhanced" | "intensive";

interface RiskAssessment {
  tier: RiskTier;
  factors: string[];
  riskScore: number;
}

function assessRisk(body: RequestBody): RiskAssessment {
  let score = 0;
  const factors: string[] = [];

  // PEP status — significant uplift under Federal Decree-Law No. 10 of 2025 Art.16
  if (body.pepStatus) {
    score += 40;
    factors.push("PEP status declared — enhanced due diligence mandatory under FATF R.12 and Federal Decree-Law No. 10 of 2025 Art.16");
  }

  // High declared wealth threshold (AED 500,000)
  const wealth = body.declaredWealth ?? 0;
  if (wealth >= 500_000 || body.transactionValue >= 500_000) {
    score += 20;
    factors.push("Transaction / declared wealth ≥ AED 500,000 — documentary wealth evidence required");
  }

  // Wealth sources that are inherently higher risk
  const highRiskSources: WealthSource[] = ["crypto", "lottery", "gift", "other"];
  const usedHighRisk = (body.wealthSources ?? []).filter((s) => highRiskSources.includes(s));
  if (usedHighRisk.length > 0) {
    score += usedHighRisk.length * 10;
    factors.push(`Elevated-risk wealth source(s): ${usedHighRisk.join(", ")} — enhanced source verification required`);
  }

  // Multiple wealth sources — layering indicator
  if ((body.wealthSources ?? []).length > 2) {
    score += 10;
    factors.push("Multiple wealth sources declared — cross-referencing required to confirm consistency");
  }

  // High-risk nationality
  if (isHighRiskJurisdiction(body.nationality)) {
    score += 25;
    factors.push(`Nationality (${body.nationality}) on FATF high-risk / monitored list — apostilled documents required`);
  }

  // Additional jurisdictions involved
  const hrJurisdictions = (body.jurisdictionsInvolved ?? []).filter(isHighRiskJurisdiction);
  if (hrJurisdictions.length > 0) {
    score += hrJurisdictions.length * 15;
    factors.push(`High-risk jurisdiction(s) involved: ${hrJurisdictions.join(", ")}`);
  }

  // Corporate subjects with short operating history
  if (body.subjectType === "corporate" && typeof body.yearsInBusiness === "number" && body.yearsInBusiness < 2) {
    score += 10;
    factors.push("Corporate entity — fewer than 2 years in business; audited accounts may be unavailable");
  }

  let tier: RiskTier;
  if (score >= 50) {
    tier = "intensive";
  } else if (score >= 20) {
    tier = "enhanced";
  } else {
    tier = "standard";
  }

  return { tier, factors, riskScore: score };
}

// ---------------------------------------------------------------------------
// Checklist builder
// ---------------------------------------------------------------------------

function buildDeadline(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function buildChecklist(body: RequestBody, risk: RiskAssessment): SowVerificationResult {
  const required: RequiredDocument[] = [];
  const optional: string[] = [];

  // ── Always required ────────────────────────────────────────────────────────
  required.push(
    {
      document: "Valid government-issued photo ID (passport or Emirates ID)",
      reason: "Primary identity verification — CBUAE AML/CFT Standards clause 4.1 (2023)",
      deadline: buildDeadline(7),
    },
    {
      document: "Proof of address (utility bill or bank statement < 3 months old)",
      reason: "Address confirmation required for all customer types under UAE KYC framework",
      deadline: buildDeadline(7),
    },
    {
      document: "Source of funds declaration form (signed and dated)",
      reason: "Mandatory SOF self-certification under Federal Decree-Law No. 10 of 2025 Art.14 and FATF R.10",
      deadline: buildDeadline(5),
    },
  );

  // ── Wealth threshold (≥ AED 500,000) ──────────────────────────────────────
  const wealthThreshold = 500_000;
  const triggerWealth =
    (body.declaredWealth ?? 0) >= wealthThreshold ||
    body.transactionValue >= wealthThreshold;

  if (triggerWealth) {
    required.push(
      {
        document: "Bank statements — 6 consecutive months (all accounts)",
        reason: "Required when transaction or declared wealth ≥ AED 500,000 to corroborate liquidity claims",
        deadline: buildDeadline(10),
      },
      {
        document: "Tax returns or audited financial accounts (2 most recent years)",
        reason: "Mandatory wealth corroboration for high-value customers under CBUAE AML Standards §5.3",
        deadline: buildDeadline(14),
      },
      {
        document: "Wealth declaration statutory declaration (notarized)",
        reason: "Formal notarized attestation of total net worth required for transactions ≥ AED 500,000",
        deadline: buildDeadline(14),
      },
    );
  }

  // ── PEP-specific requirements ──────────────────────────────────────────────
  if (body.pepStatus) {
    required.push(
      {
        document: "Independent wealth verification report (from accredited third-party due diligence firm)",
        reason: "PEP EDD obligation — FATF R.12; Federal Decree-Law No. 10 of 2025 Art.16(2)(b); CBUAE AML Standards §7.2",
        deadline: buildDeadline(21),
      },
      {
        document: "Declaration of assets and liabilities (comprehensive, signed)",
        reason: "PEP asset disclosure — Cabinet Decision 58/2020 Art.11 and FATF R.12",
        deadline: buildDeadline(14),
      },
      {
        document: "Letter of no objection from employing government entity (if currently serving)",
        reason: "Required to confirm political position does not conflict with the transaction",
        deadline: buildDeadline(14),
      },
      {
        document: "Anti-bribery and corruption declaration (AML/CFT self-certification)",
        reason: "PEP bribery/corruption risk mitigation — Federal Decree-Law No. 10 of 2025 Art.16(3) and UNCAC Art.52",
        deadline: buildDeadline(7),
      },
    );
  }

  // ── Wealth source–specific documents ──────────────────────────────────────
  for (const source of body.wealthSources ?? []) {
    switch (source) {
      case "employment":
        required.push(
          {
            document: "Payslips — 3 consecutive months",
            reason: "Employment income verification — corroborates SOW declaration",
            deadline: buildDeadline(7),
          },
          {
            document: "Employment contract (current, signed by both parties)",
            reason: "Confirms role, salary band, and duration of employment",
            deadline: buildDeadline(10),
          },
          {
            document: "Employer reference letter (on company letterhead, signed by HR/Director)",
            reason: "Independent confirmation of employment status and compensation",
            deadline: buildDeadline(10),
          },
        );
        break;

      case "business":
        required.push(
          {
            document: "Audited financial accounts (3 most recent years)",
            reason: "Business ownership income verification — Federal Decree-Law No. 10 of 2025 Art.14; CBUAE §5.3",
            deadline: buildDeadline(14),
          },
          {
            document: "Certificate of incorporation and trade licence",
            reason: "Confirms legal existence and legitimacy of the business",
            deadline: buildDeadline(7),
          },
          {
            document: "Directors / shareholders register (current, certified)",
            reason: "UBO verification — Cabinet Decision 58/2020 Art.9; FATF R.24",
            deadline: buildDeadline(10),
          },
        );
        break;

      case "inheritance":
        required.push(
          {
            document: "Probate order or authenticated will (certified copy)",
            reason: "Legal proof of entitlement to inherited assets",
            deadline: buildDeadline(14),
          },
          {
            document: "Estate valuation report (from licensed valuator)",
            reason: "Quantifies inherited wealth — must reconcile with declared SOW amount",
            deadline: buildDeadline(14),
          },
          {
            document: "Executor confirmation letter (signed, witnessed)",
            reason: "Confirms distribution to subject as named beneficiary",
            deadline: buildDeadline(14),
          },
        );
        break;

      case "investment":
        required.push(
          {
            document: "Portfolio statements — 12 months (all investment accounts)",
            reason: "Investment income / capital gains verification",
            deadline: buildDeadline(10),
          },
          {
            document: "Investment account records (opening, transactions, current balance)",
            reason: "Full transaction history to trace investment origin and growth",
            deadline: buildDeadline(10),
          },
          {
            document: "Original purchase evidence for significant holdings (contract notes / trade confirmations)",
            reason: "Proves legitimate acquisition of assets now being liquidated or transferred",
            deadline: buildDeadline(14),
          },
        );
        break;

      case "property":
        required.push(
          {
            document: "Title deed (certified copy from relevant land registry)",
            reason: "Legal proof of property ownership and valuation base",
            deadline: buildDeadline(10),
          },
          {
            document: "Independent property valuation report (< 6 months old)",
            reason: "Market value corroboration — must align with transaction / declared wealth",
            deadline: buildDeadline(14),
          },
          {
            document: "Mortgage payoff letter or redemption statement (if applicable)",
            reason: "Confirms net equity available; identifies residual encumbrances",
            deadline: buildDeadline(10),
          },
        );
        break;

      case "pension":
        optional.push(
          "Pension benefit statement (most recent annual statement)",
          "Pension fund scheme rules summary (confirms entitlement basis)",
        );
        break;

      case "gift":
        required.push(
          {
            document: "Deed of gift or gifting agreement (notarized)",
            reason: "Legal instrument confirming the transfer — prevents disguised loans or undisclosed loans",
            deadline: buildDeadline(10),
          },
          {
            document: "Gift donor's source of funds evidence (donor ID + bank statements)",
            reason: "Traces the ultimate SOF behind the gift — FATF R.10; Federal Decree-Law No. 10 of 2025 Art.14",
            deadline: buildDeadline(14),
          },
        );
        break;

      case "lottery":
        required.push(
          {
            document: "Official prize notification letter (from licensed lottery / gaming operator)",
            reason: "Confirms legitimacy of windfall — regulatory compliance with FATF R.10",
            deadline: buildDeadline(7),
          },
          {
            document: "Prize payment receipt or bank credit advice",
            reason: "Corroborates that funds entered the financial system via legitimate channels",
            deadline: buildDeadline(7),
          },
        );
        break;

      case "crypto":
        required.push(
          {
            document: "Exchange account statements (all platforms, minimum 12 months)",
            reason: "Crypto SOF traceability — FATF R.15 Virtual Assets; CBUAE VC guidance 2023",
            deadline: buildDeadline(10),
          },
          {
            document: "Wallet addresses (all wallets linked to the transaction)",
            reason: "On-chain address disclosure for blockchain analytics screening",
            deadline: buildDeadline(5),
          },
          {
            document: "On-chain transaction history (exported or linked to blockchain explorer)",
            reason: "TxID-level tracing to confirm origin of funds and detect mixing / tumbling",
            deadline: buildDeadline(10),
          },
        );
        break;

      case "other":
        required.push({
          document: "Supporting documentation for declared wealth source (bespoke — to be agreed with compliance officer)",
          reason: "Non-standard SOW requires bespoke evidential package — Federal Decree-Law No. 10 of 2025 Art.14(4)",
          deadline: buildDeadline(14),
        });
        break;
    }
  }

  // ── High-risk jurisdiction overlay ────────────────────────────────────────
  const allJurisdictions = [
    body.nationality,
    ...(body.jurisdictionsInvolved ?? []),
  ];

  const anyHighRisk = allJurisdictions.some(isHighRiskJurisdiction);
  const anyEmbassy = allJurisdictions.some(requiresEmbassyAttestation);

  if (anyHighRisk) {
    required.push(
      {
        document: "Apostilled or notarized copies of all submitted documents",
        reason:
          "High-risk jurisdiction involvement — UAE Cabinet Decision 58/2020 Art.13; Hague Apostille Convention",
        deadline: buildDeadline(21),
      },
      {
        document: "Certified translation of all non-English / non-Arabic documents (sworn translator)",
        reason: "UAE legal requirement — documents not in English or Arabic must be translated by a certified translator",
        deadline: buildDeadline(21),
      },
    );
  }

  if (anyEmbassy) {
    required.push({
      document: `Embassy attestation for documents originating from ${allJurisdictions.filter(requiresEmbassyAttestation).join(", ")}`,
      reason:
        "Strict-tier jurisdiction requires UAE embassy attestation in origin country — Cabinet Decision 58/2020 Annex 1",
      deadline: buildDeadline(30),
    });
  }

  // ── Optional / advisory documents ─────────────────────────────────────────
  optional.push(
    "Open-source due diligence report (adverse media search)",
    "LinkedIn or professional profile printout (for employment / business verification)",
  );

  if (body.subjectType === "corporate") {
    optional.push(
      "Company group structure chart (signed by director)",
      "Beneficial ownership declaration (MOEC register extract)",
    );
  }

  // ── Completion days ────────────────────────────────────────────────────────
  let estimatedCompletionDays: number;
  if (risk.tier === "intensive") {
    estimatedCompletionDays = 30;
  } else if (risk.tier === "enhanced") {
    estimatedCompletionDays = 14;
  } else {
    estimatedCompletionDays = 7;
  }

  if (anyEmbassy) estimatedCompletionDays = Math.max(estimatedCompletionDays, 30);
  if (body.pepStatus) estimatedCompletionDays = Math.max(estimatedCompletionDays, 21);

  // ── Recommendation ─────────────────────────────────────────────────────────
  const recommendation = buildRecommendation(body, risk);

  return {
    verificationLevel: risk.tier,
    requiredDocuments: required,
    optionalDocuments: optional,
    estimatedCompletionDays,
    recommendation,
  };
}

function buildRecommendation(body: RequestBody, risk: RiskAssessment): string {
  const parts: string[] = [];

  if (risk.tier === "intensive") {
    parts.push(
      `INTENSIVE verification required for ${body.subjectName}. Risk score: ${risk.riskScore}/100.`,
      "Senior compliance officer sign-off and MLRO review mandatory before onboarding or transaction approval.",
    );
  } else if (risk.tier === "enhanced") {
    parts.push(
      `ENHANCED due diligence required for ${body.subjectName}. Risk score: ${risk.riskScore}/100.`,
      "Compliance officer review and documented EDD file required.",
    );
  } else {
    parts.push(
      `Standard CDD verification applies for ${body.subjectName}. Risk score: ${risk.riskScore}/100.`,
      "Routine KYC document collection with relationship manager oversight.",
    );
  }

  if (risk.factors.length > 0) {
    parts.push(`Risk factors identified: ${risk.factors.join("; ")}.`);
  }

  parts.push(
    `Regulatory basis: Federal Decree-Law No. 10 of 2025 Arts.14–16; Cabinet Decision 58/2020; CBUAE AML/CFT Standards (2023); FATF Recommendations 10, 12, 15, 24.`,
  );

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

  // Basic input validation
  if (!body.subjectName || typeof body.subjectName !== "string") {
    return NextResponse.json(
      { ok: false, error: "subjectName is required" },
      { status: 400, headers: gate.headers },
    );
  }
  if (!["individual", "corporate"].includes(body.subjectType)) {
    return NextResponse.json(
      { ok: false, error: 'subjectType must be "individual" or "corporate"' },
      { status: 400, headers: gate.headers },
    );
  }
  if (!body.nationality || typeof body.nationality !== "string") {
    return NextResponse.json(
      { ok: false, error: "nationality is required" },
      { status: 400, headers: gate.headers },
    );
  }
  if (typeof body.transactionValue !== "number" || body.transactionValue < 0) {
    return NextResponse.json(
      { ok: false, error: "transactionValue must be a non-negative number (AED)" },
      { status: 400, headers: gate.headers },
    );
  }

  try {
    writeAuditEvent("compliance_assistant", "sow-verification.checklist-generated", body.subjectName);
  } catch (err) {
    console.warn("[hawkeye] sow-verification writeAuditEvent failed:", err);
  }

  const risk = assessRisk(body);
  const result = buildChecklist(body, risk);

  void writeAuditChainEntry(
    {
      event: "sow_verification.checklist_generated",
      actor: gate.keyId,
      subjectName: body.subjectName,
      subjectType: body.subjectType,
      verificationLevel: result.verificationLevel,
      riskScore: risk.riskScore,
      pepStatus: body.pepStatus ?? false,
      nationality: body.nationality,
      transactionValue: body.transactionValue,
    },
    tenantIdFromGate(gate),
  ).catch((err) =>
    console.warn(
      "[sow-verification] audit chain write failed:",
      err instanceof Error ? err.message : String(err),
    ),
  );

  return NextResponse.json(
    { ok: true, ...result },
    { headers: gate.headers },
  );
}
