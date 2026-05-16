// POST /api/counterparty-propagate
//
// Given a high-risk entity (newly sanctioned, newly flagged, or confirmed ML
// actor), auto-traverses the ENTIRE customer base to find:
//   - Direct counterparty links (customers who transacted with this entity)
//   - Indirect links (customers who transacted with customers who transacted…)
//   - Returns a contamination heat map with hop distance, risk scores, and
//     recommended actions for each affected customer
//
// Converts a single-entity risk event into a portfolio-wide exposure scan.

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { getAnthropicClient } from "@/lib/server/llm";
import { sanitizeField, sanitizeText } from "@/lib/server/sanitize-prompt";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { loadAllCases } from "@/lib/server/case-vault";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface ContaminationRequest {
  entityName: string;
  entityType?: "individual" | "corporate" | "vessel" | "account";
  highRiskReason: string;   // "newly_sanctioned" | "confirmed_ml_actor" | "designated_pep" | etc.
  listId?: string;          // OFAC-SDN, UAE-EOCN, etc.
  riskScore?: number;       // 0-100 starting contamination level
  maxHops?: number;         // depth of traversal (default: 3)
  includeIndirect?: boolean; // include 2nd/3rd-hop contamination (default: true)
}

const DECAY_PER_HOP = 0.55; // contamination attenuates 45% per hop
const HIGH_RISK_THRESHOLD = 60;
const MEDIUM_RISK_THRESHOLD = 30;

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  let body: ContaminationRequest;
  try { body = await req.json() as ContaminationRequest; } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400, headers: gate.headers });
  }
  if (!body.entityName?.trim() || !body.highRiskReason?.trim()) {
    return NextResponse.json({ ok: false, error: "entityName and highRiskReason required" }, { status: 400, headers: gate.headers });
  }

  const tenant = tenantIdFromGate(gate);
  const allCases = await loadAllCases(tenant);
  const maxHops = Math.min(body.maxHops ?? 3, 5);
  const includeIndirect = body.includeIndirect !== false;
  const startingScore = body.riskScore ?? 85;

  // Build case digest map for fast lookup
  const caseMap = new Map<string, Record<string, unknown>>();
  for (const c of allCases) {
    const id = (c as { id?: string }).id ?? "";
    if (id) caseMap.set(id, c as unknown as Record<string, unknown>);
  }

  const caseDigests = allCases.map((c) => ({
    id: (c as { id?: string }).id ?? "?",
    subjectName: (c as { subjectName?: string }).subjectName ?? "",
    counterparty: (c as { counterparty?: string }).counterparty ?? "",
    jurisdiction: (c as { jurisdiction?: string }).jurisdiction ?? "",
    riskScore: (c as { riskScore?: number }).riskScore ?? 0,
    typology: (c as { typology?: string }).typology ?? "",
    status: (c as { status?: string }).status ?? "",
  }));

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // Deterministic fallback: text-match counterparty field
    const entityLower = body.entityName.toLowerCase();
    const directMatches = caseDigests.filter((c) =>
      c.counterparty.toLowerCase().includes(entityLower) ||
      c.subjectName.toLowerCase().includes(entityLower)
    );
    return NextResponse.json({
      ok: true,
      entityName: body.entityName,
      startingScore,
      totalCasesScanned: allCases.length,
      directExposures: directMatches.length,
      indirectExposures: 0,
      contaminationMap: directMatches.map((c) => ({
        caseId: c.id,
        subjectName: c.subjectName,
        hopDistance: 1,
        contaminationScore: Math.round(startingScore * DECAY_PER_HOP),
        matchBasis: "counterparty_text_match",
        recommendedAction: "immediate_review",
      })),
      summary: "ANTHROPIC_API_KEY not configured — text-match only.",
      aiEnriched: false,
    }, { headers: gate.headers });
  }

  const client = getAnthropicClient(apiKey, 55_000, "counterparty-propagate");

  // LLM identifies which cases are directly/indirectly linked to the high-risk entity
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 3000,
    system: `You are an AML network contamination analyst. Given a high-risk entity and a customer case base, identify all customers with direct or indirect exposure to this entity.

For DIRECT exposure: customer has the entity as a counterparty, or their name/subject matches the entity.
For INDIRECT exposure: customer is linked to a directly-exposed customer via shared counterparties, jurisdictions, or typological patterns.

Return ONLY valid JSON:
{
  "directLinks": [
    {
      "caseId": "<id>",
      "linkType": "counterparty|subject_match|shared_account|same_beneficial_owner",
      "confidence": <0-100>,
      "evidence": "<specific link evidence>"
    }
  ],
  "indirectLinks": [
    {
      "caseId": "<id>",
      "hopDistance": <2 or 3>,
      "linkChain": ["<intermediate caseId>"],
      "linkType": "shared_counterparty|same_jurisdiction_typology|behavioral_cluster",
      "confidence": <0-100>,
      "evidence": "<specific link evidence>"
    }
  ],
  "networkSummary": "<2-3 sentence assessment of the contamination scope>",
  "typologyPattern": "<ML typology this entity likely represents>",
  "portfolioRisk": "contained|moderate|severe|critical"
}`,
    messages: [{
      role: "user",
      content: `High-Risk Entity: ${sanitizeField(body.entityName, 500)}
Entity Type: ${sanitizeField(body.entityType, 100) ?? "unknown"}
Risk Reason: ${sanitizeText(body.highRiskReason, 2000)}
List/Source: ${sanitizeField(body.listId, 100) ?? "not specified"}
Starting Contamination Score: ${startingScore}/100

Customer Base (${caseDigests.length} cases):
${JSON.stringify(caseDigests, null, 2)}

Identify all direct and ${includeIndirect ? "indirect (up to " + maxHops + " hops)" : "only direct"} links. Be specific about the evidence for each link.`,
    }],
  });

  const raw = response.content[0]?.type === "text" ? (response.content[0] as { type: "text"; text: string }).text : "{}";
  let aiResult: {
    directLinks?: Array<{ caseId: string; linkType: string; confidence: number; evidence: string }>;
    indirectLinks?: Array<{ caseId: string; hopDistance: number; linkChain: string[]; linkType: string; confidence: number; evidence: string }>;
    networkSummary?: string;
    typologyPattern?: string;
    portfolioRisk?: string;
  };

  try {
    aiResult = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "{}");
  } catch {
    aiResult = {};
  }

  if (!Array.isArray(aiResult.directLinks)) aiResult.directLinks = [];
  if (!Array.isArray(aiResult.indirectLinks)) aiResult.indirectLinks = [];
  const directLinks = aiResult.directLinks ?? [];
  const indirectLinks = (includeIndirect ? aiResult.indirectLinks : []) ?? [];

  // Build contamination map with propagated scores
  const contaminationMap = [
    ...directLinks.map((link) => ({
      caseId: link.caseId,
      subjectName: caseMap.get(link.caseId)?.["subjectName"] ?? link.caseId,
      hopDistance: 1,
      contaminationScore: Math.round(startingScore * DECAY_PER_HOP * (link.confidence / 100)),
      linkType: link.linkType,
      confidence: link.confidence,
      evidence: link.evidence,
      recommendedAction: link.confidence >= 70 ? "immediate_review" : "enhanced_monitoring",
    })),
    ...indirectLinks.map((link) => {
      const hopDecay = Math.pow(DECAY_PER_HOP, link.hopDistance);
      const score = Math.round(startingScore * hopDecay * (link.confidence / 100));
      return {
        caseId: link.caseId,
        subjectName: caseMap.get(link.caseId)?.["subjectName"] ?? link.caseId,
        hopDistance: link.hopDistance,
        linkChain: link.linkChain,
        contaminationScore: score,
        linkType: link.linkType,
        confidence: link.confidence,
        evidence: link.evidence,
        recommendedAction: score >= HIGH_RISK_THRESHOLD ? "immediate_review"
          : score >= MEDIUM_RISK_THRESHOLD ? "enhanced_monitoring"
          : "note_on_file",
      };
    }),
  ].sort((a, b) => b.contaminationScore - a.contaminationScore);

  const highRisk = contaminationMap.filter((c) => c.contaminationScore >= HIGH_RISK_THRESHOLD);
  const mediumRisk = contaminationMap.filter((c) => c.contaminationScore >= MEDIUM_RISK_THRESHOLD && c.contaminationScore < HIGH_RISK_THRESHOLD);

  return NextResponse.json({
    ok: true,
    entityName: body.entityName,
    highRiskReason: body.highRiskReason,
    startingScore,
    totalCasesScanned: allCases.length,
    directExposures: directLinks.length,
    indirectExposures: indirectLinks.length,
    highRiskExposures: highRisk.length,
    mediumRiskExposures: mediumRisk.length,
    portfolioRisk: aiResult.portfolioRisk ?? "unknown",
    typologyPattern: aiResult.typologyPattern ?? "",
    networkSummary: aiResult.networkSummary ?? "",
    contaminationMap,
    generatedAt: new Date().toISOString(),
  }, { headers: gate.headers });
}
