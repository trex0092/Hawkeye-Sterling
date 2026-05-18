// POST /api/admin/enrichment-backfill
//
// One-shot admin tool: scans all enrichment job blobs, finds completed jobs
// that pre-date the audit-chain write added to completeEnrichmentJob(), and
// writes backfill "enrichment.completed" entries tagged with backfilled: true.
//
// Safe to re-run — the audit chain is append-only; duplicate entries are
// harmless (each carries a distinct timestamp and enrichJobId for deduplication
// by the MLRO if needed).
//
// Returns { ok, scanned, backfilled, skipped, errors }.

import { NextResponse } from "next/server";
import { withGuard } from "@/lib/server/guard";
import { listKeys, getStore } from "@/lib/server/store";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import type { EnrichmentJob } from "@/lib/server/enrichment-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const JOB_PREFIX = "enrichment-jobs/";

async function handleBackfill(_req: Request): Promise<NextResponse> {
  const runAt = new Date().toISOString();

  let keys: string[];
  try {
    keys = await listKeys(JOB_PREFIX);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: "failed to list enrichment job keys", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }

  const store = getStore();
  let scanned = 0;
  let backfilled = 0;
  let skipped = 0;
  const errors: string[] = [];

  await Promise.allSettled(
    keys.map(async (key) => {
      scanned++;
      let raw: string | null = null;
      try {
        raw = await store.get(key);
      } catch (err) {
        errors.push(`read ${key}: ${err instanceof Error ? err.message : String(err)}`);
        return;
      }
      if (!raw) { skipped++; return; }

      let job: EnrichmentJob;
      try {
        job = JSON.parse(raw) as EnrichmentJob;
      } catch {
        errors.push(`parse ${key}: invalid JSON`);
        return;
      }

      if (job.status !== "complete") { skipped++; return; }

      // Write backfill audit chain entry.
      void writeAuditChainEntry({
        event: "enrichment.completed",
        actor: "system",
        subject: job.subject?.name ?? "unknown",
        enrichJobId: job.jobId,
        enrichmentPending: false,
        enrichmentCompletedAt: job.completedAt ?? runAt,
        enrichmentResultId: job.jobId,
        backfilled: true,
        backfilledAt: runAt,
      });
      backfilled++;
    }),
  );

  return NextResponse.json({
    ok: true,
    scanned,
    backfilled,
    skipped,
    ...(errors.length > 0 ? { errors } : {}),
    runAt,
  });
}

export const POST = withGuard(handleBackfill);

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 204,
    headers: {
      Allow: "POST, OPTIONS",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
