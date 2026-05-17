// Netlify Scheduled Function — sanctions-list watch (13:30 UTC).
// See sanctions-watch-cron.mts for the in-process rationale.

import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import { runIngestionAll } from "../../src/ingestion/run-all.js";

const LABEL = "sanctions-watch-1330";

export default async (_req: Request): Promise<Response> => {
  try {
    const result = await runIngestionAll(LABEL);

    if (result.ok) {
      try {
        const hbStore = getStore("hawkeye-function-heartbeats");
        await hbStore.setJSON(LABEL, { lastSuccess: new Date().toISOString(), label: LABEL });
      } catch (err) {
        console.warn(`[${LABEL}] heartbeat write failed:`, err instanceof Error ? err.message : String(err));
      }
    }

    return new Response(JSON.stringify({ cadence: "1330", ...result }), {
      status: result.ok ? 200 : 502,
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({
        cadence: "1330",
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        at: new Date().toISOString(),
      }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }
};

export const config: Config = {
  schedule: "30 13 * * *",
};
