// GET  /api/training  — list all training records for the tenant
// POST /api/training  — add a training record

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { addTrainingRecord, listTrainingRecords } from "@/lib/server/training-records";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const tenant = tenantIdFromGate(gate);

  try {
    const records = await listTrainingRecords(tenant);
    return NextResponse.json({ ok: true, records, total: records.length }, { headers: gate.headers });
  } catch (err) {
    console.error("[training] listTrainingRecords failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false, error: "Failed to load training records" }, { status: 500, headers: gate.headers });
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const tenant = tenantIdFromGate(gate);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid JSON body" },
      { status: 400, headers: gate.headers },
    );
  }

  // Required fields
  const { staffId, staffName, courseCode, courseName, completedAt } = body;

  if (!staffId || typeof staffId !== "string") {
    return NextResponse.json(
      { ok: false, error: "staffId required" },
      { status: 400, headers: gate.headers },
    );
  }
  if (!staffName || typeof staffName !== "string") {
    return NextResponse.json(
      { ok: false, error: "staffName required" },
      { status: 400, headers: gate.headers },
    );
  }
  if (!courseCode || typeof courseCode !== "string") {
    return NextResponse.json(
      { ok: false, error: "courseCode required" },
      { status: 400, headers: gate.headers },
    );
  }
  if (!courseName || typeof courseName !== "string") {
    return NextResponse.json(
      { ok: false, error: "courseName required" },
      { status: 400, headers: gate.headers },
    );
  }
  if (!completedAt || typeof completedAt !== "string" || isNaN(Date.parse(completedAt))) {
    return NextResponse.json(
      { ok: false, error: "completedAt required (ISO date)" },
      { status: 400, headers: gate.headers },
    );
  }

  const validityMonths =
    typeof body["validityMonths"] === "number" && body["validityMonths"] > 0
      ? (body["validityMonths"] as number)
      : 12;

  // Compute expiresAt
  const completedDate = new Date(completedAt);
  const expiresDate = new Date(completedDate);
  expiresDate.setMonth(expiresDate.getMonth() + validityMonths);
  const expiresAt = expiresDate.toISOString();

  const certificateRef =
    typeof body["certificateRef"] === "string" ? body["certificateRef"] : undefined;

  let record: Awaited<ReturnType<typeof addTrainingRecord>>;
  try {
    record = await addTrainingRecord({
      tenantId: tenant,
      staffId: staffId as string,
      staffName: staffName as string,
      courseCode: courseCode as string,
      courseName: courseName as string,
      completedAt,
      expiresAt,
      validityMonths,
      ...(certificateRef ? { certificateRef } : {}),
    });
  } catch (err) {
    console.error("[training] addTrainingRecord failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false, error: "Failed to save training record" }, { status: 500, headers: gate.headers });
  }

  return NextResponse.json({ ok: true, record }, { status: 201, headers: gate.headers });
}
