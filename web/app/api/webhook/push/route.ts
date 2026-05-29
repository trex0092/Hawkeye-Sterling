// POST /api/webhook/push
// GET  /api/webhook/push  (list registered webhooks for tenant)
// DELETE /api/webhook/push?id=<id>
//
// H1: Webhook and push notification endpoint.
// When a monitored entity hits a new list, Hawkeye pushes an alert
// instantly to registered webhook URLs rather than waiting for the
// next scheduled run (thrice-daily at 08:30, 15:00, 17:30 Dubai time).
//
// This is especially critical for EOCN — Cabinet Resolution 74/2020 Art.4
// requires asset freeze within 24 hours of designation. A 90-minute wait
// (designation at 16:00, next scheduled run at 17:30) creates a compliance
// exposure window. This webhook enables real-time notification.
//
// Registration (POST /api/webhook/push):
//   {
//     url: string;               // HTTPS endpoint to receive events
//     events: string[];          // ["eocn_hit","sanctions_hit","sanctions_list_down","all"]
//     secret?: string;           // optional signing secret for HMAC-SHA256 payload signature
//     description?: string;
//   }
//
// Event delivery (triggered by sanctions watch, ongoing screen, health probe):
//   POST to registered URL with body:
//   {
//     event: string;
//     subject: string;
//     listId: string;
//     listRef?: string;
//     score: number;
//     severity: string;
//     caseId?: string;
//     ts: string;
//     signature: string;   // HMAC-SHA256(JSON.stringify(payload), webhookSecret)
//   }

import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { enforce } from "@/lib/server/enforce";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { getJson, setJson, del } from "@/lib/server/store";
import { assertSafeWebhookUrl } from "@/lib/server/webhook";
import { sanitizeField } from "@/lib/server/sanitize-prompt";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

const ALLOWED_EVENTS = new Set([
  "eocn_hit", "sanctions_hit", "pep_hit", "adverse_media_hit",
  "sanctions_list_down", "sanctions_list_restored", "case_created",
  "case_escalated", "ffr_created", "str_filed", "all",
]);

interface WebhookRegistration {
  id: string;
  url: string;
  events: string[];
  secret?: string;
  description?: string;
  createdAt: string;
  createdBy: string;
  active: boolean;
  tenant: string;
  deliveryCount: number;
  lastDeliveredAt?: string;
  lastDeliveryStatus?: "ok" | "failed";
}

function webhookKey(tenant: string, id: string): string {
  return `webhooks/${tenant}/${id}.json`;
}

function webhookIndexKey(tenant: string): string {
  return `webhooks/${tenant}/_index.json`;
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const tenant = tenantIdFromGate(gate);

  let body: Partial<WebhookRegistration>;
  try { body = (await req.json()) as Partial<WebhookRegistration>; }
  catch { return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400, headers: gate.headers }); }

  const url = body.url?.trim();
  if (!url) {
    return NextResponse.json({ ok: false, error: "url is required" }, { status: 400, headers: gate.headers });
  }
  try {
    assertSafeWebhookUrl(url);
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "invalid url" }, { status: 400, headers: gate.headers });
  }

  const events = Array.isArray(body.events) ? body.events.filter((e): e is string => ALLOWED_EVENTS.has(e)) : ["all"];
  if (events.length === 0) {
    return NextResponse.json({ ok: false, error: `events must include at least one of: ${[...ALLOWED_EVENTS].join(", ")}` }, { status: 400, headers: gate.headers });
  }

  const id = `wh-${Date.now()}-${randomBytes(4).toString("hex")}`;
  const reg: WebhookRegistration = {
    id,
    url,
    events,
    secret: body.secret ? sanitizeField(body.secret, 128) : undefined,
    description: body.description ? sanitizeField(body.description) : undefined,
    createdAt: new Date().toISOString(),
    createdBy: gate.keyId,
    active: true,
    tenant,
    deliveryCount: 0,
  };

  await setJson(webhookKey(tenant, id), reg);
  const idx = (await getJson<string[]>(webhookIndexKey(tenant))) ?? [];
  idx.unshift(id);
  await setJson(webhookIndexKey(tenant), idx.slice(0, 100));

  return NextResponse.json(
    {
      ok: true,
      id,
      url,
      events,
      note: "Webhook registered. Events will be delivered in real-time when triggered by sanctions matches, EOCN hits, or list status changes.",
      eocnNote: "EOCN designations trigger immediate delivery — critical for Cabinet Resolution 74/2020 Art.4 24-hour freeze compliance.",
    },
    { status: 201, headers: gate.headers },
  );
}

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const tenant = tenantIdFromGate(gate);

  const idx = (await getJson<string[]>(webhookIndexKey(tenant))) ?? [];
  const registrations = (await Promise.all(
    idx.map((id) => getJson<WebhookRegistration>(webhookKey(tenant, id)))
  )).filter((r): r is WebhookRegistration => r !== null)
    .map((r) => ({ ...r, secret: r.secret ? "[redacted]" : undefined }));

  return NextResponse.json({ ok: true, tenant, total: registrations.length, webhooks: registrations }, { headers: gate.headers });
}

export async function DELETE(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const tenant = tenantIdFromGate(gate);

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "id query parameter required" }, { status: 400, headers: gate.headers });
  const SAFE_ID_RE = /^[a-zA-Z0-9_\-.]+$/;
  if (id.length > 128 || !SAFE_ID_RE.test(id)) {
    return NextResponse.json({ ok: false, error: "id must be alphanumeric/._- and ≤128 chars" }, { status: 400, headers: gate.headers });
  }

  await del(webhookKey(tenant, id));
  const idx = (await getJson<string[]>(webhookIndexKey(tenant))) ?? [];
  await setJson(webhookIndexKey(tenant), idx.filter((i) => i !== id));

  void writeAuditChainEntry(
    { event: "webhook.deleted", actor: gate.keyId, meta: { id } },
    tenant,
  ).catch((e: unknown) => console.warn("[audit] write failed:", e instanceof Error ? e.message : String(e)));

  return NextResponse.json({ ok: true, id, deleted: true }, { headers: gate.headers });
}
