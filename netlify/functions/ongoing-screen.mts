// Netlify Scheduled Function — hourly ongoing-screening heartbeat.
//
// Schedule: top of every hour (cron "0 * * * *"). The /api/ongoing/run
//           route checks each subject's `nextRunAt` and only rescreens
//           those whose cadence is due, so a single hourly tick handles
//           hourly, daily, weekly and monthly cadences.
// Action:   POSTs to /api/ongoing/run, which reruns the brain quickScreen,
//           diffs new hits against the last-stored snapshot and posts
//           Asana delta tasks + webhook events for anything new.
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

  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), 24_000);
  try {
    const res = await fetch(`${base}/api/ongoing/run`, {
      method: "POST",
      headers,
      signal: controller.signal,
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
  } finally {
    clearTimeout(deadline);
  }
};

export const config: Config = {
  // Hourly heartbeat. The /api/ongoing/run route reads each subject's
  // `nextRunAt` from the schedule store and only rescreens subjects
  // whose cadence is due — so an hourly tick naturally handles hourly,
  // daily, weekly and monthly cadences without separate cron entries.
  schedule: "0 * * * *",
};
