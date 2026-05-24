// GET  /api/webhooks  — list all registered webhooks
// POST /api/webhooks  — register a new webhook

import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { enforce } from "@/lib/server/enforce";
import {
  loadRegistrations,
  saveRegistrations,
  isSafeWebhookUrl,
  type WebhookEvent,
  type WebhookRegistration,
} from "@/lib/server/webhook-emitter";

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

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req, { requireAuth: true });
  if (!gate.ok) return gate.response;

  try {
    const webhooks = await loadRegistrations();
    return NextResponse.json({ webhooks }, { headers: gate.headers });
  } catch (err) {
    console.error("[webhooks GET]", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { ok: false, error: "Failed to load webhooks" },
      { status: 500, headers: gate.headers },
    );
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req, { requireAuth: true });
  if (!gate.ok) return gate.response;

  let body: { url?: unknown; events?: unknown; secret?: unknown };
  try {
    body = (await req.json()) as {
      url?: unknown;
      events?: unknown;
      secret?: unknown;
    };
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400, headers: gate.headers },
    );
  }

  const { url, events, secret } = body;

  if (typeof url !== "string" || !url) {
    return NextResponse.json(
      { ok: false, error: "url is required" },
      { status: 400, headers: gate.headers },
    );
  }

  if (!isSafeWebhookUrl(url)) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "url must be a valid https:// URL that does not point to a private or blocked host",
      },
      { status: 400, headers: gate.headers },
    );
  }

  if (!Array.isArray(events) || events.length === 0) {
    return NextResponse.json(
      { ok: false, error: "events must be a non-empty array" },
      { status: 400, headers: gate.headers },
    );
  }

  const invalidEvents = (events as unknown[]).filter(
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

  if (typeof secret !== "string" || secret.length < 16) {
    return NextResponse.json(
      { ok: false, error: "secret is required and must be at least 16 characters" },
      { status: 400, headers: gate.headers },
    );
  }

  try {
    const registrations = await loadRegistrations();

    const webhook: WebhookRegistration = {
      id: randomUUID(),
      url,
      events: events as WebhookEvent[],
      secret,
      active: true,
      createdAt: new Date().toISOString(),
      failureCount: 0,
    };

    registrations.push(webhook);
    await saveRegistrations(registrations);

    return NextResponse.json(
      { ok: true, webhook },
      { status: 201, headers: gate.headers },
    );
  } catch (err) {
    console.error("[webhooks POST]", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { ok: false, error: "Failed to register webhook" },
      { status: 500, headers: gate.headers },
    );
  }
}
