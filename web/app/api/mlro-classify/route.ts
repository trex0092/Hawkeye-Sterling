// POST /api/mlro-classify
// Cheap, no-LLM endpoint that returns the classifier output for a free-form
// MLRO question. The MLRO Advisor UI debounces calls here while the operator
// types so chips/badges (jurisdictions, regimes, FATF Rec hints, urgency
// flags) update live without burning Anthropic budget.

import { NextResponse } from "next/server";
import { classifyMlroQuestion } from "../../../../dist/src/brain/mlro-question-classifier.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: Request): Promise<NextResponse> {
  let body: { question?: unknown };
  try {
    body = (await req.json()) as { question?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400, headers: CORS });
  }
  if (typeof body.question !== "string" || !body.question.trim()) {
    return NextResponse.json({ ok: false, error: "question is required" }, { status: 400, headers: CORS });
  }
  return NextResponse.json(
    { ok: true, analysis: classifyMlroQuestion(body.question) },
    { headers: CORS },
  );
}
