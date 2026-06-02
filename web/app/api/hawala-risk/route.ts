// POST /api/hawala-risk
// Hawala / Informal Value Transfer System (IVTS) risk assessment.
// Implements FATF Guidance on Hawala (2013) and UAE FDL 10/2025 Art.14
// scoring logic covering unregistered MTO status, high-risk corridor pairs,
// volume thresholds, counterparty sanctions exposure, and record-keeping gaps.

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

interface RequestBody {
  entityName: string;
  entityType: "individual" | "corporate";
  countryCode: string;
  hawalaCodes?: string[];
  transactionPattern?: string;
  networkSize?: number;
  monthlyVolume?: number;
  primaryCurrency?: string;
  counterpartyCountries?: string[];
  isRegisteredMTO: boolean;
  regulatoryId?: string;
}

type RiskLevel = "critical" | "high" | "medium" | "low";

interface HawalaRiskResult {
  ok: true;
  riskScore: number;
  riskLevel: RiskLevel;
  flags: string[];
  ivtsTypologies: string[];
  uaeRegulatoryStatus: string;
  recommendation: string;
  regulatoryBasis: string[];
}

// ---------------------------------------------------------------------------
// Risk scoring constants
// ---------------------------------------------------------------------------

/**
 * High-risk IVTS hawala corridor pairs (source → destination country code).
 * Based on FATF Guidance on Hawala 2013 §3 and MENAFATF regional assessments.
 * Format: "SRC→DST" using ISO 3166-1 alpha-2 codes.
 */
const HIGH_RISK_CORRIDORS = new Set<string>([
  "IN→AE",
  "PK→AE",
  "AE→IR",
  "AE→AF",
  "AE→SY",
  "AE→YE",
  "NG→AE",
  "AE→SO",
]);

/**
 * FATF/UN sanctioned country codes (ISO 3166-1 alpha-2).
 * Matching any counterparty country adds +30, capped at +50 total.
 */
const SANCTIONED_COUNTRIES = new Set<string>([
  "IR", // Iran — FATF High-Risk (non-cooperative)
  "KP", // North Korea — FATF High-Risk (non-cooperative), UN sanctions
  "SY", // Syria — US/EU/UN sanctions
  "BY", // Belarus — EU/US/UK sanctions (2022)
  "RU", // Russia — OFAC/EU/UK sanctions (2022)
  "YE", // Yemen — UN arms embargo, FATF high-risk corridor
  "SD", // Sudan — US sanctions (Specially Designated Country)
]);

/**
 * Accepted low-risk mainstream currencies. All other currencies trigger
 * the exotic currency routing penalty.
 */
const MAINSTREAM_CURRENCIES = new Set<string>(["AED", "USD", "EUR", "GBP"]);

// ---------------------------------------------------------------------------
// Scoring engine
// ---------------------------------------------------------------------------

interface ScoringResult {
  rawScore: number;
  riskScore: number;
  flags: string[];
  ivtsTypologies: string[];
}

function computeHawalaRisk(body: RequestBody): ScoringResult {
  let score = 0;
  const flags: string[] = [];
  const ivtsTypologies: string[] = [];

  const src = (body.countryCode ?? "").toUpperCase().trim();

  // -------------------------------------------------------------------------
  // (a) Unregistered MTO — illegal in UAE under FDL 10/2025 Art.14: +40
  // -------------------------------------------------------------------------
  if (!body.isRegisteredMTO) {
    score += 40;
    flags.push("UNREGISTERED_MTO:+40 — operating without MTO licence is illegal in UAE (FDL 10/2025 Art.14)");
    ivtsTypologies.push("Unlicensed money or value transfer service (FATF R.14)");
  }

  // -------------------------------------------------------------------------
  // (b) High-risk hawala corridors: +20 per matched corridor
  // -------------------------------------------------------------------------
  const counterpartyCountries = Array.isArray(body.counterpartyCountries)
    ? body.counterpartyCountries.map((c) => c.toUpperCase().trim()).filter(Boolean)
    : [];

  // Build all corridor pairs: entity's country against each counterparty country.
  const corridorMatches: string[] = [];
  if (src) {
    for (const dst of counterpartyCountries) {
      const pair = `${src}→${dst}`;
      const reverse = `${dst}→${src}`;
      if (HIGH_RISK_CORRIDORS.has(pair)) {
        corridorMatches.push(pair);
      } else if (HIGH_RISK_CORRIDORS.has(reverse)) {
        corridorMatches.push(reverse);
      }
    }
  }
  // Also check the entity's own country as a destination from a known source.
  if (src) {
    const selfSrcPairs = [...HIGH_RISK_CORRIDORS].filter(
      (corridor) => corridor.startsWith(`${src}→`) || corridor.endsWith(`→${src}`),
    );
    // Only count self-country match if no counterparty countries provided to avoid
    // double-counting with the loop above.
    if (counterpartyCountries.length === 0 && selfSrcPairs.length > 0) {
      corridorMatches.push(...selfSrcPairs);
    }
  }

  const uniqueCorridors = [...new Set(corridorMatches)];
  if (uniqueCorridors.length > 0) {
    const corridorPenalty = uniqueCorridors.length * 20;
    score += corridorPenalty;
    for (const corridor of uniqueCorridors) {
      flags.push(`HIGH_RISK_CORRIDOR:+20 — ${corridor} (FATF Guidance on Hawala §3)`);
    }
    ivtsTypologies.push("High-risk IVTS corridor activity");
  }

  // -------------------------------------------------------------------------
  // (c) Volume threshold: unregistered = higher penalty
  //     > 100,000 AED unregistered: +25
  //     > 1,000,000 AED: +40 (replaces the +25, additive only if unregistered)
  // -------------------------------------------------------------------------
  const volume = typeof body.monthlyVolume === "number" ? body.monthlyVolume : 0;
  if (volume > 1_000_000) {
    score += 40;
    flags.push(`VOLUME_CRITICAL:+40 — monthly volume ${volume.toLocaleString()} AED exceeds 1,000,000 AED threshold`);
    ivtsTypologies.push("High-volume informal transfer (FATF Guidance on Hawala §4.2)");
  } else if (volume > 100_000 && !body.isRegisteredMTO) {
    score += 25;
    flags.push(`VOLUME_HIGH_UNREGISTERED:+25 — monthly volume ${volume.toLocaleString()} AED exceeds 100,000 AED for unregistered MTO`);
    ivtsTypologies.push("High-volume unregistered IVTS (FATF Guidance on Hawala §4.2)");
  }

  // -------------------------------------------------------------------------
  // (d) Network size: > 50 counterparties = professional hawaladar: +20
  // -------------------------------------------------------------------------
  const networkSize = typeof body.networkSize === "number" ? body.networkSize : 0;
  if (networkSize > 50) {
    score += 20;
    flags.push(`LARGE_NETWORK:+20 — ${networkSize} counterparties suggests professional hawaladar operation`);
    ivtsTypologies.push("Professional hawaladar network (FATF Guidance on Hawala §2.1)");
  }

  // -------------------------------------------------------------------------
  // (e) Incomplete hawala code records: +15
  //     Hawala codes are unique settlement identifiers; absence = record-keeping failure
  // -------------------------------------------------------------------------
  const hawalaCodes = body.hawalaCodes;
  const missingCodes =
    hawalaCodes === undefined ||
    hawalaCodes === null ||
    (Array.isArray(hawalaCodes) && hawalaCodes.filter((c) => c && c.trim()).length === 0);
  if (missingCodes) {
    score += 15;
    flags.push("MISSING_HAWALA_CODES:+15 — no settlement identifiers provided; record-keeping failure (FATF R.10)");
    ivtsTypologies.push("Incomplete IVTS record-keeping (FATF Recommendation 10)");
  }

  // -------------------------------------------------------------------------
  // (f) Sanctioned counterparty countries: +30 each, cap at +50 total
  // -------------------------------------------------------------------------
  const sanctionedMatches = counterpartyCountries.filter((c) => SANCTIONED_COUNTRIES.has(c));
  if (sanctionedMatches.length > 0) {
    const rawSanctionPenalty = sanctionedMatches.length * 30;
    const sanctionPenalty = Math.min(rawSanctionPenalty, 50);
    score += sanctionPenalty;
    for (const country of sanctionedMatches) {
      flags.push(`SANCTIONED_COUNTERPARTY:+30 — counterparty country ${country} is under international sanctions`);
    }
    if (rawSanctionPenalty > 50) {
      flags.push(`SANCTION_CAP_APPLIED — penalty capped at +50 (raw: +${rawSanctionPenalty})`);
    }
    ivtsTypologies.push("IVTS transactions with sanctioned jurisdictions (FATF R.6/R.7)");
  }

  // -------------------------------------------------------------------------
  // (g) Exotic currency routing: +10
  //     Primary currency outside AED/USD/EUR/GBP indicates indirect routing risk
  // -------------------------------------------------------------------------
  const primaryCurrency = (body.primaryCurrency ?? "").toUpperCase().trim();
  if (primaryCurrency && !MAINSTREAM_CURRENCIES.has(primaryCurrency)) {
    score += 10;
    flags.push(`EXOTIC_CURRENCY:+10 — primary currency ${primaryCurrency} suggests indirect routing (not AED/USD/EUR/GBP)`);
    ivtsTypologies.push("Exotic currency routing (FATF Guidance on Hawala §4.3)");
  }

  const rawScore = score;
  const riskScore = Math.min(score, 100);

  return { rawScore, riskScore, flags, ivtsTypologies };
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

function buildRegulatoryStatus(body: RequestBody, riskLevel: RiskLevel): string {
  if (!body.isRegisteredMTO) {
    return "NON-COMPLIANT: Entity is operating as an unregistered MTO/hawala dealer. This is a criminal offence under UAE Federal Decree-Law No. 10 of 2025 (Anti-Money Laundering Law) Article 14. Immediate referral to the UAE Central Bank CBUAE for enforcement action is required.";
  }
  if (riskLevel === "critical" || riskLevel === "high") {
    return `REGISTERED BUT HIGH-RISK: Entity holds MTO registration${body.regulatoryId ? ` (ID: ${body.regulatoryId})` : ""} however exhibits significant IVTS risk factors requiring Enhanced Due Diligence (EDD) and potential Suspicious Activity Report (SAR) filing.`;
  }
  return `REGISTERED: Entity holds MTO registration${body.regulatoryId ? ` (ID: ${body.regulatoryId})` : ""}. Maintain standard CDD monitoring consistent with FATF Recommendation 14.`;
}

function buildRecommendation(body: RequestBody, riskLevel: RiskLevel, flags: string[]): string {
  const parts: string[] = [];

  if (!body.isRegisteredMTO) {
    parts.push("IMMEDIATE ACTION: File a Suspicious Activity Report (SAR) with the UAE Financial Intelligence Unit (UAEFIU) and escalate to Compliance for regulatory referral to CBUAE.");
  } else if (riskLevel === "critical") {
    parts.push("File a SAR with UAEFIU and freeze transactions pending enhanced review.");
  } else if (riskLevel === "high") {
    parts.push("Initiate Enhanced Due Diligence (EDD). Obtain source-of-funds documentation and verify hawala code settlement records. Consider SAR filing.");
  } else if (riskLevel === "medium") {
    parts.push("Apply Customer Due Diligence (CDD) enhancements. Request hawala code records and transaction purpose documentation.");
  } else {
    parts.push("Continue standard monitoring. Verify MTO registration status periodically.");
  }

  if (flags.some((f) => f.startsWith("SANCTIONED_COUNTERPARTY"))) {
    parts.push("Immediately escalate sanctioned counterparty exposure to Compliance and Legal. Potential OFAC/UN sanctions breach.");
  }

  if (flags.some((f) => f.startsWith("HIGH_RISK_CORRIDOR"))) {
    parts.push("Apply FATF Guidance on Hawala §3 corridor controls: verify legitimate remittance purpose and source of funds for all matched corridors.");
  }

  if (flags.some((f) => f.startsWith("MISSING_HAWALA_CODES"))) {
    parts.push("Require submission of hawala settlement codes (unique transaction identifiers) to satisfy FATF Recommendation 10 record-keeping obligations.");
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
  if (!body.entityName || typeof body.entityName !== "string") {
    return NextResponse.json(
      { ok: false, error: "entityName is required" },
      { status: 422, headers: gate.headers },
    );
  }
  if (!body.countryCode || typeof body.countryCode !== "string") {
    return NextResponse.json(
      { ok: false, error: "countryCode is required" },
      { status: 422, headers: gate.headers },
    );
  }
  if (typeof body.isRegisteredMTO !== "boolean") {
    return NextResponse.json(
      { ok: false, error: "isRegisteredMTO (boolean) is required" },
      { status: 422, headers: gate.headers },
    );
  }

  try {
    writeAuditEvent("compliance_assistant", "hawala.ivts-risk-assessment", body.entityName);
  } catch (err) {
    console.warn("[hawkeye] hawala-risk writeAuditEvent failed:", err);
  }

  // Run the deterministic rule-based scoring engine.
  const scoring = computeHawalaRisk(body);
  const riskLevel = scoreToRiskLevel(scoring.riskScore);
  const uaeRegulatoryStatus = buildRegulatoryStatus(body, riskLevel);
  const recommendation = buildRecommendation(body, riskLevel, scoring.flags);

  // Deduplicate IVTS typologies.
  const ivtsTypologies = [...new Set(scoring.ivtsTypologies)];

  const regulatoryBasis: string[] = [
    "UAE FDL 10/2025 Art.14",
    "FATF Guidance on Hawala 2013",
    "FATF R.14 (Money or Value Transfer Services)",
  ];

  void writeAuditChainEntry(
    {
      event: "hawala.risk_assessed",
      actor: gate.keyId,
      entity: body.entityName,
      entityType: body.entityType,
      countryCode: body.countryCode,
      riskScore: scoring.riskScore,
      riskLevel,
      isRegisteredMTO: body.isRegisteredMTO,
      flagCount: scoring.flags.length,
      flags: scoring.flags,
    },
    tenantIdFromGate(gate),
  ).catch((err) =>
    console.warn(
      "[hawala-risk] audit chain write failed:",
      err instanceof Error ? err.message : String(err),
    ),
  );

  const result: HawalaRiskResult = {
    ok: true,
    riskScore: scoring.riskScore,
    riskLevel,
    flags: scoring.flags,
    ivtsTypologies,
    uaeRegulatoryStatus,
    recommendation,
    regulatoryBasis,
  };

  return NextResponse.json(result, { headers: gate.headers });
}
