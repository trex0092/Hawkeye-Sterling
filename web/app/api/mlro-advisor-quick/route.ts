// POST /api/mlro-advisor-quick
//
// Streaming "Quick" advisor — single-pass Haiku 4.5, no extended thinking,
// no executor → advisor → challenger pipeline. The brain's rule-based
// classifier (~10ms, local) enriches the prompt with FATF Recs, playbooks,
// red flags, doctrines, and common-sense rules so Haiku's answer is well-
// grounded without slow reasoning.
//
// Latency target: first token ≈500 ms, full answer 3-7 s.
//
// Body: { question: string; context?: { q, a }[] }
// Response: text/event-stream chunks of plain text deltas + a terminating
//           [DONE] sentinel. The browser reads the stream incrementally.

import { enforce } from "@/lib/server/enforce";
import { classifyMlroQuestion } from "../../../../dist/src/brain/mlro-question-classifier.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 700;
const HARD_TIMEOUT_MS = 12_000;

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
  const gate = await enforce(req);
  if (!gate.ok && gate.response.status === 429) return gate.response;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "invalid JSON body" }), {
      status: 400,
      headers: { "content-type": "application/json", ...CORS },
    });
  }

  const question = body.question?.trim();
  if (!question) {
    return new Response(JSON.stringify({ ok: false, error: "question is required" }), {
      status: 400,
      headers: { "content-type": "application/json", ...CORS },
    });
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    return new Response(JSON.stringify({ ok: false, error: "ANTHROPIC_API_KEY not configured" }), {
      status: 503,
      headers: { "content-type": "application/json", ...CORS },
    });
  }

  const userPrompt = buildEnrichedUserPrompt(question, body.context ?? []);

  const upstreamCtl = new AbortController();
  const killTimer = setTimeout(() => upstreamCtl.abort(), HARD_TIMEOUT_MS);

  let upstream: Response;
  try {
    upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        stream: true,
        system: [
          { type: "text", text: SYSTEM_PROMPT_BASE, cache_control: { type: "ephemeral" } },
        ],
        messages: [{ role: "user", content: userPrompt }],
      }),
      signal: upstreamCtl.signal,
    });
  } catch (err) {
    clearTimeout(killTimer);
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ ok: false, error: `upstream connect failed: ${msg}` }), {
      status: 502,
      headers: { "content-type": "application/json", ...CORS },
    });
  }

  if (!upstream.ok || !upstream.body) {
    clearTimeout(killTimer);
    const txt = await upstream.text().catch(() => "");
    return new Response(
      JSON.stringify({ ok: false, error: `upstream ${upstream.status}: ${txt.slice(0, 240)}` }),
      { status: upstream.status === 429 ? 429 : 502, headers: { "content-type": "application/json", ...CORS } },
    );
  }

  // Pipe Anthropic SSE stream → plain text deltas to the client. We parse
  // each `data: {...}` line, extract content_block_delta.text, and forward
  // only the visible deltas. End the stream with a `[DONE]` sentinel so the
  // client knows it's complete (and not a network drop).
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await reader.read();
        if (done) {
          controller.enqueue(encoder.encode("\n[DONE]\n"));
          controller.close();
          clearTimeout(killTimer);
          return;
        }
        const chunk = decoder.decode(value, { stream: true });
        // Anthropic SSE format: lines beginning with `data: `.
        for (const rawLine of chunk.split("\n")) {
          const line = rawLine.trim();
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          let evt: { type?: string; delta?: { type?: string; text?: string } } | null = null;
          try { evt = JSON.parse(payload); } catch { continue; }
          if (evt?.type === "content_block_delta" && evt.delta?.type === "text_delta" && evt.delta.text) {
            controller.enqueue(encoder.encode(evt.delta.text));
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        controller.enqueue(encoder.encode(`\n[ERROR] ${msg}\n[DONE]\n`));
        controller.close();
        clearTimeout(killTimer);
      }
    },
    cancel() {
      upstreamCtl.abort();
      clearTimeout(killTimer);
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      ...CORS,
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store, no-transform",
      "x-content-type-options": "nosniff",
      "x-accel-buffering": "no",
    },
  });
}
