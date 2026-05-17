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
