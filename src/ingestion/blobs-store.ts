// Hawkeye Sterling — Netlify Blobs wrapper.
// Runtime import is lazy to keep local dev / test builds working without
// `@netlify/blobs` installed or in a Netlify context.

import type { NormalisedEntity, IngestionReport } from './types.js';

export interface BlobsStore {
  putDataset: (listId: string, entities: NormalisedEntity[], report: IngestionReport) => Promise<void>;
  getLatest: (listId: string) => Promise<{ entities: NormalisedEntity[]; report: IngestionReport } | null>;
  getReport: (listId: string) => Promise<IngestionReport | null>;
}

let cached: BlobsStore | null = null;

type BlobsModule = typeof import('@netlify/blobs');
async function loadBlobs(): Promise<BlobsModule | null> {
  try {
    return (await import('@netlify/blobs')) as unknown as BlobsModule;
  } catch {
    return null;
  }
}

export async function getBlobsStore(): Promise<BlobsStore> {
  if (cached) return cached;
  const mod = await loadBlobs();
  if (!mod) {
    cached = inMemoryStore();
    return cached;
  }
  const { getStore } = mod;
  const data = getStore({ name: 'hawkeye-lists' });
  const reports = getStore({ name: 'hawkeye-list-reports' });
  cached = {
    async putDataset(listId, entities, report) {
      await data.setJSON(`${listId}/latest.json`, { entities, report });
      await reports.setJSON(`${listId}/latest.json`, report);
    },
    async getLatest(listId) {
      const v = await data.get(`${listId}/latest.json`, { type: 'json' }) as {
        entities: NormalisedEntity[]; report: IngestionReport;
      } | null;
      return v;
    },
    async getReport(listId) {
      const v = await reports.get(`${listId}/latest.json`, { type: 'json' }) as IngestionReport | null;
      return v;
    },
  };
  return cached;
}

// In-memory fallback for dev / test — keeps the same interface without Netlify.
function inMemoryStore(): BlobsStore {
  const datasets = new Map<string, { entities: NormalisedEntity[]; report: IngestionReport }>();
  const reports = new Map<string, IngestionReport>();
  return {
    async putDataset(listId, entities, report) {
      datasets.set(listId, { entities, report });
      reports.set(listId, report);
    },
    async getLatest(listId) { return datasets.get(listId) ?? null; },
    async getReport(listId) { return reports.get(listId) ?? null; },
  };
}
