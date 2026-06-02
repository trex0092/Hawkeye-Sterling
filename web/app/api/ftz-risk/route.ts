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
  ftzName: string;
  licenseCategory: string;
  licenseNumber?: string;
  incorporationDate?: string;
  businessActivities: string[];
  shareCapital?: number;
  currency?: string;
  directors?: string[];
  shareholders?: string[];
  beneficialOwners?: string[];
  bankingRelationships?: string[];
  operatingCountries?: string[];
}

type RiskLevel = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

interface FtzRiskResponse {
  ok: true;
  riskScore: number;
  riskLevel: RiskLevel;
  ftzRiskCategory: string;
  shellCompanyIndicators: string[];
  recommendation: string;
  regulatoryBasis: string[];
}

// ---------------------------------------------------------------------------
// UAE FTZ risk scoring data
// ---------------------------------------------------------------------------

/**
 * Known UAE free trade zones with their incremental risk scores.
 * Scores represent the delta applied on top of the base (0).
 * Sources: FATF TBML 2020, CBUAE FTZ Sector Guidance, UAE FDL 10/2025.
 */
const FTZ_RISK_MAP: Record<string, { delta: number; label: string }> = {
  // Very high risk — historically linked to TBML / shell formation abuse
  "uaq free trade zone": { delta: 20, label: "UAQ Free Trade Zone (Umm Al Quwain)" },
  "umm al quwain free trade zone": { delta: 20, label: "UAQ Free Trade Zone (Umm Al Quwain)" },
  uaq: { delta: 20, label: "UAQ Free Trade Zone (Umm Al Quwain)" },

  // Elevated risk — weak historical oversight
  "saif zone": { delta: 15, label: "SAIF Zone (Sharjah)" },
  "sharjah airport international free zone": { delta: 15, label: "SAIF Zone (Sharjah)" },
  saif: { delta: 15, label: "SAIF Zone (Sharjah)" },

  "hamriyah free zone": { delta: 15, label: "Hamriyah Free Zone" },
  hamriyah: { delta: 15, label: "Hamriyah Free Zone" },

  "rak international corporate centre": { delta: 15, label: "RAK International Corporate Centre" },
  rakicc: { delta: 15, label: "RAK International Corporate Centre" },
  "rak icc": { delta: 15, label: "RAK International Corporate Centre" },

  // Moderate — well-regulated but high volume
  jafza: { delta: 5, label: "JAFZA (Jebel Ali Free Zone)" },
  "jebel ali free zone": { delta: 5, label: "JAFZA (Jebel Ali Free Zone)" },
  "jebel ali": { delta: 5, label: "JAFZA (Jebel Ali Free Zone)" },

  dafza: { delta: 5, label: "DAFZA (Dubai Airport Free Zone)" },
  "dubai airport free zone": { delta: 5, label: "DAFZA (Dubai Airport Free Zone)" },

  dmcc: { delta: 5, label: "DMCC (Dubai Multi Commodities Centre)" },
  "dubai multi commodities centre": { delta: 5, label: "DMCC (Dubai Multi Commodities Centre)" },

  // Well-regulated — no incremental risk
  difc: { delta: 0, label: "DIFC (Dubai International Financial Centre)" },
  "dubai international financial centre": { delta: 0, label: "DIFC (Dubai International Financial Centre)" },

  adgm: { delta: 0, label: "ADGM (Abu Dhabi Global Market)" },
  "abu dhabi global market": { delta: 0, label: "ADGM (Abu Dhabi Global Market)" },
};

/** Sanctioned-country nationality keywords (non-exhaustive — illustrative for scoring). */
const SANCTIONED_COUNTRY_KEYWORDS = new Set([
  "iran",
  "iranian",
  "north korea",
  "north korean",
  "dprk",
  "syria",
  "syrian",
  "russia",
  "russian",
  "belarus",
  "belarusian",
  "cuba",
  "cuban",
  "myanmar",
  "burmese",
  "sudan",
  "sudanese",
  "venezuela",
  "venezuelan",
  "libya",
  "libyan",
  "somalia",
  "somali",
  "yemen",
  "yemeni",
  "iraq",
  "iraqi",
  "zimbabwe",
  "zimbabwean",
]);

/** Activities that warrant TBML scrutiny when combined with missing counterparty data. */
const TBML_ACTIVITY_KEYWORDS = ["general trading", "import/export", "import export", "trading"];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolve an FTZ entry from the provided name, normalised to lowercase. */
function resolveFtz(name: string): { delta: number; label: string } | null {
  const key = name.toLowerCase().trim();
  // Exact match first.
  if (FTZ_RISK_MAP[key]) return FTZ_RISK_MAP[key] ?? null;
  // Substring match — handles "SAIF Zone Authority", "Jebel Ali FZ", etc.
  for (const [pattern, entry] of Object.entries(FTZ_RISK_MAP)) {
    if (key.includes(pattern) || pattern.includes(key)) return entry;
  }
  return null;
}

/** Infer dominant nationality from director names (last word heuristic is a placeholder;
 *  real production code would call an NLP nationality inference service). */
function detectSanctionedNationality(directors: string[]): boolean {
  const combined = directors.join(" ").toLowerCase();
  for (const keyword of SANCTIONED_COUNTRY_KEYWORDS) {
    if (combined.includes(keyword)) return true;
  }
  return false;
}

/** Return true if all directors share a single nationality token — naive but practical
 *  for detecting single-nationality boards on an ostensibly international trading entity. */
function isSingleNationalityBoard(directors: string[]): boolean {
  if (directors.length <= 1) return false;
  // Look for explicit nationality markers embedded in the director record strings
  // (e.g. "John Smith (British)", "Ali Hassan (Emirati)").
  const nationalityPattern = /\(([^)]+)\)/;
  const nationalities = directors
    .map((d) => {
      const m = nationalityPattern.exec(d);
      return m ? (m[1] ?? "").toLowerCase().trim() : null;
    })
    .filter((n): n is string => n !== null && n.length > 0);

  if (nationalities.length < directors.length) return false; // not all annotated — skip
  const unique = new Set(nationalities);
  return unique.size === 1;
}

function scoreToRiskLevel(score: number): RiskLevel {
  if (score >= 70) return "CRITICAL";
  if (score >= 45) return "HIGH";
  if (score >= 20) return "MEDIUM";
  return "LOW";
}

function ftzRiskCategory(ftzLabel: string | null, score: number): string {
  if (score >= 70) return "Shell/Phantom Entity — Immediate EDD";
  if (score >= 45) return "High-Risk FTZ Entity — Enhanced Due Diligence Required";
  if (score >= 20) return "Elevated FTZ Risk — Standard EDD Recommended";
  return ftzLabel ? `Regulated FTZ Entity — ${ftzLabel}` : "FTZ Entity — Standard CDD";
}

function buildRecommendation(score: number, indicators: string[]): string {
  if (score >= 70) {
    return (
      "File Suspicious Activity Report (SAR/STR). Freeze relationship pending MLRO review. " +
      "Obtain UBO declarations, audited financials, and physical-presence evidence. " +
      "Escalate to Senior Management under UAE FDL 10/2025 Art. 16."
    );
  }
  if (score >= 45) {
    return (
      "Conduct Enhanced Due Diligence (EDD). Verify physical presence, obtain source-of-funds documentation, " +
      "independent director confirmation, and counterparty list. " +
      "Review under CBUAE FTZ Sector Guidance before onboarding/continuation."
    );
  }
  if (score >= 20) {
    return (
      "Apply Standard EDD: confirm registered address is operational, verify license currency, " +
      "obtain list of key counterparties and review for TBML red flags. " +
      `Key indicators noted: ${indicators.slice(0, 3).join("; ") || "none"}.`
    );
  }
  return "Standard CDD applies. Confirm FTZ license is current, collect UBO declaration, and log for periodic review.";
}

// ---------------------------------------------------------------------------
// Core scoring engine
// ---------------------------------------------------------------------------

interface ScoringResult {
  score: number;
  shellCompanyIndicators: string[];
  ftzLabel: string | null;
}

function computeFtzRiskScore(body: RequestBody): ScoringResult {
  let score = 0;
  const indicators: string[] = [];
  let ftzLabel: string | null = null;

  // ------------------------------------------------------------------
  // (a) High-risk FTZ identification
  // ------------------------------------------------------------------
  const ftzEntry = resolveFtz(body.ftzName);
  if (ftzEntry !== null) {
    ftzLabel = ftzEntry.label;
    if (ftzEntry.delta > 0) {
      score += ftzEntry.delta;
      indicators.push(`high_risk_ftz:+${ftzEntry.delta} (${ftzEntry.label})`);
    }
  } else {
    // Unknown FTZ — apply a conservative default delta
    ftzLabel = body.ftzName;
  }

  // ------------------------------------------------------------------
  // (b) Activity mismatch — general trading / import-export with no counterparties
  // ------------------------------------------------------------------
  const activitiesLower = body.businessActivities.map((a) => a.toLowerCase());
  const hasTbmlActivity = activitiesLower.some((a) =>
    TBML_ACTIVITY_KEYWORDS.some((kw) => a.includes(kw)),
  );
  const noCounterparties =
    !body.bankingRelationships || body.bankingRelationships.length === 0;

  if (hasTbmlActivity && noCounterparties) {
    score += 20;
    indicators.push("activity_mismatch:+20 (general trading/import-export with no declared counterparties)");
  }

  // ------------------------------------------------------------------
  // (c) Possible no physical presence — high-activity sector, minimal capital
  // ------------------------------------------------------------------
  const capitalAed = body.shareCapital ?? null;
  const isAed = !body.currency || body.currency.toUpperCase() === "AED";
  const capitalInAed = capitalAed !== null && isAed ? capitalAed : null;

  if (capitalInAed !== null && capitalInAed < 50_000 && hasTbmlActivity) {
    score += 15;
    indicators.push(
      `possible_no_physical_presence:+15 (share capital ${capitalInAed.toLocaleString()} AED < 50,000 threshold for trading entity)`,
    );
  }

  // ------------------------------------------------------------------
  // (d) Director red flags
  // ------------------------------------------------------------------
  const directors = body.directors ?? [];
  if (directors.length > 0) {
    if (detectSanctionedNationality(directors)) {
      score += 30;
      indicators.push("sanctioned_country_director:+30 (director nationality linked to sanctioned jurisdiction)");
    }

    if (isSingleNationalityBoard(directors)) {
      score += 10;
      indicators.push("single_nationality_board:+10 (all directors share same nationality on international trading entity)");
    }
  }

  // ------------------------------------------------------------------
  // (e) Minimal share capital — shell indicator for trading companies
  // ------------------------------------------------------------------
  if (capitalInAed !== null && capitalInAed < 10_000 && hasTbmlActivity) {
    score += 20;
    indicators.push(
      `minimal_share_capital_shell:+20 (share capital ${capitalInAed.toLocaleString()} AED < 10,000 — shell entity indicator for trading company)`,
    );
  }

  // ------------------------------------------------------------------
  // (f) Multi-jurisdiction operations — excessively broad scope for small entity
  // ------------------------------------------------------------------
  const operatingCountries = body.operatingCountries ?? [];
  if (operatingCountries.length > 10) {
    score += 15;
    indicators.push(
      `multi_jurisdiction_scope:+15 (${operatingCountries.length} operating countries — excessively broad for a small FTZ entity)`,
    );
  }

  // ------------------------------------------------------------------
  // (g) Newly incorporated and conducting high-value transactions
  // ------------------------------------------------------------------
  if (body.incorporationDate) {
    const incDate = new Date(body.incorporationDate);
    const now = new Date();
    const daysSince = Math.floor((now.getTime() - incDate.getTime()) / (1000 * 60 * 60 * 24));
    if (!isNaN(daysSince) && daysSince < 90 && hasTbmlActivity) {
      score += 25;
      indicators.push(
        `newly_incorporated_high_activity:+25 (entity incorporated ${daysSince} days ago and conducting ${activitiesLower[0] ?? "trading"} activity)`,
      );
    }
  }

  // ------------------------------------------------------------------
  // (h) Generic license category — shell indicator
  // ------------------------------------------------------------------
  const lcLower = body.licenseCategory.toLowerCase().trim();
  if (lcLower === "general trading" || lcLower === "holding") {
    score += 10;
    indicators.push(`generic_license_category:+10 (license category "${body.licenseCategory}" is non-specific — common shell indicator)`);
  }

  // Cap at 100
  score = Math.min(score, 100);

  return { score, shellCompanyIndicators: indicators, ftzLabel };
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

  // Validate required fields
  if (!body.entityName || typeof body.entityName !== "string") {
    return NextResponse.json(
      { ok: false, error: "entityName is required" },
      { status: 400, headers: gate.headers },
    );
  }
  if (!body.ftzName || typeof body.ftzName !== "string") {
    return NextResponse.json(
      { ok: false, error: "ftzName is required" },
      { status: 400, headers: gate.headers },
    );
  }
  if (!body.licenseCategory || typeof body.licenseCategory !== "string") {
    return NextResponse.json(
      { ok: false, error: "licenseCategory is required" },
      { status: 400, headers: gate.headers },
    );
  }
  if (!Array.isArray(body.businessActivities) || body.businessActivities.length === 0) {
    return NextResponse.json(
      { ok: false, error: "businessActivities must be a non-empty array" },
      { status: 400, headers: gate.headers },
    );
  }

  try {
    writeAuditEvent("compliance_assistant", "ftz.risk-assessment", body.entityName);
  } catch (err) {
    console.warn("[hawkeye] ftz-risk writeAuditEvent failed:", err);
  }

  const { score, shellCompanyIndicators, ftzLabel } = computeFtzRiskScore(body);
  const riskLevel = scoreToRiskLevel(score);
  const ftzRiskCat = ftzRiskCategory(ftzLabel, score);
  const recommendation = buildRecommendation(score, shellCompanyIndicators);

  void writeAuditChainEntry(
    {
      event: "ftz.risk_assessed",
      actor: gate.keyId,
      entity: body.entityName,
      ftzName: body.ftzName,
      riskScore: score,
      riskLevel,
      shellCompanyIndicators,
    },
    tenantIdFromGate(gate),
  ).catch((err) =>
    console.warn("[ftz-risk] audit chain write failed:", err instanceof Error ? err.message : String(err)),
  );

  const response: FtzRiskResponse = {
    ok: true,
    riskScore: score,
    riskLevel,
    ftzRiskCategory: ftzRiskCat,
    shellCompanyIndicators,
    recommendation,
    regulatoryBasis: [
      "UAE FDL 10/2025",
      "CBUAE FTZ Sector Guidance",
      "FATF TBML Report 2020",
    ],
  };

  return NextResponse.json(response, { headers: gate.headers });
}
