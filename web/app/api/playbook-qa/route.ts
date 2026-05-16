export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { writeAuditEvent } from "@/lib/audit";
import { enforce } from "@/lib/server/enforce";

import { getAnthropicClient } from "@/lib/server/llm";

interface QaAnswer {
  answer: string;
  citations: string[];
  confidence: number;
  relatedPlaybooks: string[];
}

const EMPTY_ANSWER: QaAnswer = {
  answer: "API key not configured — manual review required",
  citations: [],
  confidence: 0,
  relatedPlaybooks: [],
};

export async function POST(req: NextRequest) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: { question?: string; playbookIds?: string[] };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 , headers: gate.headers });
  }
  const question = body.question ?? "";

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ ok: true, ...EMPTY_ANSWER }, { headers: gate.headers });
  }

  const client = getAnthropicClient(apiKey, 55000);
  const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1200,
      system:
        "You are an AML compliance expert for a UAE-licensed DPMS/VASP. You answer \"what do I do if…\" questions using UAE AML procedures, FATF recommendations, and compliance playbooks. Always cite the specific regulatory basis (FDL article, FATF Rec, Cabinet Decision, MoE Circular). Keep answers concise and action-oriented — numbered steps where appropriate. Output JSON with: answer (markdown allowed, max 400 words), citations (array of strings like \"FATF R.20\", \"FDL Art.26\"), confidence (0-1), relatedPlaybooks (array of playbook names relevant to this question).",
      messages: [
        {
          role: "user",
          content: question,
        },
      ],
    });

  const rawText = response.content[0]?.type === "text" ? response.content[0].text : "";
  const cleaned = rawText
    .replace(/^```json?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  let qaAnswer: QaAnswer;
  try {
    qaAnswer = JSON.parse(cleaned) as QaAnswer;
    if (!Array.isArray(qaAnswer.citations)) qaAnswer.citations = [];
    if (!Array.isArray(qaAnswer.relatedPlaybooks)) qaAnswer.relatedPlaybooks = [];
  } catch {
    qaAnswer = { ...EMPTY_ANSWER, answer: rawText.slice(0, 1600), confidence: 0.5 };
  }

  writeAuditEvent("playbook-qa", "playbook.qa-asked", question.slice(0, 200));

  return NextResponse.json({ ok: true, ...qaAnswer }, { headers: gate.headers });
}
