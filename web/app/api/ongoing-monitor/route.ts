// GET  /api/ongoing-monitor            — list enrolled subjects with monitoring status
// POST /api/ongoing-monitor            — trigger AI pattern analysis across portfolio
//
// GET is a lightweight list of all enrolled subjects (delegates to /api/ongoing store).
// POST delegates to the /api/ongoing-monitor-ai analysis engine.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { getJson, listKeys } from "@/lib/server/store";

interface EnrolledSubject {
  id: string;
  name: string;
  entityType?: string;
  jurisdiction?: string;
  tier?: string;
  cadence?: string;
  status?: string;
  lastRun?: string;
  nextDue?: string;
  enrolledAt: string;
}

interface MonitorStatus {
  id: string;
  name: string;
  entityType?: string;
  jurisdiction?: string;
  tier: string;
  cadence: string;
  status: string;
  lastRun: string;
  nextDue: string;
  enrolledAt: string;
  overdueBy?: number;
}

function calcNextDue(lastRun: string | undefined, cadence: string): string {
  if (!lastRun) return new Date().toISOString();
  const d = new Date(lastRun);
  const days = cadence === "monthly" ? 30 : cadence === "quarterly" ? 90 : cadence === "annual" ? 365 : 30;
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function isOverdue(nextDue: string): number | undefined {
  const due = new Date(nextDue);
  const now = new Date();
  if (due < now) return Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
  return undefined;
}

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  void writeAuditChainEntry(
    { event: "ongoing-monitor_accessed", actor: gate.keyId },
    tenantIdFromGate(gate),
  ).catch(() => undefined);

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "200", 10) || 200, 500);

  try {
    const keys = await listKeys("ongoing/subject/");
    const loaded = await Promise.all(keys.slice(0, limit).map((k) => getJson<EnrolledSubject>(k)));
    const subjects = loaded.filter((s): s is EnrolledSubject => s !== null);

    const monitors: MonitorStatus[] = subjects.map((s) => {
      const nextDue = s.nextDue ?? calcNextDue(s.lastRun, s.cadence ?? "monthly");
      const overdueBy = isOverdue(nextDue);
      return {
        id: s.id,
        name: s.name,
        entityType: s.entityType,
        jurisdiction: s.jurisdiction,
        tier: s.tier ?? "2",
        cadence: s.cadence ?? "monthly",
        status: s.status ?? (overdueBy !== undefined ? "overdue" : "active"),
        lastRun: s.lastRun ?? s.enrolledAt,
        nextDue,
        enrolledAt: s.enrolledAt,
        ...(overdueBy !== undefined ? { overdueBy } : {}),
      };
    });

    const filtered = status ? monitors.filter((m) => m.status === status) : monitors;
    const overdue = filtered.filter((m) => m.overdueBy !== undefined).length;

    return NextResponse.json(
      {
        ok: true,
        total: filtered.length,
        overdue,
        subjects: filtered,
      },
      { headers: gate.headers },
    );
  } catch (err) {
    console.error("[ongoing-monitor] GET failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: "Failed to load monitoring queue" }, { status: 500, headers: gate.headers });
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  // Delegate AI analysis to the existing ongoing-monitor-ai route
  const { POST: handler } = await import("@/app/api/ongoing-monitor-ai/route");
  return handler(req);
}
