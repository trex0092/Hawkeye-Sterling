// Netlify Scheduled Function — hourly transaction anomaly monitor.
//
// Schedule: top of every hour (cron "0 * * * *").
// Action:   POSTs to /api/cron/transaction-monitor which reads all
//           unprocessed flag/hold records from Blobs, runs typology-match,
//           and auto-opens cases for strong/moderate hits or any HOLD tier.

import type { Config } from "@netlify/functions";
import { writeHeartbeat } from "../lib/heartbeat.js";

export default async (_req: Request) => {
  const base =
    process.env.URL ??
    process.env.DEPLOY_PRIME_URL ??
    "https://hawkeye-sterling.netlify.app";
  const token =
    process.env.CRON_SECRET ??
    process.env.ONGOING_RUN_TOKEN ??
    "";
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;

  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), 55_000);
  try {
    const res = await fetch(`${base}/api/cron/transaction-monitor`, {
      method: "POST",
      headers,
      signal: controller.signal,
    });
    const text = await res.text();
    if (res.ok) await writeHeartbeat("transaction-monitor");
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
  schedule: "0 * * * *",
};
