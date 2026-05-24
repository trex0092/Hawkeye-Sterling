import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { loadLbmaRecord, updateLbmaRecord } from "@/lib/server/lbma";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req, { requireAuth: true });
  if (!gate.ok) return gate.response;
  const tenantId = tenantIdFromGate(gate);

  let body: { id?: string; signedBy?: string };
  try {
    body = (await req.json()) as { id?: string; signedBy?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400, headers: gate.headers });
  }

  const { id, signedBy } = body;
  if (!id || typeof id !== "string") {
    return NextResponse.json({ ok: false, error: "Missing required field: id" }, { status: 400, headers: gate.headers });
  }
  if (!signedBy || typeof signedBy !== "string") {
    return NextResponse.json({ ok: false, error: "Missing required field: signedBy" }, { status: 400, headers: gate.headers });
  }

  const existing = await loadLbmaRecord(tenantId, id);
  if (!existing) {
    return NextResponse.json({ ok: false, error: "LBMA record not found" }, { status: 404, headers: gate.headers });
  }

  try {
    const updated = await updateLbmaRecord(tenantId, id, {
      declarationSubmitted: true,
      declarationDate: new Date().toISOString().slice(0, 10),
      declarationSignedBy: signedBy,
      status: "submitted",
    });

    void writeAuditChainEntry(
      {
        event: "lbma.declaration.submitted",
        actor: gate.keyId,
        caseId: id,
        reportingYear: existing.reportingYear,
        counterpartyName: existing.counterpartyName,
        signedBy,
      },
      tenantId,
    ).catch((err) =>
      console.warn("[lbma/declaration] audit chain write failed:", err instanceof Error ? err.message : String(err)),
    );

    return NextResponse.json({ ok: true, record: updated }, { headers: gate.headers });
  } catch (err) {
    console.error("[lbma/declaration] POST failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: "Failed to submit declaration" }, { status: 500, headers: gate.headers });
  }
}
