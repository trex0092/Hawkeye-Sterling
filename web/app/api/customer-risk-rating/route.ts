// POST /api/customer-risk-rating
//
// Customer Risk Rating (CRR) matrix and CDD tier assignment engine.
// Implements UAE CBUAE AML/CFT Standards, FATF Risk-Based Approach Guidance,
// and UAE Federal Decree-Law No. 10/2025.
//
// Body:
//   {
//     customerId, customerType, nationality, residencyCountry,
//     businessSector?, pepStatus?, sanctionsHits?, adverseMediaHits?,
//     transactionVolumeAed?, productTypes?, channelType?,
//     yearsSinceOnboarding?, lastReviewDate?
//   }
// Response:
//   {
//     riskScore, cddTier, riskDrivers, reviewFrequency,
//     seniorApprovalRequired, recommendation, regulatoryBasis
//   }

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

type CustomerType = "individual" | "corporate" | "financial_institution" | "dnfbp" | "ngo";
type PepStatus = "tier1" | "tier2" | "tier3" | "none";
type ChannelType = "branch" | "digital" | "agent" | "correspondent";
type CddTier = "standard" | "enhanced" | "intensive" | "prohibited";
type ReviewFrequency = "annual" | "semi_annual" | "quarterly" | "monthly";

interface RequestBody {
  customerId: string;
  customerType: CustomerType;
  nationality: string;
  residencyCountry: string;
  businessSector?: string;
  pepStatus?: PepStatus;
  sanctionsHits?: number;
  adverseMediaHits?: number;
  transactionVolumeAed?: number;
  productTypes?: string[];
  channelType?: ChannelType;
  yearsSinceOnboarding?: number;
  lastReviewDate?: string;
}

interface CrrResponse {
  ok: true;
  riskScore: number;
  cddTier: CddTier;
  riskDrivers: string[];
  reviewFrequency: ReviewFrequency;
  seniorApprovalRequired: boolean;
  recommendation: string;
  regulatoryBasis: string[];
}

// ---------------------------------------------------------------------------
// Geographic risk lists
// ---------------------------------------------------------------------------

/** FATF Blacklist — "High-Risk Jurisdictions subject to a Call for Action" */
const FATF_BLACKLIST = new Set([
  "iran",
  "ir",
  "north korea",
  "kp",
  "myanmar",
  "mm",
]);

/** FATF Greylist — "Jurisdictions under Increased Monitoring" (representative set, refreshed periodically) */
const FATF_GREYLIST = new Set([
  "algeria",
  "dz",
  "angola",
  "ao",
  "bulgaria",
  "bg",
  "burkina faso",
  "bf",
  "cameroon",
  "cm",
  "congo",
  "cg",
  "croatia",
  "hr",
  "haiti",
  "ht",
  "kenya",
  "ke",
  "laos",
  "la",
  "lebanon",
  "lb",
  "mali",
  "ml",
  "monaco",
  "mc",
  "mozambique",
  "mz",
  "namibia",
  "na",
  "nigeria",
  "ng",
  "south africa",
  "za",
  "south sudan",
  "ss",
  "syria",
  "sy",
  "tanzania",
  "tz",
  "venezuela",
  "ve",
  "vietnam",
  "vn",
  "yemen",
  "ye",
]);

/**
 * Countries/Regions of Heightened AML Risk (CAHRA) — conflict-affected,
 * significant illicit-finance exposure or major AML deficiency beyond FATF lists.
 */
const CAHRA = new Set([
  "afghanistan",
  "af",
  "cuba",
  "cu",
  "eritrea",
  "er",
  "ethiopia",
  "et",
  "iraq",
  "iq",
  "libya",
  "ly",
  "nicaragua",
  "ni",
  "russia",
  "ru",
  "somalia",
  "so",
  "sudan",
  "sd",
  "ukraine",
  "ua",
  "zimbabwe",
  "zw",
]);

/**
 * Elevated-risk jurisdictions (20 countries) — significant AML/CFT concerns
 * based on BASEL AML Index, FATF mutual evaluation reports, and CBUAE guidance.
 */
const ELEVATED_RISK = new Set([
  "bahamas",
  "bs",
  "belize",
  "bz",
  "cayman islands",
  "ky",
  "cook islands",
  "ck",
  "dominican republic",
  "do",
  "ghana",
  "gh",
  "guatemala",
  "gt",
  "guyana",
  "gy",
  "honduras",
  "hn",
  "indonesia",
  "id",
  "jamaica",
  "jm",
  "jordan",
  "jo",
  "mauritius",
  "mu",
  "pakistan",
  "pk",
  "panama",
  "pa",
  "philippines",
  "ph",
  "senegal",
  "sn",
  "trinidad and tobago",
  "tt",
  "turkey",
  "tr",
  "vanuatu",
  "vu",
]);

// ---------------------------------------------------------------------------
// Scoring helpers
// ---------------------------------------------------------------------------

/** Normalise a country string to lowercase for set lookup. */
function normCountry(s: string): string {
  return s.toLowerCase().trim();
}

/** Classify geographic risk and return { penalty, label }. */
function geoRisk(country: string): { penalty: number; label: string } {
  const c = normCountry(country);
  if (FATF_BLACKLIST.has(c)) return { penalty: 40, label: `FATF_BLACKLIST:${country}` };
  if (CAHRA.has(c)) return { penalty: 35, label: `CAHRA:${country}` };
  if (FATF_GREYLIST.has(c)) return { penalty: 25, label: `FATF_GREYLIST:${country}` };
  if (ELEVATED_RISK.has(c)) return { penalty: 15, label: `ELEVATED_RISK:${country}` };
  return { penalty: 0, label: "" };
}

/** Business sector penalty map (UAE CBUAE Sectoral Risk Assessment 2023). */
const SECTOR_PENALTIES: Record<string, { penalty: number; label: string }> = {
  "gold": { penalty: 25, label: "sector:gold/precious_metals:+25" },
  "precious metals": { penalty: 25, label: "sector:gold/precious_metals:+25" },
  "gold/precious metals": { penalty: 25, label: "sector:gold/precious_metals:+25" },
  "real estate": { penalty: 20, label: "sector:real_estate:+20" },
  "crypto": { penalty: 25, label: "sector:crypto/VASP:+25" },
  "vasp": { penalty: 25, label: "sector:crypto/VASP:+25" },
  "crypto/vasp": { penalty: 25, label: "sector:crypto/VASP:+25" },
  "hawala": { penalty: 30, label: "sector:hawala/MTO:+30" },
  "mto": { penalty: 30, label: "sector:hawala/MTO:+30" },
  "hawala/mto": { penalty: 30, label: "sector:hawala/MTO:+30" },
  "money transfer": { penalty: 30, label: "sector:hawala/MTO:+30" },
  "defense": { penalty: 35, label: "sector:defense/arms:+35" },
  "arms": { penalty: 35, label: "sector:defense/arms:+35" },
  "defense/arms": { penalty: 35, label: "sector:defense/arms:+35" },
  "gaming": { penalty: 20, label: "sector:gaming/gambling:+20" },
  "gambling": { penalty: 20, label: "sector:gaming/gambling:+20" },
  "gaming/gambling": { penalty: 20, label: "sector:gaming/gambling:+20" },
  "charities": { penalty: 15, label: "sector:charities/NGO:+15" },
  "ngo": { penalty: 15, label: "sector:charities/NGO:+15" },
  "charities/ngo": { penalty: 15, label: "sector:charities/NGO:+15" },
};

/** Product risk penalty map. */
const PRODUCT_PENALTIES: Record<string, { penalty: number; label: string }> = {
  "private banking": { penalty: 20, label: "product:private_banking:+20" },
  "correspondent banking": { penalty: 25, label: "product:correspondent_banking:+25" },
  "crypto services": { penalty: 20, label: "product:crypto_services:+20" },
  "trade finance": { penalty: 15, label: "product:trade_finance:+15" },
};

/** Map CDD tier to review frequency. */
function tierToReviewFrequency(tier: CddTier): ReviewFrequency {
  switch (tier) {
    case "standard": return "annual";
    case "enhanced": return "semi_annual";
    case "intensive": return "quarterly";
    case "prohibited": return "monthly"; // ongoing exit monitoring
  }
}

/** Map score to CDD tier. */
function scoreToCddTier(score: number): CddTier {
  if (score >= 75) return "prohibited";
  if (score >= 50) return "intensive";
  if (score >= 30) return "enhanced";
  return "standard";
}

/** Build a human-readable recommendation from tier. */
function buildRecommendation(tier: CddTier, score: number): string {
  switch (tier) {
    case "standard":
      return `Score ${score}: Apply Standard CDD measures. Annual review sufficient. No enhanced monitoring required.`;
    case "enhanced":
      return `Score ${score}: Apply Enhanced Due Diligence (EDD). Obtain additional KYC documentation, source of funds/wealth verification. Semi-annual review required.`;
    case "intensive":
      return `Score ${score}: Apply Intensive CDD. Mandatory ongoing transaction monitoring, senior management approval required before onboarding or relationship continuation. Quarterly review required.`;
    case "prohibited":
      return `Score ${score}: Customer meets prohibited-risk threshold under UAE CBUAE Standards. Do not onboard / exit existing relationship immediately. Refer to MLRO for potential STR filing.`;
  }
}

// ---------------------------------------------------------------------------
// Core scoring engine
// ---------------------------------------------------------------------------

interface ScoringResult {
  riskScore: number;
  riskDrivers: string[];
}

function computeCrrScore(body: RequestBody): ScoringResult {
  let score = 0;
  const drivers: string[] = [];

  // (a) Customer type base risk
  const typeBaseMap: Record<CustomerType, number> = {
    individual: 10,
    corporate: 20,
    financial_institution: 25,
    dnfbp: 30,
    ngo: 35,
  };
  const typeBase = typeBaseMap[body.customerType];
  score += typeBase;
  drivers.push(`customer_type:${body.customerType}:base_${typeBase}`);

  // (b) PEP status
  const pepStatus = body.pepStatus ?? "none";
  if (pepStatus === "tier1") {
    score += 40;
    drivers.push("pep_status:tier1_head_of_state_government:+40");
  } else if (pepStatus === "tier2") {
    score += 30;
    drivers.push("pep_status:tier2_senior_official:+30");
  } else if (pepStatus === "tier3") {
    score += 20;
    drivers.push("pep_status:tier3_family_associate:+20");
  }

  // (c) Geographic risk — nationality
  const natRisk = geoRisk(body.nationality);
  if (natRisk.penalty > 0) {
    score += natRisk.penalty;
    drivers.push(`nationality:${natRisk.label}:+${natRisk.penalty}`);
  }

  // (c) Geographic risk — residency (additive, separate country may compound)
  const normNat = normCountry(body.nationality);
  const normRes = normCountry(body.residencyCountry);
  if (normRes !== normNat) {
    const resRisk = geoRisk(body.residencyCountry);
    if (resRisk.penalty > 0) {
      score += resRisk.penalty;
      drivers.push(`residency:${resRisk.label}:+${resRisk.penalty}`);
    }
  }

  // (d) Business sector risk
  if (body.businessSector) {
    const sectorKey = body.businessSector.toLowerCase().trim();
    // Try exact match first, then substring scan
    let sectorEntry = SECTOR_PENALTIES[sectorKey];
    if (!sectorEntry) {
      for (const [key, val] of Object.entries(SECTOR_PENALTIES)) {
        if (sectorKey.includes(key) || key.includes(sectorKey)) {
          sectorEntry = val;
          break;
        }
      }
    }
    if (sectorEntry) {
      score += sectorEntry.penalty;
      drivers.push(sectorEntry.label);
    }
  }

  // (e) Product risk — apply highest single product penalty per product type
  if (Array.isArray(body.productTypes) && body.productTypes.length > 0) {
    const addedLabels = new Set<string>();
    for (const product of body.productTypes) {
      const productKey = product.toLowerCase().trim();
      let productEntry = PRODUCT_PENALTIES[productKey];
      if (!productEntry) {
        for (const [key, val] of Object.entries(PRODUCT_PENALTIES)) {
          if (productKey.includes(key) || key.includes(productKey)) {
            productEntry = val;
            break;
          }
        }
      }
      if (productEntry && !addedLabels.has(productEntry.label)) {
        score += productEntry.penalty;
        drivers.push(productEntry.label);
        addedLabels.add(productEntry.label);
      }
    }
  }

  // (f) Channel risk
  const channel = body.channelType;
  if (channel === "agent" || channel === "correspondent") {
    score += 20;
    drivers.push(`channel:${channel}:+20`);
  } else if (channel === "digital") {
    score += 10;
    drivers.push("channel:digital_no_face_to_face:+10");
  }

  // Bonus risk signals (sanctions / adverse media / transaction volume)
  const sanctionsHits = body.sanctionsHits ?? 0;
  if (sanctionsHits > 0) {
    const sanctionsPenalty = Math.min(sanctionsHits * 20, 40);
    score += sanctionsPenalty;
    drivers.push(`sanctions_hits:${sanctionsHits}:+${sanctionsPenalty}`);
  }

  const adverseMediaHits = body.adverseMediaHits ?? 0;
  if (adverseMediaHits > 0) {
    const mediaPenalty = Math.min(adverseMediaHits * 10, 20);
    score += mediaPenalty;
    drivers.push(`adverse_media_hits:${adverseMediaHits}:+${mediaPenalty}`);
  }

  // High transaction volume (>= AED 5M) — potential for structural complexity
  const txVolume = body.transactionVolumeAed ?? 0;
  if (txVolume >= 5_000_000) {
    score += 10;
    drivers.push(`transaction_volume_aed:${txVolume}:+10`);
  }

  return { riskScore: score, riskDrivers: drivers };
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
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400, headers: gate.headers });
  }

  // Validate required fields
  if (!body.customerId || !body.customerType || !body.nationality || !body.residencyCountry) {
    return NextResponse.json(
      { ok: false, error: "customerId, customerType, nationality, and residencyCountry are required" },
      { status: 400, headers: gate.headers },
    );
  }

  const validCustomerTypes: CustomerType[] = ["individual", "corporate", "financial_institution", "dnfbp", "ngo"];
  if (!validCustomerTypes.includes(body.customerType)) {
    return NextResponse.json(
      { ok: false, error: `customerType must be one of: ${validCustomerTypes.join(", ")}` },
      { status: 400, headers: gate.headers },
    );
  }

  try {
    writeAuditEvent("analyst", "customer_risk_rating.assessment", body.customerId);
  } catch (err) {
    console.warn("[hawkeye] customer-risk-rating writeAuditEvent failed:", err);
  }

  const { riskScore, riskDrivers } = computeCrrScore(body);
  const cddTier = scoreToCddTier(riskScore);
  const reviewFrequency = tierToReviewFrequency(cddTier);
  const seniorApprovalRequired = cddTier === "intensive" || cddTier === "prohibited";
  const recommendation = buildRecommendation(cddTier, riskScore);

  const regulatoryBasis = [
    "UAE CBUAE AML/CFT Standards",
    "FATF RBA Guidance",
    "UAE FDL 10/2025",
  ];

  void writeAuditChainEntry(
    {
      event: "customer_risk_rating.assessed",
      actor: gate.keyId,
      customerId: body.customerId,
      riskScore,
      cddTier,
      reviewFrequency,
      seniorApprovalRequired,
      riskDrivers,
    },
    tenantIdFromGate(gate),
  ).catch((err) =>
    console.warn(
      "[customer-risk-rating] audit chain write failed:",
      err instanceof Error ? err.message : String(err),
    ),
  );

  const responseBody: CrrResponse = {
    ok: true,
    riskScore,
    cddTier,
    riskDrivers,
    reviewFrequency,
    seniorApprovalRequired,
    recommendation,
    regulatoryBasis,
  };

  return NextResponse.json(responseBody, { headers: gate.headers });
}
