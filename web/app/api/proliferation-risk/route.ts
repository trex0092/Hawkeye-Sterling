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

interface RequestBody {
  subjectName: string;
  subjectType: "individual" | "corporate" | "vessel" | "freight_forwarder";
  countryCode: string;
  commodities?: string[];
  hsCodesInvolved?: string[];
  destinationCountries: string[];
  endUserCertificate?: boolean;
  exportLicense?: boolean;
  transactionValue?: number;
  relatedEntities?: string[];
  paymentStructure?: "advance" | "lc" | "open_account" | "cash" | "crypto";
}

interface PfRiskResult {
  riskScore: number;
  riskLevel: "critical" | "high" | "medium" | "low";
  sanctionsExposure: string[];
  unResolutionsApplicable: string[];
  exportControlFlags: string[];
  recommendation: string;
  regulatoryBasis: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * FATF R.7 / UN SC Resolution 1718 (DPRK) and 2231 (Iran JCPOA) —
 * jurisdictions subject to WMD-proliferation targeted financial sanctions.
 */
const WMD_JURISDICTIONS = new Set(["KP", "IR"]);

/**
 * UN Consolidated List keyword fragments for known WMD proliferator networks.
 * These appear in names of front companies, intermediaries, and designated
 * entities documented in UN Panel of Experts reports on DPRK and Iran.
 */
const UN_WMD_PROLIFERATOR_KEYWORDS = [
  // DPRK — UN SC 1718 designated entities & front companies
  "korea mining",
  "korea kwangson",
  "namchongang",
  "tanchon",
  "korea ryonbong",
  "korea taesong",
  "mansudae",
  "green pine",
  "ocean maritime",
  "cheil credit",
  "koryo credit",
  "daesong",
  "second academy",
  "missile industry",
  "reconnaissance general bureau",
  "munitions industry",
  // Iran — UN SC 2231 / JCPOA Annex II designated proliferators
  "atomic energy organization",
  "aeoi",
  "nuclear technology",
  "defense industries",
  "aerospace industries",
  "shahid hemmat",
  "shahid bagheri",
  "fajr industrial",
  "parchin chemical",
  "malek ashtar",
  "industrial groups of iran",
  "iran centrifuge",
  "iran electronics",
  "iran space",
  // Generic dual-use / sanctions-evasion intermediary patterns
  "golden caviar",
  "blue ocean shipping",
  "east sea shipping",
  "general technology",
  "precision mechanics",
  "international trading",
  "universal trading",
  "global industrial",
];

/**
 * HS code chapter prefixes that indicate dual-use / controlled goods.
 * Prefixes are two-digit chapter numbers as strings.
 * Source: UAE Cabinet Decision 57/2020 Strategic Goods Control List;
 *         Wassenaar Arrangement; EU Dual-Use Regulation 2021/821.
 */
const DUAL_USE_HS_PREFIXES: Record<string, string> = {
  "28": "chemicals (Chapter 28 — inorganic chemicals, incl. precursors)",
  "29": "chemicals (Chapter 29 — organic chemicals, incl. CWC Schedule precursors)",
  "38": "explosives/pyrotechnics (Chapter 38 — misc chemical products)",
  "71": "nuclear/radioactive materials (Chapter 71 — precious stones, radioactive elements)",
  "84": "industrial machinery/reactors (Chapter 84 — nuclear reactors, machinery)",
  "85": "electronics/electrical equipment (Chapter 85 — electrical machinery, dual-use components)",
  "88": "aircraft/aerospace (Chapter 88 — aircraft, spacecraft, rockets)",
  "93": "arms/weapons (Chapter 93 — firearms, munitions)",
};

// ---------------------------------------------------------------------------
// Rule-based risk scoring
// ---------------------------------------------------------------------------

interface ScoreDetail {
  score: number;
  sanctionsExposure: string[];
  unResolutions: string[];
  exportControlFlags: string[];
  scoringNotes: string[];
  isWmdDestination: boolean;
  hasDualUseGoods: boolean;
}

/**
 * Determine which HS code chapters are present in the supplied list.
 * Returns entries from DUAL_USE_HS_PREFIXES for matched chapters.
 */
function detectDualUseHsCodes(hsCodes: string[]): string[] {
  const detected: Set<string> = new Set();
  for (const code of hsCodes) {
    const normalised = code.replace(/\s/g, "");
    const chapter = normalised.slice(0, 2);
    if (DUAL_USE_HS_PREFIXES[chapter]) {
      detected.add(DUAL_USE_HS_PREFIXES[chapter]);
    }
  }
  return Array.from(detected);
}

/**
 * Check whether any related entity name contains a UN consolidated-list keyword.
 */
function matchesUnProliferatorList(relatedEntities: string[]): string[] {
  const hits: string[] = [];
  for (const entity of relatedEntities) {
    const lower = entity.toLowerCase();
    for (const kw of UN_WMD_PROLIFERATOR_KEYWORDS) {
      if (lower.includes(kw)) {
        hits.push(`"${entity}" matches UN consolidated-list keyword: "${kw}"`);
        break; // one hit per entity is enough
      }
    }
  }
  return hits;
}

/**
 * Core FATF R.7 risk scoring engine.
 * All thresholds and citations are per FATF Recommendation 7 Interpretive Note,
 * UN SC Resolution 1718 (DPRK) and UN SC Resolution 2231 (Iran JCPOA).
 */
function computePfRiskScore(body: RequestBody): ScoreDetail {
  let score = 0;
  const sanctionsExposure: string[] = [];
  const unResolutions: string[] = [];
  const exportControlFlags: string[] = [];
  const scoringNotes: string[] = [];

  const destinations = (body.destinationCountries ?? []).map((c) => c.trim().toUpperCase());
  const hsCodes = body.hsCodesInvolved ?? [];
  const relatedEntities = body.relatedEntities ?? [];

  // ------------------------------------------------------------------
  // (a) WMD-proliferation jurisdiction — immediate critical
  //     UN SC Resolution 1718 (DPRK) / UN SC Resolution 2231 (Iran)
  // ------------------------------------------------------------------
  const wmdDestinations = destinations.filter((c) => WMD_JURISDICTIONS.has(c));
  const isWmdDestination = wmdDestinations.length > 0;

  if (isWmdDestination) {
    score = 95; // immediate critical floor
    for (const dest of wmdDestinations) {
      if (dest === "KP") {
        sanctionsExposure.push("DPRK — subject to comprehensive UN SC TFS under Resolution 1718 (2006)");
        unResolutions.push("UN SC Resolution 1718 (2006) — DPRK comprehensive arms/WMD embargo");
        unResolutions.push("UN SC Resolution 2397 (2017) — DPRK further sanctions");
        scoringNotes.push("WMD destination KP (DPRK): immediate critical +95 [UN SC Res 1718]");
      }
      if (dest === "IR") {
        sanctionsExposure.push("Iran — subject to targeted UN SC TFS under Resolution 2231 (JCPOA)");
        unResolutions.push("UN SC Resolution 2231 (2015) — Iran JCPOA nuclear-related TFS");
        unResolutions.push("UN SC Resolution 1737 (2006) — Iran nuclear programme sanctions");
        scoringNotes.push("WMD destination IR (Iran): immediate critical +95 [UN SC Res 2231]");
      }
    }
  }

  // ------------------------------------------------------------------
  // (b) Dual-use commodity codes — +30 per category present
  //     HS Chapters 28, 29, 38, 71, 84, 85, 88, 93
  // ------------------------------------------------------------------
  const dualUseCategories = detectDualUseHsCodes(hsCodes);
  const hasDualUseGoods = dualUseCategories.length > 0;

  if (hasDualUseGoods) {
    const increment = Math.min(dualUseCategories.length * 30, 90);
    score = Math.min(score + increment, 100);
    for (const cat of dualUseCategories) {
      exportControlFlags.push(`Dual-use HS code detected: ${cat}`);
    }
    scoringNotes.push(`Dual-use HS codes (${dualUseCategories.length} category/ies): +${increment}`);
  }

  // ------------------------------------------------------------------
  // (c) Missing end-user certificate — +30
  //     EUC required for all controlled/dual-use exports
  // ------------------------------------------------------------------
  if (body.endUserCertificate === false && hasDualUseGoods) {
    score = Math.min(score + 30, 100);
    exportControlFlags.push("Missing end-user certificate (EUC) — mandatory for controlled exports");
    scoringNotes.push("Missing EUC with dual-use goods: +30");
  }

  // ------------------------------------------------------------------
  // (d) Missing export license — +35
  //     Export control violation for dual-use goods
  // ------------------------------------------------------------------
  if (body.exportLicense === false && hasDualUseGoods) {
    score = Math.min(score + 35, 100);
    exportControlFlags.push("Missing export license — required for dual-use goods under UAE Federal Law No. 7/2012");
    scoringNotes.push("Missing export license with dual-use goods: +35");
  }

  // ------------------------------------------------------------------
  // (e) Freight forwarder to WMD destination — +40
  //     Common proliferation-financing intermediary typology
  // ------------------------------------------------------------------
  if (body.subjectType === "freight_forwarder" && isWmdDestination) {
    score = Math.min(score + 40, 100);
    sanctionsExposure.push("Freight forwarder transacting with WMD-proliferation jurisdiction — common PF intermediary typology");
    scoringNotes.push("Freight forwarder + WMD destination: +40");
  }

  // ------------------------------------------------------------------
  // (f) Complex/opaque payment to WMD destination — +30
  //     Advance payment or cash avoids normal banking scrutiny
  // ------------------------------------------------------------------
  if ((body.paymentStructure === "advance" || body.paymentStructure === "cash") && isWmdDestination) {
    score = Math.min(score + 30, 100);
    exportControlFlags.push(`Payment structure "${body.paymentStructure}" to WMD destination — avoids banking transparency controls`);
    scoringNotes.push(`Complex payment (${body.paymentStructure}) to WMD destination: +30`);
  }

  // ------------------------------------------------------------------
  // (g) Crypto payment — +20
  //     Sanctions evasion via virtual assets
  // ------------------------------------------------------------------
  if (body.paymentStructure === "crypto") {
    score = Math.min(score + 20, 100);
    exportControlFlags.push("Crypto payment structure — elevated sanctions evasion risk per FATF R.15/VA guidance");
    scoringNotes.push("Crypto payment: +20");
  }

  // ------------------------------------------------------------------
  // (h) Vessel with WMD destination — +40
  //     Dark fleet / ship-to-ship transfer risk
  // ------------------------------------------------------------------
  if (body.subjectType === "vessel" && isWmdDestination) {
    score = Math.min(score + 40, 100);
    sanctionsExposure.push("Vessel transacting with WMD-proliferation jurisdiction — dark fleet / ship-to-ship transfer risk");
    unResolutions.push("UN SC Resolution 1718 — shipping/vessel prohibitions applicable to DPRK cargo");
    scoringNotes.push("Vessel + WMD destination: +40");
  }

  // ------------------------------------------------------------------
  // (i) Related entity matches UN consolidated WMD proliferator list — +40
  // ------------------------------------------------------------------
  const proliferatorHits = matchesUnProliferatorList(relatedEntities);
  if (proliferatorHits.length > 0) {
    score = Math.min(score + 40, 100);
    for (const hit of proliferatorHits) {
      sanctionsExposure.push(`UN consolidated-list match: ${hit}`);
    }
    scoringNotes.push(`Related entity matches UN WMD proliferator list (${proliferatorHits.length} hit(s)): +40`);
  }

  // Ensure score stays in [0, 100]
  score = Math.max(0, Math.min(score, 100));

  return {
    score,
    sanctionsExposure,
    unResolutions: Array.from(new Set(unResolutions)),
    exportControlFlags,
    scoringNotes,
    isWmdDestination,
    hasDualUseGoods,
  };
}

/** Map a numeric 0–100 score to a risk tier label. */
function scoreToRiskLevel(score: number): "critical" | "high" | "medium" | "low" {
  if (score >= 70) return "critical";
  if (score >= 45) return "high";
  if (score >= 20) return "medium";
  return "low";
}

/** Build a human-readable recommendation from the scored result. */
function buildRecommendation(
  riskLevel: "critical" | "high" | "medium" | "low",
  detail: ScoreDetail,
): string {
  if (riskLevel === "critical") {
    const parts: string[] = [
      "IMMEDIATE ACTION REQUIRED: This transaction/subject presents critical proliferation financing risk.",
    ];
    if (detail.isWmdDestination) {
      parts.push(
        "Destination country is subject to UN Security Council targeted financial sanctions for WMD proliferation. " +
        "Mandatory asset freeze obligations apply. File STR with UAE FIU immediately — no de minimis threshold. " +
        "Do not proceed with the transaction.",
      );
    }
    if (detail.hasDualUseGoods) {
      parts.push(
        "Dual-use goods detected. Verify export control classification, obtain UAE Ministry of Economy export license, " +
        "and secure a certified end-user certificate before any goods movement.",
      );
    }
    parts.push(
      "Escalate to MLRO. Engage UAE FIU goAML reporting channel. " +
      "Preserve all transaction records per UAE Federal Decree-Law No. 10 of 2025 Art.24.",
    );
    return parts.join(" ");
  }

  if (riskLevel === "high") {
    return (
      "Enhanced due diligence (EDD) required. Conduct in-depth counterparty verification, " +
      "verify stated end-use and end-user identity, and obtain all export documentation. " +
      "Escalate to MLRO for sign-off before proceeding. Consider filing STR if red flags cannot be resolved. " +
      "Monitor the relationship on an ongoing basis."
    );
  }

  if (riskLevel === "medium") {
    return (
      "Elevated customer due diligence (CDD) required. Review commodity descriptions and destination details. " +
      "Verify export licensing requirements and confirm end-user identity. " +
      "Flag for periodic MLRO review and maintain enhanced transaction monitoring."
    );
  }

  return (
    "Standard CDD procedures apply. Maintain normal transaction monitoring. " +
    "Re-assess if transaction value, counterparty, or destination changes."
  );
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

  // Basic input validation
  if (!body.subjectName?.trim()) {
    return NextResponse.json(
      { ok: false, error: "subjectName is required" },
      { status: 400, headers: gate.headers },
    );
  }
  if (!Array.isArray(body.destinationCountries) || body.destinationCountries.length === 0) {
    return NextResponse.json(
      { ok: false, error: "destinationCountries must be a non-empty array" },
      { status: 400, headers: gate.headers },
    );
  }

  const subjectName = sanitizeField(body.subjectName, 500);

  try {
    writeAuditEvent("compliance_assistant", "pf.risk-assessment", subjectName);
  } catch (err) {
    console.warn("[hawkeye] proliferation-risk writeAuditEvent failed:", err);
  }

  // Compute deterministic rule-based PF risk score (no LLM call required —
  // FATF R.7 and UN SC Resolution obligations are bright-line rules).
  const detail = computePfRiskScore(body);
  const riskLevel = scoreToRiskLevel(detail.score);
  const recommendation = buildRecommendation(riskLevel, detail);

  const regulatoryBasis: string[] = [
    "FATF R.7 — Targeted Financial Sanctions Related to Proliferation",
    "UN SC Resolution 1718 (2006) — DPRK WMD/Arms Embargo",
    "UN SC Resolution 2231 (2015) — Iran JCPOA Targeted Sanctions",
    "UAE Federal Law No. 7/2012 on Export Controls of Strategic Goods and Dual-Use Items",
  ];

  // Add UAE FDL reference for WMD-destination cases
  if (detail.isWmdDestination) {
    regulatoryBasis.push(
      "UAE Federal Decree-Law No. 10 of 2025 Art.21(3) — Proliferation Financing STR obligation (no threshold)",
      "UAE Cabinet Decision 57/2020 — DPRK Implementing Measures",
    );
  }

  const result: PfRiskResult = {
    riskScore: detail.score,
    riskLevel,
    sanctionsExposure: detail.sanctionsExposure,
    unResolutionsApplicable: detail.unResolutions,
    exportControlFlags: detail.exportControlFlags,
    recommendation,
    regulatoryBasis,
  };

  void writeAuditChainEntry(
    {
      event: "pf.risk_assessed",
      actor: gate.keyId,
      entity: subjectName,
      subjectType: body.subjectType,
      riskScore: detail.score,
      riskLevel,
      isWmdDestination: detail.isWmdDestination,
      hasDualUseGoods: detail.hasDualUseGoods,
      destinationCountries: body.destinationCountries,
      scoringNotes: detail.scoringNotes,
    },
    tenantIdFromGate(gate),
  ).catch((err) =>
    console.warn(
      "[proliferation-risk] audit chain write failed:",
      err instanceof Error ? err.message : String(err),
    ),
  );

  return NextResponse.json(
    { ok: true, ...result },
    { headers: gate.headers },
  );
}
