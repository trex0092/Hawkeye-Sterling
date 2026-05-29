// Shared heartbeat writer for all Hawkeye Sterling scheduled functions.
// Each function calls writeHeartbeat(label) at the end of a successful run.
// health-monitor.mts reads these entries to detect silent failures.

import { getStore } from "@netlify/blobs";

export async function writeHeartbeat(label: string): Promise<void> {
  try {
    const store = getStore("hawkeye-function-heartbeats");
    await store.setJSON(label, {
      lastSuccess: new Date().toISOString(),
      label,
    });
  } catch (err) {
    console.warn(`[${label}] heartbeat write failed (non-critical):`, err instanceof Error ? err.message : String(err));
  }
}

// Fire ALERT_WEBHOOK_URL when a scheduled function encounters a fatal error.
// Best-effort: network failures are swallowed so the caller can still return
// its error response without an additional unhandled rejection.
export async function fireAlert(label: string, error: string, severity: "critical" | "high" = "high"): Promise<void> {
  const url = process.env["ALERT_WEBHOOK_URL"];
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event: "cron_failure", source: label, error, severity, at: new Date().toISOString() }),
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    // non-critical — alert delivery failure must not mask the original error
  }
}
