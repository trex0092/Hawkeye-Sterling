// GET /api/functions — cron function heartbeat log.
//
// Reads from hawkeye-function-heartbeats blob store and returns the last
// run timestamp for every registered scheduled function.

import { NextResponse } from "next/server";
import { withGuard, type RequestContext } from "@/lib/server/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

const FUNCTION_LABELS: Array<{ key: string; displayName: string; schedule: string }> = [
  { key: "sanctions-watch-15min",   displayName: "Sanctions Watch (15min)",    schedule: "*/15 * * * *" },
  { key: "sanctions-watch-1100",    displayName: "Sanctions Watch (11:00 UTC)", schedule: "0 11 * * *" },
  { key: "sanctions-watch-1330",    displayName: "Sanctions Watch (13:30 UTC)", schedule: "30 13 * * *" },
  { key: "sanctions-daily-0830",    displayName: "Sanctions Daily Report (08:30 GST)", schedule: "0 5 * * *" },
  { key: "sanctions-daily-1730",    displayName: "Sanctions Daily Report (17:30 GST)", schedule: "0 14 * * *" },
  { key: "ongoing-screen",          displayName: "Ongoing Monitoring Screen",   schedule: "0 * * * *" },
  { key: "four-eyes-stale-alert",   displayName: "Four-Eyes Stale Alert",       schedule: "0 * * * *" },
  { key: "eocn-poll",               displayName: "EOCN List Poll",              schedule: "0 */6 * * *" },
  { key: "warm-pool",               displayName: "Warm Pool",                    schedule: "*/10 * * * *" },
  { key: "audit-chain-s3-backup",   displayName: "Audit Chain S3 Backup",       schedule: "0 2 * * *" },
  { key: "ofac-intraday-check",     displayName: "OFAC Intraday Check",         schedule: "0 */4 * * *" },
  { key: "adverse-media-rss",       displayName: "Adverse Media RSS",           schedule: "*/30 * * * *" },
  { key: "freeze-sla-monitor",      displayName: "Freeze SLA Monitor",          schedule: "0 * * * *" },
  { key: "sla-monitor-cron",        displayName: "SLA Monitor",                 schedule: "0 * * * *" },
  { key: "health-monitor",          displayName: "Health Monitor",              schedule: "*/30 * * * *" },
];

interface HeartbeatEntry {
  lastSuccess?: string;
  label?: string;
}

async function handleGet(_req: Request, _ctx: RequestContext): Promise<NextResponse> {
  let blobsMod: typeof import("@netlify/blobs") | null = null;
  try { blobsMod = await import("@netlify/blobs"); } catch { /* not bound */ }

  if (!blobsMod) {
    return NextResponse.json({
      ok: true,
      note: "Blob store not bound — function heartbeats unavailable in this environment.",
      functions: FUNCTION_LABELS.map((f) => ({ ...f, lastRunAt: null, ageHours: null, status: "unknown" })),
    });
  }

  const siteID = process.env["NETLIFY_SITE_ID"] ?? process.env["SITE_ID"];
  const token = process.env["NETLIFY_BLOBS_TOKEN"] ?? process.env["NETLIFY_API_TOKEN"] ?? process.env["NETLIFY_AUTH_TOKEN"];
  const storeOpts = siteID && token
    ? { name: "hawkeye-function-heartbeats", siteID, token, consistency: "strong" as const }
    : { name: "hawkeye-function-heartbeats" };
  const store = blobsMod.getStore(storeOpts);

  const now = Date.now();
  const results = await Promise.all(
    FUNCTION_LABELS.map(async (f) => {
      try {
        const hb = (await store.get(f.key, { type: "json" }).catch(() => null)) as HeartbeatEntry | null;
        const lastRunAt = hb?.lastSuccess ?? null;
        const ageMs = lastRunAt ? now - Date.parse(lastRunAt) : null;
        const ageHours = ageMs != null ? Math.round(ageMs / 3_600_000 * 10) / 10 : null;
        // Determine expected max gap from schedule (capped at 25h for daily jobs)
        const expectedGapH = f.schedule.startsWith("0 2") ? 25
          : f.schedule.startsWith("0 * * * *") ? 2
          : f.schedule.startsWith("0 */") ? 7
          : f.schedule.startsWith("*/") ? 1
          : 25;
        const status: "ok" | "late" | "unknown" =
          ageHours == null ? "unknown"
          : ageHours > expectedGapH ? "late"
          : "ok";
        return { ...f, lastRunAt, ageHours, status };
      } catch {
        return { ...f, lastRunAt: null, ageHours: null, status: "unknown" as const };
      }
    }),
  );

  const lateCount = results.filter((r) => r.status === "late").length;
  const unknownCount = results.filter((r) => r.status === "unknown").length;

  return NextResponse.json({
    ok: true,
    generatedAt: new Date().toISOString(),
    summary: { total: results.length, ok: results.length - lateCount - unknownCount, late: lateCount, unknown: unknownCount },
    functions: results,
  });
}

export const GET = withGuard(handleGet);
