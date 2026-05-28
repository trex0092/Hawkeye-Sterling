// POST /api/regulatory-changes/digest
//
// Triggers webhook delivery of the current regulatory change digest to all
// registered webhooks that subscribe to the "screening.completed" event
// (the closest existing event type for regulatory notifications).
//
// Body (optional): { days?: number } — number of days to include in the digest.
//
// Auth required.

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { getChangeDigest } from "@/lib/server/regulatory-watcher";
import { emitWebhookEvent } from "@/lib/server/webhook-emitter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req, { requireAuth: true });
  if (!gate.ok) return gate.response;

  let days = 7;
  try {
    const body = (await req.json()) as { days?: unknown };
    if (typeof body.days === "number" && body.days > 0) {
      days = Math.min(365, Math.floor(body.days));
    }
  } catch {
    // Empty body or non-JSON — use default 7 days
  }

  const tenantId = tenantIdFromGate(gate);

  let digest: Awaited<ReturnType<typeof getChangeDigest>>;
  try {
    digest = await getChangeDigest(tenantId, days);
  } catch (err) {
    console.error(
      "[regulatory-changes/digest POST] getChangeDigest failed:",
      err instanceof Error ? err.message : String(err),
    );
    return NextResponse.json(
      { ok: false, error: "Failed to build change digest" },
      { status: 500, headers: gate.headers },
    );
  }

  // Deliver digest via webhook using the "screening.completed" event channel.
  // A dedicated "regulatory.digest" event type would be added when the webhook
  // registration schema is extended; for now this reuses the closest existing event.
  try {
    await emitWebhookEvent("screening.completed", {
      type: "regulatory_digest",
      tenantId,
      days,
      changeCount: digest.changes.length,
      summary: digest.summary,
      changes: digest.changes,
      generatedAt: new Date().toISOString(),
    }, tenantId);
  } catch (err) {
    console.error(
      "[regulatory-changes/digest POST] emitWebhookEvent failed:",
      err instanceof Error ? err.message : String(err),
    );
    return NextResponse.json(
      { ok: false, error: "Digest built but webhook delivery failed" },
      { status: 500, headers: gate.headers },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      days,
      changeCount: digest.changes.length,
      summary: digest.summary,
      deliveredAt: new Date().toISOString(),
    },
    { headers: gate.headers },
  );
}
