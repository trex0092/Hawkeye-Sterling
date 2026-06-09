import { NextResponse } from "next/server";
import { writeAuditEvent } from "@/lib/audit";
import { enforce } from "@/lib/server/enforce";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ── Types ─────────────────────────────────────────────────────────────────────

interface RequestBody {
  bankName: string;
  swiftCode?: string;
  countryCode: string;
  relationships?: string[];
  services?: string[];
  isNested?: boolean;
  shellBankIndicators?: string[];
}

export interface RiskFlag {
  code: string;
  description: string;
  score: number;
  regulatoryBasis: string;
}

export interface CorrespondentRiskResult {
  riskScore: number;
  riskLevel: "low" | "medium" | "high" | "critical";
  flags: RiskFlag[];
  recommendation: string;
  regulatoryBasis: string[];
}

// ── Static jurisdiction datasets ──────────────────────────────────────────────
// FATF black list — High-Risk Jurisdictions subject to a Call for Action
// (Iran, North Korea, Myanmar — FATF Feb 2026 plenary)
const FATF_BLACK_LIST = new Set(["IR", "KP", "MM", "IRN", "PRK", "MMR"]);

// FATF grey list — Jurisdictions under Increased Monitoring (Feb 2026)
const FATF_GREY_LIST = new Set([
  "AF", "AL", "BB", "BF", "CM", "CF", "CD", "GI", "HT", "JM", "JO",
  "ML", "MZ", "NA", "NI", "NG", "PK", "PA", "PH", "SS", "SY", "TZ",
  "UG", "VN", "YE",
  "AFG", "ALB", "BRB", "BFA", "CMR", "CAF", "COD", "GIB", "HTI", "JAM",
  "JOR", "MLI", "MOZ", "NAM", "NIC", "NGA", "PAK", "PAN", "PHL", "SSD",
  "SYR", "TZA", "UGA", "VNM", "YEM",
]);

// CAHRA — Countries with significant Conflict/Arms/Humanitarian/Regime risks
// (sanctions-designated, comprehensive OFAC SDN countries, or active conflict zones)
const CAHRA_COUNTRIES = new Set([
  "IR", "KP", "MM", "SY", "RU", "BY", "CU", "VE", "LY", "SO", "ZW",
  "SD", "CF", "SS", "HT", "CD", "LB",
  "IRN", "PRK", "MMR", "SYR", "RUS", "BLR", "CUB", "VEN", "LBY", "SOM",
  "ZWE", "SDN", "CAF", "SSD", "HTI", "COD", "LBN",
]);

// Jurisdictions under comprehensive sanctions regimes (OFAC, EU, UN, or UK)
const SANCTIONS_JURISDICTIONS = new Set([
  "IR", "KP", "MM", "SY", "RU", "BY", "CU", "VE", "LY", "SO", "ZW",
  "SD", "YE", "AF", "IQ",
  "IRN", "PRK", "MMR", "SYR", "RUS", "BLR", "CUB", "VEN", "LBY", "SOM",
  "ZWE", "SDN", "YEM", "AFG", "IRQ",
]);

// Shell bank indicators per FATF R.13 / Basel Committee paper on correspondent banking
const SHELL_BANK_INDICATOR_SET = new Set([
  "no physical presence",
  "no regulatory supervision",
  "no swift membership",
  "po box only",
]);

// High-risk services per FATF typologies and UAE CBUAE guidance
const HIGH_RISK_SERVICES: Record<string, number> = {
  "crypto settlement": 20,
  "cryptocurrency settlement": 20,
  "virtual asset settlement": 20,
  "private banking": 15,
  "hawala": 20,
  "mto": 20,
  "money transfer operator": 20,
  "hawala/mtos": 20,
  "informal value transfer": 20,
};

// ── SWIFT BIC validation ──────────────────────────────────────────────────────
// ISO 9362: BIC is 8 or 11 alphanumeric characters (no spaces, no special chars)
function isValidSwiftBic(code: string): boolean {
  return /^[A-Z0-9]{8}([A-Z0-9]{3})?$/.test(code.trim().toUpperCase());
}

// ── Risk scoring engine ───────────────────────────────────────────────────────
function assessCorrespondentRisk(body: RequestBody): CorrespondentRiskResult {
  let score = 0;
  const flags: RiskFlag[] = [];
  const regulatoryBasis: string[] = [
    "FATF Recommendation 13 — Correspondent Banking",
    "UAE Federal Decree-Law No. 10 of 2025 Art.25 — Correspondent Relationships",
  ];

  const cc = body.countryCode.trim().toUpperCase();

  // 1. Country risk — FATF status
  if (FATF_BLACK_LIST.has(cc)) {
    score += 30;
    flags.push({
      code: "COUNTRY_FATF_BLACKLIST",
      description: `Country code "${cc}" is on the FATF Black List (High-Risk Jurisdictions subject to a Call for Action).`,
      score: 30,
      regulatoryBasis: "FATF Recommendation 13 & 19; UAE Federal Decree-Law No. 10 of 2025 Art.25",
    });
  } else if (FATF_GREY_LIST.has(cc)) {
    score += 30;
    flags.push({
      code: "COUNTRY_FATF_GREYLIST",
      description: `Country code "${cc}" is on the FATF Grey List (Jurisdictions under Increased Monitoring).`,
      score: 30,
      regulatoryBasis: "FATF Recommendation 13 & 19; UAE Federal Decree-Law No. 10 of 2025 Art.14 & Art.25",
    });
  }

  // 2. Country risk — CAHRA
  if (CAHRA_COUNTRIES.has(cc)) {
    score += 40;
    flags.push({
      code: "COUNTRY_CAHRA",
      description: `Country code "${cc}" is designated as a Conflict/Arms/Humanitarian/Regime-risk area (CAHRA). Correspondent relationships require senior management approval.`,
      score: 40,
      regulatoryBasis: "FATF Recommendation 13; CBUAE AML Standards — CAHRA guidance; UAE Federal Decree-Law No. 10 of 2025 Art.25(3)",
    });
    if (!regulatoryBasis.includes("CBUAE AML Standards — CAHRA jurisdictions")) {
      regulatoryBasis.push("CBUAE AML Standards — CAHRA jurisdictions");
    }
  }

  // 3. Country risk — Sanctions jurisdiction
  if (SANCTIONS_JURISDICTIONS.has(cc)) {
    score += 50;
    flags.push({
      code: "COUNTRY_SANCTIONS_JURISDICTION",
      description: `Country code "${cc}" is subject to comprehensive sanctions (OFAC, EU, UN, and/or UK). Establishing correspondent relationships may violate sanctions obligations.`,
      score: 50,
      regulatoryBasis: "UAE Federal Decree Law 74/2023 (Sanctions); OFAC 31 CFR; UN Security Council Resolutions; FATF Recommendation 13",
    });
    regulatoryBasis.push("UAE Federal Decree Law 74/2023 — Sanctions Compliance");
  }

  // 4. Nested correspondent relationships (FATF R.13 prohibition)
  if (body.isNested === true) {
    score += 25;
    flags.push({
      code: "NESTED_CORRESPONDENT_RELATIONSHIP",
      description: "Nested correspondent relationship identified. FATF Recommendation 13 prohibits a respondent bank from using the correspondent's account to offer banking services to unidentified third-party institutions (shell bank facilitation).",
      score: 25,
      regulatoryBasis: "FATF Recommendation 13 — Nested/Payable-Through Accounts; UAE Federal Decree-Law No. 10 of 2025 Art.25(4)",
    });
  }

  // 5. Shell bank indicators
  const shellIndicators = body.shellBankIndicators ?? [];
  for (const indicator of shellIndicators) {
    const normalised = indicator.toLowerCase().trim();
    if (SHELL_BANK_INDICATOR_SET.has(normalised)) {
      score += 15;
      flags.push({
        code: `SHELL_BANK_INDICATOR_${normalised.replace(/\s+/g, "_").toUpperCase()}`,
        description: `Shell bank indicator detected: "${indicator}". Banks lacking physical presence, regulatory supervision, SWIFT membership, or using PO Box-only addresses are prohibited correspondents under FATF R.13.`,
        score: 15,
        regulatoryBasis: "FATF Recommendation 13 — Shell Bank Prohibition; Basel Committee on Correspondent Banking (2016); UAE Federal Decree-Law No. 10 of 2025 Art.25(2)",
      });
    }
  }

  // 6. High-risk services
  const services = body.services ?? [];
  for (const svc of services) {
    const normalised = svc.toLowerCase().trim();
    const svcScore = HIGH_RISK_SERVICES[normalised];
    if (svcScore !== undefined) {
      score += svcScore;
      flags.push({
        code: `HIGH_RISK_SERVICE_${normalised.replace(/[\s/]+/g, "_").toUpperCase()}`,
        description: `High-risk service identified: "${svc}". This service type is associated with elevated ML/TF typologies and requires enhanced due diligence under FATF guidance.`,
        score: svcScore,
        regulatoryBasis: "FATF Guidance on Correspondent Banking (2016); CBUAE AML Standards §7; UAE Federal Decree-Law No. 10 of 2025 Art.25",
      });
    }
  }

  // 7. SWIFT BIC validation
  if (body.swiftCode !== undefined && body.swiftCode.trim() !== "") {
    if (!isValidSwiftBic(body.swiftCode)) {
      flags.push({
        code: "SWIFT_BIC_INVALID",
        description: `SWIFT BIC "${body.swiftCode}" failed format validation. A valid BIC is 8 or 11 alphanumeric characters (ISO 9362). An invalid BIC may indicate a fictitious or unregistered institution.`,
        score: 0,
        regulatoryBasis: "ISO 9362 — SWIFT BIC Standard; FATF Recommendation 13 — Correspondent Identification",
      });
      // Invalid BIC adds no direct score but is a qualitative red flag; advisory only
    } else {
      regulatoryBasis.push("ISO 9362 — SWIFT BIC verified (format-valid)");
    }
  }

  // 8. Cap score at 100
  const riskScore = Math.min(score, 100);

  // 9. Derive risk level
  let riskLevel: "low" | "medium" | "high" | "critical";
  if (riskScore >= 75) {
    riskLevel = "critical";
  } else if (riskScore >= 50) {
    riskLevel = "high";
  } else if (riskScore >= 25) {
    riskLevel = "medium";
  } else {
    riskLevel = "low";
  }

  // 10. Recommendation per FATF R.13 thresholds
  let recommendation: string;
  if (riskScore >= 75) {
    recommendation =
      "Reject correspondent relationship — exceeds risk appetite per FATF R.13";
  } else if (riskScore >= 50) {
    recommendation =
      "Enhanced due diligence required before establishing relationship";
  } else {
    recommendation = "Standard CDD applies; monitor annually";
  }

  // 11. Deduplicate regulatoryBasis
  const deduped = [...new Set(regulatoryBasis)];

  return { riskScore, riskLevel, flags, recommendation, regulatoryBasis: deduped };
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
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
  if (!body.bankName || typeof body.bankName !== "string" || !body.bankName.trim()) {
    return NextResponse.json(
      { ok: false, error: "bankName is required" },
      { status: 400, headers: gate.headers },
    );
  }
  if (!body.countryCode || typeof body.countryCode !== "string" || !body.countryCode.trim()) {
    return NextResponse.json(
      { ok: false, error: "countryCode is required (ISO 3166-1 alpha-2 or alpha-3)" },
      { status: 400, headers: gate.headers },
    );
  }

  // Audit event (best-effort — never block the main response)
  try {
    writeAuditEvent("compliance_assistant", "correspondent-risk.assessed", body.bankName.trim());
  } catch (err) {
    console.warn("[correspondent-risk] writeAuditEvent failed:", err);
  }

  // Deterministic risk scoring — no LLM call, fully rule-based
  const result = assessCorrespondentRisk(body);

  // Write to tamper-evident audit chain (async, non-blocking)
  void writeAuditChainEntry(
    {
      event: "correspondent_risk.assessed",
      actor: gate.keyId,
      entity: body.bankName.trim(),
      riskScore: result.riskScore,
      riskLevel: result.riskLevel,
      countryCode: body.countryCode.trim().toUpperCase(),
    },
    tenantIdFromGate(gate),
  ).catch((err) =>
    console.warn(
      "[correspondent-risk] audit chain write failed:",
      err instanceof Error ? err.message : String(err),
    ),
  );

  return NextResponse.json({ ok: true, ...result }, { headers: gate.headers });
}
