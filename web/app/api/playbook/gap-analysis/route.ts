import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";

import { getAnthropicClient } from "@/lib/server/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface Body {
  playbookTitle: string;
  typology: string;
  completedChecks: string[];
  incompleteChecks: string[];
  requiredStepsMissing: string[];
}

interface GapResult {
  riskRating: "critical" | "high" | "medium" | "low";
  gapSummary: string;
  criticalGaps: Array<{ check: string; risk: string; consequence: string }>;
  regulatoryExposure: string[];
  canFileSAR: boolean;
  canFileReason: string;
  priorityActions: string[];
}

const FALLBACK: GapResult = {
  riskRating: "high",
  gapSummary: "AI gap analysis unavailable — check ANTHROPIC_API_KEY. Review incomplete checks manually.",
  criticalGaps: [],
  regulatoryExposure: [],
  canFileSAR: false,
  canFileReason: "Manual review required",
  priorityActions: [],
};

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "playbook/gap-analysis temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 , headers: gate.headers });
  }

  const systemPrompt = [
    "You are a UAE MLRO conducting a stress-test of an AML compliance checklist. Analyze which incomplete checks create regulatory exposure and quantify the risk of filing gaps. Be direct and critical — this drives remediation priority.",
    "",
    "Output ONLY valid JSON:",
    `{
  "riskRating": "critical" | "high" | "medium" | "low",
  "gapSummary": "string — 1-2 sentence assessment of overall gap risk",
  "criticalGaps": [
    {
      "check": "string — the incomplete check item",
      "risk": "string — what risk this gap creates",
      "consequence": "string — regulatory/legal consequence of leaving this gap"
    }
  ],
  "regulatoryExposure": ["string array — specific UAE/FATF articles you're exposed to by these gaps"],
  "canFileSAR": boolean,
  "canFileReason": "string — whether completed checks are sufficient to support an STR filing",
  "priorityActions": ["string array — ordered list of most urgent gaps to close first"]
}`,
  ].join("\n");

  const userContent = [
    `Playbook: ${body.playbookTitle} (typology: ${body.typology})`,
    "",
    `COMPLETED (${body.completedChecks.length}): ${body.completedChecks.slice(0, 20).join(" | ")}`,
    `INCOMPLETE (${body.incompleteChecks.length}): ${body.incompleteChecks.join(" | ")}`,
    body.requiredStepsMissing.length > 0 ? `REQUIRED STEPS MISSING: ${body.requiredStepsMissing.join(" | ")}` : "",
    "",
    "Stress-test these gaps and identify regulatory exposure.",
  ].filter(Boolean).join("\n");

  try {
    const client = getAnthropicClient(apiKey, 4_500);
    const res = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: "user", content: userContent }],
      });


    const first = res.content[0];
    const raw = (first?.type === "text" ? first.text : undefined) ?? "";
    const cleaned = raw.replace(/^```json?\s*/i, "").replace(/\s*```$/i, "").trim();
    const result = JSON.parse(cleaned) as GapResult;
    if (!Array.isArray(result.criticalGaps)) result.criticalGaps = [];
    if (!Array.isArray(result.regulatoryExposure)) result.regulatoryExposure = [];
    if (!Array.isArray(result.priorityActions)) result.priorityActions = [];

    return NextResponse.json({ ok: true, ...result }, { headers: gate.headers });
  } catch {
    return NextResponse.json({ ok: false, error: "playbook/gap-analysis temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
