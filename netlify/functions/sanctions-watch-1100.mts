// Netlify Scheduled Function — sanctions-list watch (11:00 UTC).
// See sanctions-watch-cron.mts for the in-process rationale.

import type { Config } from "@netlify/functions";
import { runIngestionAll } from "../../src/ingestion/run-all.js";
import { acquireCronLock } from "../../src/ingestion/cron-lock.js";

const LABEL = "sanctions-watch-1100";
// Daily cadence: 23h lock so a same-day retry is suppressed but the
// next day's tick runs normally.
const LOCK_INTERVAL_MS = 23 * 60 * 60 * 1000;

export default async (_req: Request): Promise<Response> => {
  try {
    const lock = await acquireCronLock(LABEL, LOCK_INTERVAL_MS);
    if (!lock.acquired) {
      console.log(`[${LABEL}] cron-lock held — skipping. priorAt=${lock.priorAt} ageMs=${lock.priorAgeMs}`);
      return new Response(
        JSON.stringify({ cadence: "1100", ok: true, skipped: true, reason: "cron-lock held", priorAt: lock.priorAt, priorAgeMs: lock.priorAgeMs, at: new Date().toISOString() }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    const result = await runIngestionAll(LABEL);
    return new Response(JSON.stringify({ cadence: "1100", ...result }), {
      status: result.ok ? 200 : 502,
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({
        cadence: "1100",
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        at: new Date().toISOString(),
      }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }
};

export const config: Config = {
  schedule: "0 11 * * *",
};
