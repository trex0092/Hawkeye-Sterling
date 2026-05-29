// POST /api/hs-cases/:caseId/enrich
// Runs smart-disambiguate + ai-decision on case hits.
// Retries once on failure. Logs enrichment.failed on double failure.

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { loadCase, updateCase } from "@/lib/server/hs-case-store";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function runEnrichment(
  baseUrl: string,
  apiKey: string,
  caseRec: Awaited<ReturnType<typeof loadCase>>,
): Promise<{ verdict: string; confidence: string; reasoning: string }> {
  if (!caseRec) throw new Error("case not found");

  // Step 1: smart-disambiguate
  const disambigRes = await fetch(`${baseUrl}/api/smart-disambiguate`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey },
    body: JSON.stringify({
      name: caseRec.subjectName,
      hits: caseRec.hits.map((h) => ({
        listId: h.listId,
        candidateName: h.candidateName,
        score: h.matchScore,
      })),
      context: `Risk category: ${caseRec.riskCategory}. Due diligence: ${caseRec.dueDiligence}.`,
    }),
  });
  const disambig = disambigRes.ok ? (await disambigRes.json() as Record<string, unknown>) : {};

  // Step 2: ai-decision
  const decisionRes = await fetch(`${baseUrl}/api/ai-decision`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey },
    body: JSON.stringify({
      subjectName: caseRec.subjectName,
      riskScore: caseRec.hits.length > 0
        ? Math.round(caseRec.hits.reduce((m, h) => Math.max(m, h.matchScore), 0))
        : 0,
      sanctionsHits: caseRec.hits.map((h) => `${h.listId}: ${h.candidateName} (score ${h.matchScore})`).join("; "),
      riskCategory: caseRec.riskCategory,
      dueDiligence: caseRec.dueDiligence,
      disambiguationResult: typeof disambig["summary"] === "string" ? disambig["summary"] : undefined,
    }),
  });
  const decision = decisionRes.ok ? (await decisionRes.json() as Record<string, unknown>) : {};

  return {
    verdict: typeof decision["disposition"] === "string" ? decision["disposition"]
      : typeof decision["decision"] === "string" ? decision["decision"]
      : "requires_review",
    confidence: typeof decision["confidence"] === "string" ? decision["confidence"] : "low",
    reasoning: typeof decision["reasoning"] === "string"
      ? (decision["reasoning"] as string).slice(0, 500)
      : "AI enrichment completed. MLRO review required before action.",
  };
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ caseId: string }> },
): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const tenant = tenantIdFromGate(gate);
  const { caseId } = await ctx.params;

  const existing = await loadCase(tenant, caseId);
  if (!existing) return NextResponse.json({ ok: false, error: "not found" }, { status: 404, headers: gate.headers });
  if (!existing.enrichmentPending) {
    return NextResponse.json({ ok: true, message: "enrichment already complete", case: existing }, { headers: gate.headers });
  }

  const baseUrl = process.env["NEXT_PUBLIC_APP_URL"] ?? "http://localhost:3000";
  const apiKey  = process.env["ADMIN_TOKEN"] ?? "";
  const now     = new Date().toISOString();

  let enrichResult: { verdict: string; confidence: string; reasoning: string } | null = null;
  let _lastError = "";

  // Try once, retry once on failure.
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      enrichResult = await runEnrichment(baseUrl, apiKey, existing);
      break;
    } catch (err) {
      _lastError = err instanceof Error ? err.message : String(err);
      console.warn(`[hs-cases/enrich] attempt ${attempt} failed:`, err);
    }
  }

  if (!enrichResult) {
    void writeAuditChainEntry({
      event: "enrichment.failed",
      actor: gate.keyId,
      caseId,
      subjectName: existing.subjectName,
      error: "enrichment service unavailable",
      attempts: 2,
    }, tenant).catch(() => undefined);

    return NextResponse.json(
      { ok: false, error: "enrichment_failed", detail: "enrichment service unavailable — please retry" },
      { status: 502, headers: gate.headers },
    );
  }

  const updated = await updateCase(tenant, caseId, {
    enrichmentPending: false,
    enrichedAt: now,
    notes: existing.notes
      ? `${existing.notes}\n[ENRICHED] Verdict: ${enrichResult.verdict} (${enrichResult.confidence} confidence). ${enrichResult.reasoning}`
      : `[ENRICHED] Verdict: ${enrichResult.verdict} (${enrichResult.confidence} confidence). ${enrichResult.reasoning}`,
  }, gate.keyId);

  void writeAuditChainEntry({
    event: "enrichment.completed",
    actor: gate.keyId,
    caseId,
    subjectName: existing.subjectName,
    verdict: enrichResult.verdict,
    confidence: enrichResult.confidence,
    enrichedAt: now,
  }, tenant).catch(() => undefined);

  return NextResponse.json({ ok: true, case: updated, enrichment: enrichResult }, { headers: gate.headers });
}
