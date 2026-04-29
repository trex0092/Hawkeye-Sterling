// POST /api/mlro-advisor-challenger
//
// Standalone red-team / regulator-perspective critique against an
// existing MLRO Advisor answer. Unlike the Deep-mode challenger stage
// (which is buried inside the executor → advisor → challenger pipeline
// and only fires for multi_perspective mode), this route can be invoked
// on demand against any prior answer — Quick, Speed, Balanced, or Deep.
// It returns a structured critique so the UI can surface the outcome,
// counter-arguments, weak citations, and concrete fixes as distinct
// regulator-facing artefacts.
//
// Body: {
//   question: string;          // the original question
//   narrative: string;         // the advisor's answer to challenge
//   mode?: string;             // mode that produced the answer (display only)
//   classifierContext?: string // optional pre-formatted brain context
// }
// Response: {
//   ok: boolean;
//   outcome?: "UPHELD" | "PARTIALLY_UPHELD" | "OVERTURNED";
//   steelman?: string;
//   weakCitations?: Array<{ citation: string; why: string }>;
//   alternativeReadings?: string[];
//   hardenSuggestions?: string[];
//   fullCritique?: string;
//   elapsedMs: number;
//   error?: string;
// }

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Sonnet 4.6 — same model the existing Deep-mode challenger uses
// (src/integrations/mlroAdvisor.ts). Critiquing requires strong reasoning;
// Haiku is too shallow to spot weak citations reliably.
const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 1500;
const HARD_TIMEOUT_MS = 22_000;

const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type, authorization, x-api-key",
};

interface Body {
  question?: string;
  narrative?: string;
  mode?: string;
  classifierContext?: string;
}

const SYSTEM_PROMPT =
  "You are the MLRO Challenger — a senior regulatory examiner whose job is to red-team a prior compliance answer. " +
  "You assume the regulator's worst-case interpretation. You do not invent regulations; if you reference one, it must exist. " +
  "Your output is structured for downstream parsing — preserve the section headers exactly as instructed. " +
  "Never tip off subjects; this is an internal compliance critique. Compliance guidance only, never legal advice.";

function buildUserPrompt(question: string, narrative: string, mode: string | undefined, classifierContext: string | undefined): string {
  return [
    `ORIGINAL QUESTION:\n${question}`,
    "",
    `ADVISOR ANSWER (mode: ${mode ?? "unknown"}) TO CHALLENGE:\n${narrative}`,
    "",
    classifierContext ? `BRAIN CLASSIFIER CONTEXT:\n${classifierContext}\n` : "",
    "TASK — Produce a structured red-team critique with the following sections in this exact order, using the literal headers shown:",
    "",
    "## OUTCOME",
    "(One of: UPHELD, PARTIALLY_UPHELD, OVERTURNED. One sentence justification.)",
    "",
    "## STEELMAN COUNTER-ARGUMENT",
    "(The single strongest argument a regulator or auditor would raise against the advisor's answer. 2-4 sentences. No hedging.)",
    "",
    "## WEAK CITATIONS",
    "(Bullet list of regulatory anchors in the advisor answer that are weak, ambiguous, or missing supporting authority. Format each line as: `- <citation> — <why it's weak>`. If none, write `- none`.)",
    "",
    "## ALTERNATIVE REGULATORY READINGS",
    "(Bullet list of plausible alternative readings of the same regulation that would change the conclusion. Be specific about which regulator/jurisdiction would adopt each reading. If none, write `- none`.)",
    "",
    "## HARDEN SUGGESTIONS",
    "(Bullet list of concrete, actionable fixes the MLRO should make to harden the answer before it is filed or relied on. Each item ≤1 sentence. Always provide at least 2.)",
    "",
    "Do not add any preamble or sections beyond these five headers.",
  ].filter(Boolean).join("\n");
}

interface ParsedCritique {
  outcome?: "UPHELD" | "PARTIALLY_UPHELD" | "OVERTURNED";
  steelman?: string;
  weakCitations: Array<{ citation: string; why: string }>;
  alternativeReadings: string[];
  hardenSuggestions: string[];
}

function parseCritique(raw: string): ParsedCritique {
  const sections = splitBySection(raw);
  const outcomeText = (sections["OUTCOME"] ?? "").trim();
  const outcomeMatch = outcomeText.match(/\b(UPHELD|PARTIALLY_UPHELD|OVERTURNED)\b/);
  const outcome = (outcomeMatch?.[1] ?? undefined) as ParsedCritique["outcome"];

  return {
    outcome,
    steelman: (sections["STEELMAN COUNTER-ARGUMENT"] ?? "").trim() || undefined,
    weakCitations: parseWeakCitations(sections["WEAK CITATIONS"] ?? ""),
    alternativeReadings: parseBullets(sections["ALTERNATIVE REGULATORY READINGS"] ?? ""),
    hardenSuggestions: parseBullets(sections["HARDEN SUGGESTIONS"] ?? ""),
  };
}

function splitBySection(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  // Match `## TITLE` headers regardless of leading/trailing whitespace.
  const re = /^##\s+([^\n]+?)\s*$/gm;
  const indices: Array<{ title: string; start: number; end: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    indices.push({ title: m[1]!.trim().toUpperCase(), start: m.index, end: m.index + m[0].length });
  }
  for (let i = 0; i < indices.length; i++) {
    const cur = indices[i]!;
    const next = indices[i + 1];
    out[cur.title] = text.slice(cur.end, next ? next.start : text.length).trim();
  }
  return out;
}

function parseBullets(block: string): string[] {
  const bullets: string[] = [];
  for (const line of block.split("\n")) {
    const trimmed = line.replace(/^[\s-•*]+/, "").trim();
    if (!trimmed) continue;
    if (trimmed.toLowerCase() === "none") return [];
    bullets.push(trimmed);
  }
  return bullets;
}

function parseWeakCitations(block: string): Array<{ citation: string; why: string }> {
  const out: Array<{ citation: string; why: string }> = [];
  for (const line of block.split("\n")) {
    const trimmed = line.replace(/^[\s-•*]+/, "").trim();
    if (!trimmed) continue;
    if (trimmed.toLowerCase() === "none") return [];
    // Format: "<citation> — <why>" (em dash) or "<citation> - <why>" (hyphen).
    const match = trimmed.match(/^(.+?)\s+[—-]\s+(.+)$/);
    if (match) {
      out.push({ citation: match[1]!.trim(), why: match[2]!.trim() });
    } else {
      out.push({ citation: trimmed, why: "" });
    }
  }
  return out;
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
    return NextResponse.json({ ok: false, error: "invalid JSON body", elapsedMs: 0 }, { status: 400, headers: CORS });
  }

  const question = body.question?.trim();
  const narrative = body.narrative?.trim();
  if (!question || !narrative) {
    return NextResponse.json(
      { ok: false, error: "question and narrative are required", elapsedMs: 0 },
      { status: 400, headers: CORS },
    );
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "ANTHROPIC_API_KEY not configured", elapsedMs: 0 },
      { status: 503, headers: CORS },
    );
  }

  const userPrompt = buildUserPrompt(question, narrative, body.mode, body.classifierContext);

  const upstreamCtl = new AbortController();
  const killTimer = setTimeout(() => upstreamCtl.abort(), HARD_TIMEOUT_MS);

  try {
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
        stream: true,
        system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
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
    let raw = "";

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
          raw += evt.delta.text;
        }
      }
    }

    const parsed = parseCritique(raw);
    return NextResponse.json(
      {
        ok: true,
        outcome: parsed.outcome,
        steelman: parsed.steelman,
        weakCitations: parsed.weakCitations,
        alternativeReadings: parsed.alternativeReadings,
        hardenSuggestions: parsed.hardenSuggestions,
        fullCritique: raw,
        elapsedMs: Date.now() - startedAt,
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
          ? `Challenger budget exceeded (>${Math.round(HARD_TIMEOUT_MS / 1000)} s).`
          : `upstream connect failed: ${msg}`,
        elapsedMs: Date.now() - startedAt,
      },
      { status: aborted ? 504 : 502, headers: CORS },
    );
  } finally {
    clearTimeout(killTimer);
  }
}
