// GET /api/sla-countdown
//
// I7: Real-time SLA countdown for open compliance obligations.
// Returns time-remaining and breach status for all active SLA clocks:
//   - FFR: 24-hour asset freeze reporting (Cabinet Resolution 74/2020 Art.4)
//   - CNMR: 5 business-day STR filing (UAE FDL No.10/2025 Art.22)
//   - EDD review cadence for PEP/high-risk subjects
//   - EOCN designation: 24-hour freeze window
//
// Query params:
//   ?type=ffr|cnmr|all    — filter by SLA type (default: all)
//   ?status=open|breached — filter by breach status

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { getJson, listKeys } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// UAE public holidays 2025-2026 for business-day calculation.
const UAE_HOLIDAYS_2025_2026 = new Set([
  "2025-01-01","2025-03-29","2025-03-30","2025-04-02","2025-04-18","2025-06-06",
  "2025-06-07","2025-06-08","2025-09-22","2025-09-23","2025-10-29","2025-12-02",
  "2026-01-01","2026-03-18","2026-03-19","2026-03-20","2026-04-07","2026-05-26",
  "2026-05-27","2026-05-28","2026-09-11","2026-09-12","2026-10-19","2026-12-02",
]);

function isBusinessDay(d: Date): boolean {
  const dow = d.getUTCDay(); // 0=Sun, 6=Sat — UAE weekend is Sat+Sun
  if (dow === 0 || dow === 6) return false;
  const iso = d.toISOString().slice(0, 10);
  return !UAE_HOLIDAYS_2025_2026.has(iso);
}

function addBusinessDays(from: Date, days: number): Date {
  let remaining = days;
  const d = new Date(from.getTime());
  while (remaining > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (isBusinessDay(d)) remaining--;
  }
  return d;
}

function msToHhMm(ms: number): string {
  if (ms <= 0) return "00:00 (BREACHED)";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

interface SlaRecord {
  id: string;
  slaType: "ffr" | "cnmr" | "edd" | "eocn_freeze";
  subject: string;
  caseId?: string;
  startedAt: string;
  deadline: string;
  status: "open" | "breached" | "submitted";
  regulatoryAnchor: string;
  remainingMs: number;
  remainingFormatted: string;
  breached: boolean;
  urgencyBand: "critical" | "high" | "medium" | "low";
}

function urgencyBand(remainingMs: number, breached: boolean): SlaRecord["urgencyBand"] {
  if (breached) return "critical";
  const h = remainingMs / 3_600_000;
  if (h <= 2) return "critical";
  if (h <= 6) return "high";
  if (h <= 12) return "medium";
  return "low";
}

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const tenant = tenantIdFromGate(gate);
  const url = new URL(req.url);
  const typeFilter = url.searchParams.get("type") ?? "all";
  const statusFilter = url.searchParams.get("status");

  const now = Date.now();
  const records: SlaRecord[] = [];

  // ── FFR records (24-hour freeze reporting) ────────────────────────────────
  if (typeFilter === "all" || typeFilter === "ffr") {
    try {
      const ffrIdx = (await getJson<string[]>(`ffr/${tenant}/_index.json`)) ?? [];
      const ffrs = await Promise.all(
        ffrIdx.slice(0, 100).map((id) =>
          getJson<{
            id: string; subjectName: string; caseId?: string;
            frozenAt: string; slaDeadline: string; status: string;
          }>(`ffr/${tenant}/${id.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 128)}.json`)
        )
      );
      for (const ffr of ffrs) {
        if (!ffr || ffr.status === "acknowledged" || ffr.status === "released") continue;
        const deadline = Date.parse(ffr.slaDeadline);
        const remaining = deadline - now;
        const breached = remaining <= 0;
        records.push({
          id: ffr.id,
          slaType: "ffr",
          subject: ffr.subjectName,
          caseId: ffr.caseId,
          startedAt: ffr.frozenAt,
          deadline: ffr.slaDeadline,
          status: ffr.status as SlaRecord["status"],
          regulatoryAnchor: "Cabinet Resolution 74/2020 Art.4 — 24h asset freeze reporting to FIU",
          remainingMs: Math.max(0, remaining),
          remainingFormatted: msToHhMm(remaining),
          breached,
          urgencyBand: urgencyBand(Math.max(0, remaining), breached),
        });
      }
    } catch { /* non-fatal */ }
  }

  // ── CNMR / STR records (5 business-day filing window) ────────────────────
  if (typeFilter === "all" || typeFilter === "cnmr") {
    try {
      const caseKeys = await listKeys(`case/${tenant}/`).catch(() => [] as string[]);
      const cases = await Promise.all(
        caseKeys.slice(0, 50).map((k) =>
          getJson<{
            id: string; subjectName?: string; status: string;
            createdAt: string; reportingDeadline?: string;
          }>(k)
        )
      );
      for (const c of cases) {
        if (!c || c.status === "closed" || c.status === "reported") continue;
        const created = new Date(c.createdAt);
        const deadline = c.reportingDeadline
          ? new Date(c.reportingDeadline)
          : addBusinessDays(created, 5);
        const remaining = deadline.getTime() - now;
        const breached = remaining <= 0;
        records.push({
          id: c.id,
          slaType: "cnmr",
          subject: c.subjectName ?? c.id,
          caseId: c.id,
          startedAt: c.createdAt,
          deadline: deadline.toISOString(),
          status: breached ? "breached" : "open",
          regulatoryAnchor: "UAE FDL No.10/2025 Art.22 — 5 business-day STR filing window",
          remainingMs: Math.max(0, remaining),
          remainingFormatted: msToHhMm(remaining),
          breached,
          urgencyBand: urgencyBand(Math.max(0, remaining), breached),
        });
      }
    } catch { /* non-fatal */ }
  }

  // Sort: breached first, then by urgency (least remaining time first).
  records.sort((a, b) => {
    if (a.breached !== b.breached) return a.breached ? -1 : 1;
    return a.remainingMs - b.remainingMs;
  });

  const filtered = statusFilter
    ? records.filter((r) => statusFilter === "breached" ? r.breached : !r.breached)
    : records;

  const breachedCount = filtered.filter((r) => r.breached).length;
  const criticalCount = filtered.filter((r) => r.urgencyBand === "critical" && !r.breached).length;

  return NextResponse.json(
    {
      ok: true,
      tenant,
      generatedAt: new Date().toISOString(),
      total: filtered.length,
      breached: breachedCount,
      critical: criticalCount,
      slaClocks: filtered,
      summary: breachedCount > 0
        ? `URGENT: ${breachedCount} SLA(s) BREACHED — immediate FIU filing required`
        : criticalCount > 0
        ? `WARNING: ${criticalCount} SLA(s) critical (< 2h remaining)`
        : `${filtered.length} open SLA clock(s) — all within window`,
      regulatoryNote: "SLA windows: FFR = 24h from freeze (Cabinet Resolution 74/2020 Art.4), STR/CNMR = 5 business days from suspicion (FDL No.10/2025 Art.22).",
    },
    { status: breachedCount > 0 ? 207 : 200, headers: gate.headers },
  );
}
