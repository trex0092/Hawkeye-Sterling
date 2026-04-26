// Batch run persistence using the existing Netlify Blobs store abstraction.
// Stores run metadata + elevated results for the last 30 runs.
// Full results are truncated at 200 rows to stay under the 5 MB blob limit.

import { getJson, setJson, listKeys } from "./store";

const PREFIX = "batch-history/";
const MAX_RUNS = 30;
const MAX_STORED_RESULTS = 200;

export interface BatchRunMeta {
  runId: string;
  timestamp: string;
  rowCount: number;
  durationMs: number;
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    clear: number;
    errors: number;
  };
  elevatedSubjects: string[];
}

export interface StoredBatchRun extends BatchRunMeta {
  // Partial results: elevated first, then others (truncated at MAX_STORED_RESULTS)
  results: unknown[];
}

export async function saveBatchRun(run: StoredBatchRun): Promise<string> {
  const key = `${PREFIX}${run.runId}`;
  const payload: StoredBatchRun = {
    ...run,
    results: run.results.slice(0, MAX_STORED_RESULTS),
  };
  try {
    await setJson(key, payload);
    await pruneOldRuns();
  } catch (err) {
    console.error("[batch-history] Failed to save run:", err);
  }
  return run.runId;
}

export async function getBatchRun(runId: string): Promise<StoredBatchRun | null> {
  return getJson<StoredBatchRun>(`${PREFIX}${runId}`);
}

export async function listBatchRuns(): Promise<BatchRunMeta[]> {
  try {
    const keys = await listKeys(PREFIX);
    const runs = await Promise.all(
      keys.map((k) => getJson<BatchRunMeta>(k)),
    );
    return runs
      .filter((r): r is BatchRunMeta => r !== null)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, MAX_RUNS);
  } catch {
    return [];
  }
}

async function pruneOldRuns(): Promise<void> {
  try {
    const keys = await listKeys(PREFIX);
    if (keys.length <= MAX_RUNS) return;
    // Sort by key (which embeds timestamp) and remove oldest
    const toDelete = keys
      .sort()
      .slice(0, keys.length - MAX_RUNS);
    await Promise.allSettled(
      toDelete.map((k) =>
        getJson<null>(k).then(() => setJson(k, null as unknown as string)),
      ),
    );
  } catch { /* non-fatal */ }
}
