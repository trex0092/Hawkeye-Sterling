// Hawkeye Sterling — LSEG CFS file-notification poller (audit integration).
//
// Scheduled Netlify function that:
//   1. Authenticates with LSEG via OAuth2 (handled by lseg.ts).
//   2. Discovers available CFS packages/buckets for this account.
//   3. Polls each bucket for filesets newer than the last recorded checkpoint.
//   4. Downloads and stores new files in the Netlify Blobs store.
//   5. Emits a structured ingest record for downstream Hawkeye modules.
//
// Schedule: every 6 hours at :15 UTC (staggered off the hour).
//
// Environment variables required:
//   LSEG_USERNAME       — LSEG account email
//   LSEG_PASSWORD       — LSEG account password
//   LSEG_APP_KEY        — AppKey from LSEG AppKey Generator
//   LSEG_SQS_ENDPOINT   — Full SQS queue URL (optional — for push notifications)
//   HAWKEYE_CRON_TOKEN  — Bearer token to protect the HTTP trigger path
//
// Blobs store: "hawkeye-lseg-cfs"
//   checkpoint/<bucket>          → ISO timestamp of last successful poll
//   filesets/<bucket>/<id>.json  → raw fileset metadata
//   files/<bucket>/<fileId>.dat  → raw file content

import type { Config } from '@netlify/functions';
import { getStore } from '@netlify/blobs';
import {
  getPackages,
  getFileSets,
  getFiles,
  downloadFile,
  getNewsHeadlines,
  getAlerts,
} from '../../dist/src/integrations/lseg.js';

const STORE_NAME = 'hawkeye-lseg-cfs';
const RUN_LABEL  = 'lseg-cfs-poll';
const FETCH_TIMEOUT_MS = 30_000;
const MAX_FILES_PER_BUCKET = 10; // safety cap per run

interface PollOutcome {
  bucket: string;
  ok: boolean;
  newFileSets: number;
  filesDownloaded: number;
  error?: string;
}

interface ImportResult {
  ok: boolean;
  status?: number;
  filesProcessed?: number;
  entitiesIndexed?: number;
  adverseIndexed?: number;
  sanctionsSupplement?: Record<string, number>;
  error?: string;
}

interface IngestSummary {
  ok: boolean;
  label: string;
  runAt: string;
  buckets: PollOutcome[];
  newsHeadlines?: number;
  corporateAlerts?: number;
  importCfs?: ImportResult;
  durationMs: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function getCheckpoint(
  store: ReturnType<typeof getStore>,
  bucket: string,
): Promise<string | null> {
  try {
    return await store.get(`checkpoint/${bucket}`, { type: 'text' }) ?? null;
  } catch {
    return null;
  }
}

async function setCheckpoint(
  store: ReturnType<typeof getStore>,
  bucket: string,
  iso: string,
): Promise<void> {
  await store.set(`checkpoint/${bucket}`, iso);
}

// ── Per-bucket poll ───────────────────────────────────────────────────────────

async function pollBucket(
  bucket: string,
  store: ReturnType<typeof getStore>,
): Promise<PollOutcome> {
  const base: PollOutcome = { bucket, ok: false, newFileSets: 0, filesDownloaded: 0 };

  // Load last checkpoint so we only fetch new filesets
  const lastPoll = await getCheckpoint(store, bucket);
  const fileSetsRes = await getFileSets(bucket, lastPoll ? { contentFrom: lastPoll } : {});

  if (!fileSetsRes.ok) {
    return { ...base, error: fileSetsRes.error };
  }

  const fileSets = fileSetsRes.data;
  base.newFileSets = fileSets.length;

  let downloaded = 0;
  for (const fs of fileSets.slice(0, MAX_FILES_PER_BUCKET)) {
    // Persist fileset metadata
    await store.set(
      `filesets/${bucket}/${fs.id}.json`,
      JSON.stringify(fs),
    ).catch(() => { /* non-fatal */ });

    // Fetch and persist each file in the fileset
    const filesRes = await getFiles(fs.id);
    if (!filesRes.ok || !filesRes.data) continue;

    for (const file of filesRes.data) {
      const contentRes = await downloadFile(file.fileId, FETCH_TIMEOUT_MS);
      if (!contentRes.ok || !contentRes.data) continue;

      await store.set(
        `files/${bucket}/${file.fileId}.dat`,
        contentRes.data,
      ).catch(() => { /* non-fatal */ });

      downloaded++;
    }
  }

  base.filesDownloaded = downloaded;

  // Advance checkpoint to now
  await setCheckpoint(store, bucket, new Date().toISOString());

  return { ...base, ok: true };
}

// ── Main handler ──────────────────────────────────────────────────────────────

export default async function handler(req: Request): Promise<Response> {
  // Protect HTTP-triggered invocations with bearer token
  const cronToken = process.env['HAWKEYE_CRON_TOKEN'];
  if (cronToken) {
    const auth = req.headers.get('authorization');
    if (auth !== null) {
      const supplied = auth.replace(/^Bearer\s+/i, '').trim();
      const enc = new TextEncoder();
      const a = enc.encode(cronToken);
      const b = enc.encode(supplied);
      const padded = new Uint8Array(a.byteLength);
      padded.set(new Uint8Array(b.buffer, b.byteOffset, Math.min(b.byteLength, a.byteLength)));
      const match =
        (await import('node:crypto')
          .then(({ timingSafeEqual }) =>
            timingSafeEqual(new Uint8Array(a.buffer), padded),
          )
          .catch(() => false)) && a.byteLength === b.byteLength;
      if (!match) {
        return jsonResponse({ ok: false, label: RUN_LABEL, error: 'Unauthorized' }, 401);
      }
    }
  }

  const startedAt = Date.now();
  let store: ReturnType<typeof getStore>;
  try {
    store = getStore(STORE_NAME);
  } catch (err) {
    return jsonResponse(
      { ok: false, label: RUN_LABEL, error: `getStore failed: ${err instanceof Error ? err.message : String(err)}` },
      503,
    );
  }

  // 1. Discover entitled CFS packages
  const packagesRes = await getPackages();
  if (!packagesRes.ok) {
    return jsonResponse(
      { ok: false, label: RUN_LABEL, error: packagesRes.error },
      502,
    );
  }
  if (!packagesRes.data.length) {
    return jsonResponse(
      { ok: false, label: RUN_LABEL, error: 'No CFS packages found for this account' },
      502,
    );
  }

  // 2. Poll each unique bucket
  const buckets = [...new Set(packagesRes.data.map((p) => p.bucket))];
  const outcomes: PollOutcome[] = [];
  for (const bucket of buckets) {
    outcomes.push(await pollBucket(bucket, store));
  }

  // 3. Ingest news headlines → adverse_media_live
  let newsCount: number | undefined;
  try {
    const newsRes = await getNewsHeadlines('ISTANBUL ALTIN RAFINERISI', { count: 50 });
    if (newsRes.ok && newsRes.data) {
      newsCount = newsRes.data.length;
      await store.set('news/latest.json', JSON.stringify(newsRes.data)).catch(() => {});
    }
  } catch { /* non-fatal */ }

  // 4. Ingest corporate alerts → entity_graph
  let alertsCount: number | undefined;
  try {
    const alertsRes = await getAlerts({ status: 'new' });
    if (alertsRes.ok && alertsRes.data) {
      alertsCount = alertsRes.data.length;
      await store.set('alerts/latest.json', JSON.stringify(alertsRes.data)).catch(() => {});
    }
  } catch { /* non-fatal */ }

  // 5. Auto-trigger the indexer so freshly downloaded files become live PEP /
  //    sanctions / adverse coverage without a manual operator round-trip.
  //    Previously the System Card warned that operators had to re-run
  //    /api/admin/import-cfs after every CFS fileset refresh — that limitation
  //    is removed here: the cron POSTs to the indexer using the ADMIN_TOKEN
  //    from env and folds the result into the summary.
  //
  //    Skipped when ADMIN_TOKEN is missing (would 503 anyway) or when no new
  //    files were downloaded (re-indexing the same corpus is wasted work).
  let importCfs: ImportResult | undefined;
  const anyNewFiles = outcomes.some((o) => o.filesDownloaded > 0);
  const adminToken = process.env['ADMIN_TOKEN'];
  if (anyNewFiles && adminToken) {
    const baseUrl =
      process.env['URL'] ??
      process.env['DEPLOY_PRIME_URL'] ??
      'https://hawkeye-sterling.netlify.app';
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 55_000);
      try {
        const res = await fetch(`${baseUrl}/api/admin/import-cfs`, {
          method: 'POST',
          headers: { authorization: `Bearer ${adminToken}`, 'content-type': 'application/json' },
          signal: ctl.signal,
        });
        if (res.ok) {
          const body = await res.json() as Record<string, unknown>;
          importCfs = {
            ok: Boolean(body['ok']),
            status: res.status,
            ...(typeof body['filesProcessed'] === 'number' ? { filesProcessed: body['filesProcessed'] as number } : {}),
            ...(typeof body['entitiesIndexed'] === 'number' ? { entitiesIndexed: body['entitiesIndexed'] as number } : {}),
            ...(typeof body['adverseIndexed'] === 'number' ? { adverseIndexed: body['adverseIndexed'] as number } : {}),
            ...(body['sanctionsSupplement'] && typeof body['sanctionsSupplement'] === 'object'
              ? { sanctionsSupplement: body['sanctionsSupplement'] as Record<string, number> }
              : {}),
          };
        } else {
          importCfs = {
            ok: false,
            status: res.status,
            error: `HTTP ${res.status}`,
          };
        }
      } finally {
        clearTimeout(t);
      }
    } catch (err) {
      importCfs = {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  } else if (anyNewFiles && !adminToken) {
    importCfs = { ok: false, error: 'ADMIN_TOKEN not set — auto-import skipped, run /api/admin/import-cfs manually' };
  }

  const summary: IngestSummary = {
    ok: outcomes.every((o) => o.ok),
    label: RUN_LABEL,
    runAt: new Date().toISOString(),
    buckets: outcomes,
    ...(newsCount !== undefined ? { newsHeadlines: newsCount } : {}),
    ...(alertsCount !== undefined ? { corporateAlerts: alertsCount } : {}),
    ...(importCfs !== undefined ? { importCfs } : {}),
    durationMs: Date.now() - startedAt,
  };

  return jsonResponse(summary);
}

export const config: Config = {
  // Every 6 hours at :15 UTC — staggered off the hour.
  schedule: '15 */6 * * *',
};
