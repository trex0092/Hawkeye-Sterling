// Netlify Scheduled Function — fast-cadence sanctions-list watch.
//
// Runs every 15 minutes. Calls runIngestionAll() in-process — the
// previous self-fetch+fast-mode design was unwired (the HTTP route
// never read the `mode: fast` flag) so the cron silently performed a
// full fan-out every tick, then failed at the maxDuration ceiling.
//
// With the in-process call and the 12 s per-adapter timeout in
// run-all.ts, the full sweep finishes well inside the 26 s Netlify
// scheduled-function budget. OFAC / EU FSF / UK OFSI publish updates
// throughout the trading day, so this cadence is the difference
// between same-quarter and next-day list freshness.

import type { Config } from "@netlify/functions";
import { runIngestionAll } from "../../src/ingestion/run-all.js";
import { acquireCronLock } from "../../src/ingestion/cron-lock.js";

const LABEL = "sanctions-watch-15min";

// 12-minute lock window. The schedule fires every 15 minutes; the lock
// blocks Netlify's automatic retry on 5xx AND a second 03:00 cron
// (sanctions-watch-cron) from racing this one in the same minute.
// Slightly less than the cadence so the next legitimate tick is never
// blocked by a still-held lock.
const LOCK_INTERVAL_MS = 12 * 60 * 1000;

export default async (_req: Request): Promise<Response> => {
  try {
    const lock = await acquireCronLock(LABEL, LOCK_INTERVAL_MS);
    if (!lock.acquired) {
      // Another tick / retry won the race. Returning 200 prevents
      // Netlify from retrying again. The body explains the skip
      // for observability.
      console.log(
        `[${LABEL}] cron-lock held — skipping. priorAt=${lock.priorAt} ageMs=${lock.priorAgeMs}`,
      );
      return new Response(
        JSON.stringify({
          cadence: "15min",
          ok: true,
          skipped: true,
          reason: "cron-lock held — prior run within min-interval",
          priorAt: lock.priorAt,
          priorAgeMs: lock.priorAgeMs,
          at: new Date().toISOString(),
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    const result = await runIngestionAll(LABEL);
    return new Response(JSON.stringify({ cadence: "15min", ...result }), {
      status: result.ok ? 200 : 502,
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({
        cadence: "15min",
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        at: new Date().toISOString(),
      }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }
};

export const config: Config = {
  schedule: "*/15 * * * *",
};
