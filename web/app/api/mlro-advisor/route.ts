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
export const maxDuration = 120;

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

  // Mode-aware budgets:
  //   speed       → 20 s  (fast, single model)
  //   balanced    → 40 s  (Sonnet only, no chaining)
  //   multi_perspective → 100 s (Sonnet executor → Opus advisor — needs headroom)
  const modeBudgets: Record<string, number> = {
    speed: 8_000,
    balanced: 40_000,
    multi_perspective: 100_000,
  };
  const budgetMs = modeBudgets[body.mode ?? "multi_perspective"] ?? 100_000;

  // For multi_perspective, skip RAG — the full budget goes to the
  // Sonnet→Opus chain. RAG runs only for speed/balanced where there is
  // spare capacity.
  const isMulti = (body.mode ?? "multi_perspective") === "multi_perspective";
  const ragPromise = isMulti
    ? Promise.resolve(null)
    : askComplianceQuestion({
        query: body.question.trim().slice(0, 500),
        mode: "multi-agent",
      }).catch(() => null);

  try {
    const [result, ragResult] = await Promise.all([
      invokeMlroAdvisor(advisorReq, { apiKey, budgetMs }),
      ragPromise,
    ]);

    if (!result.ok) {
      const clientError =
        result.error ??
        (result.partial
          ? "Deep reasoning budget exceeded — try Speed or Balanced mode."
          : "Advisor pipeline failed.");
      return NextResponse.json(
        { ...result, ok: false, error: clientError },
        { status: result.partial ? 504 : 502, headers: gateHeaders },
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
