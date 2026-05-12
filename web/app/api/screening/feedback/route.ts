// POST /api/screening/feedback  — submit MLRO false-positive / true-match verdict
// GET  /api/screening/feedback  — list all verdicts + rolling stats
//
// Verdicts are persisted by feedback.ts and read back by confidence-score
// via adjustScore() to down-weight repeated false-positive hits.

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { submitFeedback, listFeedback, stats, type Verdict } from "@/lib/server/feedback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  let body: {
    subjectId?: string;
    listId?: string;
    listRef?: string;
    candidateName?: string;
    verdict?: string;
    reason?: string;
    analyst?: string;
  };
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400, headers: gate.headers });
  }

  const { subjectId, listId, listRef, candidateName, verdict, reason, analyst } = body;
  if (!subjectId || !listId || !listRef || !candidateName || !verdict || !analyst) {
    return NextResponse.json(
      { ok: false, error: "subjectId, listId, listRef, candidateName, verdict, analyst required" },
      { status: 400, headers: gate.headers },
    );
  }
  if (!["false_positive", "true_match", "needs_review"].includes(verdict)) {
    return NextResponse.json(
      { ok: false, error: "verdict must be false_positive | true_match | needs_review" },
      { status: 400, headers: gate.headers },
    );
  }

  const record = await submitFeedback({
    subjectId,
    listId,
    listRef,
    candidateName,
    verdict: verdict as Verdict,
    reason,
    analyst,
  });
  return NextResponse.json({ ok: true, record }, { status: 201, headers: gate.headers });
}

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  const [records, summary] = await Promise.all([listFeedback(), stats()]);
  return NextResponse.json({ ok: true, records, summary }, { headers: gate.headers });
}
