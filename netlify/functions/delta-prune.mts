// Hawkeye Sterling — delta blob pruning (scheduled monthly).
//
// Deletes delta blobs from hawkeye-sanctions-feeds older than PRUNE_AGE_DAYS
// (default 30 days). Without this, every sanctions-ingest run that finds
// changes writes a new delta blob and they accumulate indefinitely, increasing
// store.list() latency for designation-alert-check.mts.
//
// Schedule: monthly on the 1st at 02:00 UTC — low-traffic window.

import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import { writeHeartbeat } from "../lib/heartbeat.js";

const STORE_NAME = "hawkeye-sanctions-feeds";
const RUN_LABEL = "delta-prune";
const PRUNE_AGE_DAYS = parseInt(process.env["DELTA_PRUNE_DAYS"] ?? "30", 10);

export default async function handler(_req: Request): Promise<Response> {
  const startedAt = Date.now();
  let store: ReturnType<typeof getStore>;
  try {
    store = getStore(STORE_NAME);
  } catch (err) {
    return jsonResponse({ ok: false, label: RUN_LABEL, error: `getStore failed: ${err instanceof Error ? err.message : String(err)}` }, 503);
  }

  let pruned = 0;
  let errors = 0;
  const cutoffMs = Date.now() - PRUNE_AGE_DAYS * 24 * 60 * 60 * 1000;

  try {
    const result = await store.list({ prefix: "delta/" });
    for (const blob of result.blobs) {
      // Key format: delta/<listId>-<isoTimestamp>.json
      // Extract timestamp from the key suffix.
      const base = blob.key.replace("delta/", "").replace(".json", "");
      const dashIdx = base.indexOf("-");
      if (dashIdx === -1) continue;
      const ts = base.slice(dashIdx + 1);
      const t = Date.parse(ts.replace(/-(\d{2})-(\d{2})-(\d{3})Z$/, ":$1:$2.$3Z"));
      if (isNaN(t) || t >= cutoffMs) continue;
      try {
        await store.delete(blob.key);
        pruned++;
      } catch {
        errors++;
      }
    }
  } catch (err) {
    return jsonResponse({ ok: false, label: RUN_LABEL, error: String(err) }, 500);
  }

  await writeHeartbeat(RUN_LABEL);
  return jsonResponse({
    ok: true,
    label: RUN_LABEL,
    pruned,
    errors,
    pruneAgeDays: PRUNE_AGE_DAYS,
    durationMs: Date.now() - startedAt,
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), { status, headers: { "content-type": "application/json" } });
}

export const config: Config = {
  // Monthly on the 1st at 02:00 UTC.
  schedule: "0 2 1 * *",
};
