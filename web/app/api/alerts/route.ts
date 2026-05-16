// GET  /api/alerts          — list all alerts (sorted: critical first)
// POST /api/alerts          — write a new alert (called by cron or tests)
// DELETE /api/alerts        — dismiss ALL unread (batch)

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import {
  listAlerts,
  writeAlert,
  dismissAllUnread,
  getDemoAlerts,
  type DesignationAlert,
} from "@/lib/server/alerts-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

const SEVERITY_ORDER: Record<DesignationAlert["severity"], number> = { critical: 0, high: 1, medium: 2 };

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  try {
    const all = await listAlerts(false);
    // Sort: unread critical first, then high, then medium; read last
    const sorted = [...all].sort((a, b) => {
      if (a.read !== b.read) return a.read ? 1 : -1;
      return SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    });
    const unread = sorted.filter((a) => !a.read);
    return NextResponse.json({
      ok: true,
      alerts: sorted,
      unreadCount: unread.length,
      criticalCount: unread.filter((a) => a.severity === "critical").length,
    }, { headers: {} });
  } catch (err) {
    console.error("[alerts GET]", err instanceof Error ? err.message : err);
    const demos = getDemoAlerts();
    const unread = demos.filter((a) => !a.read);
    return NextResponse.json({
      ok: true,
      alerts: demos,
      unreadCount: unread.length,
      criticalCount: unread.filter((a) => a.severity === "critical").length,
    }, { headers: {} });
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    // Auth — ALERTS_CRON_TOKEN bearer (fail-closed: token must always be set)
    const token = process.env["ALERTS_CRON_TOKEN"];
    if (!token) {
      return NextResponse.json({ ok: false, error: "ALERTS_CRON_TOKEN not configured" }, { status: 503, headers: {} });
    }
    const got = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { timingSafeEqual } = await import("crypto");
    const enc = new TextEncoder();
    const expBuf = enc.encode(token);
    const gotRaw = enc.encode(got);
    const gotBuf = new Uint8Array(expBuf.length);
    gotBuf.set(gotRaw.slice(0, expBuf.length));
    if (got.length !== token.length || !timingSafeEqual(expBuf, gotBuf)) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401, headers: {} });
    }
    const body = (await req.json()) as Partial<DesignationAlert>;
    if (!body.id || !body.listId || !body.matchedEntry) {
      return NextResponse.json({ ok: false, error: "id, listId, matchedEntry required" }, { status: 400, headers: {} });
    }
    const alert: DesignationAlert = {
      id: body.id,
      listId: body.listId,
      listLabel: body.listLabel ?? body.listId,
      matchedEntry: body.matchedEntry,
      sourceRef: body.sourceRef ?? "",
      severity: (["critical", "high", "medium"] as const).includes(body.severity as DesignationAlert["severity"])
        ? (body.severity as DesignationAlert["severity"])
        : "high",
      detectedAt: body.detectedAt ?? new Date().toISOString(),
      read: false,
    };
    await writeAlert(alert);
    return NextResponse.json({ ok: true }, { headers: {} });
  } catch (err) {
    console.error("[alerts POST]", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { ok: false, error: "alert store unavailable — alert not persisted" },
      { status: 503, headers: {} }
    );
  }
}

export async function DELETE(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  try {
    let dismissedBy: string | undefined;
    try {
      const body = (await req.json()) as { dismissedBy?: string };
      if (typeof body.dismissedBy === "string") dismissedBy = body.dismissedBy;
    } catch { /* body optional */ }
    const count = await dismissAllUnread(dismissedBy);
    return NextResponse.json({ ok: true, dismissed: count }, { headers: {} });
  } catch (err) {
    console.error("[alerts DELETE]", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { ok: false, error: "alert store unavailable — dismiss not persisted" },
      { status: 503, headers: {} }
    );
  }
}
