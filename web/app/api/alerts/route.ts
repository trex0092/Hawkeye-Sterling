// GET /api/alerts  — list unread designation alerts
// POST /api/alerts — write a new alert (called by the scheduled function)

import { NextResponse } from "next/server";
import { listAlerts, writeAlert, type DesignationAlert } from "@/lib/server/alerts-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

export async function GET(): Promise<NextResponse> {
  try {
    const alerts = await listAlerts(false);
    const unread = alerts.filter((a) => !a.read);
    return NextResponse.json({ ok: true, alerts, unreadCount: unread.length });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "failed to load alerts" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
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
      severity: body.severity ?? "high",
      detectedAt: body.detectedAt ?? new Date().toISOString(),
      read: false,
    };
    await writeAlert(alert);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "failed to write alert" },
      { status: 500 },
    );
  }
}
