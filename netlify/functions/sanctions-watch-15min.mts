// Netlify Scheduled Function — fast-cadence sanctions-list watch.
//
// Runs every 15 minutes. Self-POSTs the same /api/sanctions/watch
// endpoint as the daily 11:00 / 13:30 / 03:00 jobs, but with the
// `mode=fast` flag so the API can short-circuit unchanged sources via
// HTTP conditional headers (ETag / If-Modified-Since) and only emit a
// delta-alert when at least one list returned a 200 with new entries.
//
// Why 15 min? OFAC, EU FSF and UK OFSI publish list updates throughout
// the trading day; a daily cadence leaves a 12+ hour blind window
// between an SDN designation and our books reflecting it. 15 min keeps
// the freshness gap inside one regulator-tolerable detection cycle
// while staying well under each provider's anonymous-fetch fair-use
// quota.
//
// Cost guard: the API route MUST honour the `fast` flag — if every
// source returns 304 Not Modified we want a single round-trip per cron,
// not the full ingestion bundle. Without that short-circuit the 96
// daily invocations would burn function-minutes for zero new data.

import type { Config } from "@netlify/functions";

export default async (_req: Request) => {
  const base =
    process.env.URL ??
    process.env.DEPLOY_PRIME_URL ??
    "https://hawkeye-sterling.netlify.app";

  const token = process.env.SANCTIONS_CRON_TOKEN ?? "";
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-watch-mode": "fast",
  };
  if (token) headers.authorization = `Bearer ${token}`;

  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), 24_000);
  try {
    const res = await fetch(`${base}/api/sanctions/watch`, {
      method: "POST",
      headers,
      body: JSON.stringify({ mode: "fast", emitDeltaAlert: true }),
      signal: controller.signal,
    });
    const text = await res.text();
    return new Response(
      JSON.stringify({
        triggered: true,
        cadence: "15min",
        status: res.status,
        ok: res.ok,
        body: text.slice(0, 4_000),
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
        cadence: "15min",
        error: err instanceof Error ? err.message : String(err),
        at: new Date().toISOString(),
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
  schedule: "*/15 * * * *",
};
