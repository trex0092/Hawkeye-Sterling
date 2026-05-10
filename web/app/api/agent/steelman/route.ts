// POST /api/agent/steelman
//
// Devil's-advocate steelman (audit follow-up #4). Given a verdict, runs
// a second Opus pass with an explicit adversarial frame: argue the
// STRONGEST possible case AGAINST the stated outcome. Forces the MLRO
// to defend the verdict against its own best counter-argument before
// disposition.
//
// Distinct from the existing /api/mlro-advisor-challenger route, which
// red-teams a free-form narrative. This one operates on a structured
// verdict + evidence pack and returns a structured rebuttal.
//
// Body: { verdict, subject, evidence?, model? }
// Response: {
//   ok, steelman: { thesis, supportingArguments[], weakestEvidence[], recommendedAction },
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

interface Body {
  verdict: { outcome: string; aggregateScore?: number; posterior?: number; [k: string]: unknown };
  subject: { name: string; [k: string]: unknown };
  evidence?: Record<string, unknown>;
  model?: string;
}

const STEELMAN_INSTRUCTION = (currentOutcome: string) =>
  `You are running an adversarial steelman analysis. The system has produced a verdict of "${currentOutcome}". Your job is to argue the STRONGEST possible case AGAINST that outcome, treating it as a hostile peer reviewer would.

Output STRICTLY as a single JSON object, no prose, no markdown fences:
{
  "steelman": {
    "thesis": "<single sentence — the contrary outcome the steelman defends>",
    "supportingArguments": [
      {
        "argument": "<single sentence>",
        "evidenceClass": "missing_evidence | misweighted_evidence | regime_misclassification | typology_blindspot | calibration_error | charter_violation",
        "strength": "weak|moderate|strong|decisive"
      }
    ],
    "weakestEvidenceCited": [
      {
        "evidenceId": "<id from input or descriptive label>",
        "reason": "<why this evidence does not support the verdict as cited>"
      }
    ],
    "missedConsiderations": ["<topic 1>", "<topic 2>"],
    "recommendedAction": "uphold|return_for_revision|overturn|escalate_for_human_review",
    "confidence": "low|medium|high"
  }
}

Rules:
- Charter P2: do NOT invent facts. Critique the verdict's USE of the supplied evidence.
- Charter P5: if you suggest "overturn", you MUST cite a specific evidence-class issue, not vibes.
- Be ruthless on the verdict's weak points; do not soften.
- 3–6 supportingArguments. 0–4 weakestEvidenceCited entries.
- recommendedAction "overturn" requires at least one "decisive" supporting argument.`;

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const gateHeaders: Record<string, string> = gate.ok ? gate.headers : {};

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    return NextResponse.json(
      {
        ok: true,
        currentOutcome: null,
        steelman: {
          thesis: "AI analysis unavailable — manual review required",
          supportingArguments: [],
          weakestEvidenceCited: [],
          missedConsiderations: [],
          recommendedAction: "uphold",
          confidence: "low",
        },
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
  const systemPrompt = weaponizedSystemPrompt({
    taskRole: "Adversarial steelman — argue the STRONGEST case against the stated verdict.",
    audience: "MLRO",
  });

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), BUDGET_MS);

  try {
    const userMsg =
      `Verdict to steelman against: ${body.verdict.outcome}\n\nSubject + evidence:\n` +
      "```json\n" +
      JSON.stringify({ subject: body.subject, evidence: body.evidence ?? {}, verdictSummary: body.verdict }, null, 2) +
      "\n```\n\n" +
      STEELMAN_INSTRUCTION(body.verdict.outcome);

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
      console.warn("[agent/steelman] Anthropic API", res.status);
      return NextResponse.json(
        {
          ok: true,
          currentOutcome: body.verdict.outcome,
          steelman: null,
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

    let steelman: unknown = null;
    try {
      const s = text.indexOf("{");
      const e = text.lastIndexOf("}");
      if (s >= 0 && e > s) {
        const parsed = JSON.parse(text.slice(s, e + 1)) as { steelman?: unknown };
        steelman = parsed.steelman ?? null;
      }
    } catch (perr) {
      console.warn("[agent/steelman] parse failed", perr);
    }

    return NextResponse.json(
      {
        ok: true,
        currentOutcome: body.verdict.outcome,
        steelman,
        rawText: text,
        model: data.model,
        usage: data.usage ?? null,
      },
      { headers: gateHeaders },
    );
  } catch (err) {
    clearTimeout(t);
    console.error("[agent/steelman]", err instanceof Error ? err.message : String(err));
    return NextResponse.json(
      {
        ok: true,
        currentOutcome: body.verdict.outcome,
        steelman: null,
        rawText: "",
        model: null,
        usage: null,
        degraded: true,
      },
      { headers: gateHeaders },
    );
  }
}
