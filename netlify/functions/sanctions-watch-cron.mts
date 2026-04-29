// Netlify Scheduled Function — sanctions-list watch.
//
// Named "sanctions-watch-cron" so external monitors and the Netlify
// dashboard can reference it unambiguously (distinct from the older
// refresh-lists.ts which ran only at 03:00 UTC).
//
// Schedule: 04:30 UTC daily (pre-Europe open, after the 03:00 refresh).
// To cover the full 04:30 / 11:00 / 13:30 UTC cadence, deploy two
// companion files alongside this one:
//   sanctions-watch-1100.mts  →  schedule: "0 11 * * *"
//   sanctions-watch-1330.mts  →  schedule: "30 13 * * *"
// (Netlify scheduled functions accept only one cron expression each.)
//
// Action: self-POSTs to /api/sanctions/watch, which runs every
//   SOURCE_ADAPTER, writes results to Netlify Blobs, and returns a
//   JSON summary with { ok, at, summary }.  The self-fetch pattern keeps
//   all ingestion code in the main Next.js bundle so adapter updates
//   deploy without rebuilding this function.
//
// Auth: SANCTIONS_CRON_TOKEN env var (set per-site in the Netlify
//   dashboard).  The API route rejects calls without a matching token
//   with HTTP 403.  A missing env var on the site returns 503.

import type { Config } from "@netlify/functions";

export default async (_req: Request) => {
  const base =
    process.env.URL ??
    process.env.DEPLOY_PRIME_URL ??
    "https://hawkeye-sterling.netlify.app";

  const token = process.env.SANCTIONS_CRON_TOKEN ?? "";
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;

  // Bound the self-fetch so a hung route doesn't burn the entire function
  // budget — Netlify scheduled functions cap at 26s; 24s leaves headroom
  // for the response body read + JSON wrap below.
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), 24_000);
  try {
    const res = await fetch(`${base}/api/sanctions/watch`, {
      method: "POST",
      headers,
      signal: controller.signal,
    });
    const text = await res.text();
    return new Response(
      JSON.stringify({
        triggered: true,
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
  schedule: "30 4 * * *",
};
