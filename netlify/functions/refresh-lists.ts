// Hawkeye Sterling — scheduled refresh function (daily 03:00 UTC).
//
// Delegates the per-adapter ingestion to runIngestionAll() so the
// parallel runner + error-log wiring + blob-write verification stays
// in one place (src/ingestion/run-all.ts). This function adds the
// refresh-lists-specific tail: a post-refresh sanctions_status read
// and an optional ALERT_WEBHOOK_URL fanout on write failure.

import type { Config } from '@netlify/functions';
import { getStore } from '@netlify/blobs';
import { runIngestionAll } from '../../src/ingestion/run-all.js';

const LABEL = 'refresh-lists';

interface SanctionsStatusList { listId: string; displayName: string; status: string; entityCount: number | null }
interface SanctionsStatusResponse { lists?: SanctionsStatusList[] }

export default async (): Promise<Response> => {
  const result = await runIngestionAll(LABEL);

  // Call sanctions_status to confirm storage state from the read path.
  const baseUrl =
    process.env['URL'] ??
    process.env['DEPLOY_PRIME_URL'] ??
    'https://hawkeye-sterling.netlify.app';
  // Audit H-03 / P2-07: a list can write successfully but parse to zero
  // entities (parser bug or empty upstream feed). Detect those by reading
  // sanctions_status after the refresh and surfacing any `status: healthy`
  // adapter whose entityCount is 0.
  const zeroEntityLists: string[] = [];
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 10_000);
    try {
      const res = await fetch(`${baseUrl}/api/sanctions/status`, {
        headers: process.env['SANCTIONS_CRON_TOKEN']
          ? { authorization: `Bearer ${process.env['SANCTIONS_CRON_TOKEN']}` }
          : {},
        signal: ctl.signal,
      });
      if (res.ok) {
        const status = await res.json() as SanctionsStatusResponse;
        console.log(`[${LABEL}] sanctions_status after refresh: ${JSON.stringify(status)}`);
        for (const l of status.lists ?? []) {
          if (l.status === 'healthy' && l.entityCount === 0) {
            zeroEntityLists.push(`${l.listId} (${l.displayName})`);
          }
        }
      } else {
        console.warn(`[${LABEL}] sanctions_status returned HTTP ${res.status}`);
      }
    } finally {
      clearTimeout(t);
    }
  } catch (err) {
    console.warn(`[${LABEL}] sanctions_status call failed (non-critical):`, err instanceof Error ? err.message : err);
  }

  // Fire alert webhook on write failure OR on zero-entity ingest so on-call
  // is notified immediately. Zero-entity is a silent-failure mode: the blob
  // is present and "healthy" from the storage layer, but the screening
  // matcher has nothing to match against.
  const alertWebhook = process.env['ALERT_WEBHOOK_URL'];
  if (alertWebhook && (result.anyWriteFailed || zeroEntityLists.length > 0)) {
    try {
      const reasons: string[] = [];
      if (result.anyWriteFailed) reasons.push(`${result.failed_count} adapter write(s) failed`);
      if (zeroEntityLists.length > 0) reasons.push(`zero-entity ingest: ${zeroEntityLists.join(', ')}`);
      await fetch(alertWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `[Hawkeye Sterling] ${LABEL} DEGRADED — ${reasons.join('; ')} at ${result.at}. Screening is degraded until the next successful run.`,
          summary: result.summary,
          zeroEntityLists,
        }),
      });
    } catch (webhookErr) {
      console.warn(`[${LABEL}] alert webhook failed (non-critical):`, webhookErr instanceof Error ? webhookErr.message : webhookErr);
    }
  }

  // Write heartbeat on success so health-monitor can detect silent cron failures.
  if (!result.anyWriteFailed) {
    try {
      const hbStore = getStore('hawkeye-function-heartbeats');
      await hbStore.setJSON(LABEL, { lastSuccess: new Date().toISOString(), label: LABEL });
    } catch (hbErr) {
      console.warn(`[${LABEL}] heartbeat write failed (non-critical):`, hbErr instanceof Error ? hbErr.message : hbErr);
    }
  }

  const statusCode = result.anyWriteFailed ? 500 : 200;
  return new Response(
    JSON.stringify({ at: result.at, summary: result.summary, anyWriteFailed: result.anyWriteFailed, zeroEntityLists }),
    { status: statusCode, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } },
  );
};

export const config: Config = { schedule: '0 3 * * *' };
