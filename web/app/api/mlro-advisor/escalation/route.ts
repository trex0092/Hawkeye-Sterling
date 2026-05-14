import { NextResponse } from "next/server";
import { writeAuditEvent } from "@/lib/audit";
import { enforce } from "@/lib/server/enforce";

import { getAnthropicClient } from "@/lib/server/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface Body {
  subjectName: string;
  riskScore?: number;
  sanctionsHits?: string[];
  pepTier?: string;
  adverseMediaCount?: number;
  typologies?: string[];
  jurisdictions?: string[];
  amountAed?: number;
  cddPosture?: string;
  notes?: string;
}

interface EscalationDecision {
  decision: "FILE_STR" | "ESCALATE_INTERNAL" | "ENHANCE_CDD" | "MONITOR" | "CLEAR";
  confidence: number;
  urgency: "immediate" | "24h" | "72h" | "routine";
  primaryTrigger: string;
  regulatoryBasis: string;
  rationale: string;
  requiredActions: string[];
  deadlines: string[];
}

const FALLBACK: EscalationDecision = {
  decision: "MONITOR",
  confidence: 0,
  urgency: "routine",
  primaryTrigger: "API key not configured",
  regulatoryBasis: "",
  rationale: "Manual review required",
  requiredActions: [],
  deadlines: [],
};

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const apiKey = process.env["ANTHROPIC_API_KEY"];

  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "mlro-advisor/escalation temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers});
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 , headers: gate.headers});
  }

  if (!body?.subjectName?.trim()) {
    return NextResponse.json({ ok: false, error: "subjectName is required" }, { status: 400 , headers: gate.headers});
  }

  const signals: string[] = [];
  if (body.riskScore != null) signals.push(`Risk score: ${body.riskScore}/100`);
  if (body.sanctionsHits?.length) signals.push(`Sanctions hits: ${body.sanctionsHits.join(", ")}`);
  if (body.pepTier) signals.push(`PEP tier: ${body.pepTier}`);
  if (body.adverseMediaCount != null) signals.push(`Adverse media hits: ${body.adverseMediaCount}`);
  if (body.typologies?.length) signals.push(`Typologies: ${body.typologies.join(", ")}`);
  if (body.jurisdictions?.length) signals.push(`Jurisdictions: ${body.jurisdictions.join(", ")}`);
  if (body.amountAed != null) signals.push(`Amount (AED): ${body.amountAed.toLocaleString()}`);
  if (body.cddPosture) signals.push(`CDD posture: ${body.cddPosture}`);
  if (body.notes) signals.push(`Analyst notes: ${body.notes}`);

  const userContent = [
    `Subject: ${body.subjectName.trim()}`,
    "",
    "RISK SIGNALS:",
    signals.length > 0 ? signals.join("\n") : "No signals provided.",
    "",
    "Analyze the risk signals above and output a JSON escalation decision object.",
  ].join("\n");

  const systemPrompt = [
    "You are a UAE MLRO making a binary compliance escalation decision under FDL 10/2025, Cabinet Resolution 134/2025, and FATF Recommendations. Analyze the risk signals and output a decision. Be decisive — this decision drives regulatory action.",
    "",
    "Heuristics:",
    "- OFAC/UN sanctions hit → always FILE_STR, urgency: immediate",
    "- PEP tier national/state_leader → ESCALATE_INTERNAL or FILE_STR if other signals present",
    "- riskScore ≥ 85 + typologies → FILE_STR or ESCALATE_INTERNAL",
    "- CAHRA jurisdictions (IR, RU, KP, SY, SD, AF, BY, CU, MM, VE) → ESCALATE_INTERNAL minimum",
    "- AED ≥ 55,000 cash DPMS → ENHANCE_CDD minimum",
    "- No hits, low score → MONITOR or CLEAR",
    "",
    "Output ONLY valid JSON in this exact shape:",
    `{
  "decision": "FILE_STR" | "ESCALATE_INTERNAL" | "ENHANCE_CDD" | "MONITOR" | "CLEAR",
  "confidence": 0.0-1.0,
  "urgency": "immediate" | "24h" | "72h" | "routine",
  "primaryTrigger": "string — the single most important regulatory trigger e.g. 'OFAC SDN hit → FDL Art.26 mandatory filing'",
  "regulatoryBasis": "string — specific articles/recommendations e.g. 'FDL Art.26, FATF R.20, Cabinet Decision 134/2025 Art.8'",
  "rationale": "string — 2-3 sentence MLRO-grade justification",
  "requiredActions": ["string array — specific next steps e.g. 'Freeze account within 24h per EOCN guidance'"],
  "deadlines": ["string array — e.g. '30-day STR filing deadline: 2026-05-30'"]
}`,
  ].join("\n");

  let decision: EscalationDecision;

  try {
    const client = getAnthropicClient(apiKey, 55000);
    const res = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2048,
        system: systemPrompt,
        messages: [{ role: "user", content: userContent }],
      });

    const raw = res.content[0]?.type === "text" ? res.content[0].text : "";
    const cleaned = raw.replace(/^```json?\s*/i, "").replace(/\s*```$/i, "").trim();
    try {
      decision = JSON.parse(cleaned) as EscalationDecision;
    } catch {
      decision = { ...FALLBACK, primaryTrigger: "Parse error", rationale: "AI response could not be parsed — manual review required." };
    }
  } catch {
    decision = { ...FALLBACK, primaryTrigger: "AI temporarily unavailable", rationale: "Manual escalation review required." };
  }

  try {
    writeAuditEvent(
      "mlro",
      "advisor.escalation-decision",
      `${body.subjectName.trim()} → ${decision.decision} (confidence ${decision.confidence}, urgency ${decision.urgency})`,
    );
  } catch { /* non-blocking */ }

  return NextResponse.json({ ok: true, ...decision }, { headers: gate.headers });
}
