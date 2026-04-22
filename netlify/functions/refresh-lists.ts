// Hawkeye Sterling — scheduled refresh function.
// Iterates the SourceAdapter registry, fetches each, normalises to
// NormalisedEntity[], writes the dataset + report to Blobs, and logs a JSON
// summary to the function log. Invoked by cron (see netlify.toml).

import type { Handler } from '@netlify/functions';
import { SOURCE_ADAPTERS } from '../../src/ingestion/index.js';
import type { IngestionReport } from '../../src/ingestion/types.js';
import { getBlobsStore } from '../../src/ingestion/blobs-store.js';

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
      const { entities, rawChecksum, sourceVersion } = await adapter.fetch();
      report.recordCount = entities.length;
      report.checksum = rawChecksum;
      if (sourceVersion) (report as IngestionReport & { sourceVersion: string }).sourceVersion = sourceVersion;
      report.durationMs = Date.now() - started;
      await store.putDataset(adapter.id, entities, report);
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
