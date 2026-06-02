import { NextResponse } from "next/server";
import { writeAuditEvent } from "@/lib/audit";
import { enforce } from "@/lib/server/enforce";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { getAnthropicClient } from "@/lib/server/llm";
import { sanitizeField } from "@/lib/server/sanitize-prompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UboEntry {
  name: string;
  dob: string;
  nationality: string;
  gender: string;
  ownershipPct: string;
  role: string;
}

interface RequestBody {
  entity: string;
  registered: string;
  ubos: UboEntry[];
  /** Optional flat list of entity names forming the ownership chain (index 0 = top, last = subject entity). */
  ownershipChain?: string[];
  /** Optional free-text description of the ownership structure (used for bearer-share detection). */
  ownershipDescription?: string;
  /** Number of intermediate holding/shell layers between the UBO and the subject entity. */
  layeringDepth?: number;
}

interface UboRiskResult {
  overallRisk: "critical" | "high" | "medium" | "low";
  riskNarrative: string;
  ownershipStructureRisk: string;
  pepRiskFlags: string[];
  nationalityRisks: string[];
  cddGaps: string[];
  recommendedActions: string[];
  regulatoryBasis: string;
  eddRequired: boolean;
  sanctionsScreeningRequired: boolean;
}

// ---------------------------------------------------------------------------
// Rule-based scoring helpers
// ---------------------------------------------------------------------------

/** High-risk offshore incorporation jurisdictions (FATF / BASEL / CFATF watch-list). */
const HIGH_RISK_JURISDICTIONS = new Set([
  "bvi",
  "british virgin islands",
  "cayman islands",
  "cayman",
  "delaware",
  "panama",
  "seychelles",
  "samoa",
  "vanuatu",
  "jersey",
  "isle of man",
  "liechtenstein",
  "cook islands",
  "belize",
  "cyprus",
  "malta",
  "luxembourg",
]);

/**
 * Generic / nominee-service keyword patterns.
 * A UBO name that contains one of these tokens (case-insensitive) and ends
 * with a corporate suffix is treated as a nominee structure.
 */
const NOMINEE_KEYWORDS = [
  "nominees",
  "nominee",
  "services ltd",
  "services llc",
  "services limited",
  "holdings llc",
  "holdings ltd",
  "holdings limited",
  "management ltd",
  "management llc",
  "management limited",
  "corporate services",
  "trust services",
  "fiduciary",
  "secretarial",
  "registrar",
  "agents ltd",
  "agents llc",
];

const CORPORATE_SUFFIXES = /\b(ltd|llc|limited|inc|corp|s\.a\.|b\.v\.|gmbh|plc|llp)\b/i;

/** Returns true if the name looks like a nominee / professional services entity. */
function isNomineeName(name: string): boolean {
  const lower = name.toLowerCase();
  if (!CORPORATE_SUFFIXES.test(lower)) return false;
  return NOMINEE_KEYWORDS.some((kw) => lower.includes(kw));
}

interface RuleBasedScore {
  score: number;
  layeringPenalty: number;
  nomineeFlagged: boolean;
  highRiskJurisdiction: boolean;
  bearerShareWarning: boolean;
  circularOwnership: boolean;
  beneficialOwnerNotIdentifiable: boolean;
  flags: string[];
}

/**
 * Compute a deterministic rule-based risk score on top of the AI narrative.
 * The result is capped at 100.
 */
function computeRuleBasedScore(body: RequestBody): RuleBasedScore {
  let score = 0;
  const flags: string[] = [];

  // ------------------------------------------------------------------
  // (a) Layering depth penalty: +10 per layer, cap at +40
  // ------------------------------------------------------------------
  const depth = typeof body.layeringDepth === "number" ? body.layeringDepth : 0;
  const layeringPenalty = Math.min(depth * 10, 40);
  if (layeringPenalty > 0) {
    score += layeringPenalty;
    flags.push(`layering_depth_penalty:+${layeringPenalty} (${depth} layers)`);
  }

  // ------------------------------------------------------------------
  // (b) Nominee director/shareholder detection: +20
  // ------------------------------------------------------------------
  let nomineeFlagged = false;
  for (const ubo of body.ubos) {
    if (isNomineeName(ubo.name)) {
      nomineeFlagged = true;
      break;
    }
  }
  if (nomineeFlagged) {
    score += 20;
    flags.push("nominee_structure_detected:+20");
  }

  // ------------------------------------------------------------------
  // (c) High-risk incorporation jurisdiction: +15
  // ------------------------------------------------------------------
  const registeredLower = (body.registered ?? "").toLowerCase().trim();
  const highRiskJurisdiction = HIGH_RISK_JURISDICTIONS.has(registeredLower);
  if (highRiskJurisdiction) {
    score += 15;
    flags.push(`high_risk_jurisdiction:+15 (${body.registered})`);
  }

  // ------------------------------------------------------------------
  // (d) Bearer share warning: +25
  // ------------------------------------------------------------------
  const description = (body.ownershipDescription ?? "").toLowerCase();
  const bearerShareWarning = description.includes("bearer share");
  if (bearerShareWarning) {
    score += 25;
    flags.push("bearer_shares_detected:+25");
  }

  // ------------------------------------------------------------------
  // (e) Circular ownership detection: +30
  // ------------------------------------------------------------------
  let circularOwnership = false;
  if (Array.isArray(body.ownershipChain) && body.ownershipChain.length > 0) {
    const seen = new Set<string>();
    for (const entityName of body.ownershipChain) {
      const key = entityName.toLowerCase().trim();
      if (seen.has(key)) {
        circularOwnership = true;
        break;
      }
      seen.add(key);
    }
  }
  if (circularOwnership) {
    score += 30;
    flags.push("circular_ownership:+30");
  }

  // ------------------------------------------------------------------
  // (f) Beneficial owner threshold — FATF 25% rule: +20
  // ------------------------------------------------------------------
  let beneficialOwnerNotIdentifiable = false;
  if (body.ubos.length > 0) {
    const anyAbove25 = body.ubos.some((ubo) => {
      const pct = parseFloat(ubo.ownershipPct);
      return !isNaN(pct) && pct > 25;
    });
    if (!anyAbove25) {
      beneficialOwnerNotIdentifiable = true;
      score += 20;
      flags.push("beneficial_owner_not_identifiable:+20 (no UBO >25%)");
    }
  }

  // Cap at 100
  score = Math.min(score, 100);

  return {
    score,
    layeringPenalty,
    nomineeFlagged,
    highRiskJurisdiction,
    bearerShareWarning,
    circularOwnership,
    beneficialOwnerNotIdentifiable,
    flags,
  };
}

/** Map a numeric 0-100 rule score to a risk tier label. */
function scoreToRiskTier(score: number): "critical" | "high" | "medium" | "low" {
  if (score >= 70) return "critical";
  if (score >= 45) return "high";
  if (score >= 20) return "medium";
  return "low";
}

/** Merge the AI risk tier with the rule-based tier, taking the higher of the two. */
function mergeRiskTier(
  aiTier: "critical" | "high" | "medium" | "low",
  ruleTier: "critical" | "high" | "medium" | "low",
): "critical" | "high" | "medium" | "low" {
  const order = { low: 0, medium: 1, high: 2, critical: 3 } as const;
  return order[aiTier] >= order[ruleTier] ? aiTier : ruleTier;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(req: Request): Promise<NextResponse> {
  // Top-level try/catch: prevents an ECONNRESET (or any uncaught throw) from
  // the upstream Anthropic call or audit-chain writes from crashing the
  // Lambda and surfacing the Netlify "This function has crashed" page in the
  // Intelligence Tools / UBO Walker tab.
  try {
    const gate = await enforce(req);
    if (!gate.ok) return gate.response;
    let body: RequestBody;
    try {
      body = (await req.json()) as RequestBody;
    } catch {
      return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400, headers: gate.headers });
    }

    const { entity, registered, ubos } = body;

    try { writeAuditEvent("analyst", "ubo.ai-risk-assessment", entity); }
    catch (err) { console.warn("[hawkeye] ubo-risk writeAuditEvent failed:", err); }

    const apiKey = process.env["ANTHROPIC_API_KEY"];
    if (!apiKey) {
      return NextResponse.json({ ok: false, error: "ubo-risk temporarily unavailable - please retry." }, { status: 503, headers: gate.headers });
    }

    // Run rule-based scoring immediately (no network call needed).
    const ruleScore = computeRuleBasedScore(body);

    try {
      const client = getAnthropicClient(apiKey, 4_500);
      const res = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 700,
        system:
          "You are a UAE AML/CFT specialist in beneficial ownership and UBO risk assessment under FDL 10/2025 Art.10 and Cabinet Decision 58/2020. Assess this UBO declaration for money laundering risk, PEP exposure, ownership structure concerns, and CDD gaps. Output JSON (ONLY valid JSON, no markdown).",
        messages: [
          {
            role: "user",
            content: `Entity: ${sanitizeField(entity)}. Registered in: ${sanitizeField(registered)}. UBOs: ${JSON.stringify(ubos)}. Return ONLY this JSON: { "overallRisk": "critical"|"high"|"medium"|"low", "riskNarrative": "string", "ownershipStructureRisk": "string", "pepRiskFlags": ["string"], "nationalityRisks": ["string"], "cddGaps": ["string"], "recommendedActions": ["string"], "regulatoryBasis": "string", "eddRequired": boolean, "sanctionsScreeningRequired": boolean }`,
          },
        ],
      });

    const text = res.content[0]?.type === "text" ? res.content[0].text : "";
    const stripped = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    const parsed = JSON.parse(stripped) as UboRiskResult;

    // Normalize arrays — LLM occasionally returns null/string instead of [].
    if (!Array.isArray(parsed.pepRiskFlags)) parsed.pepRiskFlags = [];
    if (!Array.isArray(parsed.nationalityRisks)) parsed.nationalityRisks = [];
    if (!Array.isArray(parsed.cddGaps)) parsed.cddGaps = [];
    if (!Array.isArray(parsed.recommendedActions)) parsed.recommendedActions = [];

    // ------------------------------------------------------------------
    // Merge rule-based findings into the AI result
    // ------------------------------------------------------------------
    const mergedRisk = mergeRiskTier(parsed.overallRisk, scoreToRiskTier(ruleScore.score));

    // Append rule-based flags into cddGaps so they surface in the UI.
    if (ruleScore.flags.length > 0) {
      parsed.cddGaps.push(...ruleScore.flags);
    }
    if (ruleScore.bearerShareWarning) {
      parsed.cddGaps.push("BEARER_SHARE_WARNING: bearer shares undermine beneficial ownership transparency");
    }
    if (ruleScore.circularOwnership) {
      parsed.cddGaps.push("CIRCULAR_OWNERSHIP: entity appears more than once in the ownership chain");
    }
    if (ruleScore.beneficialOwnerNotIdentifiable) {
      parsed.cddGaps.push("BENEFICIAL_OWNER_NOT_IDENTIFIABLE: no individual UBO holds >25% (FATF threshold)");
    }
    if (ruleScore.nomineeFlagged) {
      parsed.cddGaps.push("NOMINEE_STRUCTURE: one or more UBOs match a known nominee service pattern");
    }

    // EDD is required whenever rule-based score is high/critical.
    if (mergedRisk === "critical" || mergedRisk === "high") {
      parsed.eddRequired = true;
    }

    parsed.overallRisk = mergedRisk;

    void writeAuditChainEntry(
      {
        event: "ubo.risk_assessed",
        actor: gate.keyId,
        entity,
        overallRisk: mergedRisk,
        ruleScore: ruleScore.score,
        ruleFlags: ruleScore.flags,
      },
      tenantIdFromGate(gate),
    ).catch((err) =>
      console.warn("[ubo-risk] audit chain write failed:", err instanceof Error ? err.message : String(err)),
    );

    return NextResponse.json(
      {
        ok: true,
        ...parsed,
        ruleBasedScore: ruleScore.score,
        bearerShareWarning: ruleScore.bearerShareWarning,
        circularOwnership: ruleScore.circularOwnership,
        beneficialOwnerNotIdentifiable: ruleScore.beneficialOwnerNotIdentifiable,
        nomineeFlagged: ruleScore.nomineeFlagged,
        highRiskJurisdiction: ruleScore.highRiskJurisdiction,
        layeringPenalty: ruleScore.layeringPenalty,
      },
      { headers: gate.headers },
    );
    } catch (err) {
      console.warn("[hawkeye] route handler failed:", err instanceof Error ? err.message : String(err));
      return NextResponse.json({ ok: false, error: "ubo-risk temporarily unavailable - please retry." }, { status: 503, headers: gate.headers });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[hawkeye] ubo-risk handler exception:", message);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}
