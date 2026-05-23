export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { writeAuditEvent } from "@/lib/audit";

// ---------------------------------------------------------------------------
// Request / Response types
// ---------------------------------------------------------------------------

interface RequestBody {
  entityName: string;
  countryCode: string;
  ownershipCountries?: string[];
  shipmentRoutes?: string[];
  financialInstitutions?: string[];
  paymentStructure?: string;
  incorporationDate?: string;
  industryCode?: string;
  tradePartners?: string[];
}

export interface SanctionsEvasionResponse {
  ok: true;
  riskScore: number;
  riskLevel: "low" | "medium" | "high" | "critical";
  evasionSchemes: string[];
  sanctionsApplicable: string[];
  recommendation: string;
  regulatoryBasis: string[];
  ruleFlags: string[];
}

// ---------------------------------------------------------------------------
// Sanctioned-jurisdiction sets (per OFAC / CBUAE advisories)
// ---------------------------------------------------------------------------

/** Countries commonly used as transit points to circumvent Russia sanctions (post-Feb 2022). */
const RUSSIA_CIS_TRANSIT = new Set([
  "TR", // Turkey
  "AE", // UAE
  "AM", // Armenia
  "GE", // Georgia
  "KZ", // Kazakhstan
  "UZ", // Uzbekistan
]);

/** Countries used as Iran sanctions evasion corridors. */
const IRAN_EVASION_CORRIDORS = new Set([
  "AE", // UAE
  "OM", // Oman
  "TR", // Turkey
  "IQ", // Iraq
  "MY", // Malaysia
  "CN", // China
]);

/** HS code prefixes linked to dual-use/controlled goods flows to Russia. */
const RUSSIA_CONTROLLED_HS_PREFIXES = [
  "85", // Electronics / semiconductors (HS 85xx)
  "88", // Aircraft parts (HS 88xx)
];

/** HS code prefixes / industry keywords associated with DPRK commodity evasion. */
const DPRK_COMMODITY_KEYWORDS = ["coal", "iron ore", "iron", "ore", "mineral", "57", "26"];

/** Industry keyword patterns matching luxury goods. */
const LUXURY_GOODS_KEYWORDS = ["luxury", "watch", "jewel", "jewellery", "art", "yacht", "supercar", "vehicle", "fashion"];

/** Directly sanctioned country codes (primary subjects — not corridors). */
const PRIMARY_SANCTIONED_COUNTRIES = new Set([
  "RU", // Russia
  "IR", // Iran
  "KP", // North Korea / DPRK
  "SY", // Syria
  "CU", // Cuba
  "VE", // Venezuela
  "BY", // Belarus
]);

// ---------------------------------------------------------------------------
// Rule-based scoring engine
// ---------------------------------------------------------------------------

interface ScoringResult {
  score: number;
  evasionSchemes: string[];
  sanctionsApplicable: string[];
  ruleFlags: string[];
}

function normalizeList(arr: string[] | undefined): string[] {
  return Array.isArray(arr) ? arr.map((s) => s.toUpperCase().trim()) : [];
}

function normalizeLower(arr: string[] | undefined): string[] {
  return Array.isArray(arr) ? arr.map((s) => s.toLowerCase().trim()) : [];
}

/**
 * Core deterministic scoring function.
 * Applies OFAC/CBUAE/UN-based evasion pattern rules and returns an additive
 * risk score (capped at 100) together with the triggered schemes.
 */
function computeEvasionScore(body: RequestBody): ScoringResult {
  let score = 0;
  const evasionSchemes: string[] = [];
  const sanctionsApplicable: string[] = [];
  const ruleFlags: string[] = [];

  const countryUp = body.countryCode.toUpperCase().trim();
  const ownership = normalizeList(body.ownershipCountries);
  const routes = normalizeList(body.shipmentRoutes);
  const partners = normalizeLower(body.tradePartners);
  const fiLower = normalizeLower(body.financialInstitutions);
  const industryLower = (body.industryCode ?? "").toLowerCase().trim();
  const paymentLower = (body.paymentStructure ?? "").toLowerCase().trim();

  // Helper: all countries visible to this entity (home + ownership + routes + partners-as-CC).
  const allCountries = new Set<string>([
    countryUp,
    ...ownership,
    ...routes,
  ]);

  // ── (a) Russia sanctions evasion ────────────────────────────────────────

  // CIS transit routing — each corridor country: +25, capped at +50 total for this sub-rule.
  const transitHits = [...allCountries].filter((c) => RUSSIA_CIS_TRANSIT.has(c));
  if (transitHits.length > 0) {
    const penalty = Math.min(transitHits.length * 25, 50);
    score += penalty;
    evasionSchemes.push("cis_transit_routing");
    sanctionsApplicable.push("Russia (OFAC/EU/UK post-Feb 2022)");
    ruleFlags.push(
      `cis_transit_routing:+${penalty} (via ${transitHits.join(", ")})`,
    );
  }

  // Dual-use / controlled trade categories that surged to Russia post-2022.
  const controlledHsMatch = RUSSIA_CONTROLLED_HS_PREFIXES.some(
    (prefix) => industryLower.startsWith(prefix),
  );
  const luxuryMatch = LUXURY_GOODS_KEYWORDS.some((kw) => industryLower.includes(kw));
  if (controlledHsMatch || luxuryMatch) {
    const label = controlledHsMatch ? "dual_use_controlled_goods" : "luxury_goods_russia";
    score += 20;
    evasionSchemes.push(label);
    if (!sanctionsApplicable.includes("Russia (OFAC/EU/UK post-Feb 2022)")) {
      sanctionsApplicable.push("Russia (OFAC/EU/UK post-Feb 2022)");
    }
    ruleFlags.push(
      `${label}:+20 (industry: ${body.industryCode ?? industryLower})`,
    );
  }

  // Russian oligarch obscuring via UAE/CIS intermediaries.
  // Triggered when the entity is in (or routes through) UAE/CIS AND the primary
  // country is Russia or a direct Russian entity.
  const uaeCisOwnership = ownership.filter((c) => RUSSIA_CIS_TRANSIT.has(c));
  if (countryUp === "RU" && uaeCisOwnership.length > 0) {
    score += 30;
    evasionSchemes.push("russian_oligarch_uae_cis_intermediary");
    if (!sanctionsApplicable.includes("Russia (OFAC/EU/UK post-Feb 2022)")) {
      sanctionsApplicable.push("Russia (OFAC/EU/UK post-Feb 2022)");
    }
    ruleFlags.push(
      `russian_oligarch_uae_cis_intermediary:+30 (beneficial ownership via ${uaeCisOwnership.join(", ")})`,
    );
  }

  // ── (b) Iran sanctions evasion ───────────────────────────────────────────

  // Iran evasion corridor — any matching route/ownership country.
  const iranHits = [...allCountries].filter((c) => IRAN_EVASION_CORRIDORS.has(c));
  if (iranHits.length > 0 && (countryUp === "IR" || routes.includes("IR") || ownership.includes("IR"))) {
    score += 30;
    evasionSchemes.push("iran_evasion_corridor");
    sanctionsApplicable.push("Iran (OFAC SDN / EU / UN)");
    ruleFlags.push(
      `iran_evasion_corridor:+30 (via ${iranHits.join(", ")})`,
    );
  }

  // Oil trading through intermediaries to obscure Iranian origin.
  const oilKeywords = ["oil", "petroleum", "crude", "petrochemical", "lng", "lpg", "gas", "27", "2709", "2711"];
  const oilMatch = oilKeywords.some((kw) => industryLower.includes(kw));
  if (oilMatch && IRAN_EVASION_CORRIDORS.has(countryUp)) {
    score += 35;
    evasionSchemes.push("iranian_oil_intermediary");
    if (!sanctionsApplicable.includes("Iran (OFAC SDN / EU / UN)")) {
      sanctionsApplicable.push("Iran (OFAC SDN / EU / UN)");
    }
    ruleFlags.push("iranian_oil_intermediary:+35 (oil/petroleum trade in Iran evasion jurisdiction)");
  }

  // Shipping company in UAE with Iranian MMSI-linked vessel operators.
  const shippingKeywords = ["shipping", "marine", "vessel", "tanker", "maritime", "sea transport", "mmsi"];
  const shippingMatch = shippingKeywords.some((kw) => industryLower.includes(kw) || fiLower.some((fi) => fi.includes(kw)));
  if (shippingMatch && countryUp === "AE" && (ownership.includes("IR") || routes.includes("IR"))) {
    score += 40;
    evasionSchemes.push("uae_shipping_iranian_vessel_operator");
    if (!sanctionsApplicable.includes("Iran (OFAC SDN / EU / UN)")) {
      sanctionsApplicable.push("Iran (OFAC SDN / EU / UN)");
    }
    ruleFlags.push("uae_shipping_iranian_vessel_operator:+40 (UAE shipping co with Iranian ownership/route link)");
  }

  // ── (c) DPRK sanctions evasion ──────────────────────────────────────────

  // Coal/iron ore from DPRK via China.
  const dprk = ownership.includes("KP") || countryUp === "KP" || routes.includes("KP");
  const dprk_china = routes.includes("CN") || ownership.includes("CN");
  const dprk_commodity = DPRK_COMMODITY_KEYWORDS.some((kw) => industryLower.includes(kw));
  if (dprk && dprk_china && dprk_commodity) {
    score += 40;
    evasionSchemes.push("dprk_commodity_evasion");
    sanctionsApplicable.push("DPRK (UN SC Resolutions / OFAC)");
    ruleFlags.push("dprk_commodity_evasion:+40 (DPRK coal/iron ore via Chinese intermediary)");
  } else if (dprk && dprk_commodity) {
    // Partial — DPRK commodity without confirmed China routing.
    score += 30;
    evasionSchemes.push("dprk_commodity_evasion");
    if (!sanctionsApplicable.includes("DPRK (UN SC Resolutions / OFAC)")) {
      sanctionsApplicable.push("DPRK (UN SC Resolutions / OFAC)");
    }
    ruleFlags.push("dprk_commodity_evasion:+30 (DPRK commodity trade detected)");
  }

  // Cryptocurrency on behalf of DPRK actors (Lazarus Group / OFAC designation).
  const cryptoKeywords = ["crypto", "bitcoin", "ethereum", "usdt", "stablecoin", "defi", "blockchain", "mixer", "tumbler", "virtual asset"];
  const cryptoMatch = cryptoKeywords.some(
    (kw) => industryLower.includes(kw) || paymentLower.includes(kw) || partners.some((p) => p.includes(kw)),
  );
  if (cryptoMatch && (ownership.includes("KP") || countryUp === "KP")) {
    score += 45;
    evasionSchemes.push("dprk_crypto_laundering");
    if (!sanctionsApplicable.includes("DPRK (UN SC Resolutions / OFAC)")) {
      sanctionsApplicable.push("DPRK (UN SC Resolutions / OFAC)");
    }
    ruleFlags.push("dprk_crypto_laundering:+45 (cryptocurrency activity with DPRK connection)");
  }

  // ── (d) Front company indicators ────────────────────────────────────────

  // Newly-formed shell: incorporated < 6 months before large transaction.
  if (body.incorporationDate) {
    const incDate = new Date(body.incorporationDate);
    const now = new Date();
    const monthsOld = (now.getFullYear() - incDate.getFullYear()) * 12 + (now.getMonth() - incDate.getMonth());
    if (!isNaN(incDate.getTime()) && monthsOld >= 0 && monthsOld < 6) {
      score += 20;
      evasionSchemes.push("newly_formed_shell_company");
      ruleFlags.push(`newly_formed_shell_company:+20 (incorporated ${monthsOld} month(s) ago)`);
    }
  }

  // Industry code doesn't match actual trade (mismatched industry detected via keyword heuristic).
  // Flag when industryCode is provided but shipment routes/partners strongly suggest a different sector.
  const financialSectorCodes = ["64", "65", "66", "k", "financial", "bank", "insurance"];
  const tradingSectorCodes = ["46", "trading", "wholesale", "import", "export"];
  const isFinancial = financialSectorCodes.some((c) => industryLower.startsWith(c) || industryLower.includes(c));
  const isTradingByIndustry = tradingSectorCodes.some((c) => industryLower.startsWith(c) || industryLower.includes(c));
  const hasShipmentActivity = (body.shipmentRoutes ?? []).length > 0;
  if (isFinancial && hasShipmentActivity) {
    // Financial entity has physical shipment routes — mismatch.
    score += 25;
    evasionSchemes.push("industry_code_mismatch");
    ruleFlags.push("industry_code_mismatch:+25 (financial sector code but active shipment routes declared)");
  }
  if (isTradingByIndustry && fiLower.length === 0 && hasShipmentActivity && (body.tradePartners ?? []).length === 0) {
    // Trading entity with no financial institutions or trade partners.
    score += 15;
    evasionSchemes.push("industry_code_mismatch");
    ruleFlags.push("industry_code_mismatch:+15 (trading entity with no declared financial institutions or partners)");
  }

  // Multiple different industries listed (indicated by comma-separated industryCode).
  const industryCodes = (body.industryCode ?? "")
    .split(/[,;|/]/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (industryCodes.length > 2) {
    score += 15;
    evasionSchemes.push("multiple_industry_codes");
    ruleFlags.push(`multiple_industry_codes:+15 (${industryCodes.length} industries declared: ${industryCodes.join(", ")})`);
  }

  // ── (e) Beneficial owner nationality contradiction ────────────────────────

  // UAE-incorporated entity with ownership in a sanctioned country.
  if (countryUp === "AE") {
    const sanctionedOwnership = ownership.filter((c) => PRIMARY_SANCTIONED_COUNTRIES.has(c));
    if (sanctionedOwnership.length > 0) {
      score += 35;
      evasionSchemes.push("beneficial_owner_nationality_contradiction");
      const sanctionedNations = sanctionedOwnership.map((c) => {
        const map: Record<string, string> = {
          RU: "Russia", IR: "Iran", KP: "DPRK", SY: "Syria", CU: "Cuba", VE: "Venezuela", BY: "Belarus",
        };
        return map[c] ?? c;
      });
      // Ensure applicable sanctions are recorded.
      for (const c of sanctionedOwnership) {
        if (c === "RU" && !sanctionsApplicable.includes("Russia (OFAC/EU/UK post-Feb 2022)")) {
          sanctionsApplicable.push("Russia (OFAC/EU/UK post-Feb 2022)");
        }
        if (c === "IR" && !sanctionsApplicable.includes("Iran (OFAC SDN / EU / UN)")) {
          sanctionsApplicable.push("Iran (OFAC SDN / EU / UN)");
        }
        if (c === "KP" && !sanctionsApplicable.includes("DPRK (UN SC Resolutions / OFAC)")) {
          sanctionsApplicable.push("DPRK (UN SC Resolutions / OFAC)");
        }
        if (["SY", "CU", "VE", "BY"].includes(c)) {
          sanctionsApplicable.push(`${sanctionedNations.find((_, i) => sanctionedOwnership[i] === c) ?? c} (OFAC)`);
        }
      }
      ruleFlags.push(
        `beneficial_owner_nationality_contradiction:+35 (UAE-incorporated, beneficial owner from ${sanctionedNations.join(", ")})`,
      );
    }
  }

  // Cap at 100.
  score = Math.min(score, 100);

  // De-duplicate schemes / sanctions.
  return {
    score,
    evasionSchemes: [...new Set(evasionSchemes)],
    sanctionsApplicable: [...new Set(sanctionsApplicable)],
    ruleFlags,
  };
}

// ---------------------------------------------------------------------------
// Risk tier mapping
// ---------------------------------------------------------------------------

function scoreToRiskLevel(score: number): "low" | "medium" | "high" | "critical" {
  if (score >= 70) return "critical";
  if (score >= 45) return "high";
  if (score >= 20) return "medium";
  return "low";
}

function buildRecommendation(riskLevel: "low" | "medium" | "high" | "critical", schemes: string[]): string {
  if (riskLevel === "critical") {
    return "Freeze transaction and escalate immediately to MLRO. File STR with CBUAE/FINTRAC. Do not proceed without senior compliance sign-off and potential law enforcement liaison.";
  }
  if (riskLevel === "high") {
    const hasCrypto = schemes.includes("dprk_crypto_laundering");
    if (hasCrypto) return "Terminate relationship or block transaction. File STR. Notify MLRO immediately — DPRK crypto laundering triggers mandatory reporting under CBUAE AML/CFT framework.";
    return "Place entity under Enhanced Due Diligence (EDD). Obtain senior management approval before onboarding/transacting. Consider filing STR with CBUAE if suspicious activity confirmed.";
  }
  if (riskLevel === "medium") {
    return "Apply Enhanced Due Diligence measures. Obtain additional KYC documentation, verify beneficial ownership, and monitor transactions closely. Escalate to MLRO if further red flags emerge.";
  }
  return "Standard Customer Due Diligence (CDD) applies. Continue routine transaction monitoring. No immediate escalation required.";
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
      { ok: false, error: "Invalid JSON" },
      { status: 400, headers: gate.headers },
    );
  }

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

  try {
    writeAuditEvent("analyst", "sanctions-evasion.screen", body.entityName);
  } catch (err) {
    console.warn("[hawkeye] sanctions-evasion writeAuditEvent failed:", err);
  }

  const { score, evasionSchemes, sanctionsApplicable, ruleFlags } = computeEvasionScore(body);
  const riskLevel = scoreToRiskLevel(score);
  const recommendation = buildRecommendation(riskLevel, evasionSchemes);

  const regulatoryBasis: string[] = [
    "OFAC Advisory on Sanctions Evasion 2022",
    "UAE CBUAE Guidance on Russia Sanctions",
    "UN SC Resolution 2270 (DPRK)",
  ];

  void writeAuditChainEntry(
    {
      event: "sanctions_evasion.screened",
      actor: gate.keyId,
      entity: body.entityName,
      countryCode: body.countryCode,
      riskScore: score,
      riskLevel,
      evasionSchemes,
      sanctionsApplicable,
    },
    tenantIdFromGate(gate),
  ).catch((err) =>
    console.warn(
      "[sanctions-evasion] audit chain write failed:",
      err instanceof Error ? err.message : String(err),
    ),
  );

  const responseBody: SanctionsEvasionResponse = {
    ok: true,
    riskScore: score,
    riskLevel,
    evasionSchemes,
    sanctionsApplicable,
    recommendation,
    regulatoryBasis,
    ruleFlags,
  };

  return NextResponse.json(responseBody, { headers: gate.headers });
}
