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

import { getAnthropicClient } from "@/lib/server/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Module-level safety net — see /api/compliance-qa for rationale.
const REJECTION_GUARD_KEY = "__hsMlroChallengerRejectionGuard";
const guardHost = globalThis as unknown as Record<string, boolean | undefined>;
if (typeof process !== "undefined" && !guardHost[REJECTION_GUARD_KEY]) {
  guardHost[REJECTION_GUARD_KEY] = true;
  process.on("unhandledRejection", (reason: unknown) => {
    const msg = reason instanceof Error ? reason.message : String(reason);
    if (msg.includes("AbortError") || msg.includes("aborted")) return;
    console.error("[mlro-advisor-challenger] unhandled rejection", msg);
  });
}

// Haiku 4.5 — Sonnet 4.6 with 1500 tokens routinely brushed up against
// Netlify's 30 s edge "Inactivity Timeout" causing 504s in production.
// Haiku 4.5 is materially faster and reasons well enough for citation-
// adequacy critiques on STR drafts.
const MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 1500;
const HARD_TIMEOUT_MS = 25_000;

const CORS: Record<string, string> = {
  "access-control-allow-origin": process.env["NEXT_PUBLIC_APP_URL"] ?? "https://hawkeye-sterling.netlify.app",
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
  if (!gate.ok) return gate.response;

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
  if (question.length > 2000) {
    return NextResponse.json(
      { ok: false, error: "question exceeds 2000-character limit", elapsedMs: 0 },
      { status: 400, headers: CORS },
    );
  }
  if (narrative.length > 10_000) {
    return NextResponse.json(
      { ok: false, error: "narrative exceeds 10,000-character limit", elapsedMs: 0 },
      { status: 400, headers: CORS },
    );
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    return NextResponse.json(
      {
        ok: true,
        outcome: undefined,
        steelman: "AI challenger not available — ANTHROPIC_API_KEY not configured. Manual regulatory review required.",
        weakCitations: [],
        alternativeReadings: [],
        hardenSuggestions: ["Conduct manual red-team review with a senior compliance officer."],
        fullCritique: "",
        elapsedMs: 0,
        note: "Challenger unavailable — API key not configured.",
      },
      { status: 200, headers: CORS },
    );
  }

  const userPrompt = buildUserPrompt(question, narrative, body.mode, body.classifierContext);

  const upstreamCtl = new AbortController();
  const killTimer = setTimeout(() => upstreamCtl.abort(), HARD_TIMEOUT_MS);

  try {
    const client = getAnthropicClient(apiKey, 55000);
    const upstream = await client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: userPrompt }],
      });

    const raw = upstream.content[0]?.type === "text" ? upstream.content[0].text : "";
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
    console.error("[mlro-advisor-challenger] failed", aborted ? "timeout" : msg);
    return NextResponse.json(
      {
        ok: true,
        outcome: undefined,
        steelman: aborted
          ? `Challenger budget exceeded (>${Math.round(HARD_TIMEOUT_MS / 1000)} s) — manual regulatory review required.`
          : "Challenger service temporarily unavailable. Manual regulatory review required.",
        weakCitations: [],
        alternativeReadings: [],
        hardenSuggestions: ["Conduct manual red-team review with a senior compliance officer."],
        fullCritique: "",
        elapsedMs: Date.now() - startedAt,
        note: aborted ? "Challenger timed out." : `upstream connect failed: ${msg}`,
      },
      { status: 200, headers: CORS },
    );
  } finally {
    clearTimeout(killTimer);
  }
}
