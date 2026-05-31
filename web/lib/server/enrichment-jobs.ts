import { getStore } from "@/lib/server/store";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import type { QuickScreenSubject } from "@/lib/api/quickScreen.types";

const JOB_PREFIX = "enrichment-jobs/";
const JOB_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours — gives clients a full day to poll
const STALE_ALERT_MS = 30 * 60 * 1000;   // alert after 30 min if job still pending

export interface EnrichmentJob {
  jobId: string;
  status: "pending" | "complete";
  subject: QuickScreenSubject;
  partialResult: Record<string, unknown>;
  requestedAt: string;
  completedAt?: string;
  fullResult?: Record<string, unknown>;
}

function safeJobId(id: string): string {
  return id.replace(/[^A-Za-z0-9._\-:]/g, "_").slice(0, 128);
}

function jobKey(jobId: string): string {
  return `${JOB_PREFIX}${safeJobId(jobId)}`;
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
    // Treat jobs older than 24 hours as expired.  Delete the blob to prevent
    // indefinite accumulation — without cleanup, expired jobs accumulate forever.
    const ageMs = Date.now() - new Date(job.requestedAt).getTime();
    if (ageMs > JOB_TTL_MS) {
      void store.delete(jobKey(jobId)).catch((err: unknown) => {
        console.warn("[enrichment-jobs] expired job cleanup failed (non-critical):", err instanceof Error ? err.message : String(err));
      });
      return null;
    }
    // Stale-alert: if the job is still pending after 30 minutes, the client
    // has likely abandoned the poll. Log a warning so ops can detect stuck jobs.
    if (job.status === "pending" && ageMs > STALE_ALERT_MS) {
      console.warn(`[enrichment-jobs] job '${jobId}' is still pending after ${Math.round(ageMs / 60_000)} min — client may have abandoned the poll. Subject: ${job.subject.name}`);
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
    // Write a correlated audit chain entry so the audit trail reflects that
    // enrichment completed. The original "screening.completed" entry stays
    // immutable; this new entry references it by enrichJobId for correlation.
    void writeAuditChainEntry({
      event: "enrichment.completed",
      actor: "system",
      subject: job.subject.name,
      enrichJobId: jobId,
      enrichmentPending: false,
      enrichmentCompletedAt: job.completedAt,
      enrichmentResultId: jobId,
    }).catch((err: unknown) => {
      console.warn("[enrichment-jobs] audit write failed:", err instanceof Error ? err.message : String(err));
    });
  } catch (err) {
    console.warn("[enrichment-jobs] completeEnrichmentJob failed (non-critical):", err instanceof Error ? err.message : String(err));
  }
}
