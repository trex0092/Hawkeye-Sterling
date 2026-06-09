import { NextResponse } from "next/server";
import { writeAuditEvent } from "@/lib/audit";
import { enforce } from "@/lib/server/enforce";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { getCountryRisk } from "@/lib/server/high-risk-countries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ClientType = "hnwi" | "uhnwi" | "family_office" | "wealth_manager" | "private_equity";

type PrivateClientCategory =
  | "standard"
  | "enhanced"
  | "edd_mandatory"
  | "senior_approval_required"
  | "do_not_accept";

interface RequestBody {
  clientName: string;
  clientType: ClientType;
  aum?: number;
  pepStatus?: boolean;
  nationality: string;
  residencyCountry: string;
  wealthSources?: string[];
  jurisdictionsUsed?: string[];
  hasPrivateTrustStructure?: boolean;
  hasFoundationStructure?: boolean;
  hasFamilyOffice?: boolean;
  politicalConnections?: boolean;
  hasCrossJurisdictionAssets?: boolean;
}

interface PrivateBankingRiskResult {
  riskScore: number;
  riskLevel: "critical" | "high" | "medium" | "low";
  privateClientCategory: PrivateClientCategory;
  eddRequirements: string[];
  annualReviewRequired: boolean;
  recommendation: string;
  regulatoryBasis: string[];
}

// ---------------------------------------------------------------------------
// Offshore / secrecy jurisdiction set — private banking specific.
// Covers major secrecy vehicles relevant to family offices and foundations.
// ---------------------------------------------------------------------------

const OFFSHORE_SECRECY_JURISDICTIONS = new Set([
  "bvi",
  "british virgin islands",
  "cayman islands",
  "cayman",
  "liechtenstein",
  "panama",
  "jersey",
  "guernsey",
  "isle of man",
  "seychelles",
  "samoa",
  "cook islands",
  "vanuatu",
  "bahamas",
  "bermuda",
  "delaware",
  "nevada",
  "luxembourg",
  "singapore",
  "hong kong",
  "monaco",
  "andorra",
  "san marino",
  "malta",
  "cyprus",
]);

/** Returns true if any jurisdiction in the list matches an offshore secrecy location. */
function hasOffshoreJurisdiction(jurisdictions: string[] | undefined): boolean {
  if (!Array.isArray(jurisdictions) || jurisdictions.length === 0) return false;
  return jurisdictions.some((j) => OFFSHORE_SECRECY_JURISDICTIONS.has(j.toLowerCase().trim()));
}

// ---------------------------------------------------------------------------
// Risk scoring (FATF Guidance on Private Banking, FATF R.10, R.12, R.25)
// ---------------------------------------------------------------------------

interface ScoringDetail {
  score: number;
  flags: string[];
}

function computePrivateBankingScore(body: RequestBody): ScoringDetail {
  let score = 0;
  const flags: string[] = [];

  const jurisdictions = Array.isArray(body.jurisdictionsUsed) ? body.jurisdictionsUsed : [];
  const wealthSources = Array.isArray(body.wealthSources) ? body.wealthSources : [];

  // (a) UHNWI — AUM > $100M: +20
  // FATF Guidance on Private Banking §27: UHNWI constitute an inherently
  // higher-risk segment requiring enhanced due diligence procedures.
  if (body.clientType === "uhnwi" || (typeof body.aum === "number" && body.aum > 100_000_000)) {
    score += 20;
    flags.push("uhnwi_high_risk:+20 (FATF private banking guidance §27 — UHNWI inherently high-risk)");
  }

  // (b) PEP status: +40
  // FATF R.12 mandates EDD for all PEP relationships in private banking.
  // Senior management approval required at onboarding and throughout relationship.
  if (body.pepStatus === true) {
    score += 40;
    flags.push("pep_mandatory_edd:+40 (FATF R.12 — PEP in private banking requires senior management approval and EDD)");
  }

  // (c) Private trust structure: +20
  // Opacity of beneficial ownership through discretionary trusts, purpose trusts,
  // and similar arrangements — FATF R.25 and UAE Federal Decree-Law No. 10 of 2025 Art.7.
  if (body.hasPrivateTrustStructure === true) {
    score += 20;
    flags.push("private_trust_structure:+20 (FATF R.25 — trust opacity inhibits beneficial ownership identification)");
  }

  // (d) Foundation structure: +15
  // Liechtenstein Anstalts, Panama foundations, and similar vehicles are
  // recognised secrecy tools under FATF R.25 (legal arrangements).
  if (body.hasFoundationStructure === true) {
    score += 15;
    flags.push("foundation_structure:+15 (FATF R.25 — foundations used as secrecy vehicles in private banking)");
  }

  // (e) Multi-jurisdictional assets with > 3 jurisdictions: +25
  // Cross-border asset dispersion increases layering risk and complicates
  // CDD verification — FATF private banking guidance §35.
  if (body.hasCrossJurisdictionAssets === true && jurisdictions.length > 3) {
    score += 25;
    flags.push(
      `multi_jurisdiction_assets:+25 (${jurisdictions.length} jurisdictions — FATF private banking guidance §35 complexity threshold exceeded)`,
    );
  }

  // (f) Political connections without formal PEP designation: +20
  // Close associates of PEPs and politically-connected individuals carry
  // indirect PEP exposure — FATF R.12 note on "close associates".
  if (body.politicalConnections === true && body.pepStatus !== true) {
    score += 20;
    flags.push("political_connections:+20 (FATF R.12 — political connections without PEP designation; close-associate risk)");
  }

  // (g) High-risk wealth sources
  // Inheritance from high-risk jurisdiction: +15
  const hasInheritance = wealthSources.some((s) => s.toLowerCase().includes("inheritance"));
  if (hasInheritance) {
    const natRisk = getCountryRisk(body.nationality);
    const resRisk = getCountryRisk(body.residencyCountry);
    if (natRisk !== null || resRisk !== null) {
      score += 15;
      flags.push("inheritance_high_risk_jurisdiction:+15 (inheritance wealth source in FATF high-risk jurisdiction — SoW verification required)");
    }
  }

  // Crypto wealth source: +20
  const hasCrypto = wealthSources.some((s) => s.toLowerCase().includes("crypto"));
  if (hasCrypto) {
    score += 20;
    flags.push("crypto_wealth_source:+20 (crypto/virtual asset wealth source — FATF R.15 and VASP tracing required)");
  }

  // Business sale from non-public company: +15
  const hasBusinessSale = wealthSources.some((s) => s.toLowerCase().includes("business_sale") || s.toLowerCase().includes("business sale"));
  if (hasBusinessSale) {
    score += 15;
    flags.push("private_business_sale:+15 (business sale from non-public company — valuation and tax-compliance verification required)");
  }

  // (h) Family office with offshore jurisdictions: +20
  // Complex multi-entity family office structures in secrecy jurisdictions
  // are high-risk — FATF private banking guidance §42–44.
  if (body.hasFamilyOffice === true && hasOffshoreJurisdiction(jurisdictions)) {
    score += 20;
    flags.push("family_office_offshore:+20 (FATF private banking guidance §42 — family office with offshore jurisdiction presence)");
  }

  // (i) High-risk nationality / residency — FATF greylist/blacklist: +25 to +40
  const natRisk = getCountryRisk(body.nationality);
  const resRisk = getCountryRisk(body.residencyCountry);

  // Determine the higher of the two country risk tiers
  const tierOrder: Record<string, number> = { blacklist: 3, greylist: 2, elevated: 1, standard: 0 };
  const natOrder = natRisk ? (tierOrder[natRisk.tier] ?? 0) : 0;
  const resOrder = resRisk ? (tierOrder[resRisk.tier] ?? 0) : 0;
  const dominantRisk = natOrder >= resOrder ? natRisk : resRisk;

  if (dominantRisk) {
    if (dominantRisk.tier === "blacklist") {
      score += 40;
      flags.push(`blacklist_country:+40 (${dominantRisk.name} — FATF blacklist; ${dominantRisk.basis.join(", ")})`);
    } else if (dominantRisk.tier === "greylist") {
      score += 25;
      flags.push(`greylist_country:+25 (${dominantRisk.name} — FATF greylist; ${dominantRisk.basis.join(", ")})`);
    } else if (dominantRisk.tier === "elevated") {
      score += 15;
      flags.push(`elevated_risk_country:+15 (${dominantRisk.name} — elevated risk; ${dominantRisk.basis.join(", ")})`);
    }
  }

  // Cap at 100
  score = Math.min(score, 100);

  return { score, flags };
}

// ---------------------------------------------------------------------------
// Derived outputs from risk score + flags
// ---------------------------------------------------------------------------

function scoreToRiskLevel(score: number): "critical" | "high" | "medium" | "low" {
  if (score >= 70) return "critical";
  if (score >= 45) return "high";
  if (score >= 20) return "medium";
  return "low";
}

function scoreToClientCategory(score: number, flags: string[]): PrivateClientCategory {
  const hasPep = flags.some((f) => f.startsWith("pep_mandatory_edd"));
  const hasBlacklist = flags.some((f) => f.startsWith("blacklist_country"));

  // Do-not-accept: blacklist jurisdiction OR PEP from blacklist country
  if (hasBlacklist && hasPep) return "do_not_accept";
  if (hasBlacklist && score >= 80) return "do_not_accept";

  // Senior approval: PEP clients or score ≥ 70
  if (hasPep || score >= 70) return "senior_approval_required";

  // EDD mandatory: score ≥ 45
  if (score >= 45) return "edd_mandatory";

  // Enhanced: score ≥ 20
  if (score >= 20) return "enhanced";

  return "standard";
}

function buildEddRequirements(flags: string[], category: PrivateClientCategory, _body: RequestBody): string[] {
  const reqs: string[] = [];

  if (category === "do_not_accept") {
    reqs.push("Client relationship must be declined — FATF blacklist jurisdiction nexus with PEP exposure");
    reqs.push("File rejection memo with regulatory basis for MLRO sign-off");
    return reqs;
  }

  if (flags.some((f) => f.startsWith("pep_mandatory_edd"))) {
    reqs.push("Senior management written approval required at onboarding and on an annual basis (FATF R.12)");
    reqs.push("Source of wealth verification: documentary evidence for all stated wealth sources");
    reqs.push("Source of funds verification for each transaction above EDD threshold");
    reqs.push("Enhanced ongoing monitoring — transaction review quarterly");
    reqs.push("PEP registry check: domestic and foreign PEP databases, UN, OFAC, EU, UK");
  }

  if (flags.some((f) => f.startsWith("uhnwi_high_risk"))) {
    reqs.push("Independent wealth verification by qualified third party (UHNWI AUM > USD 100M)");
    reqs.push("Net worth statement with supporting documentation verified against tax filings");
  }

  if (flags.some((f) => f.startsWith("private_trust_structure"))) {
    reqs.push("Trust deed review: identify all settlors, trustees, protectors, and beneficiaries");
    reqs.push("Beneficial owner verification to FATF 25% threshold for all trust parties");
    reqs.push("Written legal opinion on trust structure if jurisdiction not in standard approval list");
  }

  if (flags.some((f) => f.startsWith("foundation_structure"))) {
    reqs.push("Foundation charter/statutes review: identify founder, council members, and beneficiaries");
    reqs.push("UBO declaration from foundation controller — enhanced scrutiny for Liechtenstein/Panama vehicles");
  }

  if (flags.some((f) => f.startsWith("multi_jurisdiction_assets"))) {
    reqs.push("Consolidated asset mapping across all jurisdictions (>3 jurisdictions detected)");
    reqs.push("Obtain tax compliance certificates or CRS/FATCA disclosure documentation per jurisdiction");
  }

  if (flags.some((f) => f.startsWith("political_connections"))) {
    reqs.push("Political exposure questionnaire — document nature and extent of political connections");
    reqs.push("Assess close-associate PEP risk under FATF R.12 guidance on 'close associates'");
  }

  if (flags.some((f) => f.startsWith("inheritance_high_risk_jurisdiction"))) {
    reqs.push("Inheritance verification: probate documents, estate valuations, and jurisdiction of deceased");
    reqs.push("Adverse media and sanctions screening on deceased and estate administrator");
  }

  if (flags.some((f) => f.startsWith("crypto_wealth_source"))) {
    reqs.push("Crypto wallet forensics: blockchain analytics report (Chainalysis / Elliptic) mandatory");
    reqs.push("Exchange KYC/AML documentation: verify fiat on/off ramp compliance");
    reqs.push("VASP due diligence under FATF R.15 travel rule requirements");
  }

  if (flags.some((f) => f.startsWith("private_business_sale"))) {
    reqs.push("Business sale documentation: sale agreement, audited financials (3 years), and valuation report");
    reqs.push("Counterparty screening: buyer/seller identity and sanctions check");
  }

  if (flags.some((f) => f.startsWith("family_office_offshore"))) {
    reqs.push("Family office structure map: entity chart with UBO identification for all vehicles");
    reqs.push("Offshore entity CDD: obtain certificate of good standing and registered agent details");
    reqs.push("Inter-entity fund flows: document economic rationale for offshore structures");
  }

  if (flags.some((f) => f.startsWith("blacklist_country") || f.startsWith("greylist_country"))) {
    reqs.push("Country-specific EDD: enhanced checks per FATF country risk guidance");
    reqs.push("Senior relationship manager sign-off on jurisdiction risk acceptance");
    reqs.push("Ongoing adverse media monitoring with FATF greylist/blacklist update alerts");
  }

  // Baseline for all non-standard categories
  if (category !== "standard") {
    reqs.push("Annual CDD refresh with updated source of wealth and source of funds documentation");
    reqs.push("Ongoing transaction monitoring with private banking typology rules applied");
  }

  return reqs;
}

function buildRecommendation(
  category: PrivateClientCategory,
  riskLevel: "critical" | "high" | "medium" | "low",
  score: number,
): string {
  switch (category) {
    case "do_not_accept":
      return `Decline client relationship. Risk score ${score}/100 (${riskLevel}). The combination of sanctioned/blacklisted jurisdiction nexus and PEP exposure makes this relationship non-compliant with FATF requirements and UAE AML obligations under Federal Decree-Law No. 10 of 2025. File a rejection memo and consider whether a STR/SAR is required.`;
    case "senior_approval_required":
      return `Conditional acceptance subject to senior management written approval. Risk score ${score}/100 (${riskLevel}). Complete all EDD requirements before account opening. Ongoing monitoring must be enhanced with quarterly transaction review and annual senior sign-off.`;
    case "edd_mandatory":
      return `Accept with mandatory EDD. Risk score ${score}/100 (${riskLevel}). All EDD requirements must be completed and documented before funds are accepted. Relationship Manager and Compliance must co-sign CDD file.`;
    case "enhanced":
      return `Accept with enhanced CDD. Risk score ${score}/100 (${riskLevel}). Standard private banking CDD must be supplemented with additional source of wealth documentation and 6-monthly monitoring reviews.`;
    case "standard":
      return `Accept under standard private banking CDD. Risk score ${score}/100 (${riskLevel}). Apply routine ongoing monitoring and annual CDD refresh.`;
  }
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req, { cost: 8 });
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

  const { clientName, clientType, nationality, residencyCountry } = body;

  if (!clientName || typeof clientName !== "string") {
    return NextResponse.json(
      { ok: false, error: "clientName is required" },
      { status: 422, headers: gate.headers },
    );
  }

  const validClientTypes: ClientType[] = [
    "hnwi",
    "uhnwi",
    "family_office",
    "wealth_manager",
    "private_equity",
  ];
  if (!validClientTypes.includes(clientType)) {
    return NextResponse.json(
      {
        ok: false,
        error: `clientType must be one of: ${validClientTypes.join(", ")}`,
      },
      { status: 422, headers: gate.headers },
    );
  }

  try {
    writeAuditEvent("compliance_assistant", "private-banking.risk-assessment", clientName);
  } catch (err) {
    console.warn("[hawkeye] private-banking-risk writeAuditEvent failed:", err);
  }

  // Run deterministic rule-based scoring (no LLM call — cost: 8 credits covers
  // the higher compliance value of this endpoint; the scoring logic embeds
  // FATF guidance directly so no AI inference is needed for core outputs).
  const { score, flags } = computePrivateBankingScore(body);
  const riskLevel = scoreToRiskLevel(score);
  const privateClientCategory = scoreToClientCategory(score, flags);
  const eddRequirements = buildEddRequirements(flags, privateClientCategory, body);
  const annualReviewRequired = privateClientCategory !== "standard";
  const recommendation = buildRecommendation(privateClientCategory, riskLevel, score);

  const result: PrivateBankingRiskResult = {
    riskScore: score,
    riskLevel,
    privateClientCategory,
    eddRequirements,
    annualReviewRequired,
    recommendation,
    regulatoryBasis: [
      "FATF Guidance on Private Banking",
      "UAE Federal Decree-Law No. 10 of 2025 Art.7",
      "CBUAE Private Banking AML Standard",
    ],
  };

  void writeAuditChainEntry(
    {
      event: "private_banking.risk_assessed",
      actor: gate.keyId,
      entity: clientName,
      riskLevel,
      riskScore: score,
      privateClientCategory,
      nationality,
      residencyCountry,
      riskFlags: flags,
    },
    tenantIdFromGate(gate),
  ).catch((err) =>
    console.warn(
      "[private-banking-risk] audit chain write failed:",
      err instanceof Error ? err.message : String(err),
    ),
  );

  return NextResponse.json(
    {
      ok: true,
      ...result,
      riskFlags: flags,
    },
    { headers: gate.headers },
  );
}
