// POST /api/mlro-classify
// Cheap, no-LLM endpoint that returns the classifier output for a free-form
// MLRO question. The MLRO Advisor UI debounces calls here while the operator
// types so chips/badges (jurisdictions, regimes, FATF Rec hints, urgency
// flags) update live without burning Anthropic budget.

import { NextResponse } from "next/server";
import { classifyMlroQuestion } from "../../../../dist/src/brain/mlro-question-classifier.js";

import { enforce } from "@/lib/server/enforce";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS: Record<string, string> = {
  "access-control-allow-origin": process.env["NEXT_PUBLIC_APP_URL"] ?? "https://hawkeye-sterling.netlify.app",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: { question?: unknown };
  try {
    body = (await req.json()) as { question?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400, headers: CORS });
  }
  if (typeof body.question !== "string" || !body.question.trim()) {
    return NextResponse.json({ ok: false, error: "question is required" }, { status: 400, headers: CORS });
  }
  // Hard length cap — this route is called on every keystroke (debounced
  // by the UI) so a 50 KB paste would otherwise re-run the classifier
  // regex pack on every debounce tick. 2000 chars matches the advisor
  // gate; beyond that the operator should send to the advisor and get
  // a proper "too_long" rejection.
  if (body.question.length > 2000) {
    return NextResponse.json(
      { ok: false, error: "question exceeds 2000 characters" },
      { status: 413, headers: CORS },
    );
  }
  return NextResponse.json(
    { ok: true, analysis: classifyMlroQuestion(body.question) },
    { headers: CORS },
  );
}
