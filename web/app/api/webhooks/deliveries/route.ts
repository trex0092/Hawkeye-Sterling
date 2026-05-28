// GET /api/webhooks/deliveries — list recent delivery records (last 100)
// Query param: webhookId? to filter by a specific webhook

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { getJson, listKeys } from "@/lib/server/store";
import type { WebhookDelivery } from "@/lib/server/webhook-emitter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req, { requireAuth: true });
  if (!gate.ok) return gate.response;

  const tenantId = tenantIdFromGate(gate);
  const url = new URL(req.url);
  const webhookId = url.searchParams.get("webhookId") ?? undefined;

  try {
    const keys = await listKeys(`webhooks:deliveries:${tenantId}:`);

    // Load all delivery records in parallel
    const records = await Promise.all(
      keys.map((k) => getJson<WebhookDelivery>(k)),
    );

    let deliveries = records.filter(
      (d): d is WebhookDelivery => d !== null,
    );

    if (webhookId) {
      deliveries = deliveries.filter((d) => d.webhookId === webhookId);
    }

    // Sort by sentAt descending (most recent first) and cap at 100
    deliveries.sort((a, b) => {
      const ta = new Date(a.sentAt).getTime();
      const tb = new Date(b.sentAt).getTime();
      return tb - ta;
    });

    deliveries = deliveries.slice(0, 100);

    return NextResponse.json({ deliveries }, { headers: gate.headers });
  } catch (err) {
    console.error(
      "[webhooks/deliveries GET]",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json(
      { ok: false, error: "Failed to load delivery records" },
      { status: 500, headers: gate.headers },
    );
  }
}
