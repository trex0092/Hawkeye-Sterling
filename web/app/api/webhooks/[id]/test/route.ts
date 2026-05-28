// POST /api/webhooks/[id]/test — send a test ping to the webhook URL

import { NextResponse } from "next/server";
import { createHmac, randomUUID } from "node:crypto";
import { enforce } from "@/lib/server/enforce";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { loadRegistrations, isSafeWebhookUrl } from "@/lib/server/webhook-emitter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const gate = await enforce(req, { requireAuth: true, requireJsonBody: false });
  if (!gate.ok) return gate.response;

  const { id } = await params;

  try {
    const registrations = await loadRegistrations(tenantIdFromGate(gate));
    const webhook = registrations.find((r) => r.id === id);
    if (!webhook) {
      return NextResponse.json(
        { ok: false, error: "Webhook not found" },
        { status: 404, headers: gate.headers },
      );
    }

    if (!isSafeWebhookUrl(webhook.url)) {
      return NextResponse.json(
        { ok: false, error: "Webhook URL is not safe to deliver to" },
        { status: 400, headers: gate.headers },
      );
    }

    const deliveryId = randomUUID();
    const timestamp = new Date().toISOString();
    const payload = {
      event: "test",
      timestamp,
      webhookId: webhook.id,
      deliveryId,
    };
    const body = JSON.stringify(payload);

    const hmac = createHmac("sha256", webhook.secret).update(body).digest("hex");

    const start = Date.now();
    let statusCode: number | undefined;
    let success = false;

    try {
      const res = await fetch(webhook.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Hawkeye-Event": "test",
          "X-Hawkeye-Delivery": deliveryId,
          "X-Hawkeye-Signature": `sha256=${hmac}`,
        },
        body,
        signal: AbortSignal.timeout(5000),
      });
      statusCode = res.status;
      success = res.ok;
    } catch (err) {
      console.warn(
        `[webhooks/[id]/test] Test delivery failed:`,
        err instanceof Error ? err.message : String(err),
      );
    }

    const responseMs = Date.now() - start;

    return NextResponse.json(
      { ok: true, success, statusCode, responseMs },
      { headers: gate.headers },
    );
  } catch (err) {
    console.error(
      "[webhooks/[id]/test POST]",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json(
      { ok: false, error: "Failed to send test webhook" },
      { status: 500, headers: gate.headers },
    );
  }
}
