import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import {
  invokeMlroAdvisor,
  type MlroAdvisorRequest,
  type ReasoningMode,
} from "../../../../dist/src/integrations/mlroAdvisor.js";
import { askComplianceQuestion } from "../../../../dist/src/integrations/complianceRag.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  question: string;
  subjectName: string;
  entityType?: "individual" | "organisation" | "vessel" | "aircraft" | "other";
  jurisdiction?: string;
  listsChecked?: string[];
  matchingMethods?: string[];
  evidenceIds?: string[];
  typologyIds?: string[];
  adverseGroups?: string[];
  mode?: ReasoningMode;
  audience?: "regulator" | "mlro" | "board";
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok && gate.response.status === 429) return gate.response;
  const gateHeaders: Record<string, string> = gate.ok ? gate.headers : {};

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "ANTHROPIC_API_KEY not configured on this server." },
      { status: 503, headers: gateHeaders },
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid JSON" },
      { status: 400, headers: gateHeaders },
    );
  }

  if (!body?.question?.trim()) {
    return NextResponse.json(
      { ok: false, error: "question is required" },
      { status: 400, headers: gateHeaders },
    );
  }
  if (!body?.subjectName?.trim()) {
    return NextResponse.json(
      { ok: false, error: "subjectName is required" },
      { status: 400, headers: gateHeaders },
    );
  }

  // Build a rich evidence ID list from everything the super-brain found
  const evidenceIds = Array.from(
    new Set([
      ...(body.evidenceIds ?? []),
      ...(body.typologyIds ?? []),
      ...(body.adverseGroups ?? []).map((g) => `adverse:${g}`),
      ...(body.jurisdiction ? [`jurisdiction:${body.jurisdiction}`] : []),
    ]),
  );

  const advisorReq: MlroAdvisorRequest = {
    question: body.question.trim().slice(0, 2000),
    mode: body.mode ?? "multi_perspective",
    audience: body.audience ?? "regulator",
    caseContext: {
      caseId: `hs-wb-${Date.now()}`,
      subjectName: body.subjectName.trim(),
      entityType: body.entityType ?? "individual",
      scope: {
        listsChecked: body.listsChecked ?? [
          "OFAC-SDN", "OFAC-Non-SDN", "UN-Consolidated",
          "EU-Consolidated", "UK-OFSI", "UAE-EOCN", "UAE-LTL",
        ],
        listVersionDates: {},
        jurisdictions: body.jurisdiction ? [body.jurisdiction] : [],
        matchingMethods: body.matchingMethods ?? [
          "exact", "levenshtein", "jaro_winkler",
          "double_metaphone", "soundex", "token_set",
        ],
      },
      evidenceIds,
    },
  };

  // Fetch regulatory RAG context in parallel with the main advisor call.
  // The RAG answer (if available and above quality gate) enriches the
  // evidence package presented to the MLRO — providing direct regulatory
  // citations alongside the AI reasoning chain.
  const ragPromise = askComplianceQuestion({
    query: body.question.trim().slice(0, 500),
    mode: "multi-agent",
  }).catch(() => null);

  try {
    // 60 s matches the integration's hard ceiling (mlro-budget-planner.ts).
    // Multi-perspective mode chains Sonnet executor + Opus advisor and
    // routinely needs ≥30 s on a real 8 k-token compliance analysis; the
    // previous 25 s clamp short-circuited the executor and surfaced as
    // a generic HTTP 502 to the operator.
    const [result, ragResult] = await Promise.all([
      invokeMlroAdvisor(advisorReq, { apiKey, budgetMs: 60_000 }),
      ragPromise,
    ]);

    if (!result.ok) {
      return NextResponse.json(
        { ...result, ok: false },
        { status: 502, headers: gateHeaders },
      );
    }

    // Attach RAG regulatory context when available and quality-gated
    const regulatoryContext = ragResult?.ok && ragResult.passedQualityGate ? {
      answer: ragResult.answer,
      citations: ragResult.citations,
      confidenceScore: ragResult.confidenceScore,
      consistencyScore: ragResult.consistencyScore,
      jurisdiction: ragResult.jurisdiction,
    } : null;

    return NextResponse.json(
      { ...result, ok: true, regulatoryContext },
      { headers: gateHeaders },
    );
  } catch (err) {
    console.error("[mlro-advisor] failed", err);
    return NextResponse.json(
      { ok: false, error: "mlro-advisor unavailable — check server logs" },
      { status: 503, headers: gateHeaders },
    );
  }
}
