export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";

import { getAnthropicClient } from "@/lib/server/llm";
import { sanitizeField, sanitizeText } from "@/lib/server/sanitize-prompt";

export interface RegExamResult {
  examArea: string;
  likelyQuestions: Array<{
    question: string;
    modelAnswer: string;
    documentationRequired: string[];
    regulatoryBasis: string;
    difficulty: "high" | "medium" | "low";
  }>;
  commonFindings: string[];
  bestPractices: string[];
  preparationSteps: string[];
  regulatoryBasis: string;
}


export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: {
    examArea: string;
    institutionType?: string;
    context?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 , headers: gate.headers });
  }
  if (!body.examArea?.trim()) return NextResponse.json({ ok: false, error: "examArea required" }, { status: 400 , headers: gate.headers });

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "regulatory-exam-prep temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });

  try {
    const client = getAnthropicClient(apiKey, 55_000);
    const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 700,
        system: `You are a CBUAE examination specialist with expertise in UAE AML/CFT inspection methodology, typical CBUAE examination questions, and model answers for regulated financial institutions. Generate realistic examination preparation materials including likely questions, model answers, documentation requirements, common findings, and best practices. Base questions on UAE FDL 10/2025, CBUAE AML/CFT Guidelines, and FATF Recommendations. Model answers should reflect what an inspector expects to hear — specific, procedure-oriented, legally grounded. Respond ONLY with valid JSON matching the RegExamResult interface — no markdown fences.`,
        messages: [{
          role: "user",
          content: `Exam Area / Topic: ${sanitizeField(body.examArea, 500)}
Institution Type: ${sanitizeField(body.institutionType, 100) ?? "UAE licensed bank"}
Additional Context: ${sanitizeText(body.context, 2000) ?? "none"}

Generate comprehensive regulatory examination preparation materials for this topic. Return complete RegExamResult JSON.`,
        }],
      });
    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as RegExamResult;
    if (!Array.isArray(result.likelyQuestions)) result.likelyQuestions = [];
    else for (const q of result.likelyQuestions) { if (!Array.isArray(q.documentationRequired)) q.documentationRequired = []; }
    if (!Array.isArray(result.commonFindings)) result.commonFindings = [];
    if (!Array.isArray(result.bestPractices)) result.bestPractices = [];
    if (!Array.isArray(result.preparationSteps)) result.preparationSteps = [];
    return NextResponse.json({ ok: true, ...result }, { headers: gate.headers });
  } catch {
    return NextResponse.json({ ok: false, error: "regulatory-exam-prep temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
