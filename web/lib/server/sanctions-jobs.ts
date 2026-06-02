// Hawkeye Sterling — sanctions-refresh job-status store.
//
// The operator-refresh route used to run runIngestionAll() synchronously
// and block the Lambda for 15-30 s — Netlify's edge inactivity timeout
// (~26 s) would terminate the connection and the browser would receive
// an un-parseable HTML 504 page even when the work had actually started.
//
// This helper stores a single status record per (tenantId, jobId) so the
// refresh route can fire-and-forget and the client can poll a separate
// status endpoint. Backed by Netlify Blobs in production; in-memory fallback
// in dev / when Blobs is unreachable (per user memory: no Upstash Redis).
//
// Status lifecycle:
//   running   - kicked off, work in flight
//   completed - terminal: result has the runIngestionAll summary
//   failed    - terminal: error captured for the operator

import { getNamedStore } from "./blob-getter";

const STORE_NAME = "hawkeye-sanctions-jobs";

export type SanctionsJobStatus = "running" | "completed" | "failed";

export interface SanctionsJobRecord {
  jobId: string;
  status: SanctionsJobStatus;
  tenantId: string;
  startedAt: string;
  completedAt?: string;
  result?: {
    ok: boolean;
    durationMs: number;
    ok_count: number;
    failed_count: number;
    anyWriteFailed: boolean;
    summary: Array<{ listId: string; recordCount: number; errors: string[] }>;
  };
  error?: string;
}

const memoryStore = new Map<string, SanctionsJobRecord>();

function keyFor(tenantId: string, jobId: string): string {
  return `${tenantId}/${jobId}.json`;
}

export async function writeJobStatus(record: SanctionsJobRecord): Promise<void> {
  const key = keyFor(record.tenantId, record.jobId);
  memoryStore.set(key, record);
  try {
    const store = await getNamedStore(STORE_NAME, { silent: true });
    if (!store?.setJSON) return;
    await store.setJSON(key, record);
  } catch (err) {
    // In-memory fallback already populated above — surface the blob write
    // failure to the function log without disturbing the operator flow.
    console.warn(
      "[sanctions-jobs] blob write failed:",
      err instanceof Error ? err.message : String(err),
    );
  }
}

export async function readJobStatus(
  tenantId: string,
  jobId: string,
): Promise<SanctionsJobRecord | null> {
  const key = keyFor(tenantId, jobId);
  const inMemory = memoryStore.get(key);
  if (inMemory) return inMemory;
  try {
    const store = await getNamedStore(STORE_NAME, { silent: true });
    if (!store) return null;
    const raw = (await store.get(key, { type: "json" })) as SanctionsJobRecord | null;
    return raw ?? null;
  } catch (err) {
    console.warn(
      "[sanctions-jobs] blob read failed:",
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}
