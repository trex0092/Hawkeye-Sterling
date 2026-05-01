export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { writeAuditEvent } from "@/lib/audit";

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
  summary: "AI analysis unavailable — check ANTHROPIC_API_KEY",
  priorityCases: [],
  duplicateRisk: null,
  actionItems: [],
  regulatoryDeadlines: [],
  mlroSignoff: "",
};

export async function POST(req: NextRequest) {
  let body: { cases?: CaseInput[] };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const cases = body.cases ?? [];

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ ok: true, briefing: EMPTY_BRIEFING });
  }

  const userMessage = `Here are the active STR/SAR cases for today's briefing:\n\n${JSON.stringify(cases, null, 2)}\n\nToday's date: ${new Date().toISOString().slice(0, 10)}`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 800,
      system:
        "You are preparing a concise daily briefing for the MLRO about active STR/SAR cases. Identify priority cases needing immediate attention, flag any apparent duplicates (same subject filed multiple times), note regulatory deadlines (FDL Art. 26 requires filing within 30 days of detection), and list required MLRO actions. Output clean JSON only.",
      messages: [
        {
          role: "user",
          content: userMessage,
        },
      ],
    }),
  });

  if (!response.ok) {
    return NextResponse.json({ ok: false, error: "Claude API error" }, { status: 502 });
  }

  const claudeData = (await response.json()) as {
    content: Array<{ type: string; text: string }>;
  };

  const rawText = claudeData.content[0]?.text ?? "";
  const cleaned = rawText
    .replace(/^```json?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  let briefing: MlroBriefing;
  try {
    briefing = JSON.parse(cleaned) as MlroBriefing;
  } catch {
    briefing = { ...EMPTY_BRIEFING, summary: rawText.slice(0, 400) };
  }

  writeAuditEvent("mlro", "str.briefing-generated", `cases: ${cases.length}`);

  return NextResponse.json({ ok: true, briefing });
}
