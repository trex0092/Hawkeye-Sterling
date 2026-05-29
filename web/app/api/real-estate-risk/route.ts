// Hawkeye Sterling — UAE Real Estate AML Risk Assessment
//
// POST /api/real-estate-risk
//
// Deterministic rule-based scoring for UAE DNFBP-regulated real estate
// transactions per UAE Federal Decree-Law 10/2025 (FDL 10/2025) Art.14,
// RERA AML Guidelines 2024, and FATF Recommendation 22.
//
// Risk factors assessed:
//   - High-value property (> AED 2,000,000) — EDD trigger per UAE law
//   - Cash purchase — very high ML risk; prohibited above AED 55,000
//   - Crypto payment — emerging ML typology
//   - Off-plan purchase — common ML vehicle with non-standard payment schedules
//   - Price variance below market — possible price manipulation / asset inflation
//   - Corporate buyer with UBO complexity — beneficial ownership obscurity
//   - High-risk buyer nationality — FATF grey/blacklisted or sanctioned jurisdiction
//   - Intermediary chain > 2 — complex intermediation typology
//   - Rapid resale < 90 days — possible round-trip / layering

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { getCountryRisk } from "@/lib/server/high-risk-countries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ── UAE sanctions-designated jurisdictions for real estate enhanced scrutiny ──
// Separate from FATF greylist: these trigger the +40 sanctioned-jurisdiction flag.
const SANCTIONED_JURISDICTIONS = new Set<string>([
  "KP", // North Korea — FATF blacklist + UN sanctions
  "IR", // Iran — FATF blacklist + OFAC SDN
  "SY", // Syria — UN sanctions
  "LY", // Libya (specific designations) — UN sanctions
  "SO", // Somalia — UN sanctions
]);

const UAE_CASH_LIMIT_AED = 55_000;
const HIGH_VALUE_THRESHOLD_AED = 2_000_000;
const PRICE_VARIANCE_THRESHOLD_PCT = 20;
const RAPID_RESALE_DAYS = 90;
const MAX_INTERMEDIARIES = 2;

interface RequestBody {
  propertyValue: number;
  purchaseCurrency: string;
  buyerType: "individual" | "corporate";
  buyerNationality: string;
  paymentMethod: "cash" | "mortgage" | "crypto" | "wire_transfer" | "cheque";
  isOffPlan: boolean;
  intermediaries?: string[];
  titleDeedNumber?: string;
  propertyType?: "residential" | "commercial" | "land";
  priceVariance?: number;
  /** Days since purchase if a resale is already planned/registered */
  daysToResale?: number;
}

interface RealEstateRiskResponse {
  ok: true;
  riskScore: number;
  riskLevel: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  flags: string[];
  dnfbpObligations: string[];
  requiredChecks: string[];
  recommendation: string;
}

function resolveAed(value: number, currency: string): number {
  // Approximate conversion for threshold checks only.
  // Exact rate must come from a live FX feed in production.
  const rates: Record<string, number> = {
    AED: 1,
    USD: 3.6725,
    EUR: 4.0,
    GBP: 4.65,
    SAR: 0.979,
    GBP_APPROX: 4.65,
  };
  const rate = rates[currency.toUpperCase()] ?? 1;
  return value * rate;
}

function deriveRiskLevel(score: number): "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" {
  if (score >= 80) return "CRITICAL";
  if (score >= 55) return "HIGH";
  if (score >= 30) return "MEDIUM";
  return "LOW";
}

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

  // ── Input validation ────────────────────────────────────────────────────────
  if (typeof body.propertyValue !== "number" || body.propertyValue <= 0) {
    return NextResponse.json(
      { ok: false, error: "propertyValue must be a positive number" },
      { status: 400, headers: gate.headers },
    );
  }
  if (!body.purchaseCurrency || typeof body.purchaseCurrency !== "string") {
    return NextResponse.json(
      { ok: false, error: "purchaseCurrency is required" },
      { status: 400, headers: gate.headers },
    );
  }
  if (!["individual", "corporate"].includes(body.buyerType)) {
    return NextResponse.json(
      { ok: false, error: "buyerType must be 'individual' or 'corporate'" },
      { status: 400, headers: gate.headers },
    );
  }
  if (!["cash", "mortgage", "crypto", "wire_transfer", "cheque"].includes(body.paymentMethod)) {
    return NextResponse.json(
      { ok: false, error: "paymentMethod must be one of: cash, mortgage, crypto, wire_transfer, cheque" },
      { status: 400, headers: gate.headers },
    );
  }

  // ── Risk scoring ────────────────────────────────────────────────────────────
  let riskScore = 0;
  const flags: string[] = [];
  const requiredChecks: string[] = [];

  const valueAed = resolveAed(body.propertyValue, body.purchaseCurrency);

  // (a) High-value threshold — EDD required above AED 2,000,000
  if (valueAed > HIGH_VALUE_THRESHOLD_AED) {
    riskScore += 10;
    flags.push(
      `high_value_property — property value AED ${valueAed.toLocaleString("en-AE", { maximumFractionDigits: 0 })} exceeds AED 2,000,000 EDD threshold per UAE FDL 10/2025 Art.14`,
    );
    requiredChecks.push("Enhanced Due Diligence (EDD) mandatory — value exceeds AED 2,000,000 threshold");
    requiredChecks.push("Source of funds declaration required");
  }

  // (b) Cash purchase — very high ML risk; prohibited above AED 55,000 in UAE
  if (body.paymentMethod === "cash") {
    riskScore += 40;
    flags.push(
      "cash_purchase — all-cash real estate transaction is a primary ML typology; cash payments above AED 55,000 are prohibited under UAE AML regulations",
    );
    requiredChecks.push("Verify source of funds — cash payment requires documentary evidence (bank statements, salary slips, asset disposal records)");
    requiredChecks.push("File STR if cash component exceeds AED 55,000 — cash prohibition applies");
    if (valueAed > UAE_CASH_LIMIT_AED) {
      flags.push("cash_prohibition_breach — cash transaction value exceeds AED 55,000 UAE cash payment limit");
      requiredChecks.push("Regulatory escalation required — mandatory STR filing under FDL 10/2025");
    }
  }

  // (c) Crypto payment — emerging ML typology in real estate
  if (body.paymentMethod === "crypto") {
    riskScore += 30;
    flags.push(
      "crypto_payment — cryptocurrency used for real estate purchase is an emerging ML typology; VASP counterparty and blockchain tracing required",
    );
    requiredChecks.push("Identify and verify VASP counterparty — confirm licensing under VARA/CBUAE");
    requiredChecks.push("Blockchain transaction tracing — screen sending address against OFAC, Chainalysis, or equivalent");
    requiredChecks.push("Wallet ownership verification required — confirm beneficial owner of crypto wallet");
  }

  // (d) Off-plan risk — common ML vehicle via non-standard payment schedules
  if (body.isOffPlan) {
    riskScore += 15;
    flags.push(
      "off_plan_purchase — off-plan real estate is a known ML vehicle; non-standard payment schedules can obscure fund layering",
    );
    requiredChecks.push("Verify developer registration with RERA — confirm escrow account compliance");
    requiredChecks.push("Review payment schedule for irregularities — off-plan overpayments are a red flag");
    requiredChecks.push("Confirm payment originates from buyer's own account — third-party payment screening");
  }

  // (e) Price variance — possible price manipulation if >20% below market
  if (typeof body.priceVariance === "number" && body.priceVariance > PRICE_VARIANCE_THRESHOLD_PCT) {
    riskScore += 25;
    flags.push(
      `below_market_price — purchase price is ${body.priceVariance}% below market value (threshold: ${PRICE_VARIANCE_THRESHOLD_PCT}%); indicates possible price manipulation or undisclosed cash element`,
    );
    requiredChecks.push("Independent RICS valuation required — confirm market value and variance");
    requiredChecks.push("Investigate relationship between buyer and seller — potential connected-party transaction");
    requiredChecks.push("Check for side payments or undisclosed consideration");
  }

  // (f) Corporate buyer UBO complexity — beneficial ownership obscurity
  if (body.buyerType === "corporate") {
    riskScore += 20;
    flags.push(
      "corporate_buyer_ubo_complexity — corporate purchaser introduces layered ownership structure; UBO identification required per UAE FDL 10/2025 Art.10 and Cabinet Decision 58/2020",
    );
    requiredChecks.push("Full UBO registry check — identify all natural persons owning > 25% directly or indirectly");
    requiredChecks.push("Obtain corporate ownership chart and constitutional documents");
    requiredChecks.push("Screen all UBOs, directors, and authorised signatories against sanctions and PEP lists");
    requiredChecks.push("Cross-reference against UAE ICV (In-Country Value) and commercial registry");
  }

  // (g) High-risk buyer nationality — FATF grey/blacklist or sanctioned jurisdiction
  const countryRisk = getCountryRisk(body.buyerNationality);
  if (countryRisk) {
    const isSanctioned = SANCTIONED_JURISDICTIONS.has(countryRisk.iso2);
    if (isSanctioned) {
      riskScore += 40;
      flags.push(
        `sanctioned_jurisdiction_nationality — buyer nationality ${countryRisk.name} (${countryRisk.iso2}) is a sanctioned jurisdiction; transaction may be prohibited`,
      );
      requiredChecks.push("OFAC/UN/EU/UAE sanctions screening mandatory — potential prohibited transaction");
      requiredChecks.push("Legal counsel required before proceeding — sanctions nexus may prohibit transaction completion");
    } else if (countryRisk.tier === "blacklist") {
      riskScore += 40;
      flags.push(
        `fatf_blacklist_nationality — buyer nationality ${countryRisk.name} (${countryRisk.iso2}) is on the FATF blacklist (High-Risk / Call for Action); basis: ${countryRisk.basis.join(", ")}`,
      );
      requiredChecks.push("Enhanced scrutiny mandatory — FATF blacklisted jurisdiction nationality");
      requiredChecks.push("Senior management approval required before onboarding or transaction completion");
    } else if (countryRisk.tier === "greylist") {
      riskScore += 20;
      flags.push(
        `fatf_greylist_nationality — buyer nationality ${countryRisk.name} (${countryRisk.iso2}) is on the FATF greylist (Increased Monitoring); basis: ${countryRisk.basis.join(", ")}`,
      );
      requiredChecks.push("Enhanced customer due diligence (ECDD) required — FATF greylist nationality");
    } else if (countryRisk.tier === "elevated") {
      riskScore += 15;
      flags.push(
        `elevated_risk_nationality — buyer nationality ${countryRisk.name} (${countryRisk.iso2}) is an elevated-risk jurisdiction; basis: ${countryRisk.basis.join(", ")}`,
      );
      requiredChecks.push("Enhanced due diligence recommended — elevated-risk jurisdiction nationality");
    }
  }

  // (h) Intermediary chain — complex intermediation if > 2 intermediaries
  const intermediaryCount = Array.isArray(body.intermediaries) ? body.intermediaries.length : 0;
  if (intermediaryCount > MAX_INTERMEDIARIES) {
    riskScore += 20;
    flags.push(
      `complex_intermediary_chain — ${intermediaryCount} intermediaries identified (threshold: ${MAX_INTERMEDIARIES}); layered intermediation is a recognised ML typology for real estate`,
    );
    requiredChecks.push(`Screen all ${intermediaryCount} intermediaries — verify identity, licensing, and beneficial ownership`);
    requiredChecks.push("Establish business rationale for multi-intermediary structure");
    requiredChecks.push("Confirm no intermediary is a shell entity or nominee");
  }

  // (i) Rapid resale indicator — possible round-trip if < 90 days
  if (typeof body.daysToResale === "number" && body.daysToResale < RAPID_RESALE_DAYS) {
    flags.push(
      `possible_round_trip — resale planned within ${body.daysToResale} days of purchase (threshold: ${RAPID_RESALE_DAYS} days); rapid resale is a red flag for layering and round-tripping`,
    );
    requiredChecks.push("Investigate economic rationale for rapid resale — confirm legitimate purpose");
    requiredChecks.push("Check for linked buyer/seller relationship — potential connected-party round-trip");
    requiredChecks.push("Review transaction chain for recycled funds entering financial system");
  }

  // ── Cap score at 100 ────────────────────────────────────────────────────────
  riskScore = Math.min(100, riskScore);
  const riskLevel = deriveRiskLevel(riskScore);

  // ── Standard DNFBP checks regardless of risk score ─────────────────────────
  requiredChecks.push("Identity verification of buyer — Emirates ID / passport per UAE AML law");
  requiredChecks.push("Sanctions screening — UN, OFAC, EU, UAE local list");
  requiredChecks.push("PEP screening — all principals and authorised signatories");
  requiredChecks.push("DLD/RERA transaction registration verification");
  if (body.titleDeedNumber) {
    requiredChecks.push(`Title deed verification — confirm DLD record for deed ${body.titleDeedNumber}`);
  }

  // ── Recommendation ─────────────────────────────────────────────────────────
  let recommendation: string;
  if (riskLevel === "CRITICAL") {
    recommendation =
      "REJECT or ESCALATE IMMEDIATELY — risk score exceeds critical threshold. File STR with UAE FIU (goAML) and obtain MLRO sign-off before any further action. Do not proceed with transaction without legal counsel review.";
  } else if (riskLevel === "HIGH") {
    recommendation =
      "ESCALATE TO MLRO — enhanced due diligence mandatory. Obtain MLRO written approval before proceeding. Consider STR filing if red flags cannot be satisfactorily explained. Senior management awareness required.";
  } else if (riskLevel === "MEDIUM") {
    recommendation =
      "PROCEED WITH CAUTION — complete all required checks before transaction completion. Document risk rationale and obtain compliance sign-off. Monitor for additional red flags post-completion.";
  } else {
    recommendation =
      "PROCEED WITH STANDARD CDD — complete identity verification, sanctions screening, and DLD registration checks. Document file and retain records per UAE AML record-keeping requirements (5 years minimum).";
  }

  // ── Audit chain entry ──────────────────────────────────────────────────────
  void writeAuditChainEntry(
    {
      event: "real_estate_risk.assessed",
      actor: gate.keyId,
      propertyValue: body.propertyValue,
      purchaseCurrency: body.purchaseCurrency,
      buyerType: body.buyerType,
      buyerNationality: body.buyerNationality,
      paymentMethod: body.paymentMethod,
      riskScore,
      riskLevel,
      flagCount: flags.length,
    },
    tenantIdFromGate(gate),
  ).catch((err) =>
    console.warn(
      "[real-estate-risk] audit chain write failed:",
      err instanceof Error ? err.message : String(err),
    ),
  );

  const responseBody: RealEstateRiskResponse = {
    ok: true,
    riskScore,
    riskLevel,
    flags,
    dnfbpObligations: [
      "UAE FDL 10/2025 Art.14 — DNFBP real estate EDD obligations",
      "RERA AML Guidelines 2024 — real estate broker CDD requirements",
      "UAE FDL 10/2025 Art.10 — beneficial ownership identification",
      "FATF Recommendation 22 — DNFBP customer due diligence",
      "FATF Recommendation 23 — DNFBP reporting obligations",
      "UAE Cabinet Decision 58/2020 — UBO registration requirements",
    ],
    requiredChecks: [...new Set(requiredChecks)], // deduplicate
    recommendation,
  };

  return NextResponse.json(responseBody, { headers: gate.headers });
}
