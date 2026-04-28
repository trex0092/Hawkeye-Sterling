// POST /api/mlro-advisor-quick
//
// Fast "Quick" advisor — single-pass Haiku 4.5, no extended thinking,
// no executor → advisor → challenger pipeline. The brain's rule-based
// classifier (~10ms, local) enriches the prompt with FATF Recs,
// playbooks, red flags, doctrines, and common-sense rules so Haiku's
// answer is well-grounded without slow reasoning.
//
// IMPORTANT: this used to stream SSE deltas, but Netlify's Lambda runtime
// buffers the entire response before returning, so streaming never
// actually reached the browser — the client just sat idle until the
// 12 s server-side kill-timer aborted upstream and the client-side 15 s
// timer fired. Now we accumulate the full response on the server and
// return a single JSON object: { ok, answer, elapsedMs }. End-to-end
// latency is still ~3-7 s with Haiku 4.5 single-pass.
//
// Body: { question: string; context?: { q, a }[] }
// Response: { ok: boolean, answer?: string, elapsedMs: number, error?: string }

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { classifyMlroQuestion } from "../../../../dist/src/brain/mlro-question-classifier.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

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
  "Cite the regulatory anchor inline (e.g. 'FATF R.10', 'UAE FDL 20/2018 Art.16', 'Wolfsberg FAQ', '5AMLD Art.18a'). " +
  "Never invent regulations or section numbers. If the brain context below already cites the exact anchor, REUSE it verbatim. " +
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
      .map((f) => `R.${f.num} (${f.title})`)
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

  const question = body.question?.trim();
  if (!question) {
    return NextResponse.json({ ok: false, error: "question is required" }, { status: 400, headers: CORS });
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "ANTHROPIC_API_KEY not configured" }, { status: 503, headers: CORS });
  }

  const userPrompt = buildEnrichedUserPrompt(question, body.context ?? []);

  const upstreamCtl = new AbortController();
  const killTimer = setTimeout(() => upstreamCtl.abort(), HARD_TIMEOUT_MS);

  try {
    // Non-streaming request — we accumulate Anthropic's SSE deltas server-
    // side because Netlify Lambda buffers the entire HTTP response anyway,
    // making client-side streaming a fiction. Returning a single JSON
    // payload is faster (no SSE framing overhead) and reliably crosses
    // Netlify's edge.
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        // We still ask Anthropic to stream so we get text as soon as the
        // first delta lands, but we accumulate it inside the Lambda and
        // return JSON. This minimises wall-clock latency vs non-streaming.
        stream: true,
        system: [
          { type: "text", text: SYSTEM_PROMPT_BASE, cache_control: { type: "ephemeral" } },
        ],
        messages: [{ role: "user", content: userPrompt }],
      }),
      signal: upstreamCtl.signal,
    });

    if (!upstream.ok || !upstream.body) {
      const txt = await upstream.text().catch(() => "");
      return NextResponse.json(
        { ok: false, error: `upstream ${upstream.status}: ${txt.slice(0, 240)}`, elapsedMs: Date.now() - startedAt },
        { status: upstream.status === 429 ? 429 : 502, headers: CORS },
      );
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

    return NextResponse.json(
      { ok: true, answer, elapsedMs: Date.now() - startedAt },
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
