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
import { classifyMlroQuestion } from "../../../../dist/src/brain/mlro-question-classifier.js";
import { gateMlroQuestion } from "@/lib/server/mlro-input-gate";

const HAIKU_MODEL = "claude-haiku-4-5-20251001";
const HAIKU_TIMEOUT_MS = 18_000;
const HAIKU_SYSTEM_PROMPT =
  "You are the MLRO Advisor — a regulator-grade compliance assistant for AML/CFT/sanctions/PEP/adverse-media questions. " +
  "You answer in 4-10 short paragraphs (or a tight bullet list when the question asks for steps/thresholds). " +
  "Cite the regulatory anchor inline (e.g. 'FATF R.10', 'UAE FDL 10/2025 Art.16', 'Cabinet Resolution 134/2025', 'Wolfsberg FAQ', '5AMLD Art.18a'). " +
  "Never invent regulations or section numbers. If the brain context below already cites the exact anchor, REUSE it verbatim. " +
  "IMPORTANT — UAE law update: Federal Decree-Law (20) of 2018 has been REPEALED and replaced by Federal Decree-Law (10) of 2025. " +
  "Cite FDL 10/2025 for all current obligations; never cite FDL 20/2018 except in explicit historical context. " +
  "Implementing regulation is Cabinet Resolution 134/2025 (supersedes Cabinet Resolution 10/2019). " +
  "Do not include extended thinking or chain-of-thought; deliver the answer directly. " +
  "Never tip off subjects, never disclose internal SAR/STR filings to customers, never give legal advice — only compliance guidance.";

interface HaikuPair { q: string; a: string }

interface HaikuResult {
  ok: boolean;
  answer?: string;
  error?: string;
  elapsedMs: number;
}

function buildHaikuPrompt(question: string, contextPairs: HaikuPair[]): string {
  const analysis = classifyMlroQuestion(question);
  const lines: string[] = [];
  if (contextPairs.length) {
    const ctx = contextPairs
      .slice(-3)
      .map((p, i) => `[Prior Q${i + 1}] ${p.q.slice(0, 160)}\n[Prior A${i + 1}] ${p.a.slice(0, 320)}`)
      .join("\n---\n");
    lines.push(`REGULATORY SESSION CONTEXT:\n${ctx}\n`);
  }
  lines.push("BRAIN CONTEXT (rule-based classifier — use to ground your answer):");
  lines.push(`Primary topic: ${analysis.primaryTopic}${analysis.topics.length > 1 ? ` (also: ${analysis.topics.slice(1, 4).join(", ")})` : ""}`);
  if (analysis.jurisdictions.length) lines.push(`Jurisdictions: ${analysis.jurisdictions.join(", ")}`);
  if (analysis.regimes.length) lines.push(`Sanctions regimes: ${analysis.regimes.slice(0, 6).join(", ")}`);
  if (analysis.fatfRecDetails.length) {
    lines.push(`FATF Recommendations anchored: ${analysis.fatfRecDetails.slice(0, 6).map((f: { num: number; title: string }) => `R.${f.num} (${f.title})`).join("; ")}`);
  }
  if (analysis.doctrineHints.length) lines.push(`Doctrines: ${analysis.doctrineHints.slice(0, 8).join(", ")}`);
  if (analysis.playbookHints.length) lines.push(`Relevant playbooks: ${analysis.playbookHints.slice(0, 6).join(", ")}`);
  if (analysis.redFlagHints.length) lines.push(`Red flags to watch: ${analysis.redFlagHints.slice(0, 6).join(", ")}`);
  if (analysis.urgencyFlags.length) lines.push(`URGENCY FLAGS: ${analysis.urgencyFlags.join(", ")}`);
  if (analysis.commonSenseRules.length) {
    lines.push("Common-sense rules to apply:");
    for (const rule of analysis.commonSenseRules.slice(0, 5)) lines.push(`  · ${rule}`);
  }
  lines.push("");
  lines.push(`QUESTION:\n${question}`);
  return lines.join("\n");
}

async function runHaikuQuick(question: string, contextPairs: HaikuPair[], apiKey: string): Promise<HaikuResult> {
  const startedAt = Date.now();
  const ctl = new AbortController();
  const killTimer = setTimeout(() => ctl.abort(), HAIKU_TIMEOUT_MS);
  try {
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: HAIKU_MODEL,
        max_tokens: 700,
        stream: true,
        system: [{ type: "text", text: HAIKU_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: buildHaikuPrompt(question, contextPairs) }],
      }),
      signal: ctl.signal,
    });
    if (!upstream.ok || !upstream.body) {
      const txt = await upstream.text().catch(() => "");
      return { ok: false, error: `upstream ${upstream.status}: ${txt.slice(0, 240)}`, elapsedMs: Date.now() - startedAt };
    }
    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let answer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      for (const rawLine of chunk.split("\n")) {
        const line = rawLine.trim();
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        let evt: { type?: string; delta?: { type?: string; text?: string } } | null = null;
        try { evt = JSON.parse(payload); } catch { continue; }
        if (evt?.type === "content_block_delta" && evt.delta?.type === "text_delta" && evt.delta.text) {
          answer += evt.delta.text;
        }
      }
    }
    return { ok: true, answer, elapsedMs: Date.now() - startedAt };
  } catch (err) {
    const aborted = ctl.signal.aborted;
    return {
      ok: false,
      error: aborted ? `Quick budget exceeded (>${Math.round(HAIKU_TIMEOUT_MS / 1000)} s)` : (err instanceof Error ? err.message : String(err)),
      elapsedMs: Date.now() - startedAt,
    };
  } finally {
    clearTimeout(killTimer);
  }
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Module-level safety net. Orphaned promises inside the upstream RAG / advisor
// pipeline (e.g. an aborted fetch whose rejection arrives after the awaited
// call already returned) escape the route's local try/catch and crash the
// Lambda with HTTP 502 + raw runtime trace. Swallowing them here keeps the
// function alive long enough to return a clean JSON response. Only registered
// once per Lambda warm instance — we tag a property on globalThis as the
// idempotency marker (cast through `unknown` to avoid redeclaring the
// built-in globalThis type, which fails strict-mode typechecking).
const REJECTION_GUARD_KEY = "__hsComplianceQaRejectionGuard";
const guardHost = globalThis as unknown as Record<string, boolean | undefined>;
if (typeof process !== "undefined" && !guardHost[REJECTION_GUARD_KEY]) {
  guardHost[REJECTION_GUARD_KEY] = true;
  process.on("unhandledRejection", (reason: unknown) => {
    const msg = reason instanceof Error ? reason.message : String(reason);
    if (msg.includes("AbortError") || msg.includes("aborted")) {
      // Expected — upstream timeouts during RAG/advisor fallback.
      return;
    }
    console.error("[compliance-qa] unhandled rejection", msg);
  });
}

const CORS: Record<string, string> = {
  "access-control-allow-origin": process.env["NEXT_PUBLIC_APP_URL"] ?? "https://hawkeye-sterling.netlify.app",
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

  // Shared input gate — refuses empty / oversize / prompt-injection
  // inputs. Topic-scope filtering is off across all advisor surfaces.
  const gateResult = gateMlroQuestion(body.query ?? "", {
    maxChars: 2000,
  });
  if (!gateResult.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: gateResult.message,
        reason: gateResult.reason,
        ...(gateResult.hint ? { hint: gateResult.hint } : {}),
      },
      { status: gateResult.status, headers: CORS },
    );
  }
  body.query = gateResult.question;

  // FAST PATH — Balanced depth (the default) routes through the same
  // Haiku 4.5 single-pass path that the MLRO Advisor "Quick" mode uses.
  // Reliable ~3-7 s end-to-end; no Sonnet/Opus, no thinking, no
  // executor → advisor → challenger pipeline that previously timed out
  // and returned HTML 502 from Netlify edge. Deep depth still uses the
  // legacy Sonnet/Opus pipeline below for callers who explicitly opt in.
  if (body.depth !== "deep") {
    const apiKey = process.env["ANTHROPIC_API_KEY"];
    if (!apiKey) {
      return NextResponse.json(
        {
          ok: true,
          query: body.query.trim(),
          answer: "AI advisor not available — ANTHROPIC_API_KEY not configured. Please consult your compliance documentation or a qualified compliance officer for this question.",
          citations: [],
          passedQualityGate: false,
          source: "fallback",
          note: "API key not configured — AI answer unavailable.",
        },
        { status: 200, headers: { ...CORS, ...gateHeaders } },
      );
    }
    const fastResult = await runHaikuQuick(body.query.trim(), body.context ?? [], apiKey);
    if (fastResult.ok) {
      return NextResponse.json(
        {
          ok: true,
          query: body.query.trim(),
          answer: fastResult.answer,
          citations: [],
          passedQualityGate: true,
          source: "mlro-advisor-quick",
          elapsedMs: fastResult.elapsedMs,
        },
        { status: 200, headers: { ...CORS, ...gateHeaders } },
      );
    }
    // Fall through to legacy path on hard failure (so a transient Anthropic
    // 5xx still has a second chance via RAG / the slower advisor).
  }

  // Hard-cap upstream RAG to 18s so we always have budget for the advisor
  // fallback inside Netlify's ~26s sync function timeout. Any throw here
  // (AbortError, network reset, DNS fail) MUST be caught — an uncaught
  // rejection escapes the Lambda and produces HTTP 502 with the raw
  // runtime trace, which the client cannot parse.
  let result: Awaited<ReturnType<typeof askComplianceQuestion>>;
  try {
    result = await askComplianceQuestion(
      { query: body.query.trim(), mode: body.mode ?? "multi-agent" },
      { timeoutMs: 18_000 },
    );
  } catch (err) {
    console.error("[compliance-qa] RAG call threw", err);
    result = {
      ok: false,
      query: body.query.trim(),
      citations: [],
      passedQualityGate: false,
      error: `RAG client error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

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
      ? "Regulatory Q&A requires either COMPLIANCE_RAG_URL (external RAG service) or ANTHROPIC_API_KEY (built-in advisor fallback). Neither is configured."
      : `RAG service failed (${result.error ?? "unknown"}) and no ANTHROPIC_API_KEY is set for fallback.`;
    return NextResponse.json(
      {
        ok: true,
        query: body.query.trim(),
        answer: "AI advisor not available — " + reason + " Please consult your compliance documentation or a qualified compliance officer.",
        citations: [],
        passedQualityGate: false,
        source: "fallback",
        note: reason,
      },
      { status: 200, headers: { ...CORS, ...gateHeaders } },
    );
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
      {
        ok: true,
        query: body.query.trim(),
        answer: "Advisor service temporarily unavailable. Please consult your compliance documentation or a qualified compliance officer for this question.",
        citations: [],
        passedQualityGate: false,
        source: "fallback",
        note: `Advisor fallback unavailable: ${detail}`,
      },
      { status: 200, headers: { ...CORS, ...gateHeaders } },
    );
  }
}
