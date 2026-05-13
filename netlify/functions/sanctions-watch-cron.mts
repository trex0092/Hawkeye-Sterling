// Netlify Scheduled Function — sanctions-list watch (04:30 UTC).
//
// Calls runIngestionAll() directly rather than self-fetching
// /api/sanctions/watch. The previous self-fetch pattern silently
// no-op'd because Netlify Lambdas can't reliably TLS-handshake back to
// their own public origin. The same /api/sanctions/watch HTTP route
// remains intact for manual curl-driven refreshes.

import type { Config } from "@netlify/functions";
import { runIngestionAll } from "../../src/ingestion/run-all.js";

const LABEL = "sanctions-watch-cron";

export default async (_req: Request): Promise<Response> => {
  try {
    const result = await runIngestionAll(LABEL);
    return new Response(JSON.stringify({ cadence: "0430", ...result }), {
      status: result.ok ? 200 : 502,
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
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
