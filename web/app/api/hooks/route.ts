// POST /api/hooks  — create a webhook hook config for the calling tenant
// GET  /api/hooks  — list all hooks for the calling tenant
// DELETE /api/hooks?id=<hookId>  — remove a hook by ID
//
// Requires admin role. Hook secrets are stored per-tenant in Netlify Blobs
// and are never returned in list responses (only the hook ID, event, and URL).

import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { enforce } from "@/lib/server/enforce";
import { requireRole } from "@/lib/server/role-gate";
import { tenantIdFromGate } from "@/lib/server/tenant";
import {
  getHooksForTenant,
  saveHooksForTenant,
  type HookConfig,
  type ComplianceEvent,
} from "@/lib/server/compliance-hooks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

const VALID_EVENTS: ComplianceEvent[] = [
  "screening_completed", "sar_filed", "four_eyes_required",
  "four_eyes_approved", "four_eyes_rejected", "periodic_rescreen_due",
  "ai_budget_downgrade", "anomaly_detected", "pep_hit", "sanctions_hit",
];

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req, { requireJsonBody: false });
  if (!gate.ok) return gate.response;

  const roleCheck = await requireRole(req, ["admin"]);
  if (roleCheck) return roleCheck;

  const tenantId = tenantIdFromGate(gate);
  const hooks = await getHooksForTenant(tenantId);

  // Never return hook secrets in list responses
  const sanitised = hooks.map(({ secret: _s, ...rest }) => rest);
  return NextResponse.json({ ok: true, hooks: sanitised }, { headers: gate.headers });
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  const roleCheck = await requireRole(req, ["admin"]);
  if (roleCheck) return roleCheck;

  const body = await req.json() as {
    event?: unknown;
    url?: unknown;
    secret?: unknown;
    maxRetries?: unknown;
    timeoutMs?: unknown;
  };

  if (typeof body.event !== "string" || !VALID_EVENTS.includes(body.event as ComplianceEvent)) {
    return NextResponse.json(
      { ok: false, error: `Invalid event. Valid values: ${VALID_EVENTS.join(", ")}` },
      { status: 400 },
    );
  }
  if (typeof body.url !== "string" || !body.url.startsWith("http")) {
    return NextResponse.json({ ok: false, error: "url must be a valid HTTP/HTTPS URL" }, { status: 400 });
  }
  if (typeof body.secret !== "string" || body.secret.length < 16) {
    return NextResponse.json(
      { ok: false, error: "secret must be at least 16 characters" },
      { status: 400 },
    );
  }

  const tenantId = tenantIdFromGate(gate);
  const existing = await getHooksForTenant(tenantId);

  if (existing.length >= 20) {
    return NextResponse.json(
      { ok: false, error: "Maximum 20 hooks per tenant" },
      { status: 400 },
    );
  }

  const hook: HookConfig = {
    id:         randomBytes(8).toString("hex"),
    event:      body.event as ComplianceEvent,
    url:        body.url,
    secret:     body.secret,
    maxRetries: typeof body.maxRetries === "number" ? Math.min(5, Math.max(1, body.maxRetries)) : 3,
    timeoutMs:  typeof body.timeoutMs  === "number" ? Math.min(15_000, Math.max(1_000, body.timeoutMs)) : 5_000,
    createdAt:  new Date().toISOString(),
    active:     true,
  };

  await saveHooksForTenant(tenantId, [...existing, hook]);

  const { secret: _s, ...publicHook } = hook;
  return NextResponse.json({ ok: true, hook: publicHook }, { status: 201, headers: gate.headers });
}

export async function DELETE(req: Request): Promise<NextResponse> {
  const gate = await enforce(req, { requireJsonBody: false });
  if (!gate.ok) return gate.response;

  const roleCheck = await requireRole(req, ["admin"]);
  if (roleCheck) return roleCheck;

  const hookId = new URL(req.url).searchParams.get("id");
  if (!hookId) {
    return NextResponse.json({ ok: false, error: "id query param required" }, { status: 400 });
  }

  const tenantId = tenantIdFromGate(gate);
  const existing = await getHooksForTenant(tenantId);
  const filtered = existing.filter((h) => h.id !== hookId);

  if (filtered.length === existing.length) {
    return NextResponse.json({ ok: false, error: "Hook not found" }, { status: 404 });
  }

  await saveHooksForTenant(tenantId, filtered);
  return NextResponse.json({ ok: true }, { headers: gate.headers });
}
