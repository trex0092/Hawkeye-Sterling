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
//
// Ingest timestamp tracking:
//   After every successful putDataset, we record the completion time in
//   the `hawkeye-list-ingest-meta` blob store under
//   `last-successful-ingest.json`. This allows /api/sanctions/status to
//   report per-list "last time a full successful ingest completed" — a
//   separate signal from the snapshot's own lastModified timestamp, which
//   reflects upstream data age rather than our own pipeline health.

import type { NormalisedEntity, IngestionReport } from './types.js';

// Sentinel thrown by `putDataset` when the feed-integrity guard refuses
// to overwrite a non-empty snapshot with an empty one. The ingestion
// runner catches this and surfaces it as `writeFailed` so the existing
// alert / status pipeline lights up without confusing it with a
// transport failure.
export class EmptyOverwriteRefusedError extends Error {
  readonly listId: string;
  readonly priorEntityCount: number;
  constructor(listId: string, priorEntityCount: number) {
    super(
      `feed-integrity guard: refused to overwrite ${listId}/latest.json ` +
      `(prior entityCount=${priorEntityCount}, new entityCount=0). ` +
      `Last healthy snapshot preserved. Investigate the upstream parser ` +
      `before retrying.`,
    );
    this.name = 'EmptyOverwriteRefusedError';
    this.listId = listId;
    this.priorEntityCount = priorEntityCount;
  }
}

export interface PutDatasetOptions {
  /**
   * Override the refuse-empty-write integrity guard. Default false.
   * Only set this for a deliberate operator-driven reset where the
   * intent really is to wipe a previously-healthy list.
   */
  allowEmpty?: boolean;
}

export interface BlobsStore {
  putDataset: (
    listId: string,
    entities: NormalisedEntity[],
    report: IngestionReport,
    opts?: PutDatasetOptions,
  ) => Promise<void>;
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

  // Ingest-meta store: tracks per-list last successful ingest timestamps.
  const metaOpts: ExplicitOpts = { name: 'hawkeye-list-ingest-meta', consistency: 'strong' };
  if (creds.siteID) metaOpts.siteID = creds.siteID;
  if (creds.token) metaOpts.token = creds.token;
  const ingestMeta = getStore(metaOpts) as unknown as {
    get: (_key: string, _opts?: { type?: string }) => Promise<unknown>;
    setJSON: (_key: string, _value: unknown) => Promise<void>;
  };

  const INGEST_META_KEY = 'last-successful-ingest.json';

  /** Best-effort: record a successful ingest for `listId` without blocking the pipeline. */
  async function recordIngestTimestamp(listId: string): Promise<void> {
    try {
      const raw = await ingestMeta.get(INGEST_META_KEY, { type: 'json' }).catch(() => null) as {
        lastFullIngestAt: string | null;
        perList: Record<string, string>;
        updatedAt: string;
      } | null;
      const existing = raw ?? { lastFullIngestAt: null, perList: {}, updatedAt: new Date().toISOString() };
      existing.perList[listId] = new Date().toISOString();
      existing.updatedAt = new Date().toISOString();
      await ingestMeta.setJSON(INGEST_META_KEY, existing);
    } catch {
      // Best-effort — never fail a putDataset because metadata tracking failed.
    }
  }

  cached = {
    async putDataset(listId, entities, report, opts) {
      // Feed-integrity guard (RULE 12 / Mandatory Feed Integrity):
      // refuse to overwrite a healthy snapshot with an empty parse.
      // A zero-entity parse is almost always a parser regression, a
      // transient upstream 5xx that produced an empty payload, or a
      // schema drift — NEVER what the regulator-facing screening engine
      // should match against. Preserve the last-known-good snapshot
      // and surface the refusal as a structured error so the alert
      // webhook fires.
      if (entities.length === 0 && !opts?.allowEmpty) {
        const prior = await data
          .get(`${listId}/latest.json`, { type: 'json' })
          .catch(() => null) as { entities?: NormalisedEntity[] } | null;
        const priorCount = prior?.entities?.length ?? 0;
        if (priorCount > 0) {
          // Forensic side-channel: persist the rejected report so the
          // dashboard + audit chain retain evidence of the refused write.
          const rejectedKey = `${listId}/latest.rejected.json`;
          try {
            await reports.setJSON(rejectedKey, {
              ...report,
              errors: [
                ...(report.errors ?? []),
                `empty-overwrite refused at ${new Date().toISOString()}; priorEntityCount=${priorCount}`,
              ],
            });
          } catch (forensicErr) {
            // AML-03: forensic write best-effort, but the failure must NOT be
            // silent — without this WARN an operator investigating corpus
            // corruption sees no trace of the rejected report attempt.
            console.warn(
              `[blobs-store] forensic-write failed for rejected report listId=${listId} key=${rejectedKey}: ${
                forensicErr instanceof Error ? forensicErr.message : String(forensicErr)
              }`,
            );
          }
          throw new EmptyOverwriteRefusedError(listId, priorCount);
        }
      }
      await data.setJSON(`${listId}/latest.json`, { entities, report });
      // Mirror entity data into hawkeye-list-reports so Next.js API routes
      // (which cannot read hawkeye-lists without auto-injection) can load
      // the candidate list for screening. fetchedAt is top-level for compat.
      await reports.setJSON(`${listId}/latest.json`, { ...report, entities });
      // Track the last successful ingest timestamp for this list. Fire-and-forget.
      void recordIngestTimestamp(listId);
    },
    async getLatest(listId) {
      const v = await data.get(`${listId}/latest.json`, { type: 'json' }) as {
        entities: NormalisedEntity[]; report: IngestionReport;
      } | null;
      if (v) {
        const MAX_SANCTIONS_AGE_MS = 48 * 60 * 60 * 1000; // 48 hours
        const fetchedAt = v.report?.fetchedAt;
        const ageMs = typeof fetchedAt === 'number' ? Date.now() - fetchedAt : NaN;
        if (Number.isFinite(ageMs) && ageMs > MAX_SANCTIONS_AGE_MS) {
          console.warn(`[sanctions] corpus is stale — last fetched ${Math.round(ageMs / 3600000)}h ago. Screening may miss recently designated entities.`);
        }
      }
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
// Same feed-integrity guard applies so tests exercise the production
// refusal path. Exported for test files that need a clean store without
// Netlify Blobs creds; production code should continue to use getBlobsStore().
export function inMemoryStore(): BlobsStore {
  const datasets = new Map<string, { entities: NormalisedEntity[]; report: IngestionReport }>();
  const reports = new Map<string, IngestionReport>();
  return {
    async putDataset(listId, entities, report, opts) {
      if (entities.length === 0 && !opts?.allowEmpty) {
        const prior = datasets.get(listId);
        const priorCount = prior?.entities?.length ?? 0;
        if (priorCount > 0) {
          throw new EmptyOverwriteRefusedError(listId, priorCount);
        }
      }
      datasets.set(listId, { entities, report });
      reports.set(listId, report);
    },
    async getLatest(listId) { return datasets.get(listId) ?? null; },
    async getReport(listId) { return reports.get(listId) ?? null; },
  };
}
