// GET /api/ongoing/queue
//
// Returns the monitoring queue for the calling tenant, ordered by compliance priority:
//   1. Overdue items first
//   2. High/critical risk customers before low/medium (prohibited > pep > intensive > enhanced > standard)
//   3. PEPs before non-PEPs within the same tier
//   4. Ascending by next scheduled date (soonest-due first)
//
// Each item includes the risk tier, next scheduled run, overdue status,
// and the applicable monitoring frequency from MONITORING_FREQUENCIES.
//
// Auth: withGuard (same gate as the rest of /api/ongoing/*).

import { NextResponse } from "next/server";
import { withGuard, type RequestContext } from "@/lib/server/guard";
import { getJson, listKeys } from "@/lib/server/store";
import {
  buildQueueItem,
  sortMonitoringQueue,
  MONITORING_FREQUENCIES,
  type CustomerRiskTier,
} from "@/lib/server/ongoing-monitoring-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

interface EnrolledSubject {
  id: string;
  tenantId?: string;
  name: string;
  riskTier?: CustomerRiskTier;
  isPep?: boolean;
  enrolledAt: string;
}

interface RiskBasedSchedule {
  subjectId: string;
  riskTier: CustomerRiskTier;
  nextScreenAt: string;
  nextNewsCheckAt: string;
  lastScreenAt?: string;
  lastNewsCheckAt?: string;
}

// Validated customer risk tier — unknown values fall back to "standard".
const VALID_RISK_TIERS = new Set<CustomerRiskTier>([
  "standard",
  "enhanced",
  "intensive",
  "pep",
  "prohibited",
]);

function toRiskTier(raw: unknown): CustomerRiskTier {
  if (typeof raw === "string" && VALID_RISK_TIERS.has(raw as CustomerRiskTier)) {
    return raw as CustomerRiskTier;
  }
  return "standard";
}

async function handleGet(_req: Request, ctx: RequestContext): Promise<NextResponse> {
  const nowMs = Date.now();

  // Load all enrolled subjects for this tenant.
  const subjectKeys = await listKeys("ongoing/subject/");
  const subjects = (
    await Promise.all(subjectKeys.map((k) => getJson<EnrolledSubject>(k)))
  ).filter(
    (s): s is EnrolledSubject => s !== null && s.tenantId === ctx.tenantId,
  );

  // Load risk-based schedules for each subject in parallel.
  const schedules = await Promise.all(
    subjects.map((s) =>
      getJson<RiskBasedSchedule>(`ongoing/risk-schedule/${s.id}`),
    ),
  );

  const queueItems = subjects.map((s, i) => {
    const riskTier = toRiskTier(s.riskTier ?? schedules[i]?.riskTier);
    const schedule = schedules[i];

    // Resolve next screen timestamp — from the risk-based schedule if available,
    // otherwise treat as immediately due (no schedule means never run).
    const nextScreenAt = schedule?.nextScreenAt
      ? Date.parse(schedule.nextScreenAt)
      : nowMs - 1; // overdue by default when no schedule exists

    const isPep = Boolean(s.isPep ?? riskTier === "pep");

    return buildQueueItem({
      subjectId: s.id,
      subjectName: s.name,
      riskTier,
      isPep,
      nextScheduledAt: nextScreenAt,
      nowMs,
    });
  });

  const sorted = sortMonitoringQueue(queueItems);

  // Enrich with frequency metadata for display / downstream consumption.
  const enriched = sorted.map((item) => ({
    ...item,
    frequency: MONITORING_FREQUENCIES[item.riskTier],
    nextScheduledAt: new Date(item.nextScheduledAt).toISOString(),
  }));

  const overdue = enriched.filter((i) => i.isOverdue).length;
  const byTier: Record<string, number> = {};
  for (const item of enriched) {
    byTier[item.riskTier] = (byTier[item.riskTier] ?? 0) + 1;
  }

  return NextResponse.json({
    ok: true,
    generatedAt: new Date(nowMs).toISOString(),
    total: enriched.length,
    overdue,
    byTier,
    queue: enriched,
  });
}

export const GET = withGuard(handleGet);
