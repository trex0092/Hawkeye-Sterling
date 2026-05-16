import { NextResponse } from "next/server";
import { writeAuditEvent } from "@/lib/audit";
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
  subjectName?: string;
  notes?: string;
}

interface STRNarrativeResult {
  narrative: string;
  suspiciousBehaviours: string[];
  regulatoryBasis: string[];
  recommendedDisposition: "FILE_STR" | "ESCALATE" | "ENHANCED_CDD" | "MONITOR";
  confidence: number;
  missingElements: string[];
}

const FALLBACK: STRNarrativeResult = {
  narrative: "AI narrative generation unavailable — check ANTHROPIC_API_KEY. Draft narrative manually based on completed checklist items.",
  suspiciousBehaviours: [],
  regulatoryBasis: [],
  recommendedDisposition: "ESCALATE",
  confidence: 0,
  missingElements: [],
};

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "playbook/str-narrative temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers});

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 , headers: gate.headers});
  }

  if (!body?.playbookTitle?.trim()) {
    return NextResponse.json({ ok: false, error: "playbookTitle is required" }, { status: 400 , headers: gate.headers});
  }

  const systemPrompt = [
    "You are a UAE MLRO drafting a Suspicious Transaction Report (STR) narrative under FDL 10/2025, Cabinet Resolution 134/2025, and FATF Recommendations. Based on completed AML playbook checks, draft a professional STR narrative suitable for submission to the UAE Financial Intelligence Unit via goAML.",
    "",
    "Output ONLY valid JSON:",
    `{
  "narrative": "string — 3-5 paragraph STR narrative in formal regulatory language, describing the suspicious behaviour, the investigation steps taken, and the basis for filing. Reference specific completed checks as evidence.",
  "suspiciousBehaviours": ["string array — specific suspicious indicators observed"],
  "regulatoryBasis": ["string array — specific UAE/FATF articles triggering filing obligation"],
  "recommendedDisposition": "FILE_STR" | "ESCALATE" | "ENHANCED_CDD" | "MONITOR",
  "confidence": 0.0-1.0,
  "missingElements": ["string array — checks not yet completed that would strengthen the STR"]
}`,
  ].join("\n");

  const userContent = [
    `Playbook: ${body.playbookTitle} (typology: ${body.typology})`,
    body.subjectName ? `Subject: ${body.subjectName}` : "",
    "",
    `COMPLETED CHECKS (${body.completedChecks.length}):`,
    body.completedChecks.map((c) => `✓ ${c}`).join("\n") || "None",
    "",
    `INCOMPLETE CHECKS (${body.incompleteChecks.length}):`,
    body.incompleteChecks.map((c) => `✗ ${c}`).join("\n") || "None",
    body.notes ? `\nAnalyst notes: ${body.notes}` : "",
    "",
    "Draft the STR narrative based on the completed checks above.",
  ].filter(Boolean).join("\n");

  try {
    const client = getAnthropicClient(apiKey, 55000);
    const res = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1500,
        system: systemPrompt,
        messages: [{ role: "user", content: userContent }],
      });


    const first = res.content[0];
    const raw = (first?.type === "text" ? first.text : undefined) ?? "";
    const cleaned = raw.replace(/^```json?\s*/i, "").replace(/\s*```$/i, "").trim();
    const result = JSON.parse(cleaned) as STRNarrativeResult;
    if (!Array.isArray(result.suspiciousBehaviours)) result.suspiciousBehaviours = [];
    if (!Array.isArray(result.regulatoryBasis)) result.regulatoryBasis = [];
    if (!Array.isArray(result.missingElements)) result.missingElements = [];

    try {
      writeAuditEvent("mlro", "playbook.str-narrative", `${body.playbookTitle} → ${result.recommendedDisposition} (${body.completedChecks.length} checks completed)`);
    } catch { /* non-blocking */ }

    return NextResponse.json({ ok: true, ...result }, { headers: gate.headers });
  } catch {
    return NextResponse.json({ ok: false, error: "playbook/str-narrative temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers});
  }
}
