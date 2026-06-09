import { NextResponse } from "next/server";
import { writeAuditEvent } from "@/lib/audit";
import { enforce } from "@/lib/server/enforce";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { sanitizeField } from "@/lib/server/sanitize-prompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RiskLevel = "critical" | "high" | "medium" | "low";
type NgoSector =
  | "humanitarian"
  | "religious"
  | "advocacy"
  | "development"
  | "education"
  | "health"
  | "other";

interface RequestBody {
  organizationName: string;
  registrationNumber?: string;
  countryCode: string;
  operatingCountries: string[];
  fundingSources: string[];
  beneficiaries?: string;
  annualBudget?: number;
  hasGovernmentFunding?: boolean;
  hasForeignFunding?: boolean;
  foreignFundingCountries?: string[];
  isRegistered: boolean;
  sector: NgoSector;
}

interface NgoRiskResponse {
  riskScore: number;
  riskLevel: RiskLevel;
  flags: string[];
  cftRisks: string[];
  uaeComplianceStatus: string;
  recommendation: string;
  regulatoryBasis: string[];
}

// ---------------------------------------------------------------------------
// Risk data sets
// ---------------------------------------------------------------------------

/**
 * Active conflict zone country codes per FATF R.8 and UNOCHA assessments.
 * Operations in these jurisdictions raise terrorism financing exposure.
 */
const CONFLICT_ZONE_COUNTRIES = new Set([
  "AF", // Afghanistan
  "SY", // Syria
  "YE", // Yemen
  "SO", // Somalia
  "LY", // Libya
  "MM", // Myanmar
  "SD", // Sudan
  "ML", // Mali
  "CF", // Central African Republic
  "NE", // Niger
  "NG", // Nigeria (North-East)
  "IQ", // Iraq
]);

/**
 * FATF grey-list and blacklist country codes (as of early 2025).
 * Foreign funding routed through these jurisdictions warrants elevated scrutiny.
 */
const FATF_HIGH_RISK_COUNTRIES = new Set([
  // Blacklist (FATF "Call for Action")
  "KP", // North Korea
  "IR", // Iran
  "MM", // Myanmar
  // Grey-list
  "AF", // Afghanistan
  "AL", // Albania
  "BJ", // Benin
  "BF", // Burkina Faso
  "CM", // Cameroon
  "KH", // Cambodia
  "CG", // Congo
  "HR", // Croatia
  "HT", // Haiti
  "JM", // Jamaica
  "JO", // Jordan
  "ML", // Mali
  "MZ", // Mozambique
  "NA", // Namibia
  "NG", // Nigeria
  "PH", // Philippines
  "SN", // Senegal
  "ZA", // South Africa
  "SS", // South Sudan
  "SY", // Syria
  "TZ", // Tanzania
  "VU", // Vanuatu
  "VN", // Vietnam
  "YE", // Yemen
]);

/**
 * Terrorism-related keyword patterns for name similarity checks.
 * Per FATF R.8 and UAE designated list obligations (Cabinet Decision 10/2019).
 */
const TERRORIST_KEYWORDS = [
  "jihad",
  "mujahideen",
  "caliphate",
  "isis",
  "isil",
  "hamas",
  "hezbollah",
];

// ---------------------------------------------------------------------------
// Scoring helpers
// ---------------------------------------------------------------------------

interface ScoringResult {
  score: number;
  flags: string[];
  cftRisks: string[];
}

/**
 * Deterministic rule-based CFT risk scoring per FATF R.8 and
 * Cabinet Resolution No. (134) of 2025.
 */
function computeNgoRiskScore(body: RequestBody): ScoringResult {
  let score = 0;
  const flags: string[] = [];
  const cftRisks: string[] = [];

  // (a) Unregistered NGO: +40 (illegal operation in UAE)
  if (!body.isRegistered) {
    score += 40;
    flags.push("unregistered_entity:+40");
    cftRisks.push(
      "Unregistered entity — operating without regulatory oversight is prohibited under UAE Cabinet Decision No. 10/2019 and Federal Decree-Law No. 10 of 2025 Art.14",
    );
  }

  // (b) Conflict zone operations: +25 per country, cap at +50
  const conflictCountries = (body.operatingCountries ?? []).filter((c) =>
    CONFLICT_ZONE_COUNTRIES.has(c.toUpperCase()),
  );
  if (conflictCountries.length > 0) {
    const conflictPenalty = Math.min(conflictCountries.length * 25, 50);
    score += conflictPenalty;
    flags.push(
      `conflict_zone_operations:+${conflictPenalty} (${conflictCountries.join(", ")})`,
    );
    cftRisks.push(
      `Operations in active conflict zone(s): ${conflictCountries.join(", ")} — elevated terrorism financing channel risk per FATF R.8`,
    );
  }

  // (c) Unidentified foreign funding: hasForeignFunding=true with no countries listed → +30
  if (
    body.hasForeignFunding === true &&
    (!body.foreignFundingCountries || body.foreignFundingCountries.length === 0)
  ) {
    score += 30;
    flags.push("unidentified_foreign_funding:+30");
    cftRisks.push(
      "Foreign funding declared but source countries not disclosed — opacity prevents effective CFT due diligence",
    );
  }

  // (d) High-risk funding source countries: any foreignFundingCountries on FATF grey/blacklist → +20
  const highRiskFundingCountries = (body.foreignFundingCountries ?? []).filter((c) =>
    FATF_HIGH_RISK_COUNTRIES.has(c.toUpperCase()),
  );
  if (highRiskFundingCountries.length > 0) {
    score += 20;
    flags.push(
      `fatf_high_risk_funding_countries:+20 (${highRiskFundingCountries.join(", ")})`,
    );
    cftRisks.push(
      `Funding sourced from FATF grey/blacklisted jurisdiction(s): ${highRiskFundingCountries.join(", ")}`,
    );
  }

  // (e) Religious sector operating in conflict zones: additional +20
  if (body.sector === "religious" && conflictCountries.length > 0) {
    score += 20;
    flags.push("religious_sector_conflict_zone:+20");
    cftRisks.push(
      "Religious sector NGO with conflict-zone operations — highest CFT risk category per FATF R.8 guidance",
    );
  }

  // (f) Anonymous/cash/crypto funding sources: +25 each
  const anonymousSources = (body.fundingSources ?? []).filter((src) => {
    const s = src.toLowerCase();
    return s.includes("anonymous") || s.includes("crypto") || s.includes("cash");
  });
  for (const src of anonymousSources) {
    score += 25;
    flags.push(`anonymous_funding_source:+25 ("${src}")`);
    cftRisks.push(
      `Anonymous/untraceable funding source detected: "${src}" — prevents beneficial owner identification required under Federal Decree-Law No. 10 of 2025 Art.14`,
    );
  }

  // (g) High budget + unregistered: annualBudget > 500,000 AED + isRegistered=false → +30
  if (!body.isRegistered && typeof body.annualBudget === "number" && body.annualBudget > 500_000) {
    score += 30;
    flags.push(
      `high_budget_unregistered:+30 (AED ${body.annualBudget.toLocaleString()} budget, unregistered)`,
    );
    cftRisks.push(
      "Large budget (>500,000 AED) held by an unregistered entity — significant financial activity without regulatory accountability",
    );
  }

  // (h) No government oversight + large budget (>1M AED): +15
  if (
    body.hasGovernmentFunding === false &&
    typeof body.annualBudget === "number" &&
    body.annualBudget > 1_000_000
  ) {
    score += 15;
    flags.push("no_government_oversight_large_budget:+15");
    cftRisks.push(
      "No government funding or oversight linkage for an entity managing >1M AED — reduced regulatory visibility",
    );
  }

  // (i) Name matches terrorist entity keywords: +50
  const orgNameLower = (body.organizationName ?? "").toLowerCase();
  const matchedKeywords = TERRORIST_KEYWORDS.filter((kw) => orgNameLower.includes(kw));
  if (matchedKeywords.length > 0) {
    score += 50;
    flags.push(
      `name_matches_terrorist_entity:+50 (keywords: ${matchedKeywords.join(", ")})`,
    );
    cftRisks.push(
      `Organization name contains designated terrorist entity keyword(s): "${matchedKeywords.join(", ")}" — mandatory name-match referral to CBUAE/NAMLCFTC per Cabinet Decision No. 10/2019`,
    );
  }

  // Cap at 100
  score = Math.min(score, 100);

  return { score, flags, cftRisks };
}

/** Map numeric 0-100 score to risk level tier. */
function scoreToRiskLevel(score: number): RiskLevel {
  if (score >= 70) return "critical";
  if (score >= 45) return "high";
  if (score >= 20) return "medium";
  return "low";
}

/** Derive UAE regulatory compliance status string from risk level and registration status. */
function deriveUaeComplianceStatus(
  riskLevel: RiskLevel,
  isRegistered: boolean,
  flags: string[],
): string {
  const nameMatch = flags.some((f) => f.startsWith("name_matches_terrorist_entity"));

  if (nameMatch) {
    return "NON_COMPLIANT — Mandatory referral to NAMLCFTC/CBUAE required under Cabinet Decision No. 10/2019";
  }
  if (!isRegistered) {
    return "NON_COMPLIANT — Registration with UAE regulatory authority required before operations may continue";
  }
  if (riskLevel === "critical") {
    return "NON_COMPLIANT — Enhanced due diligence mandatory; operations should be suspended pending MLRO review";
  }
  if (riskLevel === "high") {
    return "ELEVATED_RISK — Enhanced due diligence and MLRO sign-off required before relationship continues";
  }
  if (riskLevel === "medium") {
    return "REQUIRES_REVIEW — Standard due diligence with additional documentation; annual monitoring required";
  }
  return "COMPLIANT — Standard ongoing monitoring applies under UAE Federal Decree-Law No. 10 of 2025";
}

/** Generate a concise recommendation string from the scoring result. */
function buildRecommendation(
  riskLevel: RiskLevel,
  isRegistered: boolean,
  flags: string[],
): string {
  const nameMatch = flags.some((f) => f.startsWith("name_matches_terrorist_entity"));
  const conflictOps = flags.some((f) => f.startsWith("conflict_zone_operations"));
  const anonFunding = flags.some((f) => f.startsWith("anonymous_funding_source"));

  if (nameMatch) {
    return (
      "Immediately escalate to MLRO and refer to NAMLCFTC. Freeze any pending transactions. " +
      "Do not onboard or continue the relationship until name-match cleared by compliance authority."
    );
  }
  if (!isRegistered) {
    return (
      "Reject or suspend engagement until UAE registration documentation is provided and verified. " +
      "File an internal suspicious activity report (iSAR) if funds have already been processed."
    );
  }
  if (riskLevel === "critical") {
    return (
      "Mandatory EDD: obtain audited financials, complete beneficial ownership chain, verify all foreign " +
      "funding sources, conduct site visit or third-party verification of operations. MLRO sign-off required."
    );
  }
  if (riskLevel === "high") {
    const extras: string[] = [];
    if (conflictOps) extras.push("obtain field-level operational reports for conflict-zone activity");
    if (anonFunding) extras.push("require full donor disclosure and eliminate anonymous funding channels");
    return (
      "Apply EDD: " +
      (extras.length > 0 ? extras.join("; ") + ". " : "") +
      "Annual re-assessment and ongoing transaction monitoring required."
    );
  }
  if (riskLevel === "medium") {
    return (
      "Apply standard CDD with enhanced documentation on funding sources. " +
      "Conduct annual review and monitor for changes in operating countries or funding structure."
    );
  }
  return "Apply standard CDD. Periodic review on 24-month cycle unless risk profile changes.";
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
      { ok: false, error: "Invalid JSON" },
      { status: 400, headers: gate.headers },
    );
  }

  // Basic validation
  if (!body.organizationName || typeof body.organizationName !== "string") {
    return NextResponse.json(
      { ok: false, error: "organizationName is required" },
      { status: 400, headers: gate.headers },
    );
  }
  if (!body.countryCode || typeof body.countryCode !== "string") {
    return NextResponse.json(
      { ok: false, error: "countryCode is required" },
      { status: 400, headers: gate.headers },
    );
  }
  if (!Array.isArray(body.operatingCountries)) {
    return NextResponse.json(
      { ok: false, error: "operatingCountries must be an array" },
      { status: 400, headers: gate.headers },
    );
  }
  if (!Array.isArray(body.fundingSources)) {
    return NextResponse.json(
      { ok: false, error: "fundingSources must be an array" },
      { status: 400, headers: gate.headers },
    );
  }
  if (typeof body.isRegistered !== "boolean") {
    return NextResponse.json(
      { ok: false, error: "isRegistered must be a boolean" },
      { status: 400, headers: gate.headers },
    );
  }

  // Sanitize the organization name before use in audit events
  const orgName = sanitizeField(body.organizationName, 500);

  try {
    writeAuditEvent("compliance_assistant", "ngo.cft-risk-assessment", orgName);
  } catch (err) {
    console.warn("[hawkeye] ngo-risk writeAuditEvent failed:", err);
  }

  // Run deterministic rule-based scoring
  const { score, flags, cftRisks } = computeNgoRiskScore(body);
  const riskLevel = scoreToRiskLevel(score);
  const uaeComplianceStatus = deriveUaeComplianceStatus(riskLevel, body.isRegistered, flags);
  const recommendation = buildRecommendation(riskLevel, body.isRegistered, flags);

  const result: NgoRiskResponse = {
    riskScore: score,
    riskLevel,
    flags,
    cftRisks,
    uaeComplianceStatus,
    recommendation,
    regulatoryBasis: [
      "FATF R.8",
      "UAE Cabinet Decision No. 10/2019",
      "UAE Federal Decree-Law No. 10 of 2025 Art.14",
    ],
  };

  void writeAuditChainEntry(
    {
      event: "ngo.cft_risk_assessed",
      actor: gate.keyId,
      organizationName: orgName,
      registrationNumber: body.registrationNumber ?? null,
      countryCode: body.countryCode,
      riskScore: score,
      riskLevel,
      flags,
    },
    tenantIdFromGate(gate),
  ).catch((err) =>
    console.warn(
      "[ngo-risk] audit chain write failed:",
      err instanceof Error ? err.message : String(err),
    ),
  );

  return NextResponse.json({ ok: true, ...result }, { headers: gate.headers });
}
