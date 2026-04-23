// Hawkeye Sterling — scheduled refresh function.
// Iterates the SourceAdapter registry, fetches each, normalises to
// NormalisedEntity[], writes the dataset + report to Blobs, and logs a JSON
// summary to the function log. Invoked by cron (see netlify.toml).

import type { Handler } from '@netlify/functions';
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

export const handler: Handler = async () => {
  const store = await getBlobsStore();
  const summary: IngestionReport[] = [];

  for (const adapter of SOURCE_ADAPTERS) {
    const started = Date.now();
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
      try {
        await store.putDataset(adapter.id, entities, report);
      } catch (writeErr) {
        report.errors.push(
          `blob write failed: ${writeErr instanceof Error ? writeErr.message : String(writeErr)}`,
        );
      }
    } catch (err) {
      report.errors.push(err instanceof Error ? err.message : String(err));
      report.durationMs = Date.now() - started;
    }
    summary.push(report);
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    body: JSON.stringify({ at: new Date().toISOString(), summary }),
  };
};

export const config = { schedule: '0 3 * * *' };
