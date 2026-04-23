import { NextResponse } from "next/server";
import { listApiKeys } from "@/lib/server/api-keys";
import { stats as feedbackStats, listFeedback } from "@/lib/server/feedback";
import { getJson, listKeys } from "@/lib/server/store";
import { DPMS_KPIS } from "../../../../dist/src/brain/dpms-kpis.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SchedulePreview {
  subjectId: string;
  cadence: string;
  nextRunAt: string;
}

export async function GET(): Promise<NextResponse> {
  const [keys, feedback, scheduleKeys, ongoingKeys] = await Promise.all([
    listApiKeys(),
    feedbackStats(),
    listKeys("schedule/"),
    listKeys("ongoing/subject/"),
  ]);

  const tierCounts: Record<string, number> = {};
  let totalScreeningsThisMonth = 0;
  for (const k of keys) {
    tierCounts[k.tier] = (tierCounts[k.tier] ?? 0) + 1;
    totalScreeningsThisMonth += k.usageMonthly;
  }

  const schedules: SchedulePreview[] = [];
  for (const k of scheduleKeys) {
    const s = await getJson<SchedulePreview>(k);
    if (s) schedules.push(s);
  }

  const fp = Object.values(feedback.falsePositiveByPair).reduce(
    (a, b) => a + b,
    0,
  );
  const tm = Object.values(feedback.trueMatchByPair).reduce((a, b) => a + b, 0);
  const total = fp + tm;

  const records = await listFeedback();
  const last24h = records.filter(
    (r) =>
      Date.now() - Date.parse(r.submittedAt) < 24 * 60 * 60 * 1_000,
  ).length;

  return NextResponse.json({
    ok: true,
    generatedAt: new Date().toISOString(),
    commercial: {
      totalApiKeys: keys.length,
      tierBreakdown: tierCounts,
      totalScreeningsThisMonth,
    },
    monitoring: {
      enrolledSubjects: ongoingKeys.length,
      scheduledSubjects: schedules.length,
      cadenceBreakdown: schedules.reduce<Record<string, number>>((acc, s) => {
        acc[s.cadence] = (acc[s.cadence] ?? 0) + 1;
        return acc;
      }, {}),
    },
    quality: {
      falsePositiveCount: fp,
      trueMatchCount: tm,
      falsePositiveRate: total > 0 ? fp / total : 0,
      verdictsLast24h: last24h,
      totalVerdicts: feedback.totalVerdicts,
    },
    kpis: {
      defined: Array.isArray(DPMS_KPIS) ? DPMS_KPIS.length : 0,
      sample: Array.isArray(DPMS_KPIS) ? DPMS_KPIS.slice(0, 8) : [],
    },
  });
}
