// GET    /api/webhooks/[id]  — get a single webhook registration
// PATCH  /api/webhooks/[id]  — update active, events, or url
// DELETE /api/webhooks/[id]  — remove a webhook registration

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { tenantIdFromGate } from "@/lib/server/tenant";
import {
  loadRegistrations,
  saveRegistrations,
  isSafeWebhookUrl,
  type WebhookEvent,
} from "@/lib/server/webhook-emitter";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

const VALID_EVENTS: WebhookEvent[] = [
  "case.opened",
  "case.closed",
  "case.escalated",
  "sar.filed",
  "subject.frozen",
  "subject.cleared",
  "screening.completed",
  "edd.triggered",
  "four_eyes.approved",
];

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const gate = await enforce(req, { requireAuth: true });
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
    return NextResponse.json({ webhook }, { headers: gate.headers });
  } catch (err) {
    console.error("[webhooks/[id] GET]", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { ok: false, error: "Failed to load webhook" },
      { status: 500, headers: gate.headers },
    );
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const gate = await enforce(req, { requireAuth: true });
  if (!gate.ok) return gate.response;
  const tenantId = tenantIdFromGate(gate);

  const { id } = await params;

  let body: { active?: unknown; events?: unknown; url?: unknown };
  try {
    body = (await req.json()) as {
      active?: unknown;
      events?: unknown;
      url?: unknown;
    };
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400, headers: gate.headers },
    );
  }

  try {
    const registrations = await loadRegistrations(tenantId);
    const idx = registrations.findIndex((r) => r.id === id);
    if (idx === -1) {
      return NextResponse.json(
        { ok: false, error: "Webhook not found" },
        { status: 404, headers: gate.headers },
      );
    }

    const webhook = registrations[idx]!;

    if (body.active !== undefined) {
      if (typeof body.active !== "boolean") {
        return NextResponse.json(
          { ok: false, error: "active must be a boolean" },
          { status: 400, headers: gate.headers },
        );
      }
      webhook.active = body.active;
    }

    if (body.url !== undefined) {
      if (typeof body.url !== "string" || !isSafeWebhookUrl(body.url)) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "url must be a valid https:// URL that does not point to a private or blocked host",
          },
          { status: 400, headers: gate.headers },
        );
      }
      webhook.url = body.url;
    }

    if (body.events !== undefined) {
      if (!Array.isArray(body.events) || body.events.length === 0) {
        return NextResponse.json(
          { ok: false, error: "events must be a non-empty array" },
          { status: 400, headers: gate.headers },
        );
      }
      const invalidEvents = (body.events as unknown[]).filter(
        (e) => !VALID_EVENTS.includes(e as WebhookEvent),
      );
      if (invalidEvents.length > 0) {
        return NextResponse.json(
          {
            ok: false,
            error: `Invalid events: ${invalidEvents.join(", ")}. Valid events: ${VALID_EVENTS.join(", ")}`,
          },
          { status: 400, headers: gate.headers },
        );
      }
      webhook.events = body.events as WebhookEvent[];
    }

    registrations[idx] = webhook;
    await saveRegistrations(registrations, tenantId);

    void writeAuditChainEntry(
      { event: "webhook.updated", actor: gate.keyId, meta: { id } },
      tenantId,
    ).catch((e: unknown) => console.warn("[audit] write failed:", e instanceof Error ? e.message : String(e)));

    return NextResponse.json({ ok: true, webhook }, { headers: gate.headers });
  } catch (err) {
    console.error("[webhooks/[id] PATCH]", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { ok: false, error: "Failed to update webhook" },
      { status: 500, headers: gate.headers },
    );
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const gate = await enforce(req, { requireAuth: true });
  if (!gate.ok) return gate.response;
  const tenantId = tenantIdFromGate(gate);

  const { id } = await params;

  try {
    const registrations = await loadRegistrations(tenantId);
    const idx = registrations.findIndex((r) => r.id === id);
    if (idx === -1) {
      return NextResponse.json(
        { ok: false, error: "Webhook not found" },
        { status: 404, headers: gate.headers },
      );
    }

    registrations.splice(idx, 1);
    await saveRegistrations(registrations, tenantId);

    void writeAuditChainEntry(
      { event: "webhook.deleted", actor: gate.keyId, meta: { id } },
      tenantId,
    ).catch((e: unknown) => console.warn("[audit] write failed:", e instanceof Error ? e.message : String(e)));

    return NextResponse.json({ ok: true }, { headers: gate.headers });
  } catch (err) {
    console.error("[webhooks/[id] DELETE]", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { ok: false, error: "Failed to delete webhook" },
      { status: 500, headers: gate.headers },
    );
  }
}
