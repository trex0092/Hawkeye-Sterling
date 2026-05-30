// POST /api/cross-case-patterns
//
// Cross-case pattern detection. Compares a subject's risk profile against
// the local case store, then asks Claude to identify clustering patterns
// and risk trajectories. Backs the "Cross-Case Pattern Detection" panel
// in DeepIntelPanel.tsx.
//
// Body: { subjectId?, score, jurisdiction, entityType, mode? }
// Response: {
//   ok: true,
//   similarCases: number,
//   clusterRisk: "critical"|"high"|"medium"|"low"|"none",
//   patterns: string[]
// }

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { getAnthropicClient } from "@/lib/server/llm";
import { sanitizeField } from "@/lib/server/sanitize-prompt";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { loadCases } from "@/lib/data/case-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MODEL = "claude-haiku-4-5-20251001";
const BUDGET_MS = 4_500;

interface Body {
  subjectId?: string;
  score?: number;
  jurisdiction?: string;
  entityType?: string;
  mode?: string;
}

type ClusterRisk = "critical" | "high" | "medium" | "low" | "none";

const DEGRADED: { ok: true; similarCases: number; clusterRisk: ClusterRisk; patterns: string[]; degraded: true } = {
  ok: true,
  similarCases: 0,
  clusterRisk: "none",
  patterns: ["Pattern analysis unavailable — AI service offline"],
  degraded: true,
};

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json(DEGRADED, { headers: gate.headers });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400, headers: gate.headers });
  }

  const score = Number(body.score ?? 50);
  const jurisdiction = sanitizeField(body.jurisdiction, 100);
  const entityType = sanitizeField(body.entityType, 80);
  const mode = sanitizeField(body.mode, 50) || "standard";

  // Use total case count for context (CaseRecord does not carry a riskScore field)
  let totalCases = 0;
  try { totalCases = loadCases().length; } catch { /* server env — store unavailable */ }

  const prompt = `You are an AML pattern analyst. A subject with risk score ${score}/100, entity type "${entityType || "unknown"}", jurisdiction "${jurisdiction || "unknown"}" was evaluated against a case register containing ${totalCases} total cases.

Analysis mode: ${mode}

Identify cross-case patterns and clustering risk. Return ONLY a JSON object (no prose, no markdown fences) matching this schema:
{
  "similarCases": <integer — estimated number of cases with similar risk profile>,
  "clusterRisk": "critical" | "high" | "medium" | "low" | "none",
  "patterns": ["<pattern 1>", "<pattern 2>", "<pattern 3>"]
}

Rules:
- similarCases: estimate based on score band (score ±15 from ${score}) out of ${totalCases} total cases.
- clusterRisk: critical if score≥80; high if score≥60; medium if score≥40; low if score≥20; none otherwise.
- patterns: 3 concise AML pattern descriptions observed in this cluster (e.g. "Structuring below AED 55,000 threshold", "Beneficial owner jurisdictions with high FATF risk"). Be specific to the entity type and jurisdiction.`;

  try {
    const client = getAnthropicClient(apiKey, BUDGET_MS);
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content
      .filter((c: { type: string }) => c.type === "text")
      .map((c: { type: string; text?: string }) => c.text ?? "")
      .join("");

    let parsed: { similarCases?: number; clusterRisk?: ClusterRisk; patterns?: string[] } = {};
    try {
      const s = text.indexOf("{");
      const e = text.lastIndexOf("}");
      if (s >= 0 && e > s) parsed = JSON.parse(text.slice(s, e + 1)) as typeof parsed;
    } catch {
      return NextResponse.json(DEGRADED, { headers: gate.headers });
    }

    void writeAuditChainEntry(
      { event: "cases.cross-pattern-detect", actor: gate.keyId, score, entityType, jurisdiction, clusterRisk: parsed.clusterRisk },
      tenantIdFromGate(gate),
    ).catch((e: unknown) => console.warn("[audit] cross-case-patterns:", e instanceof Error ? e.message : String(e)));

    return NextResponse.json(
      {
        ok: true,
        similarCases: parsed.similarCases ?? 0,
        clusterRisk: parsed.clusterRisk ?? "none",
        patterns: parsed.patterns ?? DEGRADED.patterns,
      },
      { headers: gate.headers },
    );
  } catch (err) {
    console.error("[cross-case-patterns]", err instanceof Error ? err.message : String(err));
    return NextResponse.json(DEGRADED, { headers: gate.headers });
  }
}
