// Hawkeye Sterling — scheduled refresh function.
// Iterates the SourceAdapter registry, fetches each, normalises to
// NormalisedEntity[], writes the dataset + report to Blobs, and logs a JSON
// summary to the function log. Invoked by cron (see netlify.toml).

import type { Config } from '@netlify/functions';
import { SOURCE_ADAPTERS } from '../../src/ingestion/index.js';
import type { IngestionReport } from '../../src/ingestion/types.js';
import { getBlobsStore } from '../../src/ingestion/blobs-store.js';

// Per-adapter fetch timeout. A single hung adapter used to block the whole
// job; now each one is races with a timeout and reported independently.
const ADAPTER_TIMEOUT_MS = 90_000;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms`)),
      ms,
    );
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

export default async (): Promise<Response> => {
  const store = await getBlobsStore();
  const summary: IngestionReport[] = [];
  let anyWriteFailed = false;

  for (const adapter of SOURCE_ADAPTERS) {
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
    try {
      const { entities, rawChecksum, sourceVersion } = await withTimeout(
        adapter.fetch(),
        ADAPTER_TIMEOUT_MS,
        `adapter ${adapter.id}`,
      );
      report.recordCount = entities.length;
      report.checksum = rawChecksum;
      if (sourceVersion) (report as IngestionReport & { sourceVersion: string }).sourceVersion = sourceVersion;
      report.durationMs = Date.now() - started;

      // Write to blob storage
      try {
        await store.putDataset(adapter.id, entities, report);

        // Immediately read back to verify the write succeeded
        try {
          const verification = await store.getReport(adapter.id);
          if (!verification) {
            console.error(
              `[refresh-lists] WRITE VERIFICATION FAILED list=${adapter.id} key=${blobKey} — report blob not found immediately after write`,
            );
            report.errors.push('write verification failed: blob not readable after write');
            anyWriteFailed = true;
          } else {
            console.log(
              `[refresh-lists] write verified list=${adapter.id} key=${blobKey} entityCount=${entities.length}`,
            );
          }
        } catch (verifyErr) {
          const msg = verifyErr instanceof Error ? verifyErr.message : String(verifyErr);
          console.error(`[refresh-lists] WRITE READ-BACK ERROR list=${adapter.id} key=${blobKey} error=${msg}`);
          report.errors.push(`write read-back error: ${msg}`);
          anyWriteFailed = true;
        }
      } catch (writeErr) {
        const msg = writeErr instanceof Error ? writeErr.message : String(writeErr);
        console.error(`[refresh-lists] BLOB WRITE FAILED list=${adapter.id} key=${blobKey} error=${msg}`);
        report.errors.push(`blob write failed: ${msg}`);
        anyWriteFailed = true;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[refresh-lists] ADAPTER FETCH FAILED list=${adapter.id} error=${msg}`);
      report.errors.push(msg);
      report.durationMs = Date.now() - started;
    }
    summary.push(report);
  }

  // Log per-list summary so operators can read the full picture in function logs
  const ok = summary.filter(r => r.errors.length === 0).length;
  const failed = summary.filter(r => r.errors.length > 0).length;
  console.log(`[refresh-lists] SUMMARY ok=${ok} failed=${failed} anyWriteFailed=${anyWriteFailed}`);
  for (const r of summary) {
    const st = r.errors.length === 0 ? 'ok' : 'error';
    console.log(
      `[refresh-lists]   ${r.listId}: status=${st} entityCount=${r.recordCount}` +
      (r.errors.length ? ` errors=${JSON.stringify(r.errors)}` : ''),
    );
  }

  const statusCode = anyWriteFailed ? 500 : 200;
  return new Response(
    JSON.stringify({ at: new Date().toISOString(), summary, anyWriteFailed }),
    { status: statusCode, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } },
  );
};

export const config: Config = { schedule: '0 3 * * *' };
