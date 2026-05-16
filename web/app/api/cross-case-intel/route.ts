// POST /api/cross-case-intel
//
// Scans ALL open cases simultaneously and surfaces hidden connections
// that are invisible case-by-case:
//   - Shared counterparties across multiple subjects
//   - Common typology patterns forming a network cluster
//   - Overlapping jurisdictions + timing correlations
//   - Possible organized crime ring signatures
//
// Uses the LLM to synthesize cross-case patterns that rule-based
// systems miss. MLRO sees the full picture, not individual silos.

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { getAnthropicClient } from "@/lib/server/llm";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { loadAllCases } from "@/lib/server/case-vault";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  const tenant = tenantIdFromGate(gate);
  const allCases = await loadAllCases(tenant);

  if (allCases.length === 0) {
    return NextResponse.json({ ok: true, patterns: [], clusters: [], summary: "No cases found.", caseCount: 0 }, { headers: gate.headers });
  }

  // Distill cases to a compact representation (no raw PII in prompt)
  const caseDigests = allCases.map((c) => ({
    id: (c as { id?: string }).id ?? "?",
    risk: (c as { riskScore?: number }).riskScore ?? (c as { risk?: string }).risk ?? "unknown",
    status: (c as { status?: string }).status ?? "unknown",
    jurisdiction: (c as { jurisdiction?: string }).jurisdiction ?? "",
    counterparty: (c as { counterparty?: string }).counterparty ?? "",
    redFlags: (c as { redFlags?: string[] }).redFlags ?? [],
    typology: (c as { typology?: string }).typology ?? "",
    amount: (c as { amount?: number }).amount ?? 0,
    lastActivity: (c as { lastActivity?: string }).lastActivity ?? "",
  }));

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // Heuristic: group by jurisdiction and flag overlaps
    const byJurisdiction: Record<string, string[]> = {};
    for (const c of caseDigests) {
      if (c.jurisdiction) {
        byJurisdiction[c.jurisdiction] ??= [];
        byJurisdiction[c.jurisdiction]!.push(c.id);
      }
    }
    const clusters = Object.entries(byJurisdiction)
      .filter(([, ids]) => ids.length > 1)
      .map(([jurisdiction, ids]) => ({ type: "shared_jurisdiction", jurisdiction, caseIds: ids, riskSignal: "medium" }));
    return NextResponse.json({
      ok: true, caseCount: allCases.length, patterns: [], clusters,
      summary: `${allCases.length} cases scanned. ${clusters.length} jurisdiction clusters found. Set ANTHROPIC_API_KEY for AI-powered pattern detection.`,
    }, { headers: gate.headers });
  }

  const client = getAnthropicClient(apiKey, 55_000, "cross-case-intel");

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    system: `You are an AML network intelligence analyst specialising in cross-case pattern recognition for UAE DPMS (gold traders) under FDL 10/2025.

Analyse the provided case digest array and identify:
1. Shared counterparties across multiple cases (possible money mule networks)
2. Typology clusters (multiple cases with same ML scheme)
3. Jurisdiction timing correlations (funds flowing through same routes)
4. Structured amount patterns across cases (aggregate structuring rings)
5. Possible organized crime signals (3+ cases with overlapping indicators)

Return ONLY valid JSON:
{
  "patterns": [
    {
      "type": "shared_counterparty|typology_cluster|jurisdiction_ring|structuring_ring|organized_crime",
      "description": "<1-2 sentence description>",
      "caseIds": ["<id>"],
      "riskSignal": "low|medium|high|critical",
      "recommendedAction": "<action>"
    }
  ],
  "clusters": [
    {
      "clusterId": "<label>",
      "caseIds": ["<id>"],
      "clusterType": "<type>",
      "riskNarrative": "<narrative>",
      "sarRecommendation": "individual|consolidated|no_action"
    }
  ],
  "summary": "<3-4 sentence executive summary>",
  "organizedCrimeSignals": ["<signal>"]
}`,
    messages: [{
      role: "user",
      content: `Case digest (${caseDigests.length} cases):\n${JSON.stringify(caseDigests, null, 2)}\n\nIdentify all cross-case patterns.`,
    }],
  });

  const raw = response.content[0]?.type === "text" ? (response.content[0] as { type: "text"; text: string }).text : "{}";
  try {
    const result = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "{}") as {
      patterns?: unknown[]; clusters?: unknown[]; summary?: string; organizedCrimeSignals?: string[];
    };
    return NextResponse.json({
      ok: true,
      caseCount: allCases.length,
      patterns: Array.isArray(result.patterns) ? result.patterns : [],
      clusters: Array.isArray(result.clusters) ? result.clusters : [],
      summary: result.summary ?? "",
      organizedCrimeSignals: Array.isArray(result.organizedCrimeSignals) ? result.organizedCrimeSignals : [],
    }, { headers: gate.headers });
  } catch {
    return NextResponse.json({ ok: false, error: "pattern analysis failed — retry" }, { status: 500, headers: gate.headers });
  }
}
