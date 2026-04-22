// Netlify Scheduled Function — daily transaction monitoring.
//
// Schedule: every day at 09:00 Dubai time (UTC+4) → 05:00 UTC.
// Action:   self-POSTs to /api/transaction-monitor/run which walks every
//           enrolled subject, runs the brain's structuring / smurfing /
//           anomaly detectors on any recorded transactions, and posts a
//           single daily [TM-DAILY] summary task to Asana plus a webhook
//           event with the alert roll-up.

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
    const res = await fetch(`${base}/api/transaction-monitor/run`, {
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
  // 09:00 Dubai (UTC+4) = 05:00 UTC, every day.
  schedule: "0 5 * * *",
};
