import { NextResponse } from "next/server";
import { listApiKeys } from "@/lib/server/api-keys";
import { enforce } from "@/lib/server/enforce";
import { stats as feedbackStats, listFeedback } from "@/lib/server/feedback";
import { getJson, listKeys } from "@/lib/server/store";
import { DPMS_KPIS } from "../../../../dist/src/brain/dpms-kpis.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface SchedulePreview {
  subjectId: string;
  cadence: string;
  nextRunAt: string;
}

// Each sub-query is wrapped so a single Netlify Blobs hiccup, a feedback
// store outage, or a bad api-keys serialisation doesn't take down the
// whole analytics payload. The page renders partial data gracefully.
async function safe<T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    console.warn(`[analytics] ${label} failed`, err);
    return fallback;
  }
}

export async function GET(req: Request): Promise<NextResponse> {
  try {
  const gate = await enforce(req, { requireAuth: true });
  if (!gate.ok) return gate.response;

  const [keys, feedback, scheduleKeys, ongoingKeys, feedbackRecords] =
    await Promise.all([
      safe("listApiKeys", listApiKeys, [] as Awaited<ReturnType<typeof listApiKeys>>),
      safe("feedbackStats", feedbackStats, {
        totalVerdicts: 0,
        falsePositiveByPair: {} as Record<string, number>,
        trueMatchByPair: {} as Record<string, number>,
      } as Awaited<ReturnType<typeof feedbackStats>>),
      safe("listKeys schedule/", () => listKeys("schedule/"), [] as string[]),
      safe("listKeys ongoing/subject/", () => listKeys("ongoing/subject/"), [] as string[]),
      safe("listFeedback", listFeedback, [] as Awaited<ReturnType<typeof listFeedback>>),
    ]);

  const tierCounts: Record<string, number> = {};
  let totalScreeningsThisMonth = 0;
  for (const k of keys) {
    tierCounts[k.tier] = (tierCounts[k.tier] ?? 0) + 1;
    totalScreeningsThisMonth += k.usageMonthly;
  }

  const schedules: SchedulePreview[] = [];
  for (const k of scheduleKeys) {
    const s = await safe(
      `getJson ${k}`,
      () => getJson<SchedulePreview>(k),
      null,
    );
    if (s) schedules.push(s);
  }

  const fp = Object.values(feedback.falsePositiveByPair).reduce(
    (a, b) => a + b,
    0,
  );
  const tm = Object.values(feedback.trueMatchByPair).reduce((a, b) => a + b, 0);
  const total = fp + tm;

  const last24h = feedbackRecords.filter(
    (r) => Date.now() - Date.parse(r.submittedAt) < 24 * 60 * 60 * 1_000,
  ).length;

  // Kpis load from dist — wrap the length/slice calls so an unexpected
  // shape (undefined at build boundary) doesn't 500 the whole endpoint.
  const kpisDefined = safe(
    "dpmsKpisDefined",
    () => Promise.resolve(Array.isArray(DPMS_KPIS) ? DPMS_KPIS.length : 0),
    0,
  );
  const kpisSample = safe(
    "dpmsKpisSample",
    () => Promise.resolve(Array.isArray(DPMS_KPIS) ? DPMS_KPIS.slice(0, 8) : []),
    [] as unknown[],
  );
  const [defined, sample] = await Promise.all([kpisDefined, kpisSample]);

  return NextResponse.json(
    {
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
        defined,
        sample,
      },
    },
    { headers: gate.headers },
  );
  } catch (err) {
    console.error("[analytics] unhandled error", err);
    return NextResponse.json(
      {
        ok: true,
        generatedAt: new Date().toISOString(),
        commercial: { totalApiKeys: 0, tierBreakdown: {}, totalScreeningsThisMonth: 0 },
        monitoring: { enrolledSubjects: 0, scheduledSubjects: 0, cadenceBreakdown: {} },
        quality: { falsePositiveCount: 0, trueMatchCount: 0, falsePositiveRate: 0, verdictsLast24h: 0, totalVerdicts: 0 },
        kpis: { defined: 0, sample: [] },
        note: "Analytics data temporarily unavailable.",
      },
      { status: 200 },
    );
  }
}
