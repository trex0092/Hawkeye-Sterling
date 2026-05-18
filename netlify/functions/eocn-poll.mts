// Netlify Scheduled Function — EOCN list-update watch.
//
// Polls the EOCN announcements feed (when EOCN_FEED_URL is set) and
// writes the parsed updates to Netlify Blobs at:
//   hawkeye-eocn/list-updates/latest.json
//
// The /eocn page reads from that blob via /api/eocn-list-updates, so
// regulators see live designations as soon as the cron fires —
// without operator action.
//
// Schedule: every 6 hours. EOCN announcements are infrequent (a
// handful per week) but freezing-deadline SLA is 24h, so 4 polls/day
// keeps us well inside that window without burning function minutes.
// The 6h cadence aligns roughly with Dubai office hours starting
// blocks (00:00 / 06:00 / 12:00 / 18:00 UTC = 04:00 / 10:00 / 16:00
// / 22:00 Dubai), so an MLRO logging in at any UAE business window
// sees a snapshot less than 6h old.
//
// Action: self-POSTs to /api/eocn-list-updates. The API route does
// the upstream fetch + parse + blob write itself — keeps the cron
// stupid (just a tickler) and the parser logic in one place that's
// covered by the report's smoke-test runner.
//
// Auth: SANCTIONS_CRON_TOKEN env var. The /api route falls under the
// shared `enforce` gate which accepts that token. A separate
// EOCN_CRON_TOKEN can be added later if the security team wants
// per-cron tokens, but reusing the existing one keeps configuration
// simple for the initial rollout.
//
// No-op when EOCN_FEED_URL is unset — the API route returns the
// fixture, which the cron writes to the blob unchanged. The page
// then shows `demo` instead of `live`. Set EOCN_FEED_URL in Netlify
// env to flip the badge without redeploying.

import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

export default async (_req: Request) => {
  const base =
    process.env.URL ??
    process.env.DEPLOY_PRIME_URL ??
    "https://hawkeye-sterling.netlify.app";

  const token = process.env.SANCTIONS_CRON_TOKEN ?? "";
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;

  // 24s deadline matches sanctions-watch-cron — leaves 2s of
  // function budget for the response wrap below.
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), 24_000);
  try {
    const res = await fetch(`${base}/api/eocn-list-updates`, {
      method: "POST",
      headers,
      body: "{}",
      signal: controller.signal,
    });
    const text = await res.text();
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      /* non-JSON upstream — kept as raw body */
    }
    // Write heartbeat on successful poll so health-monitor can detect silent failures.
    if (res.ok) {
      try {
        const hbStore = getStore("hawkeye-function-heartbeats");
        await hbStore.setJSON("eocn-poll", { lastSuccess: new Date().toISOString(), label: "eocn-poll" });
      } catch (hbErr) {
        console.warn("[eocn-poll] heartbeat write failed (non-critical):", hbErr instanceof Error ? hbErr.message : String(hbErr));
      }
    }

    return new Response(
      JSON.stringify({
        triggered: true,
        status: res.status,
        ok: res.ok,
        source:
          parsed && typeof parsed === "object" && "source" in parsed
            ? (parsed as { source?: string }).source
            : null,
        listUpdateCount:
          parsed && typeof parsed === "object" && "listUpdates" in parsed
            ? Array.isArray((parsed as { listUpdates?: unknown[] }).listUpdates)
              ? (parsed as { listUpdates: unknown[] }).listUpdates.length
              : null
            : null,
        body: text.slice(0, 2_000),
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
  schedule: "0 */6 * * *",
};
