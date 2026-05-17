import { getStore } from "@/lib/server/store";
import type { QuickScreenSubject } from "@/lib/api/quickScreen.types";

const JOB_PREFIX = "enrichment-jobs/";
const JOB_TTL_MS = 30 * 60 * 1000; // 30 minutes

export interface EnrichmentJob {
  jobId: string;
  status: "pending" | "complete";
  subject: QuickScreenSubject;
  partialResult: Record<string, unknown>;
  requestedAt: string;
  completedAt?: string;
  fullResult?: Record<string, unknown>;
}

function jobKey(jobId: string): string {
  return `${JOB_PREFIX}${jobId}`;
}

export async function saveEnrichmentJob(
  jobId: string,
  subject: QuickScreenSubject,
  partialResult: Record<string, unknown>,
): Promise<void> {
  try {
    const store = getStore();
    const job: EnrichmentJob = {
      jobId,
      status: "pending",
      subject,
      partialResult,
      requestedAt: new Date().toISOString(),
    };
    await store.set(jobKey(jobId), JSON.stringify(job));
  } catch (err) {
    console.warn("[enrichment-jobs] saveEnrichmentJob failed (non-critical):", err instanceof Error ? err.message : String(err));
  }
}

export async function getEnrichmentJob(jobId: string): Promise<EnrichmentJob | null> {
  try {
    const store = getStore();
    const raw = await store.get(jobKey(jobId));
    if (!raw) return null;
    const job = JSON.parse(raw) as EnrichmentJob;
    // Treat jobs older than 30 minutes as expired.  Delete the blob to prevent
    // indefinite accumulation — without cleanup, expired jobs accumulate forever.
    if (Date.now() - new Date(job.requestedAt).getTime() > JOB_TTL_MS) {
      void store.delete(jobKey(jobId)).catch((err: unknown) => {
        console.warn("[enrichment-jobs] expired job cleanup failed (non-critical):", err instanceof Error ? err.message : String(err));
      });
      return null;
    }
    return job;
  } catch {
    return null;
  }
}

export async function completeEnrichmentJob(
  jobId: string,
  fullResult: Record<string, unknown>,
): Promise<void> {
  try {
    const store = getStore();
    const raw = await store.get(jobKey(jobId));
    if (!raw) return;
    const job = JSON.parse(raw) as EnrichmentJob;
    // Do not update already-expired jobs — prevents resurrection of old blobs.
    if (Date.now() - new Date(job.requestedAt).getTime() > JOB_TTL_MS) return;
    job.status = "complete";
    job.fullResult = fullResult;
    job.completedAt = new Date().toISOString();
    await store.set(jobKey(jobId), JSON.stringify(job));
  } catch (err) {
    console.warn("[enrichment-jobs] completeEnrichmentJob failed (non-critical):", err instanceof Error ? err.message : String(err));
  }
}
