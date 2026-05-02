// POST /api/agent/counterfactual
//
// Counterfactual generator (audit follow-up #2 of the upgrade catalogue).
// Given a BrainVerdict + the evidence pack that produced it, asks Opus
// to enumerate the SMALLEST evidence deltas that would flip the outcome
// (clear → escalate, escalate → clear, etc.) and grades them by
// plausibility + cost-to-acquire. Surfaces MLRO blindspots at
// disposition time per Charter P10 (no proceeding on insufficient info).
//
// Body: {
//   verdict: BrainVerdict,
//   subject: { ... },
//   evidence?: { ... },
//   targetOutcome?: 'clear'|'flag'|'escalate'|'block', // default: opposite of current
// }
// Response: {
//   ok: true,
//   counterfactuals: Array<{
//     id: string,
//     description: string,
//     plausibility: 'high'|'medium'|'low',
//     costToAcquire: 'low'|'medium'|'high',
//     wouldShift: string,
//     impact: string,
//     citation?: string
//   }>,
//   model, usage
// }

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { weaponizedSystemPrompt } from "../../../../../dist/src/brain/weaponized.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MODEL = "claude-opus-4-7";
const MAX_OUTPUT_TOKENS = 4096;
const BUDGET_MS = 22_000;

type Outcome = "clear" | "flag" | "escalate" | "inconclusive" | "block";

interface Body {
  verdict: { outcome: Outcome; aggregateScore?: number; posterior?: number; [k: string]: unknown };
  subject: { name: string; [k: string]: unknown };
  evidence?: Record<string, unknown>;
  targetOutcome?: Outcome;
  model?: string;
}

function defaultTarget(o: Outcome): Outcome {
  if (o === "clear") return "escalate";
  if (o === "flag") return "escalate";
  if (o === "escalate") return "clear";
  if (o === "block") return "clear";
  return "flag";
}

const COUNTERFACTUAL_INSTRUCTION = (target: Outcome) =>
  `You are running a counterfactual analysis. Given the supplied verdict, subject, and evidence pack, produce an array of 4–6 minimal counterfactuals that would shift the outcome to "${target}". Each counterfactual MUST cite the specific evidence-acquisition step required (NOT speculate that the evidence exists), and MUST grade plausibility and cost-to-acquire conservatively (Charter P2 + P10).

Output STRICTLY as a single JSON object matching this schema, no prose, no markdown fences:
{
  "counterfactuals": [
    {
      "id": "cf_1",
      "description": "<single sentence — what new evidence or condition>",
      "plausibility": "high|medium|low",
      "costToAcquire": "low|medium|high",
      "wouldShift": "<single sentence — what flips and why>",
      "impact": "outcome-only|posterior-only|both",
      "citation": "<optional regulatory anchor or doctrine id>"
    }
  ]
}

Rules:
- Do NOT invent specific facts (e.g. "the subject is on OFAC SDN") — describe the evidence acquisition step, not the conclusion.
- Charter P2: never imply fabricated citations. If you don't know an article number, omit citation.
- Order counterfactuals by descending plausibility × inverse cost (cheap+plausible first).
- If the supplied verdict is "inconclusive", target counterfactuals that would resolve it in either direction.`;

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok && gate.response.status === 429) return gate.response;
  const gateHeaders: Record<string, string> = gate.ok ? gate.headers : {};

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    return NextResponse.json(
      {
        ok: true,
        currentOutcome: null,
        targetOutcome: null,
        counterfactuals: [],
        rawText: "AI analysis unavailable — manual review required",
        model: null,
        usage: null,
      },
      { headers: gateHeaders },
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
  if (!body?.verdict?.outcome || !body?.subject?.name) {
    return NextResponse.json(
      { ok: false, error: "verdict.outcome + subject.name required" },
      { status: 400, headers: gateHeaders },
    );
  }

  const model = body.model ?? DEFAULT_MODEL;
  const target = body.targetOutcome ?? defaultTarget(body.verdict.outcome);
  const systemPrompt = weaponizedSystemPrompt({
    taskRole: "Counterfactual analyst — surface the minimal evidence deltas that would change the verdict.",
    audience: "MLRO",
  });

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), BUDGET_MS);

  try {
    const userMsg = `Current verdict outcome: ${body.verdict.outcome}\nTarget outcome to flip to: ${target}\n\nSubject + evidence pack:\n\`\`\`json\n${JSON.stringify({ subject: body.subject, evidence: body.evidence ?? {}, verdictSummary: { outcome: body.verdict.outcome, aggregateScore: body.verdict.aggregateScore, posterior: body.verdict.posterior } }, null, 2)}\n\`\`\`\n\n${COUNTERFACTUAL_INSTRUCTION(target)}`;

    const res = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: MAX_OUTPUT_TOKENS,
        system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: userMsg }],
      }),
      signal: ctrl.signal,
    });
    clearTimeout(t);

    if (!res.ok) {
      console.warn("[agent/counterfactual] Anthropic API", res.status);
      return NextResponse.json(
        {
          ok: true,
          currentOutcome: body.verdict.outcome,
          targetOutcome: target,
          counterfactuals: [],
          rawText: "",
          model: null,
          usage: null,
          degraded: true,
        },
        { headers: gateHeaders },
      );
    }

    const data = (await res.json()) as {
      content: Array<{ type: string; text?: string }>;
      model: string;
      usage?: Record<string, number>;
    };
    const text = data.content.filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n");

    let counterfactuals: unknown = [];
    try {
      // Strip optional code fences if the model still emitted them.
      const jsonStart = text.indexOf("{");
      const jsonEnd = text.lastIndexOf("}");
      if (jsonStart >= 0 && jsonEnd > jsonStart) {
        const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as { counterfactuals?: unknown };
        counterfactuals = parsed.counterfactuals ?? [];
      }
    } catch (parseErr) {
      console.warn("[agent/counterfactual] parse failed", parseErr);
    }

    return NextResponse.json(
      {
        ok: true,
        currentOutcome: body.verdict.outcome,
        targetOutcome: target,
        counterfactuals,
        rawText: text,
        model: data.model,
        usage: data.usage ?? null,
      },
      { headers: gateHeaders },
    );
  } catch (err) {
    clearTimeout(t);
    console.error("[agent/counterfactual]", err instanceof Error ? err.message : String(err));
    return NextResponse.json(
      {
        ok: true,
        currentOutcome: body.verdict.outcome,
        targetOutcome: target,
        counterfactuals: [],
        rawText: "",
        model: null,
        usage: null,
        degraded: true,
      },
      { headers: gateHeaders },
    );
  }
}
