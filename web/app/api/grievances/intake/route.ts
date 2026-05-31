import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { enforce } from "@/lib/server/enforce";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";

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
  // Anonymous submissions are permitted (whistleblower intake); enforce()
  // still applies rate limiting and assigns an anon keyId for audit tracking.
  const gate = await enforce(req, { requireAuth: false, cost: 2 });
  if (!gate.ok) return gate.response;

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

  const caseRef = generateCaseRef();
  const receivedAt = new Date().toISOString();
  const tenantId = tenantIdFromGate(gate);

  // Persist intake record to Netlify Blobs so MLRO can retrieve and action it.
  try {
    const { getStore } = await import("@netlify/blobs");
    const store = getStore("hawkeye-grievances");
    await store.setJSON(`intake/${caseRef}.json`, {
      caseRef,
      receivedAt,
      mode: body.mode,
      severity: body.severity,
      language: body.language,
      concern: body.concern,
      dateObs: body.dateObs,
      ...(body.location ? { location: body.location } : {}),
      ...(body.mode === "named" && body.reporterName ? { reporterName: body.reporterName } : {}),
      ...(body.description ? { description: body.description } : {}),
      status: "pending_review",
    });
  } catch {
    // Blob unavailable (local dev without Netlify context) — log and continue.
    // Do not surface storage errors to the reporter (tipping-off mitigation).
    console.warn("[grievances/intake] blob store unavailable — intake not persisted");
  }

  void writeAuditChainEntry({
    tenantId,
    event: "grievance_intake",
    actor: gate.keyId,
    result: "received",
    detail: {
      caseRef,
      mode: body.mode,
      severity: body.severity,
      language: body.language,
    },
  }).catch(() => undefined);

  // Do NOT echo back reporter name or concern detail in the response —
  // tipping-off mitigation: zero leakage via shared channels.
  return NextResponse.json(
    { ok: true, caseRef, receivedAt, status: "acknowledged", message: "Your disclosure has been received and will be handled confidentially." },
    { status: 201, headers: { ...gate.headers, "Cache-Control": "no-store" } },
  );
}
