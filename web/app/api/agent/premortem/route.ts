// POST /api/agent/premortem
//
// Pre-mortem analyser (audit follow-up #3). Given a verdict the MLRO is
// about to commit, asks Opus to time-travel six months forward and
// enumerate the failure modes — "in 6 months, why might this verdict
// have been wrong, and what would we wish we had done at disposition?".
//
// Output is a structured array of failure scenarios + the mitigation
// each implies, ranked by severity × likelihood. MLRO consumes this as
// a checklist BEFORE clicking Approve.
//
// Body: { verdict, subject, evidence?, horizonMonths? (default 6) }
// Response: { ok, scenarios: Array<{...}>, mitigations: Array<{...}>, model, usage }

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { getAnthropicClient } from "@/lib/server/llm";
import { weaponizedSystemPrompt } from "../../../../../dist/src/brain/weaponized.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const DEFAULT_MODEL = "claude-opus-4-7";
const MAX_OUTPUT_TOKENS = 4096;
const BUDGET_MS = 22_000;

interface Body {
  verdict: { outcome: string; [k: string]: unknown };
  subject: { name: string; [k: string]: unknown };
  evidence?: Record<string, unknown>;
  horizonMonths?: number;
  model?: string;
}

const PREMORTEM_INSTRUCTION = (months: number) =>
  `Run a pre-mortem analysis. Imagine it is exactly ${months} months from now and this verdict turned out to be wrong (the subject was later sanctioned, the MLRO was investigated, the case was reopened, etc.). Working backwards from each plausible failure, enumerate:

(a) the failure SCENARIO (what went wrong, in past tense, as if reading a regulator's after-action report),
(b) the WARNING SIGN we should have spotted at disposition,
(c) the MITIGATION we should apply NOW (before clicking approve).

Output STRICTLY as a single JSON object, no prose, no markdown fences:
{
  "scenarios": [
    {
      "id": "pm_1",
      "scenario": "<single past-tense sentence>",
      "warningSign": "<what we should have spotted>",
      "severity": "low|medium|high|critical",
      "likelihood": "rare|possible|likely|near_certain",
      "rootCause": "<one of: missed_evidence | weak_corroboration | regime_blindspot | typology_blindspot | disambiguation_failure | tipping_off | training_data_reliance | calibration_drift>"
    }
  ],
  "mitigations": [
    {
      "id": "mit_1",
      "scenarioId": "pm_1",
      "action": "<imperative — what to do before approving>",
      "estimatedCost": "low|medium|high",
      "blocksDisposition": true|false
    }
  ]
}

Rules:
- Charter P2: do not invent specific facts. Phrase scenarios as plausible failure modes, not predictions.
- Order scenarios by severity × likelihood (critical+near_certain first).
- 4–8 scenarios; 1–2 mitigations per scenario.
- If the verdict is already 'block' or 'escalate', explore false-positive failures (wrongful denial → legal liability).
- If the verdict is 'clear', explore false-negative failures (wrongful onboarding → criminal liability).`;

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const gateHeaders: Record<string, string> = gate.ok ? gate.headers : {};

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    return NextResponse.json(
      {
        ok: true,
        verdictOutcome: null,
        horizonMonths: 6,
        scenarios: [],
        mitigations: [],
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
  const horizon = Math.max(1, Math.min(60, body.horizonMonths ?? 6));
  const systemPrompt = weaponizedSystemPrompt({
    taskRole: "Pre-mortem analyst — identify failure modes BEFORE the MLRO commits to a disposition.",
    audience: "MLRO",
  });

  try {
    const userMsg =
      `Verdict outcome: ${body.verdict.outcome}\n\nSubject + evidence pack:\n` +
      "```json\n" +
      JSON.stringify({ subject: body.subject, evidence: body.evidence ?? {}, verdictSummary: body.verdict }, null, 2) +
      "\n```\n\n" +
      PREMORTEM_INSTRUCTION(horizon);

    const client = getAnthropicClient(apiKey, BUDGET_MS);
    const response = await client.messages.create({
      model,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userMsg }],
    });

    const text = response.content
      .filter((c) => c.type === "text")
      .map((c) => (c.type === "text" ? c.text : ""))
      .join("\n");

    let scenarios: unknown = [];
    let mitigations: unknown = [];
    try {
      const s = text.indexOf("{");
      const e = text.lastIndexOf("}");
      if (s >= 0 && e > s) {
        const parsed = JSON.parse(text.slice(s, e + 1)) as { scenarios?: unknown; mitigations?: unknown };
        scenarios = parsed.scenarios ?? [];
        mitigations = parsed.mitigations ?? [];
      }
    } catch (perr) {
      console.warn("[agent/premortem] parse failed", perr);
    }

    return NextResponse.json(
      {
        ok: true,
        verdictOutcome: body.verdict.outcome,
        horizonMonths: horizon,
        scenarios,
        mitigations,
        rawText: text,
        model: response.model,
        usage: response.usage ?? null,
      },
      { headers: gateHeaders },
    );
  } catch (err) {
    console.error("[agent/premortem]", err instanceof Error ? err.message : String(err));
    return NextResponse.json(
      {
        ok: true,
        verdictOutcome: body.verdict.outcome,
        horizonMonths: horizon,
        scenarios: [],
        mitigations: [],
        rawText: "",
        model: null,
        usage: null,
        degraded: true,
      },
      { headers: gateHeaders },
    );
  }
}
