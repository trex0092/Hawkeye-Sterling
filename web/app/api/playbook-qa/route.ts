export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { writeAuditEvent } from "@/lib/audit";

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
  let body: { question?: string; playbookIds?: string[] };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const question = body.question ?? "";

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ ok: true, ...EMPTY_ANSWER });
  }

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
        "You are an AML compliance expert for a UAE-licensed DPMS/VASP. You answer \"what do I do if…\" questions using UAE AML procedures, FATF recommendations, and compliance playbooks. Always cite the specific regulatory basis (FDL article, FATF Rec, Cabinet Decision, MoE Circular). Keep answers concise and action-oriented — numbered steps where appropriate. Output JSON with: answer (markdown allowed, max 400 words), citations (array of strings like \"FATF R.20\", \"FDL Art.26\"), confidence (0-1), relatedPlaybooks (array of playbook names relevant to this question).",
      messages: [
        {
          role: "user",
          content: question,
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

  let qaAnswer: QaAnswer;
  try {
    qaAnswer = JSON.parse(cleaned) as QaAnswer;
  } catch {
    qaAnswer = { ...EMPTY_ANSWER, answer: rawText.slice(0, 1600), confidence: 0.5 };
  }

  writeAuditEvent("playbook-qa", "playbook.qa-asked", question.slice(0, 200));

  return NextResponse.json({ ok: true, ...qaAnswer });
}
