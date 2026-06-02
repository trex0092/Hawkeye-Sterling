// POST /api/gold-dealer-risk
//
// Gold and precious metals dealer AML risk assessment for UAE DNFBPs.
// Gold/precious metals dealers are the highest-risk DNFBP sector in the UAE,
// with cash purchases of gold being the primary money laundering vehicle.
//
// Regulatory basis:
//   - UAE FDL 10/2025 (Federal Decree-Law on AML/CFT)
//   - UAE Cabinet Decision 10/2019 Art.7 (DNFBP obligations)
//   - FATF Guidance on Dealers in Precious Metals and Stones (DPMS)
//   - Dubai Multi Commodities Centre (DMCC) Responsible Sourcing Programme
//   - UAE Central Bank Gold/Precious Metals sector guidelines

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

type TransactionType = "purchase" | "sale" | "exchange" | "refining" | "export";
type PaymentMethod = "cash" | "wire_transfer" | "cheque" | "crypto" | "barter";
type MetalType = "gold" | "silver" | "platinum" | "diamonds" | "precious_stones" | "mixed";
type CustomerType = "individual" | "corporate" | "wholesale_dealer";
type RiskLevel = "critical" | "high" | "medium" | "low";
type ReportingThreshold = "none" | "CDD" | "EDD" | "STR";

interface RequestBody {
  dealerName: string;
  licenseNumber?: string;
  countryCode: string;
  transactionValue: number;
  currency: string;
  transactionType: TransactionType;
  paymentMethod: PaymentMethod;
  metalType: MetalType;
  originCountry?: string;
  destinationCountry?: string;
  customerType: CustomerType;
  isGoaeRegistered?: boolean;
  hasKycOnFile?: boolean;
}

interface GoldDealerRiskResult {
  ok: boolean;
  riskScore: number;
  riskLevel: RiskLevel;
  flags: string[];
  amlTypologies: string[];
  uaeRegulatoryStatus: string;
  reportingThreshold: ReportingThreshold;
  recommendation: string;
  regulatoryBasis: string[];
}

// ---------------------------------------------------------------------------
// Risk scoring constants
// ---------------------------------------------------------------------------

/**
 * Conflict zone / blood gold origin countries.
 * Gold from these jurisdictions is associated with conflict minerals,
 * artisanal mining funding armed groups, and sanctions evasion.
 * Sources: UN Panel of Experts reports, OECD Due Diligence Guidance,
 * Kimberley Process Certification Scheme (KPCS).
 */
const CONFLICT_MINERAL_ORIGINS = new Set([
  "CD", // Democratic Republic of Congo
  "GN", // Guinea
  "SL", // Sierra Leone
  "LR", // Liberia
  "ZW", // Zimbabwe
  "SD", // Sudan
  "CF", // Central African Republic
]);

/**
 * Sanctioned destination countries where shipping precious metals is
 * prohibited or severely restricted under UAE/UN/OFAC sanctions regimes.
 */
const SANCTIONED_DESTINATIONS = new Set([
  "IR", // Iran
  "KP", // North Korea (DPRK)
  "SY", // Syria
  "RU", // Russia
  "BY", // Belarus
  "VE", // Venezuela
]);

/**
 * AED cash transaction reporting threshold per UAE regulations.
 * Transactions at or above AED 55,000 in cash must be reported as
 * a Cash Transaction Report (CTR) under UAE FDL 10/2025.
 */
const AED_CASH_REPORTING_THRESHOLD = 55_000;

// ---------------------------------------------------------------------------
// Scoring engine
// ---------------------------------------------------------------------------

interface ScoringResult {
  score: number;
  flags: string[];
  amlTypologies: string[];
}

function computeGoldDealerRisk(body: RequestBody): ScoringResult {
  let score = 0;
  const flags: string[] = [];
  const typologies = new Set<string>();

  // -------------------------------------------------------------------------
  // (a) Unlicensed dealer: missing licenseNumber → +30
  //     Not registered with DMCC/GOAE → +25
  // -------------------------------------------------------------------------
  if (!body.licenseNumber) {
    score += 30;
    flags.push("unlicensed_dealer:+30 (no trade license number provided)");
    typologies.add("Operating without regulatory license — primary DNFBP red flag");
  }

  if (body.isGoaeRegistered === false) {
    score += 25;
    flags.push("not_dmcc_goae_registered:+25 (dealer not registered with DMCC/regulatory authority)");
    typologies.add("Unregistered precious metals dealer — UAE DNFBP registration evasion");
  }

  // -------------------------------------------------------------------------
  // (b) Cash payment: +35
  //     Cash purchases of gold are the primary ML vehicle in the UAE DPMS sector
  // -------------------------------------------------------------------------
  if (body.paymentMethod === "cash") {
    score += 35;
    flags.push("cash_payment:+35 (cash is primary ML vehicle in UAE gold sector)");
    typologies.add("Cash-intensive precious metals purchase — placement typology");
  }

  // -------------------------------------------------------------------------
  // (c) Cash transaction exceeding AED 55,000 legal limit: +40
  //     UAE law mandates CTR filing and prohibits anonymous cash above this threshold
  // -------------------------------------------------------------------------
  if (body.paymentMethod === "cash" && body.transactionValue > AED_CASH_REPORTING_THRESHOLD) {
    score += 40;
    flags.push(
      `cash_exceeds_aed_limit:+40 (${body.transactionValue} ${body.currency} exceeds AED 55,000 cash threshold — CTR mandatory)`,
    );
    typologies.add("Large cash purchase exceeding CTR threshold — potential structuring evasion");
  }

  // -------------------------------------------------------------------------
  // (d) High-risk conflict mineral origin: +30 per country
  //     Gold from conflict zones funds armed groups and evades sanctions
  // -------------------------------------------------------------------------
  if (body.originCountry && CONFLICT_MINERAL_ORIGINS.has(body.originCountry.toUpperCase())) {
    score += 30;
    flags.push(
      `conflict_mineral_origin:+30 (${body.originCountry} — known conflict/blood gold source jurisdiction)`,
    );
    typologies.add(
      `Conflict minerals / blood gold origin (${body.originCountry}) — OECD Due Diligence Guidance red flag`,
    );
  }

  // -------------------------------------------------------------------------
  // (e) Sanctioned destination country: +40
  //     Exporting precious metals to sanctioned jurisdictions violates UAE/UN sanctions
  // -------------------------------------------------------------------------
  if (body.destinationCountry && SANCTIONED_DESTINATIONS.has(body.destinationCountry.toUpperCase())) {
    score += 40;
    flags.push(
      `sanctioned_destination:+40 (${body.destinationCountry} — sanctions target; UAE/UN/OFAC prohibitions apply)`,
    );
    typologies.add(
      `Precious metals export to sanctioned jurisdiction (${body.destinationCountry}) — sanctions evasion typology`,
    );
  }

  // -------------------------------------------------------------------------
  // (f) Cryptocurrency payment: +25
  //     Emerging typology — crypto used to layer ML proceeds before converting to gold
  // -------------------------------------------------------------------------
  if (body.paymentMethod === "crypto") {
    score += 25;
    flags.push("crypto_payment:+25 (crypto-to-gold conversion is emerging high-risk ML typology)");
    typologies.add("Cryptocurrency-to-precious metals conversion — layering typology");
  }

  // -------------------------------------------------------------------------
  // (g) No KYC on file: +25
  //     DNFBP obligations under UAE FDL 10/2025 and Cabinet Decision 10/2019
  //     require CDD for all transactions above thresholds
  // -------------------------------------------------------------------------
  if (body.hasKycOnFile === false) {
    score += 25;
    flags.push("no_kyc_on_file:+25 (DNFBP CDD requirement not met — UAE FDL 10/2025 Art.6)");
    typologies.add("CDD failure — anonymous precious metals transaction in breach of DNFBP obligations");
  }

  // -------------------------------------------------------------------------
  // (h) Refining from unknown origin: +30
  //     Refining is used to destroy provenance evidence and integrate illicit gold
  // -------------------------------------------------------------------------
  if (body.transactionType === "refining" && !body.originCountry) {
    score += 30;
    flags.push(
      "refining_unknown_origin:+30 (refining with no origin country — laundering through smelting typology)",
    );
    typologies.add("Gold refining without documented origin — integration stage ML; hides conflict/illicit gold provenance");
  }

  // -------------------------------------------------------------------------
  // (i) Wholesale dealer + cash payment: +20
  //     Wholesale cash transactions are a major typology flagged by FATF DPMS guidance
  // -------------------------------------------------------------------------
  if (body.customerType === "wholesale_dealer" && body.paymentMethod === "cash") {
    score += 20;
    flags.push("wholesale_cash:+20 (wholesale dealer cash transactions — FATF DPMS high-risk typology)");
    typologies.add("Wholesale precious metals dealer using cash — high-volume placement/structuring typology");
  }

  // -------------------------------------------------------------------------
  // (j) Diamonds / precious stones: +15
  //     Harder to trace than gold bars; used in placement and integration stages
  // -------------------------------------------------------------------------
  if (body.metalType === "diamonds" || body.metalType === "precious_stones") {
    score += 15;
    flags.push(
      `precious_stones_metal_type:+15 (${body.metalType} — harder to trace than gold; valuation opacity risk)`,
    );
    typologies.add("Diamonds/precious stones transaction — valuation manipulation and traceability evasion");
  }

  // Cap at 100
  score = Math.min(score, 100);

  return {
    score,
    flags,
    amlTypologies: Array.from(typologies),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function scoreToRiskLevel(score: number): RiskLevel {
  if (score >= 70) return "critical";
  if (score >= 45) return "high";
  if (score >= 20) return "medium";
  return "low";
}

function determineReportingThreshold(score: number, riskLevel: RiskLevel, flags: string[]): ReportingThreshold {
  // STR: any score ≥ 70, sanctioned destination, or cash above AED limit
  const hasSanctionedDest = flags.some((f) => f.startsWith("sanctioned_destination"));
  const hasCashLimitViolation = flags.some((f) => f.startsWith("cash_exceeds_aed_limit"));
  if (riskLevel === "critical" || hasSanctionedDest || hasCashLimitViolation) return "STR";
  // EDD: high risk
  if (riskLevel === "high") return "EDD";
  // CDD: medium risk
  if (riskLevel === "medium") return "CDD";
  return "none";
}

function buildUaeRegulatoryStatus(body: RequestBody, riskLevel: RiskLevel, flags: string[]): string {
  const issues: string[] = [];

  if (!body.licenseNumber) {
    issues.push("No trade license on file — DNFBP registration verification required");
  }
  if (body.isGoaeRegistered === false) {
    issues.push("DMCC/regulatory authority registration not confirmed");
  }
  if (body.hasKycOnFile === false) {
    issues.push("CDD documentation absent — UAE FDL 10/2025 Art.6 breach");
  }
  if (flags.some((f) => f.startsWith("cash_exceeds_aed_limit"))) {
    issues.push("Cash CTR filing mandatory (UAE FIU — goAML submission required within 48 hours)");
  }
  if (flags.some((f) => f.startsWith("sanctioned_destination"))) {
    issues.push("CRITICAL: Transaction to sanctioned jurisdiction — immediate STR required; halt pending compliance review");
  }

  if (issues.length === 0) {
    return riskLevel === "low"
      ? "No immediate regulatory concerns identified. Maintain standard CDD records per UAE DNFBP obligations."
      : "No specific regulatory breaches identified; enhanced monitoring recommended given risk score.";
  }

  return issues.join("; ");
}

function buildRecommendation(
  riskLevel: RiskLevel,
  reportingThreshold: ReportingThreshold,
  _flags: string[],
): string {
  switch (reportingThreshold) {
    case "STR":
      return (
        "File a Suspicious Transaction Report (STR) with UAE FIU via goAML immediately. " +
        "Halt transaction pending MLRO review. Escalate to senior compliance officer. " +
        "Apply enhanced due diligence (EDD) on all associated parties. Do not tip off the customer."
      );
    case "EDD":
      return (
        "Apply Enhanced Due Diligence (EDD): obtain source of funds documentation, verify " +
        "beneficial ownership, confirm origin documentation for metals, conduct adverse media screening " +
        "on all parties, and escalate to MLRO for written approval before processing."
      );
    case "CDD":
      return (
        "Apply standard Customer Due Diligence (CDD): verify customer identity, obtain transaction " +
        "purpose, document source of funds. Retain records for minimum 5 years per UAE FDL 10/2025."
      );
    default:
      return (
        "Maintain standard AML/CFT controls. Retain transaction records per UAE DNFBP obligations. " +
        "Monitor for cumulative transaction patterns that may trigger CDD/EDD thresholds."
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

  // Basic validation
  if (!body.dealerName || !body.countryCode || typeof body.transactionValue !== "number") {
    return NextResponse.json(
      { ok: false, error: "dealerName, countryCode, and transactionValue are required" },
      { status: 400, headers: gate.headers },
    );
  }

  try {
    writeAuditEvent("compliance_assistant", "gold-dealer.aml-risk-assessment", body.dealerName);
  } catch (err) {
    console.warn("[hawkeye] gold-dealer-risk writeAuditEvent failed:", err);
  }

  const scoring = computeGoldDealerRisk(body);
  const riskLevel = scoreToRiskLevel(scoring.score);
  const reportingThreshold = determineReportingThreshold(scoring.score, riskLevel, scoring.flags);
  const uaeRegulatoryStatus = buildUaeRegulatoryStatus(body, riskLevel, scoring.flags);
  const recommendation = buildRecommendation(riskLevel, reportingThreshold, scoring.flags);

  void writeAuditChainEntry(
    {
      event: "gold-dealer.risk_assessed",
      actor: gate.keyId,
      dealer: body.dealerName,
      countryCode: body.countryCode,
      riskScore: scoring.score,
      riskLevel,
      reportingThreshold,
      ruleFlags: scoring.flags,
    },
    tenantIdFromGate(gate),
  ).catch((err) =>
    console.warn(
      "[gold-dealer-risk] audit chain write failed:",
      err instanceof Error ? err.message : String(err),
    ),
  );

  const result: GoldDealerRiskResult = {
    ok: true,
    riskScore: scoring.score,
    riskLevel,
    flags: scoring.flags,
    amlTypologies: scoring.amlTypologies,
    uaeRegulatoryStatus,
    reportingThreshold,
    recommendation,
    regulatoryBasis: [
      "UAE FDL 10/2025",
      "FATF Guidance on Dealers in Precious Metals",
      "UAE Cabinet Decision 10/2019 Art.7",
    ],
  };

  return NextResponse.json(result, { headers: gate.headers });
}
