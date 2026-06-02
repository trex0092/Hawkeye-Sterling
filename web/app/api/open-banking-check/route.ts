// POST /api/open-banking-check
//
// Open Banking and account information risk assessment.
//
// Performs a comprehensive rule-based AML/CFT risk assessment on a bank
// account, covering IBAN validation, banking jurisdiction risk, account
// type risk, account age, velocity-vs-balance, unusual digital access
// activity, and round-trip fund-flow indicators.
//
// Regulatory basis:
//   - FATF Recommendations 10, 15, 16, 20 (CDD, New Technologies, Wire Transfers, STR)
//   - UAE FDL 10/2025 (Federal Decree-Law on AML/CFT)
//   - CBUAE Open Finance Regulation (2023)
//   - EBA Guidelines on Internal Governance (EBA/GL/2021/05)
//   - PSD2 / Open Banking Framework (EU) — Strong Customer Authentication
//   - Basel Committee Sound Practices — Implications of Fintech Developments (2018)

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

type AccountType = "personal" | "business" | "joint" | "trust" | "correspondent";
type RiskLevel = "low" | "medium" | "high" | "critical";
type AccountRiskCategory = "low" | "medium" | "high" | "critical";
type MonitoringAction = "standard" | "enhanced" | "block_and_report";

interface RequestBody {
  accountNumber?: string;
  iban?: string;
  bankName?: string;
  bankCountry: string;
  accountType: AccountType;
  accountAge?: number;            // days since account opening
  averageBalance?: number;        // in the account's currency
  currency: string;
  recentTransactionCount?: number;
  recentTransactionVolume?: number; // total volume over recent period (e.g., 30 days)
  unusualActivity?: string[];
}

interface OpenBankingRiskResult {
  riskScore: number;
  riskLevel: RiskLevel;
  flags: string[];
  accountRiskCategory: AccountRiskCategory;
  ibanValid?: boolean;
  recommendation: string;
  monitoringAction: MonitoringAction;
}

// ---------------------------------------------------------------------------
// Jurisdiction datasets
// ---------------------------------------------------------------------------

// FATF black list — High-Risk Jurisdictions subject to a Call for Action
// (FATF Feb 2026 plenary: Iran, North Korea, Myanmar)
const FATF_BLACK_LIST = new Set([
  "IR", "KP", "MM",
  "IRN", "PRK", "MMR",
]);

// FATF grey list — Jurisdictions under Increased Monitoring (Feb 2026)
const FATF_GREY_LIST = new Set([
  "AF", "AL", "BB", "BF", "CM", "CF", "CD", "GI", "HT", "JM", "JO",
  "ML", "MZ", "NA", "NI", "NG", "PK", "PA", "PH", "SS", "SY", "TZ",
  "UG", "VN", "YE",
  "AFG", "ALB", "BRB", "BFA", "CMR", "CAF", "COD", "GIB", "HTI", "JAM",
  "JOR", "MLI", "MOZ", "NAM", "NIC", "NGA", "PAK", "PAN", "PHL", "SSD",
  "SYR", "TZA", "UGA", "VNM", "YEM",
]);

// CAHRA — Conflict/Arms/Humanitarian/Regime-risk areas
// (sanctions-designated, comprehensive OFAC SDN countries, or active conflict zones)
const CAHRA_COUNTRIES = new Set([
  "IR", "KP", "MM", "SY", "RU", "BY", "CU", "VE", "LY", "SO", "ZW",
  "SD", "CF", "SS", "HT", "CD", "LB",
  "IRN", "PRK", "MMR", "SYR", "RUS", "BLR", "CUB", "VEN", "LBY", "SOM",
  "ZWE", "SDN", "CAF", "SSD", "HTI", "COD", "LBN",
]);

// ---------------------------------------------------------------------------
// IBAN validation (mod-97 algorithm — ISO 13616)
// ---------------------------------------------------------------------------

/**
 * Validates an IBAN using the ISO 13616 mod-97 checksum algorithm.
 *
 * Steps:
 *  1. Strip whitespace and convert to uppercase.
 *  2. Move the first 4 characters to the end.
 *  3. Convert letters to digits (A=10 … Z=35).
 *  4. Compute mod 97 — result must equal 1 for a valid IBAN.
 *
 * Minimum length is 5 (2 country + 2 check + at least 1 BBAN char).
 * Maximum IBAN length per ISO 13616 is 34 characters.
 */
function validateIban(raw: string): boolean {
  const iban = raw.replace(/\s+/g, "").toUpperCase();

  if (iban.length < 5 || iban.length > 34) return false;
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(iban)) return false;

  // Rearrange: BBAN + original country code + check digits
  const rearranged = iban.slice(4) + iban.slice(0, 4);

  // Convert letters to digits: A=10, B=11, …, Z=35
  const numeric = rearranged.replace(/[A-Z]/g, (ch) =>
    String(ch.charCodeAt(0) - 55),
  );

  // BigInt mod 97 (numeric string can be up to ~43 digits — exceeds JS safe integer range)
  let remainder = BigInt(0);
  for (const ch of numeric) {
    remainder = (remainder * BigInt(10) + BigInt(Number(ch))) % BigInt(97);
  }

  return remainder === BigInt(1);
}

/**
 * Returns true if the supplied string looks like an IBAN (starts with two
 * letters followed by two digits, 5–34 chars after stripping spaces).
 */
function looksLikeIban(value: string): boolean {
  const clean = value.replace(/\s+/g, "").toUpperCase();
  return /^[A-Z]{2}\d{2}/.test(clean) && clean.length >= 5 && clean.length <= 34;
}

// ---------------------------------------------------------------------------
// Unusual activity signals
// ---------------------------------------------------------------------------

const UNUSUAL_ACTIVITY_SCORES: Record<string, number> = {
  multiple_country_ips:            15,
  after_hours_access:              15,
  rapid_password_change:           15,
  new_beneficiaries_added:         15,
  large_transfers_unusual_recipients: 15,
};

// ---------------------------------------------------------------------------
// Core scoring engine
// ---------------------------------------------------------------------------

interface ScoringResult {
  score: number;
  flags: string[];
  ibanValid?: boolean;
}

function computeOpenBankingRisk(body: RequestBody): ScoringResult {
  let score = 0;
  const flags: string[] = [];
  let ibanValid: boolean | undefined;

  const country = body.bankCountry.trim().toUpperCase();

  // -------------------------------------------------------------------------
  // (a) IBAN validation — mod-97 checksum
  // -------------------------------------------------------------------------
  if (body.iban && body.iban.trim().length > 0) {
    if (looksLikeIban(body.iban)) {
      ibanValid = validateIban(body.iban);
      if (!ibanValid) {
        score += 25;
        flags.push(
          "invalid_iban:+25 (IBAN failed mod-97 checksum — possible synthetic, miskeyed, or fraudulent account identifier)",
        );
      }
    } else if (body.accountNumber && body.accountNumber.trim().length > 0) {
      // accountNumber is present but doesn't look like an IBAN — no IBAN check
      ibanValid = undefined;
    }
  }

  // -------------------------------------------------------------------------
  // (b) High-risk banking jurisdiction
  //     FATF grey list → +30; CAHRA → +40
  //     (CAHRA adds on top of grey-list score when both apply)
  // -------------------------------------------------------------------------
  if (FATF_BLACK_LIST.has(country)) {
    score += 30;
    flags.push(
      `country_fatf_blacklist:+30 (banking jurisdiction "${country}" is on the FATF Black List — High-Risk Jurisdictions subject to a Call for Action)`,
    );
  } else if (FATF_GREY_LIST.has(country)) {
    score += 30;
    flags.push(
      `country_fatf_greylist:+30 (banking jurisdiction "${country}" is on the FATF Grey List — Jurisdictions under Increased Monitoring)`,
    );
  }

  if (CAHRA_COUNTRIES.has(country)) {
    score += 40;
    flags.push(
      `country_cahra:+40 (banking jurisdiction "${country}" is a Conflict/Arms/Humanitarian/Regime-risk area — senior management approval required; EDD mandatory)`,
    );
  }

  // -------------------------------------------------------------------------
  // (c) Account type risk
  //     correspondent +25 | trust +15 | joint +10
  // -------------------------------------------------------------------------
  if (body.accountType === "correspondent") {
    score += 25;
    flags.push(
      "account_type_correspondent:+25 (correspondent account — highest account-type risk; potential shell-via-correspondent, nested relationships, and payable-through account abuse per FATF R.13)",
    );
  } else if (body.accountType === "trust") {
    score += 15;
    flags.push(
      "account_type_trust:+15 (trust account — elevated beneficial-ownership opacity risk; enhanced CDD required on settlor, trustees, and beneficiaries per FATF R.25)",
    );
  } else if (body.accountType === "joint") {
    score += 10;
    flags.push(
      "account_type_joint:+10 (joint account — multiple-controller risk; verify all signatories meet CDD/KYC requirements)",
    );
  }

  // -------------------------------------------------------------------------
  // (d) New account risk: accountAge < 90 days → +20
  //     New accounts are disproportionately used for fraud and ML structuring
  // -------------------------------------------------------------------------
  if (body.accountAge !== undefined && body.accountAge < 90) {
    score += 20;
    flags.push(
      `new_account:+20 (account age ${body.accountAge} day(s) — accounts under 90 days are a primary fraud and ML structuring vector; heightened velocity monitoring required)`,
    );
  }

  // -------------------------------------------------------------------------
  // (e) Velocity relative to balance:
  //     averageBalance < 1,000 AED-equivalent AND monthly volume > 100,000 AED → +25
  //     Indicator of transit/funnel account or structuring activity
  // -------------------------------------------------------------------------
  if (
    body.averageBalance !== undefined &&
    body.recentTransactionVolume !== undefined &&
    body.averageBalance < 1_000 &&
    body.recentTransactionVolume > 100_000
  ) {
    score += 25;
    flags.push(
      `velocity_relative_to_balance:+25 (average balance ${body.averageBalance} ${body.currency} is below 1,000 but recent transaction volume is ${body.recentTransactionVolume} ${body.currency} — classic funnel/transit account pattern; FATF Typology #15)`,
    );
  }

  // -------------------------------------------------------------------------
  // (f) Unusual digital activity signals: +15 each
  //     Indicates account takeover, credential compromise, or insider threat
  // -------------------------------------------------------------------------
  const unusualActivity = body.unusualActivity ?? [];
  for (const activity of unusualActivity) {
    const activityNorm = activity.trim().toLowerCase();
    const activityScore = UNUSUAL_ACTIVITY_SCORES[activityNorm];
    if (activityScore !== undefined) {
      score += activityScore;
      flags.push(
        `unusual_activity_${activityNorm}:+${activityScore} (unusual digital access/behavioural signal detected — potential account compromise or authorised-push-payment fraud vector)`,
      );
    }
  }

  // -------------------------------------------------------------------------
  // (g) Round-trip indicator:
  //     recentTransactionCount > 10 AND net balance change < 5% of total volume → +30
  //     Suggests funds cycling/round-tripping — layering typology
  // -------------------------------------------------------------------------
  if (
    body.recentTransactionCount !== undefined &&
    body.recentTransactionCount > 10 &&
    body.averageBalance !== undefined &&
    body.recentTransactionVolume !== undefined &&
    body.recentTransactionVolume > 0
  ) {
    // Net balance change proxy: we use averageBalance as a standing balance proxy.
    // When the average balance is very low relative to total volume, it implies
    // money flowing in and out at near-equal rates — the round-trip signature.
    const netChangeRatio = body.averageBalance / body.recentTransactionVolume;
    if (netChangeRatio < 0.05) {
      score += 30;
      flags.push(
        `round_trip_indicator:+30 (${body.recentTransactionCount} transactions with net balance-to-volume ratio of ${(netChangeRatio * 100).toFixed(2)}% — below 5% threshold, consistent with circular fund-flow / round-tripping layering typology)`,
      );
    }
  }

  // Cap at 100
  score = Math.min(score, 100);

  return { score, flags, ibanValid };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function scoreToRiskLevel(score: number): RiskLevel {
  if (score >= 75) return "critical";
  if (score >= 50) return "high";
  if (score >= 25) return "medium";
  return "low";
}

function riskLevelToAccountCategory(level: RiskLevel): AccountRiskCategory {
  return level; // 1:1 mapping
}

function riskLevelToMonitoringAction(level: RiskLevel): MonitoringAction {
  if (level === "critical") return "block_and_report";
  if (level === "high") return "enhanced";
  return "standard";
}

function buildRecommendation(level: RiskLevel, flags: string[]): string {
  const flagSummary = flags
    .slice(0, 3)
    .map((f) => f.split(":")[0])
    .join(", ");

  switch (level) {
    case "critical":
      return (
        `Block account activity and file a Suspicious Transaction/Activity Report immediately. ` +
        `Critical account risk indicators detected (${flagSummary}). ` +
        `Escalate to MLRO and senior compliance officer. ` +
        `Apply a transaction freeze pending full EDD review and potential SAR filing with the UAE FIU via goAML. ` +
        `Do not tip off the account holder.`
      );
    case "high":
      return (
        `Apply Enhanced Due Diligence (EDD): obtain source of funds and source of wealth documentation, ` +
        `verify all beneficial owners, conduct adverse media and sanctions screening on all associated parties. ` +
        `Senior compliance officer approval required before processing further transactions. ` +
        `Key risk drivers: ${flagSummary}.`
      );
    case "medium":
      return (
        `Elevated account risk — apply enhanced transaction monitoring and periodic CDD refresh. ` +
        `Review transaction patterns against known ML typologies. ` +
        `Collect supporting documentation for unusual activity. ` +
        `Risk drivers: ${flagSummary}.`
      );
    default:
      return (
        `Standard CDD controls are sufficient. ` +
        `Maintain routine transaction monitoring and periodic KYC refresh per CBUAE guidance. ` +
        `No immediate escalation required.`
      );
  }
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

  // Required field validation
  if (!body.bankCountry || typeof body.bankCountry !== "string" || !body.bankCountry.trim()) {
    return NextResponse.json(
      { ok: false, error: "bankCountry is required (ISO 3166-1 alpha-2 or alpha-3)" },
      { status: 400, headers: gate.headers },
    );
  }

  const validAccountTypes: AccountType[] = ["personal", "business", "joint", "trust", "correspondent"];
  if (!body.accountType || !validAccountTypes.includes(body.accountType)) {
    return NextResponse.json(
      {
        ok: false,
        error: `accountType is required and must be one of: ${validAccountTypes.join(", ")}`,
      },
      { status: 400, headers: gate.headers },
    );
  }

  if (!body.currency || typeof body.currency !== "string" || !body.currency.trim()) {
    return NextResponse.json(
      { ok: false, error: "currency is required (ISO 4217 currency code)" },
      { status: 400, headers: gate.headers },
    );
  }

  if (!body.accountNumber && !body.iban) {
    return NextResponse.json(
      { ok: false, error: "at least one of accountNumber or iban is required" },
      { status: 400, headers: gate.headers },
    );
  }

  // Audit event (best-effort — never blocks main response)
  const auditEntity = body.iban ?? body.accountNumber ?? body.bankName ?? "unknown";
  try {
    writeAuditEvent("compliance_assistant", "open-banking.risk-assessment", auditEntity);
  } catch (err) {
    console.warn("[open-banking-check] writeAuditEvent failed:", err);
  }

  // Run rule-based risk scoring
  const { score, flags, ibanValid } = computeOpenBankingRisk(body);
  const riskLevel = scoreToRiskLevel(score);
  const accountRiskCategory = riskLevelToAccountCategory(riskLevel);
  const monitoringAction = riskLevelToMonitoringAction(riskLevel);
  const recommendation = buildRecommendation(riskLevel, flags);

  // Write to tamper-evident audit chain (async, non-blocking)
  void writeAuditChainEntry(
    {
      event: "open_banking.risk_assessed",
      actor: gate.keyId,
      entity: auditEntity,
      bankCountry: body.bankCountry.trim().toUpperCase(),
      accountType: body.accountType,
      riskScore: score,
      riskLevel,
      accountRiskCategory,
      monitoringAction,
      flagCount: flags.length,
      ibanValid,
    },
    tenantIdFromGate(gate),
  ).catch((err) =>
    console.warn(
      "[open-banking-check] audit chain write failed:",
      err instanceof Error ? err.message : String(err),
    ),
  );

  const result: OpenBankingRiskResult = {
    riskScore: score,
    riskLevel,
    flags,
    accountRiskCategory,
    ...(ibanValid !== undefined ? { ibanValid } : {}),
    recommendation,
    monitoringAction,
  };

  return NextResponse.json({ ok: true, ...result }, { headers: gate.headers });
}
