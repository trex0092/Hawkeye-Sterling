// POST /api/mlro-advisor-quick
//
// Fast "Quick" advisor — single-pass Haiku 4.5, no extended thinking,
// no executor → advisor → challenger pipeline. The brain's rule-based
// classifier (~10ms, local) enriches the prompt with FATF Recs,
// playbooks, red flags, doctrines, and common-sense rules so Haiku's
// answer is well-grounded without slow reasoning.
//
// Two-pass deterministic critique: after Haiku answers, a sub-ms
// verifier checks the response against four axes (citation grounding,
// topic anchoring, structure sanity, no refusal/CoT-leak). If any axis
// fails, ONE retry is issued with the defects fed back as
// "fix these" hints. Most answers ship after pass 1; the retry only
// fires when it actually saves a bad answer.
//
// IMPORTANT: this used to stream SSE deltas, but Netlify's Lambda runtime
// buffers the entire response before returning, so streaming never
// actually reached the browser — the client just sat idle until the
// 12 s server-side kill-timer aborted upstream and the client-side 15 s
// timer fired. Now we accumulate the full response on the server and
// return a single JSON object: { ok, answer, elapsedMs, verification }.
//
// Body: { question: string; context?: { q, a }[] }
// Response: { ok, answer, elapsedMs, advisorScore, citationReport,
//             suggestedFollowUps, verification }

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { classifyMlroQuestion } from "../../../../dist/src/brain/mlro-question-classifier.js";
import { gateMlroQuestion } from "@/lib/server/mlro-input-gate";
import { scoreAdvisorAnswer } from "../../../../dist/src/integrations/qualityGates.js";
import { verifyCitations, type CitationReport } from "@/lib/server/citation-verifier";
import {
  appendProbeInstructions,
  extractAndStripProbe,
} from "@/lib/server/mlro-probe";
import {
  retrieveForQuestion,
  runPreGenerationRouter,
  runPostGenerationCheck,
  appendAuditEntry,
  type RetrievalContext,
} from "@/lib/server/mlro-integration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Module-level safety net — see /api/mlro-advisor and /api/compliance-qa
// for the rationale. Orphaned upstream-fetch rejections crash the Lambda
// with `Runtime.UnhandledPromiseRejection: AbortError` and return raw
// 502s; this swallows the expected aborts so the route can return clean
// JSON. Registered once per Lambda warm instance.
const REJECTION_GUARD_KEY = "__hsMlroAdvisorQuickRejectionGuard";
const guardHost = globalThis as unknown as Record<string, boolean | undefined>;
if (typeof process !== "undefined" && !guardHost[REJECTION_GUARD_KEY]) {
  guardHost[REJECTION_GUARD_KEY] = true;
  process.on("unhandledRejection", (reason: unknown) => {
    const msg = reason instanceof Error ? reason.message : String(reason);
    if (msg.includes("AbortError") || msg.includes("aborted")) return;
    console.error("[mlro-advisor-quick] unhandled rejection", msg);
  });
}

const MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 700;
// Hard cap inside the Lambda. Netlify's edge inactivity timeout is ~26 s,
// so we abort upstream well before that to guarantee we always have time
// to return a clean JSON response (rather than letting Netlify replace
// our body with an HTML 502).
const HARD_TIMEOUT_MS = 18_000;

const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type, authorization, x-api-key",
};

interface ContextPair { q: string; a: string }

interface Body {
  question?: string;
  context?: ContextPair[];
}

const SYSTEM_PROMPT_BASE =
  "You are the MLRO Advisor — a regulator-grade compliance assistant for AML/CFT/sanctions/PEP/adverse-media questions. " +
  "You answer in 4-10 short paragraphs (or a tight bullet list when the question asks for steps/thresholds). " +
  "Cite the regulatory anchor inline (e.g. 'FATF R.10', 'UAE FDL 10/2025 Art.16', 'Cabinet Resolution 134/2025', 'Wolfsberg FAQ', '5AMLD Art.18a'). " +
  "Never invent regulations or section numbers. If the brain context below already cites the exact anchor, REUSE it verbatim. " +
  "IMPORTANT — UAE law update: Federal Decree-Law (20) of 2018 has been REPEALED and replaced by Federal Decree-Law (10) of 2025. " +
  "Cite FDL 10/2025 for all current obligations (CDD, STR, retention, tipping-off, MLRO appointment). " +
  "Never cite FDL 20/2018 except when explicitly answering a historical / pre-2025 question. " +
  "Implementing regulation is Cabinet Resolution 134/2025 (which supersedes Cabinet Resolution 10/2019). " +
  "Do not include extended thinking or chain-of-thought; deliver the answer directly. " +
  "Never tip off subjects, never disclose internal SAR/STR filings to customers, never give legal advice — only compliance guidance.";

function buildContextPreamble(pairs: ContextPair[]): string {
  if (!pairs.length) return "";
  const lines = pairs
    .slice(-3)
    .map((p, i) => `[Prior Q${i + 1}] ${p.q.slice(0, 160)}\n[Prior A${i + 1}] ${p.a.slice(0, 320)}`)
    .join("\n---\n");
  return `REGULATORY SESSION CONTEXT (prior Q&A in this session — use for continuity):\n${lines}\n\n`;
}

// ── Deterministic answer verifier ───────────────────────────────────────────
//
// Sub-ms post-pass over Haiku's draft. Returns a list of defects keyed by
// axis. Empty array means the answer is shippable; non-empty means we
// retry once with the defects fed back as targeted fix-it hints.
//
// Axes:
//   1. citation_missing      — answer cites no recognised regulatory anchor
//   2. citation_broken       — answer cites an anchor that didn't verify
//   3. topic_anchor_missing  — classifier flagged FATF Recs for the topic
//                              but the answer cited none of them
//   4. too_short             — Quick mode should produce 4-10 paragraphs
//   5. cot_leak              — answer includes thinking scaffolding
//   6. refusal               — answer refuses a legitimate compliance ask

interface AnswerDefect {
  axis:
    | "citation_missing"
    | "citation_broken"
    | "topic_anchor_missing"
    | "too_short"
    | "cot_leak"
    | "refusal";
  detail: string;
}

interface AnswerVerification {
  passed: boolean;
  defects: AnswerDefect[];
}

function citedFatfRecs(report: CitationReport): Set<string> {
  const out = new Set<string>();
  for (const c of report.citations) {
    if (c.category !== "fatf_recommendation" || !c.verified) continue;
    const m = c.raw.match(/(\d+)/);
    if (m) out.add(m[1]!);
  }
  return out;
}

function verifyAnswer(
  answer: string,
  citationReport: CitationReport,
  classifier: ReturnType<typeof classifyMlroQuestion>,
): AnswerVerification {
  const defects: AnswerDefect[] = [];

  if (citationReport.verifiedCount === 0) {
    defects.push({
      axis: "citation_missing",
      detail:
        "Answer cites no recognised regulatory anchor. Cite at least one " +
        "primary source (FATF Rec, FDL 10/2025 article, Cabinet Resolution, " +
        "5/6AMLD, MLR 2017, BSA, etc.).",
    });
  }

  if (citationReport.unknownCount > 0) {
    const broken = citationReport.citations
      .filter((c) => !c.verified)
      .map((c) => `"${c.raw}" (${c.note ?? "not in catalogue"})`)
      .join("; ");
    defects.push({
      axis: "citation_broken",
      detail:
        "These citations did not verify against the bundled regulatory " +
        `catalogue: ${broken}. Replace each with a verified anchor or ` +
        "remove the cite.",
    });
  }

  const fatfHints = classifier.fatfRecHints as string[];
  if (fatfHints.length > 0) {
    const cited = citedFatfRecs(citationReport);
    const expected = fatfHints.map((h: string) => String(h).replace(/[^0-9]/g, "")).filter(Boolean);
    const matched = expected.some((e: string) => cited.has(e));
    if (!matched && expected.length > 0) {
      const expectedList = expected.slice(0, 4).map((e: string) => `R.${e}`).join(", ");
      defects.push({
        axis: "topic_anchor_missing",
        detail:
          `Question's primary topic is "${classifier.primaryTopic}". The brain ` +
          `flagged FATF ${expectedList} as the canonical anchors — answer must ` +
          `cite at least one of them.`,
      });
    }
  }

  const wordCount = answer.trim().split(/\s+/).filter(Boolean).length;
  if (wordCount < 60) {
    defects.push({
      axis: "too_short",
      detail:
        `Answer is only ${wordCount} words. Quick mode should produce 4-10 ` +
        "short paragraphs (or a tight bullet list of comparable substance).",
    });
  }

  const head = answer.slice(0, 240);
  if (/^\s*(?:thinking[: ]|let me think|first[, ] i (?:will|need|'ll)|i'll start by|<thinking>)/i.test(head)) {
    defects.push({
      axis: "cot_leak",
      detail:
        "Answer leaks chain-of-thought scaffolding. Deliver the final " +
        "answer directly — no 'let me think' / 'first I'll' preamble.",
    });
  }

  if (/^\s*(?:i (?:cannot|can't|am unable|'m not able)|sorry,? (?:i|but i)|unable to (?:answer|help|provide))/i.test(head)) {
    defects.push({
      axis: "refusal",
      detail:
        "Answer refuses a legitimate compliance question. The MLRO Advisor " +
        "must answer every compliance question; only refuse when the input " +
        "gate flags an injection attempt or the refusal-router fires for a " +
        "charter-protected reason (legal/tax advice, named-individual " +
        "speculation, definitive sanctions verdict, unsigned filing draft).",
    });
  }

  return { passed: defects.length === 0, defects };
}

function buildEnrichedUserPrompt(question: string, contextPairs: ContextPair[]): string {
  const analysis = classifyMlroQuestion(question);
  const lines: string[] = [];

  lines.push(buildContextPreamble(contextPairs).trim());

  lines.push("BRAIN CONTEXT (rule-based classifier, deterministic — use to ground your answer):");
  lines.push(`Primary topic: ${analysis.primaryTopic}${analysis.topics.length > 1 ? ` (also: ${analysis.topics.slice(1, 4).join(", ")})` : ""}`);
  if (analysis.jurisdictions.length) lines.push(`Jurisdictions detected: ${analysis.jurisdictions.join(", ")}`);
  if (analysis.regimes.length) lines.push(`Sanctions regimes: ${analysis.regimes.slice(0, 6).join(", ")}`);
  if (analysis.fatfRecDetails.length) {
    lines.push(`FATF Recommendations anchored: ${analysis.fatfRecDetails
      .slice(0, 6)
      .map((f: { num: number; title: string }) => `R.${f.num} (${f.title})`)
      .join("; ")}`);
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
  lines.push(`QUESTION:\n${question.trim()}`);
  return lines.filter(Boolean).join("\n");
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS });
}

export async function POST(req: Request): Promise<Response> {
  const startedAt = Date.now();
  const gate = await enforce(req);
  if (!gate.ok && gate.response.status === 429) return gate.response;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400, headers: CORS });
  }

  // Shared input gate — refuses empty / oversize / prompt-injection
  // inputs before we burn a Haiku call. Topic-scope filtering is off;
  // the Advisor must answer every compliance question.
  const gateResult = gateMlroQuestion(body.question ?? "", {
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
  const question = gateResult.question;

  // Layer 1 retrieval — pull class-tagged chunks for this question so
  // the Advisor's prompt is anchored to the source-of-truth registry
  // and Layer 2's citation validator can later check every cite
  // against this exact retrieval set.
  const retrieval: RetrievalContext = retrieveForQuestion(question, 12);

  // Layer 5 pre-generation refusal router — five active paths
  // (out-of-scope legal/tax advice, named-individual speculation,
  // definitive sanctions verdicts, unsigned filing drafts). The
  // sixth path (low retrieval confidence) is disabled — the Advisor
  // must answer every compliance question. Short-circuits before
  // we burn an API call; the audit log records refusals so refusal
  // precision can be graded by Layer 7.
  const preGen = runPreGenerationRouter({ question, retrieval });
  if (preGen.refused) {
    void appendAuditEntry({
      userId: "anonymous",
      mode: "quick",
      questionText: question,
      modelVersions: { haiku: MODEL },
      charterVersionHash: "quick-v1",
      directivesInvoked: [],
      doctrinesApplied: [],
      retrievedSources: retrieval.persistedSources,
      reasoningTrace: [],
      finalAnswer: null,
      refusalReason: preGen.reason,
    }).catch(() => {});
    return NextResponse.json(
      {
        ok: false,
        refused: true,
        reason: preGen.reason,
        message: preGen.message,
        escalation: preGen.escalation,
        elapsedMs: Date.now() - startedAt,
      },
      { status: 200, headers: CORS },
    );
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "ANTHROPIC_API_KEY not configured" }, { status: 503, headers: CORS });
  }

  const analysis = classifyMlroQuestion(question);
  const userPrompt = `${retrieval.promptBlock}\n\n${buildEnrichedUserPrompt(question, body.context ?? [])}`;

  const upstreamCtl = new AbortController();
  const killTimer = setTimeout(() => upstreamCtl.abort(), HARD_TIMEOUT_MS);

  /** Single Haiku turn — caller passes either the initial enriched prompt
   *  or a follow-up rewrite prompt with defect feedback. Returns the
   *  full text or throws on upstream / network / abort errors. */
  async function callHaiku(userMessage: string): Promise<string> {
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey!,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        // Stream so we get text as soon as the first delta lands; we
        // accumulate it inside the Lambda and return JSON.
        stream: true,
        system: [
          { type: "text", text: appendProbeInstructions(SYSTEM_PROMPT_BASE), cache_control: { type: "ephemeral" } },
        ],
        messages: [{ role: "user", content: userMessage }],
      }),
      signal: upstreamCtl.signal,
    });

    if (!upstream.ok || !upstream.body) {
      const txt = await upstream.text().catch(() => "");
      const err = new Error(`upstream ${upstream.status}: ${txt.slice(0, 240)}`);
      (err as Error & { upstreamStatus?: number }).upstreamStatus = upstream.status;
      throw err;
    }

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let text = "";
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
          text += evt.delta.text;
        }
      }
    }
    return text;
  }

  /** Build the rewrite prompt for the second pass. The original enriched
   *  prompt is reused so the model still has the full classifier context;
   *  the previous draft and the verifier's defects are appended as a
   *  targeted fix-it instruction. */
  function buildRewritePrompt(originalPrompt: string, draft: string, defects: AnswerDefect[]): string {
    const bullets = defects.map((d) => `  · [${d.axis}] ${d.detail}`).join("\n");
    return [
      originalPrompt,
      "",
      "PREVIOUS DRAFT (failed deterministic verification — do NOT repeat its mistakes):",
      "<<<DRAFT",
      draft.trim(),
      "DRAFT>>>",
      "",
      "VERIFICATION DEFECTS to FIX (each must be resolved in your rewrite):",
      bullets,
      "",
      "Produce a corrected answer. Same format constraints as the original instruction (4-10 short paragraphs or tight bullet list, cite primary regulatory anchors inline, no chain-of-thought). Address every defect listed above.",
    ].join("\n");
  }

  try {
    let answer: string;
    try {
      answer = await callHaiku(userPrompt);
    } catch (err) {
      const status = (err as Error & { upstreamStatus?: number }).upstreamStatus;
      if (typeof status === "number") {
        return NextResponse.json(
          { ok: false, error: (err as Error).message, elapsedMs: Date.now() - startedAt },
          { status: status === 429 ? 429 : 502, headers: CORS },
        );
      }
      throw err;
    }

    let citationReport = verifyCitations(answer);
    let verification = verifyAnswer(answer, citationReport, analysis);
    let retried = false;
    const initialDefects = verification.defects;

    // Conditional rewrite — only fires when the deterministic verifier
    // found at least one defect AND we still have budget for a second
    // Haiku call. The rewrite prompt feeds the defects back as targeted
    // fix-it hints so Haiku knows exactly what to repair.
    const remainingBudgetMs = HARD_TIMEOUT_MS - (Date.now() - startedAt);
    if (!verification.passed && remainingBudgetMs > 6_000) {
      try {
        const rewritePrompt = buildRewritePrompt(userPrompt, answer, verification.defects);
        const rewritten = await callHaiku(rewritePrompt);
        retried = true;
        const rewrittenReport = verifyCitations(rewritten);
        const rewrittenVerification = verifyAnswer(rewritten, rewrittenReport, analysis);
        // Keep the rewrite if it's strictly better (fewer defects) OR the
        // same count — the rewrite at least addressed structure/citation
        // gaps even when it didn't fully eliminate them.
        if (rewrittenVerification.defects.length <= verification.defects.length) {
          answer = rewritten;
          citationReport = rewrittenReport;
          verification = rewrittenVerification;
        }
      } catch {
        // Rewrite failed (timeout, upstream error). Stick with the
        // original draft + defects rather than 502'ing — the user still
        // gets an answer plus a warning chip from the verification chip.
      }
    }

    // Layer 6.3 — extract the adversarial-probe markers the model
    // emitted and strip them from the user-visible answer. The clean
    // body is what the operator sees; the structured outcome is
    // returned alongside as `probeOutcome` (and persisted in the
    // audit log when this route is wired with one).
    const probeWrap = extractAndStripProbe(answer, "escalate");
    answer = probeWrap.cleanAnswer;

    // Confidence + citations + follow-ups — same intelligence pack the
    // deep advisor returns. AdvisorScore reflects whichever draft we
    // ultimately chose.
    const advisorScore = scoreAdvisorAnswer(answer, "approved");
    const suggestedFollowUps = analysis.suggestedFollowUps?.slice(0, 3) ?? [];

    // Layer 2 retrieval-grounded citation validator + Layer 5 post-
    // generation router. The validator checks every cite in the
    // answer against the registry retrieval set (catches invented
    // articles, forbidden suffixes, class conflation, invented
    // numeric timing). The post-gen router catches sanctions verdicts
    // and filing-XML drift that the pre-gen router can't see from
    // the question alone.
    const postGen = runPostGenerationCheck({ question, answer, retrieval });
    if (postGen.router.refused) {
      void appendAuditEntry({
        userId: "anonymous",
        mode: "quick",
        questionText: question,
        modelVersions: { haiku: MODEL },
        charterVersionHash: "quick-v1",
        directivesInvoked: [],
        doctrinesApplied: [],
        retrievedSources: retrieval.persistedSources,
        reasoningTrace: [{ role: "executor", modelBuild: MODEL, text: answer.slice(0, 4_000) }],
        finalAnswer: null,
        validation: postGen.validation,
        refusalReason: postGen.router.reason,
      }).catch(() => {});
      return NextResponse.json(
        {
          ok: false,
          refused: true,
          reason: postGen.router.reason,
          message: postGen.router.message,
          escalation: postGen.router.escalation,
          elapsedMs: Date.now() - startedAt,
        },
        { status: 200, headers: CORS },
      );
    }

    // Layer 4 audit log — fire-and-forget; persists to Netlify Blobs.
    const audit = await appendAuditEntry({
      userId: "anonymous",
      mode: "quick",
      questionText: question,
      modelVersions: { haiku: MODEL },
      charterVersionHash: "quick-v1",
      directivesInvoked: [],
      doctrinesApplied: [],
      retrievedSources: retrieval.persistedSources,
      reasoningTrace: [{ role: "executor", modelBuild: MODEL, text: answer.slice(0, 4_000) }],
      finalAnswer: null,
      validation: postGen.validation,
    }).catch(() => ({ seq: 0, entryHash: "" }));

    return NextResponse.json(
      {
        ok: true,
        answer,
        elapsedMs: Date.now() - startedAt,
        advisorScore,
        citationReport,
        suggestedFollowUps,
        verification: {
          passed: verification.passed,
          defects: verification.defects,
          retried,
          initialDefectCount: initialDefects.length,
        },
        // Lightweight classifier hits the UI surfaces as chips above the
        // answer ("smart context") so the operator can see what the
        // brain pulled in before grounding Haiku.
        classifierHits: {
          primaryTopic: analysis.primaryTopic,
          secondaryTopics: analysis.topics.slice(1, 4),
          jurisdictions: analysis.jurisdictions,
          fatfRecs: analysis.fatfRecDetails.slice(0, 6).map((r: { num: number; title: string }) => ({ num: r.num, title: r.title })),
          confidence: analysis.confidence,
          coverageScore: analysis.intelligenceProfile?.coverageScore ?? 0,
        },
        // Layer 6.3 — adversarial probe outcome. Surfaced so the UI
        // can render an "innocent / adversarial" chip pair if it
        // wants to. `bothEmitted=false` means the model didn't
        // follow the probe instruction; treat as informational.
        probeOutcome: {
          innocent: probeWrap.outcome.innocent,
          adversarial: probeWrap.outcome.adversarial,
          survived: probeWrap.outcome.survived,
          ...(probeWrap.outcome.disagreement ? { disagreement: probeWrap.outcome.disagreement } : {}),
          bothEmitted: probeWrap.bothEmitted,
        },
        // Layer-2 retrieval-grounded validation summary — orthogonal to
        // the bundled-allow-list `citationReport` above. UI can ignore
        // this for now; the audit log captures it for the regulator.
        retrievalGroundedValidation: {
          passed: postGen.validation.passed,
          summary: postGen.validation.summary,
          defectCount: postGen.validation.defects.length,
          ungroundedClaimCount: postGen.validation.ungroundedClaims.length,
        },
        // Layer-1 retrieval breadcrumb — class-tagged source ids the
        // answer was anchored against. Surfaces in the audit log.
        retrievedSources: retrieval.persistedSources.map((s) => ({
          class: s.class,
          classLabel: s.classLabel,
          sourceId: s.sourceId,
          articleRef: s.articleRef,
          version: s.version,
        })),
        auditEntrySeq: audit.seq,
      },
      { status: 200, headers: CORS },
    );
  } catch (err) {
    const aborted = upstreamCtl.signal.aborted;
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        ok: false,
        error: aborted
          ? `Quick mode budget exceeded (>${Math.round(HARD_TIMEOUT_MS / 1000)} s) — try Balanced.`
          : `upstream connect failed: ${msg}`,
        elapsedMs: Date.now() - startedAt,
      },
      { status: aborted ? 504 : 502, headers: CORS },
    );
  } finally {
    clearTimeout(killTimer);
  }
}
