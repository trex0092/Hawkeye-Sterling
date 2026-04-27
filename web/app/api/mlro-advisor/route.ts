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

interface ContextPair { q: string; a: string }

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
  context?: ContextPair[];  // prior Q&A pairs from the session
}

// Lightweight jurisdiction signal extraction — no LLM needed.
const JURISDICTION_SIGNALS: Array<{ tag: string; keywords: string[] }> = [
  { tag: "UAE", keywords: ["uae", "united arab emirates", "fdl", "cbuae", "dpms", "moe circular", "goaml", "namlcftc", "dfsa", "adgm"] },
  { tag: "US",  keywords: ["bank secrecy act", "bsa", "ofac", "fincen", "fatca", "patriot act", "finra", "us treasury"] },
  { tag: "EU",  keywords: ["5amld", "6amld", "amld", "eu directive", "european union", "eba", "ecb", "esma"] },
  { tag: "UK",  keywords: ["mlr 2017", "proceeds of crime", "poca", "fca", "hmrc", "sanctions regulations", "uk government"] },
  { tag: "FATF/Global", keywords: ["fatf", "un security council", "unscr", "wolfsberg", "egmont", "basel committee"] },
];

function detectJurisdiction(text: string): string | undefined {
  const lower = text.toLowerCase();
  for (const { tag, keywords } of JURISDICTION_SIGNALS) {
    if (keywords.some((kw) => lower.includes(kw))) return tag;
  }
  return undefined;
}

// Build a session-context preamble so the advisor can give continuity-aware
// answers across a long Q&A session. We cap prior pairs at 3 and truncate
// each question/answer to keep the enriched question well under the 4000-char
// model context limit reserved for reasoning.
function buildContextPreamble(pairs: ContextPair[]): string {
  if (pairs.length === 0) return "";
  const lines = pairs
    .slice(-3)
    .map((p, i) => `[Prior Q${i + 1}] ${p.q.slice(0, 160)}\n[Prior A${i + 1}] ${p.a.slice(0, 320)}`)
    .join("\n---\n");
  return `REGULATORY SESSION CONTEXT (prior Q&A in this session — use for continuity):\n${lines}\n\nCURRENT QUESTION:\n`;
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

  // Enrich the question with conversation context + detected jurisdiction
  const preamble = buildContextPreamble(body.context ?? []);
  const enrichedQuestion = `${preamble}${body.question.trim()}`.slice(0, 3500);

  const detectedJurisdiction = body.jurisdiction ?? detectJurisdiction(body.question);

  // Build a rich evidence ID list from everything the super-brain found
  const evidenceIds = Array.from(
    new Set([
      ...(body.evidenceIds ?? []),
      ...(body.typologyIds ?? []),
      ...(body.adverseGroups ?? []).map((g) => `adverse:${g}`),
      ...(detectedJurisdiction ? [`jurisdiction:${detectedJurisdiction}`] : []),
    ]),
  );

  const advisorReq: MlroAdvisorRequest = {
    question: enrichedQuestion,
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
        jurisdictions: detectedJurisdiction
          ? [detectedJurisdiction, ...(body.jurisdiction && body.jurisdiction !== detectedJurisdiction ? [body.jurisdiction] : [])]
          : (body.jurisdiction ? [body.jurisdiction] : []),
        matchingMethods: body.matchingMethods ?? [
          "exact", "levenshtein", "jaro_winkler",
          "double_metaphone", "soundex", "token_set",
        ],
      },
      evidenceIds,
    },
  };

  const modeBudgets: Record<string, number> = {
    speed: 8_000,
    balanced: 40_000,
    multi_perspective: 100_000,
  };
  const budgetMs = modeBudgets[body.mode ?? "multi_perspective"] ?? 100_000;

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

    const regulatoryContext = ragResult?.ok && ragResult.passedQualityGate ? {
      answer: ragResult.answer,
      citations: ragResult.citations,
      confidenceScore: ragResult.confidenceScore,
      consistencyScore: ragResult.consistencyScore,
      jurisdiction: ragResult.jurisdiction,
    } : null;

    return NextResponse.json(
      { ...result, ok: true, regulatoryContext, detectedJurisdiction: detectedJurisdiction ?? null },
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
