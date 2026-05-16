import { NextResponse } from "next/server";

import { enforce } from "@/lib/server/enforce";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ReqBody {
  subjectId: string;
  caseAge: number;
  hasScreening: boolean;
  hasCdd: boolean;
  hasEdd: boolean;
  hasNarrative: boolean;
  hasDisposition: boolean;
}

const PASS_THRESHOLD = 70;

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: ReqBody;
  try {
    body = (await req.json()) as ReqBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 , headers: gate.headers });
  }

  const { subjectId, caseAge, hasScreening, hasCdd, hasEdd, hasNarrative, hasDisposition } = body;
  if (!subjectId) {
    return NextResponse.json({ ok: false, error: "subjectId is required" }, { status: 400 , headers: gate.headers });
  }

  const gaps: string[] = [];
  const strengths: string[] = [];
  let score = 0;

  // Scoring weights
  if (hasScreening) {
    score += 20;
    strengths.push("Sanctions/PEP screening completed and documented");
  } else {
    gaps.push("Sanctions and PEP screening record missing — critical gap");
  }

  if (hasCdd) {
    score += 25;
    strengths.push("CDD documentation present");
  } else {
    gaps.push("Customer due diligence documentation absent — regulatory minimum not met");
  }

  if (hasEdd) {
    score += 20;
    strengths.push("Enhanced due diligence on file");
  } else {
    gaps.push("EDD documentation absent — required for high-risk subjects");
  }

  if (hasNarrative) {
    score += 20;
    strengths.push("Case narrative provides examiner-ready rationale");
  } else {
    gaps.push("No written case narrative — examiner cannot understand risk rationale");
  }

  if (hasDisposition) {
    score += 15;
    strengths.push("Clear disposition recorded");
  } else {
    gaps.push("No disposition documented — case appears unresolved");
  }

  // Age penalty
  if (caseAge > 365) {
    score = Math.max(0, score - 15);
    gaps.push(`Case is ${caseAge} days old — periodic review likely overdue`);
  } else if (caseAge > 180) {
    score = Math.max(0, score - 5);
    gaps.push(`Case is ${caseAge} days old — review currency of CDD documents`);
  } else {
    strengths.push(`Case age (${caseAge} days) within acceptable review window`);
  }

  const grade = score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : score >= 50 ? "D" : "F";
  const passThreshold = score >= PASS_THRESHOLD;

  const regulatorExpectations = [
    "CBUAE expects full CDD/EDD documentation for all medium/high-risk subjects",
    "DFSA requires written rationale for risk classification decisions",
    "Screening records must be dated and show clear/no-match outcomes",
    "Case narrative must address any adverse media or screening hits",
    "Disposition must align with risk score and documented evidence",
  ];

  return NextResponse.json({
    ok: true,
    score,
    grade,
    gaps,
    strengths,
    regulatorExpectations,
    passThreshold,
  }, { headers: gate.headers });
}
