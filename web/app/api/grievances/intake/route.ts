import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";

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
  const year = new Date().getFullYear();
  // Use crypto.randomBytes for collision resistance — Math.random() with 900
  // values risks collisions for orgs filing multiple grievances in a year.
  const seq = randomBytes(3).readUIntBE(0, 3).toString(16).toUpperCase().slice(0, 6);
  return `FG-WB-${year}-${seq}`;
}

export async function POST(req: Request) {
  let body: IntakeBody;
  try {
    body = (await req.json()) as IntakeBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.concern) {
    return NextResponse.json({ ok: false, error: "concern is required" }, { status: 400 });
  }
  if (body.mode === "named" && !body.reporterName) {
    return NextResponse.json({ ok: false, error: "reporterName is required for named submissions" }, { status: 422 });
  }

  // Do NOT echo back reporter name or concern detail in the response —
  // tipping-off mitigation: zero leakage via shared channels.
  const caseRef = generateCaseRef();
  const receivedAt = new Date().toISOString();

  return NextResponse.json(
    { ok: true, caseRef, receivedAt, status: "acknowledged", message: "Your disclosure has been received and will be handled confidentially." },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}
