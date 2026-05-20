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

// Single attempt to POST /api/eocn-list-updates with a 24s deadline.
async function pollOnce(
  base: string,
  headers: Record<string, string>,
): Promise<{ ok: boolean; status: number; text: string; parsed: unknown }> {
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
      /* non-JSON upstream */
    }
    return { ok: res.ok, status: res.status, text, parsed };
  } finally {
    clearTimeout(deadline);
  }
}

export default async (_req: Request) => {
  const base =
    process.env.URL ??
    process.env.DEPLOY_PRIME_URL ??
    "https://hawkeye-sterling.netlify.app";

  const token = process.env.SANCTIONS_CRON_TOKEN ?? "";
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;

  // Read prior stored count for zero-row guard BEFORE the API call so we
  // know whether a 0-row response would represent a data-loss event.
  let priorCount: number | null = null;
  try {
    const siteId = process.env["NETLIFY_SITE_ID"] ?? process.env["SITE_ID"] ?? "";
    const blobToken =
      process.env["NETLIFY_BLOBS_TOKEN"] ??
      process.env["NETLIFY_API_TOKEN"] ??
      process.env["NETLIFY_AUTH_TOKEN"] ??
      "";
    const mainStore =
      siteId && blobToken
        ? getStore({ name: "hawkeye-sterling", siteID: siteId, token: blobToken, consistency: "strong" })
        : getStore("hawkeye-sterling");
    const prior = await mainStore.get("hawkeye-eocn/list-updates/latest.json", { type: "json" }) as {
      listUpdates?: unknown[];
    } | null;
    priorCount = Array.isArray(prior?.listUpdates) ? prior.listUpdates.length : null;
    if (priorCount !== null) {
      console.info(`[eocn-poll] prior stored count: ${priorCount}`);
    }
  } catch (priorErr) {
    console.warn("[eocn-poll] prior count read failed (non-critical):", priorErr instanceof Error ? priorErr.message : String(priorErr));
  }

  // Two attempts separated by a 30 s back-off. Scheduled functions run as
  // Netlify Background Functions (≤ 15 min), so 30 s is well within budget.
  let result: { ok: boolean; status: number; text: string; parsed: unknown } | null = null;
  let fetchError: string | null = null;

  for (let attempt = 1; attempt <= 2; attempt++) {
    if (attempt === 2) {
      console.info("[eocn-poll] retrying after 30 s (attempt 2)");
      await new Promise<void>((r) => setTimeout(r, 30_000));
    }
    try {
      result = await pollOnce(base, headers);
      if (result.ok) {
        console.info(`[eocn-poll] attempt ${attempt} succeeded: HTTP ${result.status}`);
        break;
      }
      console.warn(`[eocn-poll] attempt ${attempt} returned HTTP ${result.status}`);
    } catch (err) {
      fetchError = err instanceof Error ? err.message : String(err);
      console.warn(`[eocn-poll] attempt ${attempt} threw:`, fetchError);
      result = null;
    }
  }

  // Write heartbeat when the API call returned ok — even a 502 from the
  // upstream (fixture fallback) means the cron and API pipeline are alive.
  // Heartbeat on ok only; a double-failure means the pipeline itself is broken.
  if (result?.ok) {
    try {
      const hbStore = getStore("hawkeye-function-heartbeats");
      await hbStore.setJSON("eocn-poll", { lastSuccess: new Date().toISOString(), label: "eocn-poll" });
    } catch (hbErr) {
      console.warn("[eocn-poll] heartbeat write failed (non-critical):", hbErr instanceof Error ? hbErr.message : String(hbErr));
    }
  }

  // Extract listUpdateCount from the API response.
  const listUpdateCount =
    result?.parsed &&
    typeof result.parsed === "object" &&
    "listUpdates" in result.parsed &&
    Array.isArray((result.parsed as { listUpdates?: unknown[] }).listUpdates)
      ? (result.parsed as { listUpdates: unknown[] }).listUpdates.length
      : null;

  // Zero-row guard: if the API returned 0 rows but prior stored count was > 0,
  // this is a potential data-loss event. The API route's own guard will have
  // preserved the prior data — log critical and alert.
  if (listUpdateCount === 0 && priorCount !== null && priorCount > 0) {
    console.error(
      `[eocn-poll] CRITICAL: EOCN feed returned 0 list-updates but prior stored=${priorCount} — potential data-loss event. Prior data preserved by API zero-row guard.`,
    );
    const webhookUrl = process.env["ALERT_WEBHOOK_URL"];
    if (webhookUrl) {
      try {
        await fetch(webhookUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            alert: "EOCN poll returned 0 rows (data-loss risk)",
            priorCount,
            at: new Date().toISOString(),
            source: "eocn-poll",
          }),
        });
      } catch {
        /* non-critical */
      }
    }
  }

  // Always return HTTP 200 — Netlify marks scheduled functions as failed
  // when they return non-2xx, which floods the alerts dashboard with
  // false "function crashed" notifications for expected API failures
  // (e.g. EOCN_FEED_URL not set → fixture-only mode).
  return new Response(
    JSON.stringify({
      triggered: result !== null,
      status: result?.status ?? null,
      ok: result?.ok ?? false,
      source:
        result?.parsed &&
        typeof result.parsed === "object" &&
        "source" in result.parsed
          ? (result.parsed as { source?: string }).source
          : null,
      listUpdateCount,
      priorCount,
      error: fetchError,
      at: new Date().toISOString(),
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
};

export const config: Config = {
  schedule: "0 */6 * * *",
};
