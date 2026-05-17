// Hawkeye Sterling — Netlify Blobs wrapper.
// Runtime import is lazy to keep local dev / test builds working without
// `@netlify/blobs` installed or in a Netlify context.
//
// Credential model — IMPORTANT.
//   @netlify/plugin-nextjs does NOT auto-inject Netlify Blobs context
//   into Netlify Function lambdas in this monorepo layout. So
//   `getStore({ name })` without explicit credentials returns a store
//   handle whose writes silently fail to land in the same blob scope
//   that the public read path uses. This was the actual root cause
//   of the "architecture is correct but no list ever populates"
//   symptom: refresh-lists.ts wrote successfully (from its own POV)
//   but /api/sanctions/status read an empty store.
//
//   Fix: resolve NETLIFY_SITE_ID + NETLIFY_BLOBS_TOKEN at runtime and
//   pass them through to getStore() — mirroring the pattern in
//   web/app/api/sanctions/status/route.ts which has always worked.
//   The fallback to inMemoryStore() is preserved for local dev /
//   vitest, but the production path now always uses an explicitly
//   authenticated store.

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
    return await import('@netlify/blobs') as unknown as BlobsModule;
  } catch {
    return null;
  }
}

interface ExplicitOpts {
  name: string;
  siteID?: string;
  token?: string;
  consistency?: 'strong' | 'eventual';
}

function readCredentialEnv(): { siteID?: string; token?: string } {
  // Match the read-side resolution in /api/sanctions/status/route.ts
  // so write and read paths see the same blob scope.
  const siteID = process.env['NETLIFY_SITE_ID'] ?? process.env['SITE_ID'];
  const token =
    process.env['NETLIFY_BLOBS_TOKEN'] ??
    process.env['NETLIFY_API_TOKEN'] ??
    process.env['NETLIFY_AUTH_TOKEN'];
  const out: { siteID?: string; token?: string } = {};
  if (siteID) out.siteID = siteID;
  if (token) out.token = token;
  return out;
}

export async function getBlobsStore(): Promise<BlobsStore> {
  if (cached) return cached;
  const mod = await loadBlobs();
  if (!mod) {
    cached = inMemoryStore();
    return cached;
  }
  const { getStore } = mod;
  const creds = readCredentialEnv();
  const dataOpts: ExplicitOpts = { name: 'hawkeye-lists', consistency: 'strong' };
  const reportOpts: ExplicitOpts = { name: 'hawkeye-list-reports', consistency: 'strong' };
  if (creds.siteID) {
    dataOpts.siteID = creds.siteID;
    reportOpts.siteID = creds.siteID;
  }
  if (creds.token) {
    dataOpts.token = creds.token;
    reportOpts.token = creds.token;
  }
  const data = getStore(dataOpts);
  const reports = getStore(reportOpts);
  cached = {
    async putDataset(listId, entities, report) {
      await data.setJSON(`${listId}/latest.json`, { entities, report });
      // Mirror entity data into hawkeye-list-reports so Next.js API routes
      // (which cannot read hawkeye-lists without auto-injection) can load
      // the candidate list for screening. fetchedAt is top-level for compat.
      await reports.setJSON(`${listId}/latest.json`, { ...report, entities });
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
