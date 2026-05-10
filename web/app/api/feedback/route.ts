import { NextResponse } from "next/server";
import {
  listFeedback,
  stats,
  submitFeedback,
  type Verdict,
} from "@/lib/server/feedback";
import { enforce } from "@/lib/server/enforce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

interface FeedbackBody {
  subjectId?: string;
  listId?: string;
  listRef?: string;
  candidateName?: string;
  verdict?: Verdict;
  reason?: string;
  analyst?: string;
}

const VALID_VERDICTS = new Set<Verdict>([
  "false_positive",
  "true_match",
  "needs_review",
]);

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req, { requireAuth: true });
  if (!gate.ok) return gate.response;
  const gateHeaders: Record<string, string> = gate.ok ? gate.headers : {};

  const [records, s] = await Promise.all([listFeedback(), stats()]);
  return NextResponse.json({
    ok: true,
    totalVerdicts: s.totalVerdicts,
    stats: s,
    records: records.slice(0, 100),
  });
}

export async function POST(req: Request): Promise<NextResponse> {
  // Gate verdicts behind the standard rate-limiter so anonymous
  // actors can't flood the feedback table and skew the FP signal
  // we feed back into the match-score calibrator.
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const gateHeaders: Record<string, string> = gate.ok ? gate.headers : {};

  let body: FeedbackBody;
  try {
    body = (await req.json()) as FeedbackBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid JSON" },
      { status: 400, headers: gateHeaders },
    );
  }
  const {
    subjectId,
    listId,
    listRef,
    candidateName,
    verdict,
    reason,
    analyst,
  } = body;
  const clean = {
    subjectId: typeof subjectId === "string" ? subjectId.trim() : "",
    listId: typeof listId === "string" ? listId.trim() : "",
    listRef: typeof listRef === "string" ? listRef.trim() : "",
    candidateName: typeof candidateName === "string" ? candidateName.trim() : "",
    analyst: typeof analyst === "string" ? analyst.trim().slice(0, 200) : "",
  };
  if (
    !clean.subjectId ||
    !clean.listId ||
    !clean.listRef ||
    !clean.candidateName ||
    !verdict ||
    !clean.analyst
  ) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "subjectId, listId, listRef, candidateName, verdict and analyst required",
      },
      { status: 400, headers: gateHeaders },
    );
  }
  if (!VALID_VERDICTS.has(verdict)) {
    return NextResponse.json(
      { ok: false, error: "invalid verdict" },
      { status: 400, headers: gateHeaders },
    );
  }
  const record = await submitFeedback({
    subjectId: clean.subjectId,
    listId: clean.listId,
    listRef: clean.listRef,
    candidateName: clean.candidateName,
    verdict,
    ...(reason && typeof reason === "string" ? { reason: reason.trim().slice(0, 2000) } : {}),
    analyst: clean.analyst,
  });
  return NextResponse.json({ ok: true, record }, { headers: gateHeaders });
}
