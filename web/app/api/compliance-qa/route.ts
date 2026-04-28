// POST /api/compliance-qa
// Regulatory Q&A — tries the AML-MultiAgent-RAG service first; when the RAG
// service is unconfigured OR fails at runtime, falls back to the MLRO Advisor
// pipeline (balanced mode, 50 s budget — chosen to fit inside the Netlify
// function timeout while still producing a regulator-grade answer).
// Accepts conversation context so follow-up questions are answered with
// awareness of what was already discussed in the session.
// Body: { query: string; mode?: "multi-agent" | "single"; context?: {q,a}[] }

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { askComplianceQuestion } from "../../../../dist/src/integrations/complianceRag.js";
import {
  invokeMlroAdvisor,
  type MlroAdvisorRequest,
} from "../../../../dist/src/integrations/mlroAdvisor.js";
import { scoreAdvisorAnswer } from "../../../../dist/src/integrations/qualityGates.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type, authorization, x-api-key",
};

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: CORS });
}

interface ContextPair { q: string; a: string }

interface ComplianceQaBody {
  query?: string;
  mode?: "multi-agent" | "single";
  context?: ContextPair[];
  /** Advisor reasoning depth when the fallback runs.
   *  - "balanced" (default): advisor only, ~45 s — fits any Netlify timeout.
   *  - "deep": full executor → advisor pipeline, ~90 s — only safe on
   *    deployments with maxDuration ≥ 120 s actually honoured by the
   *    underlying platform (Netlify Pro background functions or similar).
   */
  depth?: "balanced" | "deep";
  /** Enable advisor tool-use (sanctions / regulatory anchor lookups).
   *  Default true. Set false to bypass tools entirely for a pure
   *  prompt-only answer. */
  useTools?: boolean;
}

function buildContextPreamble(pairs: ContextPair[]): string {
  if (pairs.length === 0) return "";
  const lines = pairs
    .slice(-3)
    .map((p, i) => `[Prior Q${i + 1}] ${p.q.slice(0, 160)}\n[Prior A${i + 1}] ${p.a.slice(0, 320)}`)
    .join("\n---\n");
  return `REGULATORY SESSION CONTEXT (prior Q&A in this session — use for continuity):\n${lines}\n\nCURRENT QUESTION:\n`;
}

const JURISDICTION_SIGNALS: Array<{ tag: string; keywords: string[] }> = [
  { tag: "UAE", keywords: ["uae", "fdl", "cbuae", "dpms", "moe circular", "goaml", "dfsa"] },
  { tag: "US",  keywords: ["bank secrecy act", "bsa", "ofac", "fincen", "fatca", "patriot act"] },
  { tag: "EU",  keywords: ["5amld", "6amld", "amld", "eu directive", "european union", "eba"] },
  { tag: "UK",  keywords: ["mlr 2017", "proceeds of crime", "poca", "fca", "hmrc"] },
  { tag: "FATF/Global", keywords: ["fatf", "unscr", "wolfsberg", "egmont"] },
];

function detectJurisdiction(text: string): string | undefined {
  const lower = text.toLowerCase();
  for (const { tag, keywords } of JURISDICTION_SIGNALS) {
    if (keywords.some((kw) => lower.includes(kw))) return tag;
  }
  return undefined;
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok && gate.response.status === 429) return gate.response;
  const gateHeaders = gate.ok ? gate.headers : {};

  let body: ComplianceQaBody;
  try {
    body = (await req.json()) as ComplianceQaBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400, headers: CORS });
  }

  if (!body.query?.trim()) {
    return NextResponse.json({ ok: false, error: "query is required" }, { status: 400, headers: CORS });
  }

  const result = await askComplianceQuestion({
    query: body.query.trim(),
    mode: body.mode ?? "multi-agent",
  });

  if (result.ok) {
    return NextResponse.json(result, { status: 200, headers: { ...CORS, ...gateHeaders } });
  }

  const ragNotConfigured = result.error?.includes("not configured") ?? false;
  if (!ragNotConfigured) {
    console.error("[compliance-qa] RAG call failed", { error: result.error });
  }

  // Either RAG is not configured, or it failed at runtime — in both cases the
  // advisor fallback is the user's only path to an answer, so try it whenever
  // ANTHROPIC_API_KEY is available rather than only on "not configured".
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    const reason = ragNotConfigured
      ? "Regulatory Q&A requires either COMPLIANCE_RAG_URL (external RAG service) " +
        "or ANTHROPIC_API_KEY (built-in advisor fallback). Neither is configured."
      : `RAG service failed (${result.error ?? "unknown"}) and no ANTHROPIC_API_KEY is set for fallback.`;
    return NextResponse.json({ ok: false, error: reason }, { status: 503, headers: { ...CORS, ...gateHeaders } });
  }

  const preamble = buildContextPreamble(body.context ?? []);
  const enrichedQuestion = `${preamble}${body.query.trim()}`.slice(0, 3500);
  const detectedJurisdiction = detectJurisdiction(body.query);

  // 'balanced' mode skips the 25 s executor stage and runs the advisor only,
  // so the round-trip fits comfortably inside the Netlify function timeout.
  // 'deep' mode runs the full executor → advisor pipeline (multi_perspective)
  // for higher answer quality at the cost of latency. Caller opts in via the
  // `depth` field; we still cap budgetMs below to stay inside maxDuration.
  const wantsDeep = body.depth === "deep";
  const advisorMode: "balanced" | "multi_perspective" = wantsDeep ? "multi_perspective" : "balanced";
  const advisorBudgetMs = wantsDeep ? 95_000 : 50_000;

  const advisorReq: MlroAdvisorRequest = {
    question: enrichedQuestion,
    mode: advisorMode,
    audience: "regulator",
    caseContext: {
      caseId: `cqa-${Date.now()}`,
      subjectName: "Regulatory Query",
      entityType: "individual",
      scope: {
        listsChecked: [
          "OFAC-SDN", "OFAC-Non-SDN", "UN-Consolidated",
          "EU-Consolidated", "UK-OFSI", "UAE-EOCN", "UAE-LTL",
        ],
        listVersionDates: {},
        jurisdictions: detectedJurisdiction ? [detectedJurisdiction] : [],
        matchingMethods: ["exact", "levenshtein", "jaro_winkler"],
      },
      evidenceIds: detectedJurisdiction ? [`jurisdiction:${detectedJurisdiction}`] : [],
    },
  };

  try {
    // Netlify's edge layer enforces a ~26 s "inactivity timeout" on
    // synchronous functions independent of route-level maxDuration.
    // We HARD-CAP both balanced and deep modes at 22 s so the platform
    // always sees JSON before its timeout fires — the alternative is
    // an HTML 504 page the client cannot parse. Deep mode therefore
    // returns its best-effort partial reasoning trail when it cannot
    // finish; the response.partial flag tells the UI to render the
    // partial answer with a "budget exceeded" notice. To re-enable
    // longer-budget deep reasoning, port this route to a Netlify
    // background function (15-minute timeout) and remove the cap.
    const safeBudgetMs = Math.min(advisorBudgetMs, 22_000);
    const advisorResult = await invokeMlroAdvisor(advisorReq, { apiKey, budgetMs: safeBudgetMs });

    if (!advisorResult.ok) {
      const lastStep = advisorResult.reasoningTrail[advisorResult.reasoningTrail.length - 1];
      const partialAnswer = advisorResult.narrative ?? lastStep?.body ?? "";
      const errorMessage =
        advisorResult.error ??
        (advisorResult.partial
          ? "Advisor budget exceeded — partial answer returned."
          : "Advisor fallback failed without a specific error.");
      console.error("[compliance-qa] advisor fallback failed", {
        partial: advisorResult.partial,
        elapsedMs: advisorResult.elapsedMs,
        error: advisorResult.error,
      });
      return NextResponse.json(
        {
          ok: false,
          query: body.query.trim(),
          error: errorMessage,
          partial: advisorResult.partial,
          partialAnswer,
          source: "mlro-advisor-fallback",
        },
        // Return 200 for advisor-logic failures so CDN/Netlify edge never
        // replaces the JSON body with an HTML error page; ok:false in the body
        // signals the error to the client. Reserve 504 for genuine timeouts.
        { status: advisorResult.partial ? 504 : 200, headers: { ...CORS, ...gateHeaders } },
      );
    }

    const lastStep = advisorResult.reasoningTrail[advisorResult.reasoningTrail.length - 1];
    const answer = advisorResult.narrative ?? lastStep?.body ?? "";
    const score = scoreAdvisorAnswer(answer, advisorResult.complianceReview.advisorVerdict);

    return NextResponse.json(
      {
        ok: true,
        query: body.query.trim(),
        answer,
        citations: [],
        passedQualityGate: score.passedQualityGate,
        confidenceScore: score.confidenceScore,
        consistencyScore: score.consistencyScore,
        qualityFailures: score.failures,
        qualityDiagnostics: score.diagnostics,
        advisorVerdict: advisorResult.complianceReview.advisorVerdict,
        jurisdiction: detectedJurisdiction ?? undefined,
        source: "mlro-advisor-fallback",
      },
      { headers: { ...CORS, ...gateHeaders } },
    );
  } catch (err) {
    console.error("[compliance-qa] advisor fallback threw", err);
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: `Advisor fallback unavailable: ${detail}` },
      { status: 503, headers: { ...CORS, ...gateHeaders } },
    );
  }
}
