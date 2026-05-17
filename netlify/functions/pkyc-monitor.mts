// Netlify Scheduled Function — pKYC perpetual monitoring heartbeat
//
// Schedule: every 6 hours (cron "0 */6 * * *")
// Action:   POST /api/pkyc/run — rescreens all subjects whose nextRunAt is due
//
// Controls: 3.01 (ongoing CDD), 3.04 (periodic review), 20.09 (telemetry)

import type { Config } from "@netlify/functions";
import { writeHeartbeat } from "../lib/heartbeat.js";

export default async (_req: Request) => {
  const base =
    process.env.URL ??
    process.env.DEPLOY_PRIME_URL ??
    "https://hawkeye-sterling.netlify.app";
  const token =
    process.env.ADMIN_TOKEN ??
    "";

  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;

  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), 55_000);

  try {
    const res = await fetch(`${base}/api/pkyc/run`, {
      method: "POST",
      headers,
      signal: controller.signal,
    });
    const body = await res.text();
    if (res.ok) await writeHeartbeat("pkyc-monitor");
    return new Response(
      JSON.stringify({ triggered: true, status: res.status, body: body.slice(0, 2000), at: new Date().toISOString() }),
      { status: res.ok ? 200 : 502, headers: { "content-type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ triggered: false, error: err instanceof Error ? err.message : String(err), at: new Date().toISOString() }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  } finally {
    clearTimeout(deadline);
  }
};

export const config: Config = {
  schedule: "0 */6 * * *",
};
