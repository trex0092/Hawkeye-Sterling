// POST /api/cluster-contamination
//
// Network Contamination Engine — upgraded to auto-traverse the tenant's
// full customer base from a starting entity, without requiring the caller
// to supply a pre-built cluster.
//
// Auto-traversal mode (no clusterEntities provided):
//   1. Loads all tenant cases via loadAllCases()
//   2. Uses LLM to identify network clusters around the subject
//   3. Runs BFS contamination across the discovered cluster
//   4. Returns enriched heat map with hop distances and evidence
//
// Manual mode (clusterEntities provided):
//   - Legacy behaviour — uses supplied cluster with optional edges
//
// Contamination decays 45% per hop (DECAY = 0.55).

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { getAnthropicClient } from "@/lib/server/llm";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { loadAllCases } from "@/lib/server/case-vault";
import { sanitizeField } from "@/lib/server/sanitize-prompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface ReqBody {
  subjectId: string;
  subjectName?: string;         // used for AI-assisted auto-discovery
  clusterEntities?: string[];   // optional — if omitted, auto-discovers from case base
  entityScores?: Record<string, number>;
  edges?: [string, string][];
  maxHops?: number;             // default 3
  autoDiscover?: boolean;       // default true when clusterEntities not provided
}

const RECOMMENDED_ACTIONS = [
  "Escalate linked entities to enhanced due diligence review",
  "Freeze new transactions pending cluster-wide investigation",
  "File Suspicious Activity Report covering all contaminated entities",
  "Notify relationship managers of cluster risk elevation",
  "Commission network mapping to identify additional linked parties",
  "Apply enhanced monitoring on all cluster transaction activity",
  "Request updated source of funds documentation from all cluster members",
];

const DECAY = 0.55;
const HIGH_RISK_THRESHOLD = 60;
const CONTAMINATED_THRESHOLD = 30;

function runBfsContamination(
  subjectId: string,
  clusterEntities: string[],
  entityScores: Record<string, number>,
  edges: [string, string][],
  maxHops: number,
): Map<string, { score: number; hopDistance: number }> {
  const adj = new Map<string, Set<string>>();
  const allNodes = new Set([subjectId, ...clusterEntities]);
  for (const n of allNodes) adj.set(n, new Set());

  if (edges.length > 0) {
    for (const [from, to] of edges) {
      adj.get(from)?.add(to);
      adj.get(to)?.add(from);
    }
  } else {
    for (const e of clusterEntities) {
      adj.get(subjectId)?.add(e);
      adj.get(e)?.add(subjectId);
    }
  }

  const subjectScore = entityScores[subjectId] ?? 80;
  const result = new Map<string, { score: number; hopDistance: number }>();
  result.set(subjectId, { score: subjectScore, hopDistance: 0 });

  const queue: Array<{ id: string; hop: number }> = [{ id: subjectId, hop: 0 }];
  const visited = new Set<string>([subjectId]);

  while (queue.length > 0) {
    const { id: current, hop } = queue.shift()!;
    if (hop >= maxHops) continue;
    const currentScore = result.get(current)?.score ?? 0;
    for (const neighbour of (adj.get(current) ?? new Set())) {
      if (visited.has(neighbour)) continue;
      visited.add(neighbour);
      const ownScore = entityScores[neighbour] ?? 0;
      const propagated = currentScore * DECAY;
      result.set(neighbour, { score: Math.max(ownScore, propagated), hopDistance: hop + 1 });
      queue.push({ id: neighbour, hop: hop + 1 });
    }
  }

  return result;
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  let body: ReqBody;
  try { body = await req.json() as ReqBody; } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400, headers: gate.headers });
  }

  const { subjectId, entityScores = {}, edges = [] } = body;
  const maxHops = Math.min(body.maxHops ?? 3, 5);

  if (!subjectId) {
    return NextResponse.json({ ok: false, error: "subjectId is required" }, { status: 400, headers: gate.headers });
  }

  const autoDiscover = body.autoDiscover !== false && !body.clusterEntities?.length;

  // Manual mode: legacy cluster supplied by caller
  if (!autoDiscover && body.clusterEntities?.length) {
    const clusterEntities = body.clusterEntities;
    if (clusterEntities.length === 0) {
      return NextResponse.json({
        ok: true, contaminatedEntities: 0, highRiskLinks: [], propagatedScore: 0,
        recommendedActions: ["No cluster entities provided — run network mapping first"],
        mode: "manual",
      }, { headers: gate.headers });
    }

    const contamination = runBfsContamination(subjectId, clusterEntities, entityScores, edges, maxHops);
    const highRiskLinks: string[] = [];
    let contaminatedCount = 0;
    for (const entity of clusterEntities) {
      const { score } = contamination.get(entity) ?? { score: 0 };
      if (score >= HIGH_RISK_THRESHOLD) { highRiskLinks.push(entity); contaminatedCount++; }
      else if (score >= CONTAMINATED_THRESHOLD) { contaminatedCount++; }
    }
    const clusterScores = clusterEntities.map((e) => contamination.get(e)?.score ?? 0);
    const propagatedScore = clusterScores.length > 0
      ? Math.round(clusterScores.reduce((a, b) => a + b, 0) / clusterScores.length) : 0;
    const actionCount = Math.min(RECOMMENDED_ACTIONS.length, Math.ceil(1 + (propagatedScore / 100) * (RECOMMENDED_ACTIONS.length - 1)));

    return NextResponse.json({
      ok: true, contaminatedEntities: contaminatedCount, highRiskLinks, propagatedScore,
      recommendedActions: RECOMMENDED_ACTIONS.slice(0, actionCount),
      detail: {
        subjectScore: entityScores[subjectId] ?? 80,
        clusterSize: clusterEntities.length,
        edgeCount: edges.length || clusterEntities.length,
        scoresByEntity: Object.fromEntries(clusterEntities.map((e) => [e, Math.round(contamination.get(e)?.score ?? 0)])),
      },
      mode: "manual",
    }, { headers: gate.headers });
  }

  // Auto-discover mode: load all tenant cases and use LLM to find clusters
  const tenant = tenantIdFromGate(gate);
  const allCases = await loadAllCases(tenant);
  const caseMap = new Map<string, Record<string, unknown>>();
  for (const c of allCases) {
    const id = (c as { id?: string }).id ?? "";
    if (id) caseMap.set(id, c as unknown as Record<string, unknown>);
  }

  const caseDigests = allCases
    .filter((c) => (c as { id?: string }).id !== subjectId)
    .map((c) => ({
      id: (c as { id?: string }).id ?? "?",
      subjectName: (c as { subjectName?: string }).subjectName ?? "",
      counterparty: (c as { counterparty?: string }).counterparty ?? "",
      jurisdiction: (c as { jurisdiction?: string }).jurisdiction ?? "",
      riskScore: (c as { riskScore?: number }).riskScore ?? 0,
      typology: (c as { typology?: string }).typology ?? "",
    }));

  const subjectCase = caseMap.get(subjectId) as Record<string, unknown> | undefined;
  const subjectScore = (subjectCase?.["riskScore"] as number) ?? entityScores[subjectId] ?? 80;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // Text-match fallback
    const subjectName = (body.subjectName ?? subjectCase?.["subjectName"] as string ?? "").toLowerCase();
    const subjectCounterparty = (subjectCase?.["counterparty"] as string ?? "").toLowerCase();
    const directMatches = caseDigests.filter((c) =>
      (subjectCounterparty && c.counterparty.toLowerCase().includes(subjectCounterparty)) ||
      (subjectName && (c.counterparty.toLowerCase().includes(subjectName) || c.subjectName.toLowerCase().includes(subjectName)))
    );
    const clusterIds = directMatches.map((c) => c.id);
    const contamination = runBfsContamination(subjectId, clusterIds, { [subjectId]: subjectScore }, [], maxHops);
    const propagatedScore = clusterIds.length > 0
      ? Math.round(clusterIds.map((id) => contamination.get(id)?.score ?? 0).reduce((a, b) => a + b, 0) / clusterIds.length) : 0;

    return NextResponse.json({
      ok: true,
      subjectId,
      subjectScore,
      clusterSize: clusterIds.length,
      contaminatedEntities: clusterIds.length,
      highRiskLinks: clusterIds.filter((id) => (contamination.get(id)?.score ?? 0) >= HIGH_RISK_THRESHOLD),
      propagatedScore,
      recommendedActions: RECOMMENDED_ACTIONS.slice(0, 3),
      detail: {
        scoresByEntity: Object.fromEntries(clusterIds.map((id) => [id, Math.round(contamination.get(id)?.score ?? 0)])),
        hopsByEntity: Object.fromEntries(clusterIds.map((id) => [id, contamination.get(id)?.hopDistance ?? 1])),
      },
      mode: "auto_text_match",
    }, { headers: gate.headers });
  }

  const client = getAnthropicClient(apiKey, 55_000, "cluster-contamination");

  const clusterResponse = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
    system: `You are an AML network analyst. Given a subject entity and a customer base, identify which other customers form a risk cluster with the subject — i.e., they share counterparties, jurisdictions, typological patterns, or ownership linkages that suggest network connectivity.

Return ONLY valid JSON:
{
  "clusterMembers": [
    {
      "caseId": "<id>",
      "linkType": "shared_counterparty|shared_jurisdiction_typology|ownership_link|behavioral_pattern|direct_relationship",
      "evidence": "<specific evidence of connection>",
      "confidence": <0-100>
    }
  ],
  "edges": [["<caseId1>","<caseId2>"]],
  "clusterNarrative": "<2 sentence description of the cluster>",
  "mlTypology": "<primary ML typology for this cluster>"
}`,
    messages: [{
      role: "user",
      content: `Subject Case ID: ${sanitizeField(subjectId)}
Subject Data: ${JSON.stringify(subjectCase ?? { id: subjectId, name: body.subjectName ?? "unknown" })}
Subject Risk Score: ${subjectScore}

Remaining Customer Base (${caseDigests.length} cases):
${JSON.stringify(caseDigests, null, 2)}

Identify all cases that form a risk cluster with the subject. Only include cases with meaningful evidence of connection.`,
    }],
  });

  const clusterRaw = clusterResponse.content[0]?.type === "text" ? (clusterResponse.content[0] as { type: "text"; text: string }).text : "{}";
  let clusterResult: {
    clusterMembers?: Array<{ caseId: string; linkType: string; evidence: string; confidence: number }>;
    edges?: [string, string][];
    clusterNarrative?: string;
    mlTypology?: string;
  } = {};
  try { clusterResult = JSON.parse(clusterRaw.match(/\{[\s\S]*\}/)?.[0] ?? "{}"); } catch { /* best effort */ }

  const clusterMembers = clusterResult.clusterMembers ?? [];
  const discoveredEdges = clusterResult.edges ?? [];
  const clusterIds = clusterMembers.map((m) => m.caseId);

  // Merge confidence-weighted scores into entityScores
  const mergedScores: Record<string, number> = { [subjectId]: subjectScore, ...entityScores };
  for (const m of clusterMembers) {
    const caseScore = (caseMap.get(m.caseId) as Record<string, unknown> | undefined)?.["riskScore"] as number ?? 0;
    mergedScores[m.caseId] = Math.max(caseScore, m.confidence * 0.5);
  }

  const contamination = runBfsContamination(subjectId, clusterIds, mergedScores, discoveredEdges, maxHops);
  const highRiskLinks: string[] = [];
  let contaminatedCount = 0;
  for (const id of clusterIds) {
    const { score } = contamination.get(id) ?? { score: 0 };
    if (score >= HIGH_RISK_THRESHOLD) { highRiskLinks.push(id); contaminatedCount++; }
    else if (score >= CONTAMINATED_THRESHOLD) { contaminatedCount++; }
  }

  const clusterScores = clusterIds.map((id) => contamination.get(id)?.score ?? 0);
  const propagatedScore = clusterScores.length > 0
    ? Math.round(clusterScores.reduce((a, b) => a + b, 0) / clusterScores.length) : 0;
  const actionCount = Math.min(RECOMMENDED_ACTIONS.length, Math.ceil(1 + (propagatedScore / 100) * (RECOMMENDED_ACTIONS.length - 1)));

  return NextResponse.json({
    ok: true,
    subjectId,
    subjectScore,
    clusterSize: clusterIds.length,
    contaminatedEntities: contaminatedCount,
    highRiskLinks,
    propagatedScore,
    clusterNarrative: clusterResult.clusterNarrative ?? "",
    mlTypology: clusterResult.mlTypology ?? "",
    recommendedActions: RECOMMENDED_ACTIONS.slice(0, actionCount),
    detail: {
      clusterMembers: clusterMembers.map((m) => ({
        ...m,
        contaminationScore: Math.round(contamination.get(m.caseId)?.score ?? 0),
        hopDistance: contamination.get(m.caseId)?.hopDistance ?? 1,
        subjectName: (caseMap.get(m.caseId) as Record<string, unknown> | undefined)?.["subjectName"] ?? m.caseId,
      })),
      scoresByEntity: Object.fromEntries(clusterIds.map((id) => [id, Math.round(contamination.get(id)?.score ?? 0)])),
      hopsByEntity: Object.fromEntries(clusterIds.map((id) => [id, contamination.get(id)?.hopDistance ?? 1])),
      edgeCount: discoveredEdges.length || clusterIds.length,
    },
    mode: "auto_discover",
    totalCasesScanned: allCases.length,
  }, { headers: gate.headers });
}
