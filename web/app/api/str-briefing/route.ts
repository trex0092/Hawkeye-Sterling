export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { writeAuditEvent } from "@/lib/audit";
import { enforce } from "@/lib/server/enforce";

import { getAnthropicClient } from "@/lib/server/llm";

interface CaseInput {
  id: string;
  title: string;
  reportKind: string;
  subject: string;
  status: string;
  openedAt: string;
}

interface MlroBriefing {
  summary: string;
  priorityCases: Array<{ id: string; reason: string }>;
  duplicateRisk: string | null;
  actionItems: string[];
  regulatoryDeadlines: string[];
  mlroSignoff: string;
}

const EMPTY_BRIEFING: MlroBriefing = {
  summary: "API key not configured",
  priorityCases: [],
  duplicateRisk: null,
  actionItems: [],
  regulatoryDeadlines: [],
  mlroSignoff: "",
};

export async function POST(req: NextRequest) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: { cases?: CaseInput[] };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 , headers: gate.headers });
  }
  const cases = body.cases ?? [];

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ ok: true, briefing: EMPTY_BRIEFING }, { headers: gate.headers });
  }

  const userMessage = `Here are the active STR/SAR cases for today's briefing:\n\n${JSON.stringify(cases, null, 2)}\n\nToday's date: ${new Date().toISOString().slice(0, 10)}`;

  const client = getAnthropicClient(apiKey, 55000);
  const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1500,
      system:
        "You are preparing a concise daily briefing for the MLRO about active STR/SAR cases. Identify priority cases needing immediate attention, flag any apparent duplicates (same subject filed multiple times), note regulatory deadlines (FDL Art. 26 requires filing within 30 days of detection), and list required MLRO actions. Output clean JSON only.",
      messages: [
        {
          role: "user",
          content: userMessage,
        },
      ],
    });

  const rawText = response.content[0]?.type === "text" ? response.content[0].text : "";
  const cleaned = rawText
    .replace(/^```json?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  let briefing: MlroBriefing;
  try {
    briefing = JSON.parse(cleaned) as MlroBriefing;
    if (!Array.isArray(briefing.priorityCases)) briefing.priorityCases = [];
    if (!Array.isArray(briefing.actionItems)) briefing.actionItems = [];
    if (!Array.isArray(briefing.regulatoryDeadlines)) briefing.regulatoryDeadlines = [];
  } catch {
    briefing = { ...EMPTY_BRIEFING, summary: rawText.slice(0, 400) };
  }

  writeAuditEvent("mlro", "str.briefing-generated", `cases: ${cases.length}`);

  return NextResponse.json({ ok: true, briefing }, { headers: gate.headers });
}
