// POST /api/audit/client-event
//
// Persists browser-side audit events (from web/lib/audit.ts) to the
// server-side HMAC-signed audit chain so they survive browser cache clears,
// cross-device sessions, and regulatory inspections.
//
// The client calls this fire-and-forget after writing to localStorage so
// there is no user-facing latency penalty. Failure is logged but does not
// block the calling UI.
//
// Compliance basis: FDL 10/2025 Art.24 requires audit records to be
// persisted in a tamper-evident, regulator-accessible store — localStorage
// alone does not satisfy this requirement.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { incrementCounter } from "@/lib/server/metrics-store";

interface ClientEventBody {
  actor?: unknown;
  action?: unknown;
  target?: unknown;
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req, { requireAuth: true });
  if (!gate.ok) return gate.response;

  let body: ClientEventBody;
  try {
    body = (await req.json()) as ClientEventBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const { actor, action, target } = body;

  if (
    typeof actor !== "string" || !actor.trim() ||
    typeof action !== "string" || !action.trim() ||
    typeof target !== "string" || !target.trim()
  ) {
    return NextResponse.json(
      { ok: false, error: "actor, action, and target are required strings" },
      { status: 400 },
    );
  }

  // Enforce field-length limits to prevent log-injection via oversized payloads.
  if (actor.length > 256 || action.length > 256 || target.length > 512) {
    return NextResponse.json(
      { ok: false, error: "Field length limit exceeded (actor≤256, action≤256, target≤512)" },
      { status: 400 },
    );
  }

  const tenantId = tenantIdFromGate(gate);

  const ok = await writeAuditChainEntry(
    {
      event: `client.${action}`,
      actor: actor.trim(),
      target: target.trim(),
      source: "browser",
    },
    tenantId,
  );

  incrementCounter("hawkeye_client_audit_events_total", 1, { ok: ok ? "true" : "false" });

  if (!ok) {
    return NextResponse.json({ ok: false, error: "Audit chain write failed" }, { status: 503 });
  }

  return NextResponse.json({ ok: true });
}
