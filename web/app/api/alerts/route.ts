// GET  /api/alerts          — list all alerts (sorted: critical first)
// POST /api/alerts          — write a new alert (called by cron or tests)
// DELETE /api/alerts        — dismiss ALL unread (batch)

import { NextResponse } from "next/server";
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

export async function GET(): Promise<NextResponse> {
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
    });
  } catch (err) {
    console.error("[alerts GET]", err instanceof Error ? err.message : err);
    const demos = getDemoAlerts();
    const unread = demos.filter((a) => !a.read);
    return NextResponse.json({
      ok: true,
      alerts: demos,
      unreadCount: unread.length,
      criticalCount: unread.filter((a) => a.severity === "critical").length,
    });
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    // Auth — accept ALERTS_CRON_TOKEN bearer or no-auth in dev
    const token = process.env["ALERTS_CRON_TOKEN"];
    if (token) {
      const auth = req.headers.get("authorization") ?? "";
      if (auth !== `Bearer ${token}`) {
        return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
      }
    }
    const body = (await req.json()) as Partial<DesignationAlert>;
    if (!body.id || !body.listId || !body.matchedEntry) {
      return NextResponse.json({ ok: false, error: "id, listId, matchedEntry required" }, { status: 400 });
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
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[alerts POST]", err instanceof Error ? err.message : err);
    return NextResponse.json({
      ok: true,
      stored: false,
      note: "alert store unavailable — alert not persisted",
    });
  }
}

export async function DELETE(req: Request): Promise<NextResponse> {
  try {
    const token = process.env["ALERTS_CRON_TOKEN"];
    if (token) {
      const auth = req.headers.get("authorization") ?? "";
      if (auth !== `Bearer ${token}`) {
        return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
      }
    }
    let dismissedBy: string | undefined;
    try {
      const body = (await req.json()) as { dismissedBy?: string };
      if (typeof body.dismissedBy === "string") dismissedBy = body.dismissedBy;
    } catch { /* body optional */ }
    const count = await dismissAllUnread(dismissedBy);
    return NextResponse.json({ ok: true, dismissed: count });
  } catch (err) {
    console.error("[alerts DELETE]", err instanceof Error ? err.message : err);
    return NextResponse.json({
      ok: true,
      dismissed: 0,
      note: "alert store unavailable — dismiss not persisted",
    });
  }
}
