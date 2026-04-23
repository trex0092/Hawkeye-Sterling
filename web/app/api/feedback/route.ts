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

export async function GET(): Promise<NextResponse> {
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

  let body: FeedbackBody;
  try {
    body = (await req.json()) as FeedbackBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid JSON" },
      { status: 400, headers: gate.headers },
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
  if (
    !subjectId ||
    !listId ||
    !listRef ||
    !candidateName ||
    !verdict ||
    !analyst
  ) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "subjectId, listId, listRef, candidateName, verdict and analyst required",
      },
      { status: 400, headers: gate.headers },
    );
  }
  if (!VALID_VERDICTS.has(verdict)) {
    return NextResponse.json(
      { ok: false, error: "invalid verdict" },
      { status: 400, headers: gate.headers },
    );
  }
  const record = await submitFeedback({
    subjectId,
    listId,
    listRef,
    candidateName,
    verdict,
    ...(reason ? { reason } : {}),
    analyst,
  });
  return NextResponse.json({ ok: true, record }, { headers: gate.headers });
}
