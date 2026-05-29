// POST /api/vara-compliance
//
// Virtual Asset / VASP regulatory compliance assessment for UAE VARA jurisdiction.
// Assesses compliance against the UAE Virtual Assets Regulatory Authority (VARA)
// Rulebook 2024, FATF Recommendation 15 (Virtual Assets), FATF Recommendation 16
// (Travel Rule for VASPs), and CBUAE VC/VASP Regulations.
//
// Regulatory basis:
//   - UAE VARA Rulebook 2024 (Virtual Assets and Related Activities Regulations)
//   - FATF R.15 (New Technologies / Virtual Assets)
//   - FATF R.16 (Wire Transfers — extended to VASPs / Travel Rule)
//   - CBUAE VC/VASP Regulations (Central Bank UAE)
//   - UAE FDL 10/2025 (Federal Decree-Law on AML/CFT)

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

type VaspType =
  | "exchange"
  | "broker_dealer"
  | "custodian"
  | "payment_service"
  | "nft_platform"
  | "defi_protocol"
  | "dao";

type LicenseCategory =
  | "VA Broker-Dealer"
  | "VA Custodian"
  | "VA Exchange"
  | "VA Lending"
  | "VA Payment"
  | "VA Management & Investment";

interface RequestBody {
  entityName: string;
  vaspType: VaspType;
  jurisdictionCode: string;
  isVaraLicensed?: boolean;
  licenseCategory?: LicenseCategory;
  travelRuleCompliant?: boolean;
  hasWalletScreening?: boolean;
  hasOnchainMonitoring?: boolean;
  kycCoveragePercent?: number;
  transactionMonitoringSystem?: string;
  coldStoragePct?: number;
}

interface VaraComplianceResult {
  ok: boolean;
  complianceScore: number;
  varaLicenseStatus: string;
  requiredCapabilities: string[];
  missingCapabilities: string[];
  recommendation: string;
  regulatoryBasis: string[];
  riskPenalty: number;
  flags: string[];
}

// ---------------------------------------------------------------------------
// Required capability matrix per VASP type
// ---------------------------------------------------------------------------

/**
 * Minimum capabilities required for each VASP type under UAE VARA Rulebook 2024.
 * All VASPs operating in or from the UAE (including ADGM / DIFC) must satisfy
 * the base set; custodians have additional cold-storage requirements.
 */
const REQUIRED_CAPABILITIES_BY_TYPE: Record<VaspType, string[]> = {
  exchange: [
    "VARA license (VA Exchange category)",
    "Travel Rule compliance (FATF R.16)",
    "KYC coverage ≥ 95%",
    "Wallet screening (OFAC / UN designations)",
    "On-chain transaction monitoring",
    "Transaction monitoring system",
  ],
  broker_dealer: [
    "VARA license (VA Broker-Dealer category)",
    "Travel Rule compliance (FATF R.16)",
    "KYC coverage ≥ 95%",
    "Wallet screening (OFAC / UN designations)",
    "On-chain transaction monitoring",
    "Transaction monitoring system",
  ],
  custodian: [
    "VARA license (VA Custodian category)",
    "Travel Rule compliance (FATF R.16)",
    "KYC coverage ≥ 95%",
    "Wallet screening (OFAC / UN designations)",
    "On-chain transaction monitoring",
    "Cold storage ≥ 85% of assets under custody",
    "Transaction monitoring system",
  ],
  payment_service: [
    "VARA license (VA Payment category)",
    "Travel Rule compliance (FATF R.16)",
    "KYC coverage ≥ 95%",
    "Wallet screening (OFAC / UN designations)",
    "On-chain transaction monitoring",
    "Transaction monitoring system",
  ],
  nft_platform: [
    "VARA license (applicable category)",
    "KYC coverage ≥ 95%",
    "Wallet screening (OFAC / UN designations)",
    "On-chain transaction monitoring",
  ],
  defi_protocol: [
    "VARA license (applicable category) — DeFi protocols are unregulated under current VARA framework",
    "Travel Rule compliance where technically feasible (FATF R.16)",
    "KYC coverage ≥ 95% where applicable",
    "Wallet screening (OFAC / UN designations)",
    "On-chain transaction monitoring",
  ],
  dao: [
    "VARA license (applicable category) — DAOs are unregulated under current VARA framework",
    "Travel Rule compliance where technically feasible (FATF R.16)",
    "KYC coverage ≥ 95% where applicable",
    "Wallet screening (OFAC / UN designations)",
    "On-chain transaction monitoring",
  ],
};

// ---------------------------------------------------------------------------
// Scoring engine
// ---------------------------------------------------------------------------

interface ScoringResult {
  penalty: number;
  flags: string[];
  missingCapabilities: string[];
}

/**
 * Compute risk penalty (0-100) against UAE VARA Rulebook 2024 + FATF R.15/R.16.
 * Each flag deducts from the maximum compliance score of 100.
 */
function computeVaraComplianceRisk(body: RequestBody): ScoringResult {
  let penalty = 0;
  const flags: string[] = [];
  const missingCapabilities: string[] = [];

  // -------------------------------------------------------------------------
  // (a) VARA license status: unlicensed VASP in UAE → +35
  //     Operating without a VARA license is illegal in the UAE and constitutes
  //     a breach of the Virtual Assets and Related Activities Regulations 2023.
  // -------------------------------------------------------------------------
  if (body.isVaraLicensed === false) {
    penalty += 35;
    flags.push("unlicensed_vasp:+35 (operating without VARA license is illegal in UAE)");
    missingCapabilities.push("VARA license — mandatory for all VASPs operating in/from UAE");
  }

  // -------------------------------------------------------------------------
  // (b) Travel Rule compliance (FATF R.16 extended to VASPs):
  //     Non-compliant → +25
  //     UAE mandated Travel Rule for VASPs since 2024 under FATF R.16 guidance.
  //     VASPs must transmit originator/beneficiary information for transfers ≥ USD 1,000.
  // -------------------------------------------------------------------------
  if (body.travelRuleCompliant === false) {
    penalty += 25;
    flags.push(
      "travel_rule_non_compliant:+25 (FATF R.16 Travel Rule mandatory for UAE VASPs since 2024)",
    );
    missingCapabilities.push("Travel Rule compliance (FATF R.16) — originator/beneficiary data transmission");
  }

  // -------------------------------------------------------------------------
  // (c) KYC coverage below VARA threshold: < 95% → +20
  //     VARA Rulebook 2024 requires near-100% KYC for all VA activity customers.
  //     Any gap below 95% constitutes a material compliance failure.
  // -------------------------------------------------------------------------
  if (typeof body.kycCoveragePercent === "number" && body.kycCoveragePercent < 95) {
    penalty += 20;
    flags.push(
      `kyc_coverage_insufficient:+20 (${body.kycCoveragePercent}% KYC coverage — VARA requires ≥ 95%)`,
    );
    missingCapabilities.push(`KYC coverage improvement required (current: ${body.kycCoveragePercent}%, required: ≥ 95%)`);
  }

  // -------------------------------------------------------------------------
  // (d) Cold storage ratio for custodians: < 85% → +10
  //     VARA Rulebook 2024 requires custodians to maintain ≥ 85% of client
  //     assets in cold (offline) storage to mitigate operational/cyber risk.
  // -------------------------------------------------------------------------
  if (
    body.vaspType === "custodian" &&
    typeof body.coldStoragePct === "number" &&
    body.coldStoragePct < 85
  ) {
    penalty += 10;
    flags.push(
      `cold_storage_insufficient:+10 (${body.coldStoragePct}% cold storage — VARA requires ≥ 85% for custodians)`,
    );
    missingCapabilities.push(
      `Cold storage ratio improvement required (current: ${body.coldStoragePct}%, required: ≥ 85%)`,
    );
  }

  // -------------------------------------------------------------------------
  // (e) DeFi protocol / DAO: unregulated category under VARA → +20
  //     DeFi protocols and DAOs currently fall outside the VARA licensing
  //     framework, making them inherently high-risk for UAE AML/CFT compliance.
  //     FATF June 2021 guidance treats DeFi as a VASP if it provides VA services.
  // -------------------------------------------------------------------------
  if (body.vaspType === "defi_protocol" || body.vaspType === "dao") {
    penalty += 20;
    flags.push(
      `unregulated_vasp_category:+20 (${body.vaspType} — unregulated under current VARA framework; inherently high-risk)`,
    );
    missingCapabilities.push(
      `Regulatory classification clarification required — ${body.vaspType} may constitute unlicensed VASP activity under FATF guidance`,
    );
  }

  // -------------------------------------------------------------------------
  // (f) No on-chain monitoring: → +20
  //     VARA Rulebook 2024 requires all licensed VASPs to implement real-time
  //     on-chain transaction monitoring to detect mixing, darknet exposure,
  //     and sanctions-designated wallet interactions.
  // -------------------------------------------------------------------------
  if (body.hasOnchainMonitoring === false) {
    penalty += 20;
    flags.push(
      "no_onchain_monitoring:+20 (on-chain monitoring required for UAE VASPs per VARA Rulebook 2024)",
    );
    missingCapabilities.push(
      "On-chain transaction monitoring — required to detect mixing services, darknet wallets, sanctioned addresses",
    );
  }

  // -------------------------------------------------------------------------
  // (g) No wallet screening: → +15
  //     VARA requires screening all wallet addresses against OFAC SDN List,
  //     UN Security Council Consolidated List, and UAE Local Terrorist Designations
  //     before processing any virtual asset transaction.
  // -------------------------------------------------------------------------
  if (body.hasWalletScreening === false) {
    penalty += 15;
    flags.push(
      "no_wallet_screening:+15 (wallet screening required against OFAC/UN designations per VARA)",
    );
    missingCapabilities.push(
      "Wallet screening solution — required for OFAC SDN, UN Consolidated List, UAE Local Terrorist Designations",
    );
  }

  // Cap penalty at 100
  penalty = Math.min(penalty, 100);

  return { penalty, flags, missingCapabilities };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map penalty score to a compliance score (100 = fully compliant, 0 = non-compliant). */
function penaltyToComplianceScore(penalty: number): number {
  return Math.max(0, 100 - penalty);
}

function buildVaraLicenseStatus(body: RequestBody): string {
  if (body.isVaraLicensed === false) {
    return (
      "UNLICENSED — Entity is not licensed by UAE VARA. " +
      "Operating virtual asset services without a VARA license is illegal under the " +
      "Virtual Assets and Related Activities Regulations 2023 and UAE FDL 10/2025."
    );
  }
  if (body.isVaraLicensed === true) {
    const category = body.licenseCategory
      ? ` (${body.licenseCategory})`
      : " (category not specified)";
    return `VARA LICENSED${category} — Entity holds a valid VARA license. Ongoing compliance obligations apply under VARA Rulebook 2024.`;
  }
  return "LICENSE STATUS UNKNOWN — VARA license status not provided. Verification required before onboarding or processing transactions.";
}

function buildRecommendation(complianceScore: number, flags: string[]): string {
  const isUnlicensed = flags.some((f) => f.startsWith("unlicensed_vasp"));
  const isUnregulated = flags.some((f) => f.startsWith("unregulated_vasp_category"));

  if (isUnlicensed) {
    return (
      "REJECT / DO NOT ONBOARD: Entity is operating without a VARA license in the UAE. " +
      "File a Suspicious Activity Report (SAR/STR) with UAE FIU via goAML if there is suspicion of " +
      "financial crime. Escalate immediately to MLRO. Do not tip off the entity."
    );
  }

  if (complianceScore < 40) {
    return (
      "HIGH RISK — REJECT or apply Stringent Enhanced Due Diligence: Multiple critical VARA compliance " +
      "gaps identified. Do not process transactions until Travel Rule compliance, wallet screening, and " +
      "on-chain monitoring are confirmed operational. Escalate to MLRO for written sign-off."
    );
  }

  if (complianceScore < 65) {
    return (
      "ELEVATED RISK — Apply Enhanced Due Diligence (EDD): Significant VARA compliance gaps require " +
      "remediation before or alongside onboarding. Obtain written compliance attestation from the entity's " +
      "MLRO/compliance officer. Set 90-day remediation deadline with MLRO approval required to continue. " +
      (isUnregulated
        ? "Note: DeFi/DAO entities carry inherent regulatory risk under current UAE framework. "
        : "") +
      "Review quarterly."
    );
  }

  if (complianceScore < 85) {
    return (
      "MODERATE RISK — Apply standard Enhanced Due Diligence: Minor VARA compliance gaps identified. " +
      "Obtain documentation confirming remediation timeline. Apply ongoing monitoring with enhanced " +
      "transaction-level screening. Review compliance status at next annual CDD refresh."
    );
  }

  return (
    "COMPLIANT — Entity meets UAE VARA Rulebook 2024 requirements. Apply standard CDD controls, " +
    "maintain transaction monitoring, and conduct annual VARA compliance re-verification. " +
    "Ensure ongoing Travel Rule and wallet screening obligations are met for all VA transfers."
  );
}

function getRequiredCapabilities(vaspType: VaspType): string[] {
  return REQUIRED_CAPABILITIES_BY_TYPE[vaspType] ?? [];
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
  if (!body.entityName || !body.vaspType || !body.jurisdictionCode) {
    return NextResponse.json(
      { ok: false, error: "entityName, vaspType, and jurisdictionCode are required" },
      { status: 400, headers: gate.headers },
    );
  }

  const validVaspTypes: VaspType[] = [
    "exchange",
    "broker_dealer",
    "custodian",
    "payment_service",
    "nft_platform",
    "defi_protocol",
    "dao",
  ];
  if (!validVaspTypes.includes(body.vaspType)) {
    return NextResponse.json(
      {
        ok: false,
        error: `Invalid vaspType. Must be one of: ${validVaspTypes.join(", ")}`,
      },
      { status: 400, headers: gate.headers },
    );
  }

  try {
    writeAuditEvent("analyst", "vara-compliance.assessment", body.entityName);
  } catch (err) {
    console.warn("[hawkeye] vara-compliance writeAuditEvent failed:", err);
  }

  const scoring = computeVaraComplianceRisk(body);
  const complianceScore = penaltyToComplianceScore(scoring.penalty);
  const varaLicenseStatus = buildVaraLicenseStatus(body);
  const requiredCapabilities = getRequiredCapabilities(body.vaspType);
  const recommendation = buildRecommendation(complianceScore, scoring.flags);

  void writeAuditChainEntry(
    {
      event: "vara-compliance.assessed",
      actor: gate.keyId,
      entity: body.entityName,
      vaspType: body.vaspType,
      jurisdictionCode: body.jurisdictionCode,
      complianceScore,
      riskPenalty: scoring.penalty,
      ruleFlags: scoring.flags,
    },
    tenantIdFromGate(gate),
  ).catch((err) =>
    console.warn(
      "[vara-compliance] audit chain write failed:",
      err instanceof Error ? err.message : String(err),
    ),
  );

  const result: VaraComplianceResult = {
    ok: true,
    complianceScore,
    varaLicenseStatus,
    requiredCapabilities,
    missingCapabilities: scoring.missingCapabilities,
    recommendation,
    regulatoryBasis: [
      "UAE VARA Rulebook 2024",
      "FATF R.15 (Virtual Assets)",
      "FATF R.16 (Wire Transfers)",
      "CBUAE VC/VASP Regulations",
    ],
    riskPenalty: scoring.penalty,
    flags: scoring.flags,
  };

  return NextResponse.json(result, { headers: gate.headers });
}
