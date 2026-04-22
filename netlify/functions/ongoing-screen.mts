// Netlify Scheduled Function — twice-daily ongoing screening.
//
// Schedule: 00:00 and 12:00 UTC every day (cron "0 0,12 * * *").
// Action: POSTs to the deployed site's /api/ongoing/run route, which iterates
//         all enrolled subjects, reruns the brain quickScreen, diffs new hits
//         against the last-stored snapshot and posts Asana delta tasks +
//         webhook events for anything new.
//
// The self-fetch pattern keeps all brain state and integrations in the main
// Next.js function bundle; this scheduled function is just the heartbeat.

import type { Config } from "@netlify/functions";

export default async (_req: Request) => {
  const base =
    process.env.URL ??
    process.env.DEPLOY_PRIME_URL ??
    "https://hawkeye-sterling.netlify.app";
  const token = process.env.ONGOING_RUN_TOKEN ?? "";
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (token) headers.authorization = `Bearer ${token}`;

  try {
    const res = await fetch(`${base}/api/ongoing/run`, {
      method: "POST",
      headers,
    });
    const text = await res.text();
    return new Response(
      JSON.stringify({
        triggered: true,
        status: res.status,
        body: text.slice(0, 2000),
        at: new Date().toISOString(),
      }),
      {
        status: res.ok ? 200 : 502,
        headers: { "content-type": "application/json" },
      },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        triggered: false,
        error: err instanceof Error ? err.message : String(err),
      }),
      {
        status: 500,
        headers: { "content-type": "application/json" },
      },
    );
  }
};

export const config: Config = {
  // Twice daily at 09:00 and 15:00 Dubai time (UTC+4 all year).
  //   09:00 GST → 05:00 UTC
  //   15:00 GST → 11:00 UTC
  schedule: "0 5,11 * * *",
};
