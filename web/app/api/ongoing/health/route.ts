// GET /api/ongoing/health
//
// MLRO-facing health probe for the periodic re-screening pipeline. Reports:
//   - enrolled subjects (count, by tenant)
//   - scheduled subjects (count, overdue count)
//   - last-run staleness (count of subjects whose ongoing/last snapshot is
//     older than 48h — should be 0 if the cron is firing for every enrolled
//     subject on its cadence)
//   - coverage percentage (subjects with a recent snapshot / enrolled)
//
// Plain-JSON output; no side effects. Plug into a dashboard widget or
// alert system. Auth: withGuard (same gate as the rest of /api/ongoing/*).

import { NextResponse } from "next/server";
import { withGuard } from "@/lib/server/guard";
import type { RequestContext } from "@/lib/server/guard";
import { getJson, listKeys } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

interface EnrolledSubject {
  id: string;
  tenantId?: string;
  name: string;
  enrolledAt: string;
}

interface Schedule {
  subjectId: string;
  cadence: string;
  nextRunAt: string;
}

interface LastSnapshot {
  runAt?: string;
  ranAt?: string;
  at?: string;
}

const STALE_THRESHOLD_MS = 48 * 60 * 60 * 1_000; // 48h

function snapshotTimestamp(s: LastSnapshot | null): number | null {
  if (!s) return null;
  const candidate = s.runAt ?? s.ranAt ?? s.at;
  if (!candidate) return null;
  const t = Date.parse(candidate);
  return Number.isFinite(t) ? t : null;
}

async function handleHealth(_req: Request, ctx: RequestContext): Promise<NextResponse> {
  const now = Date.now();

  const subjectKeys = await listKeys("ongoing/subject/");
  const subjects = (await Promise.all(subjectKeys.map((k) => getJson<EnrolledSubject>(k))))
    .filter((s): s is EnrolledSubject => s !== null)
    .filter((s) => !s.tenantId || s.tenantId === ctx.tenantId);

  const enrolled = subjects.length;

  // Pull schedule + last-snapshot for every enrolled subject in parallel.
  const detail = await Promise.all(
    subjects.map(async (s) => {
      const [schedule, last] = await Promise.all([
        getJson<Schedule>(`schedule/${s.id}`),
        getJson<LastSnapshot>(`ongoing/last/${s.id}`),
      ]);
      const lastTs = snapshotTimestamp(last);
      const ageMs = lastTs !== null ? now - lastTs : null;
      const scheduled = schedule !== null;
      const overdue =
        scheduled && schedule.nextRunAt
          ? Date.parse(schedule.nextRunAt) + STALE_THRESHOLD_MS < now
          : false;
      const stale = lastTs === null || (ageMs !== null && ageMs > STALE_THRESHOLD_MS);
      return {
        id: s.id,
        name: s.name,
        scheduled,
        overdue,
        cadence: schedule?.cadence ?? null,
        nextRunAt: schedule?.nextRunAt ?? null,
        lastRunAt: lastTs !== null ? new Date(lastTs).toISOString() : null,
        ageHours: ageMs !== null ? Math.round(ageMs / 3_600_000) : null,
        stale,
      };
    }),
  );

  const scheduledCount = detail.filter((d) => d.scheduled).length;
  const overdueCount = detail.filter((d) => d.overdue).length;
  const staleCount = detail.filter((d) => d.stale).length;
  const freshCount = enrolled - staleCount;
  const coveragePct = enrolled > 0 ? Math.round((freshCount / enrolled) * 100) : 100;

  // Health classification — green/yellow/red so a UI badge can colour itself
  // without re-running the logic.
  let health: "green" | "yellow" | "red";
  if (enrolled === 0) {
    health = "green";
  } else if (coveragePct >= 95 && overdueCount === 0) {
    health = "green";
  } else if (coveragePct >= 80) {
    health = "yellow";
  } else {
    health = "red";
  }

  return NextResponse.json({
    ok: true,
    at: new Date(now).toISOString(),
    health,
    summary: {
      enrolled,
      scheduled: scheduledCount,
      overdue: overdueCount,
      stale: staleCount,
      fresh: freshCount,
      coveragePct,
    },
    staleThresholdHours: 48,
    subjects: detail.filter((d) => d.stale || d.overdue).slice(0, 50),
  });
}

export const GET = withGuard(handleHealth);
