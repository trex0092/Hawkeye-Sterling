// Netlify Scheduled Function — sanctions-list watch (04:30 UTC).
//
// Calls runIngestionAll() directly rather than self-fetching
// /api/sanctions/watch. The previous self-fetch pattern silently
// no-op'd because Netlify Lambdas can't reliably TLS-handshake back to
// their own public origin. The same /api/sanctions/watch HTTP route
// remains intact for manual curl-driven refreshes.

import type { Config } from "@netlify/functions";
import { runIngestionAll } from "../../src/ingestion/run-all.js";
import { getBlobsStore } from "../../src/ingestion/blobs-store.js";

const LABEL = "sanctions-watch-cron";
const CRITICAL_LISTS = ["ofac_sdn", "un_consolidated", "eu_fsf"] as const;
const AGE_ALERT_MS = 24 * 60 * 60 * 1000; // 24 hours

/** Emit a CRITICAL log if any sanctions list blob is older than 24 hours. */
async function alertOnStaleBlobs(): Promise<void> {
  try {
    const store = await getBlobsStore();
    const now = Date.now();
    for (const listId of CRITICAL_LISTS) {
      try {
        const blob = await store.get(`${listId}/latest.json`, { type: "json" }) as { fetchedAt?: number } | null;
        if (!blob?.fetchedAt) {
          console.error(`[${LABEL}] CRITICAL_ALERT list=${listId} status=missing_blob age=unknown`);
          continue;
        }
        const ageMs = now - blob.fetchedAt;
        if (ageMs > AGE_ALERT_MS) {
          const ageHours = (ageMs / 3_600_000).toFixed(1);
          console.error(
            `[${LABEL}] CRITICAL_ALERT list=${listId} status=stale age=${ageHours}h — ` +
            `last successful refresh was ${ageHours} hours ago (threshold: 24h). ` +
            `Screening results may be based on outdated designations. ` +
            `Trigger a manual refresh via POST /api/sanctions/watch or /api/cron/sanctions-refresh.`,
          );
        }
      } catch (e) {
        console.warn(`[${LABEL}] freshness check failed for ${listId}:`, e instanceof Error ? e.message : e);
      }
    }
  } catch (e) {
    console.warn(`[${LABEL}] stale-blob alert check failed:`, e instanceof Error ? e.message : e);
  }
}

export default async (_req: Request): Promise<Response> => {
  try {
    const result = await runIngestionAll(LABEL);
    // Always check for stale blobs after the run — catches cases where the
    // run itself succeeded but a prior failure left a critical list stale.
    await alertOnStaleBlobs();
    return new Response(JSON.stringify({ cadence: "0430", ...result }), {
      status: result.ok ? 200 : 502,
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    await alertOnStaleBlobs().catch(() => undefined);
    return new Response(
      JSON.stringify({
        cadence: "0430",
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        at: new Date().toISOString(),
      }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }
};

export const config: Config = {
  schedule: "30 4 * * *",
};
