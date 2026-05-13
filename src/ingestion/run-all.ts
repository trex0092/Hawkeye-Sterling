// Hawkeye Sterling — parallel ingestion runner.
//
// Shared by the four Netlify scheduled functions:
//   netlify/functions/sanctions-watch-cron.mts     (04:30 UTC)
//   netlify/functions/sanctions-watch-1100.mts     (11:00 UTC)
//   netlify/functions/sanctions-watch-1330.mts     (13:30 UTC)
//   netlify/functions/sanctions-watch-15min.mts    (*/15 mins)
//
// These previously self-fetched `/api/sanctions/watch` over the public
// origin. On Netlify, outbound fetch from a Lambda back to its own host
// has historically failed the TLS handshake (~200 ms, generic
// `fetch failed`). The crons therefore silently no-op'd while their
// own wrapper happily returned 200. Calling SOURCE_ADAPTERS directly
// from inside the scheduled function removes that dependency.
//
// The /api/sanctions/watch HTTP route is preserved unchanged so manual
// curl-based refreshes continue to work; only the crons are moved.

import { SOURCE_ADAPTERS } from './index.js';
import { getBlobsStore } from './blobs-store.js';
import type { IngestionReport } from './types.js';

const ADAPTER_TIMEOUT_MS = 12_000;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms`)),
      ms,
    );
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

export interface IngestRunSummary {
  ok: boolean;
  at: string;
  durationMs: number;
  ok_count: number;
  failed_count: number;
  anyWriteFailed: boolean;
  summary: IngestionReport[];
}

/**
 * Run every registered SOURCE_ADAPTER in parallel, write results to
 * Netlify Blobs, and return a structured summary. Each adapter is
 * bounded by ADAPTER_TIMEOUT_MS; one slow upstream cannot starve the
 * others. Errors are captured per-adapter — never thrown — so the
 * caller always receives a complete summary.
 *
 * The `label` is prefixed to every log line so multiple crons can be
 * distinguished in the Netlify Function logs.
 */
export async function runIngestionAll(label: string): Promise<IngestRunSummary> {
  const startedAt = Date.now();
  const store = await getBlobsStore();

  const runAdapter = async (
    adapter: typeof SOURCE_ADAPTERS[number],
  ): Promise<{ report: IngestionReport; writeFailed: boolean }> => {
    const started = Date.now();
    const blobKey = `${adapter.id}/latest.json`;
    const report: IngestionReport = {
      listId: adapter.id,
      sourceUrl: adapter.sourceUrl,
      recordCount: 0,
      checksum: '',
      fetchedAt: started,
      durationMs: 0,
      errors: [],
    };
    let writeFailed = false;
    try {
      const { entities, rawChecksum, sourceVersion } = await withTimeout(
        adapter.fetch(),
        ADAPTER_TIMEOUT_MS,
        `adapter ${adapter.id}`,
      );
      report.recordCount = entities.length;
      report.checksum = rawChecksum;
      if (sourceVersion) {
        (report as IngestionReport & { sourceVersion: string }).sourceVersion = sourceVersion;
      }
      report.durationMs = Date.now() - started;

      try {
        await store.putDataset(adapter.id, entities, report);
        try {
          const verification = await store.getReport(adapter.id);
          if (!verification) {
            console.error(
              `[${label}] WRITE VERIFICATION FAILED list=${adapter.id} key=${blobKey}`,
            );
            report.errors.push('write verification failed: blob not readable after write');
            writeFailed = true;
          } else {
            console.log(
              `[${label}] write verified list=${adapter.id} key=${blobKey} entityCount=${entities.length}`,
            );
          }
        } catch (verifyErr) {
          const msg = verifyErr instanceof Error ? verifyErr.message : String(verifyErr);
          console.error(
            `[${label}] WRITE READ-BACK ERROR list=${adapter.id} key=${blobKey} error=${msg}`,
          );
          report.errors.push(`write read-back error: ${msg}`);
          writeFailed = true;
        }
      } catch (writeErr) {
        const msg = writeErr instanceof Error ? writeErr.message : String(writeErr);
        console.error(
          `[${label}] BLOB WRITE FAILED list=${adapter.id} key=${blobKey} error=${msg}`,
        );
        report.errors.push(`blob write failed: ${msg}`);
        writeFailed = true;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[${label}] ADAPTER FETCH FAILED list=${adapter.id} error=${msg}`);
      report.errors.push(msg);
      report.durationMs = Date.now() - started;
    }
    return { report, writeFailed };
  };

  const settled = await Promise.allSettled(SOURCE_ADAPTERS.map(runAdapter));
  const summary: IngestionReport[] = [];
  let anyWriteFailed = false;
  for (let i = 0; i < settled.length; i++) {
    const r = settled[i]!;
    if (r.status === 'fulfilled') {
      summary.push(r.value.report);
      if (r.value.writeFailed) anyWriteFailed = true;
    } else {
      const adapter = SOURCE_ADAPTERS[i]!;
      const msg = r.reason instanceof Error ? r.reason.message : String(r.reason);
      console.error(`[${label}] UNCAUGHT REJECTION list=${adapter.id} error=${msg}`);
      summary.push({
        listId: adapter.id,
        sourceUrl: adapter.sourceUrl,
        recordCount: 0,
        checksum: '',
        fetchedAt: Date.now(),
        durationMs: 0,
        errors: [`unhandled rejection: ${msg}`],
      });
      anyWriteFailed = true;
    }
  }

  const ok_count = summary.filter((r) => r.errors.length === 0).length;
  const failed_count = summary.filter((r) => r.errors.length > 0).length;
  console.log(
    `[${label}] SUMMARY ok=${ok_count} failed=${failed_count} anyWriteFailed=${anyWriteFailed}`,
  );

  return {
    ok: failed_count === 0 && !anyWriteFailed,
    at: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    ok_count,
    failed_count,
    anyWriteFailed,
    summary,
  };
}
