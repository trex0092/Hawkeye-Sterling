import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Redline {
  id: string;
  condition: string;
  severity: string;
}

interface TriggeredRedline {
  redlineId: string;
  condition: string;
  severity: string;
  evidence: string;
}

interface ReqBody {
  subjectId: string;
  redlines: Redline[];
  currentData: Record<string, unknown>;
}

function evaluateCondition(condition: string, data: Record<string, unknown>): { triggered: boolean; evidence: string } {
  const condLower = condition.toLowerCase();
  const dataStr = JSON.stringify(data).toLowerCase();

  // Simple keyword-based condition evaluation
  const keywords = condLower.split(/[\s,;]+/).filter(w => w.length > 3);
  const matchedKeywords = keywords.filter(kw => dataStr.includes(kw));
  const matchRatio = keywords.length > 0 ? matchedKeywords.length / keywords.length : 0;

  if (matchRatio >= 0.5) {
    return {
      triggered: true,
      evidence: `Condition matched: ${matchedKeywords.join(", ")} found in subject data`,
    };
  }

  // Check for numeric thresholds in condition
  const riskMatch = condLower.match(/risk[_\s]?score\s*[>>=]+\s*(\d+)/);
  if (riskMatch) {
    const threshold = parseInt(riskMatch[1]);
    const riskScore = typeof data.riskScore === "number" ? data.riskScore : typeof data.risk_score === "number" ? data.risk_score : null;
    if (riskScore !== null && riskScore >= threshold) {
      return { triggered: true, evidence: `Risk score ${riskScore} exceeds threshold ${threshold}` };
    }
  }

  return { triggered: false, evidence: "" };
}

export async function POST(req: Request): Promise<NextResponse> {
  let body: ReqBody;
  try {
    body = (await req.json()) as ReqBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }

  const { subjectId, redlines = [], currentData = {} } = body;
  if (!subjectId) {
    return NextResponse.json({ ok: false, error: "subjectId is required" }, { status: 400 });
  }

  const triggered: TriggeredRedline[] = [];
  let clear = 0;

  for (const redline of redlines) {
    const evaluation = evaluateCondition(redline.condition, currentData);
    if (evaluation.triggered) {
      triggered.push({
        redlineId: redline.id,
        condition: redline.condition,
        severity: redline.severity,
        evidence: evaluation.evidence,
      });
    } else {
      clear++;
    }
  }

  return NextResponse.json({
    ok: true,
    triggered,
    clear,
    total: redlines.length,
  });
}
