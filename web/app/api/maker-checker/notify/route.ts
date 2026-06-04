export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { emitWebhookEvent } from "@/lib/server/webhook-emitter";

// POST /api/maker-checker/notify
// Emits a "maker_checker_pending" webhook event for a given request ID,
// notifying all registered webhook subscribers that a maker-checker request
// is awaiting review.
export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  void writeAuditChainEntry(
    { event: "maker-checker.notify_accessed", actor: gate.keyId },
    tenantIdFromGate(gate),
  ).catch(() => undefined);

  let body: { requestId?: unknown };
  try {
    body = (await req.json()) as { requestId?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400, headers: gate.headers });
  }

  if (!body.requestId || typeof body.requestId !== "string") {
    return NextResponse.json(
      { ok: false, error: "requestId is required and must be a string" },
      { status: 400, headers: gate.headers },
    );
  }

  const requestId = body.requestId.trim();
  if (!requestId) {
    return NextResponse.json(
      { ok: false, error: "requestId must not be empty" },
      { status: 400, headers: gate.headers },
    );
  }

  await emitWebhookEvent("maker_checker_pending", {
    requestId,
    emittedAt: new Date().toISOString(),
  }, tenantIdFromGate(gate));

  return NextResponse.json(
    { ok: true, requestId, event: "maker_checker_pending" },
    { headers: gate.headers },
  );
}
