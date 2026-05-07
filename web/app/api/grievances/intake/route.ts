import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface IntakeBody {
  mode: "anonymous" | "named";
  concern: string;
  dateObs: string;
  location?: string;
  reporterName?: string;
  description?: string;
  severity: "Low" | "Medium" | "High";
  language: "en" | "ar";
}

function generateCaseRef(): string {
  const now   = new Date();
  const year  = now.getFullYear();
  const seq   = String(Math.floor(Math.random() * 900) + 100);
  return `FG-WB-${year}-${seq}`;
}

export async function POST(req: Request) {
  let body: IntakeBody;
  try {
    body = (await req.json()) as IntakeBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.concern) {
    return NextResponse.json({ error: "concern is required" }, { status: 400 });
  }
  if (body.mode === "named" && !body.reporterName) {
    return NextResponse.json({ error: "reporterName is required for named submissions" }, { status: 422 });
  }

  // Do NOT echo back reporter name or concern detail in the response —
  // tipping-off mitigation: zero leakage via shared channels.
  const caseRef = generateCaseRef();
  const receivedAt = new Date().toISOString();

  return NextResponse.json(
    { caseRef, receivedAt, status: "acknowledged", message: "Your disclosure has been received and will be handled confidentially." },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}
