import { NextResponse } from "next/server";
import {
  buildComplianceReport,
  type ReportInput,
} from "@/lib/reports/complianceReport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/compliance-report
// Body: { subject, result, superBrain?, reportingEntity?, mlro? }
// Returns text/plain — the Hawkeye Sterling MLRO report, generated
// strictly from the payload (no invented facts, no narrative hallucinations).
export async function POST(req: Request): Promise<Response> {
  let body: ReportInput;
  try {
    body = (await req.json()) as ReportInput;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }
  if (!body?.subject?.name || !body?.result) {
    return NextResponse.json(
      { ok: false, error: "subject and result are required" },
      { status: 400 },
    );
  }
  const report = buildComplianceReport(body);
  return new Response(report, {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "content-disposition": `attachment; filename="hawkeye-report-${body.subject.id ?? "unknown"}.txt"`,
    },
  });
}
