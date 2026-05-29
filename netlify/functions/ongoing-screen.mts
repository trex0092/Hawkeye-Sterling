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
import { writeHeartbeat } from "../lib/heartbeat.js";

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

  // ENHANCE 1: Check /api/health before screening. Skip if mandatory
  // sanctions lists are unhealthy to avoid screening against stale data.
  try {
    const healthRes = await fetch(`${base}/api/health`, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
      signal: AbortSignal.timeout(8_000),
    });
    const health = (await healthRes.json().catch(() => null)) as {
      mandatoryListsHealthy?: boolean;
      degraded?: boolean;
    } | null;
    if (health && health.mandatoryListsHealthy === false) {
      console.warn(
        "[ongoing-screen] mandatory sanctions lists unhealthy — skipping screening run to avoid stale-data results.",
      );
      await writeHeartbeat("ongoing-screen");
      return new Response(
        JSON.stringify({
          triggered: false,
          skipped: true,
          reason: "mandatory_lists_unhealthy",
          health,
          at: new Date().toISOString(),
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
  } catch (healthErr) {
    // Health check failure is non-blocking — proceed with screening and log.
    console.warn(
      "[ongoing-screen] health check failed (proceeding with screening):",
      healthErr instanceof Error ? healthErr.message : String(healthErr),
    );
  }

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
    const errMsg = err instanceof Error ? err.message : String(err);
    // Fire alert webhook so operations team is notified of cron failure.
    // CG-3 resolution: errors no longer silently disappear into logs.
    const alertUrl = process.env["ALERT_WEBHOOK_URL"];
    if (alertUrl) {
      void fetch(alertUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          event: "cron_failure",
          source: "ongoing-screen",
          error: errMsg,
          severity: "high",
          at: new Date().toISOString(),
        }),
        signal: AbortSignal.timeout(5_000),
      }).catch(() => undefined);
    }
    return new Response(
      JSON.stringify({
        triggered: false,
        error: errMsg,
      }),
      {
        status: 500,
        headers: { "content-type": "application/json" },
      },
    );
  } finally {
    clearTimeout(deadline);
    await writeHeartbeat("ongoing-screen");
  }
};

export const config: Config = {
  // Hourly heartbeat. The /api/ongoing/run route reads each subject's
  // `nextRunAt` from the schedule store and only rescreens subjects
  // whose cadence is due — so an hourly tick naturally handles hourly,
  // daily, weekly and monthly cadences without separate cron entries.
  schedule: "0 * * * *",
};
