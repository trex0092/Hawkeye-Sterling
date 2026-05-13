// Hawkeye Sterling — scheduled refresh function (daily 03:00 UTC).
//
// Delegates the per-adapter ingestion to runIngestionAll() so the
// parallel runner + error-log wiring + blob-write verification stays
// in one place (src/ingestion/run-all.ts). This function adds the
// refresh-lists-specific tail: a post-refresh sanctions_status read
// and an optional ALERT_WEBHOOK_URL fanout on write failure.

import type { Config } from '@netlify/functions';
import { runIngestionAll } from '../../src/ingestion/run-all.js';

const LABEL = 'refresh-lists';

export default async (): Promise<Response> => {
  const result = await runIngestionAll(LABEL);

  // Call sanctions_status to confirm storage state from the read path.
  const baseUrl =
    process.env['URL'] ??
    process.env['DEPLOY_PRIME_URL'] ??
    'https://hawkeye-sterling.netlify.app';
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
        const status = await res.json() as Record<string, unknown>;
        console.log(`[${LABEL}] sanctions_status after refresh: ${JSON.stringify(status)}`);
      } else {
        console.warn(`[${LABEL}] sanctions_status returned HTTP ${res.status}`);
      }
    } finally {
      clearTimeout(t);
    }
  } catch (err) {
    console.warn(`[${LABEL}] sanctions_status call failed (non-critical):`, err instanceof Error ? err.message : err);
  }

  // Fire alert webhook on write failure so on-call is notified immediately.
  if (result.anyWriteFailed && process.env['ALERT_WEBHOOK_URL']) {
    try {
      await fetch(process.env['ALERT_WEBHOOK_URL'], {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `[Hawkeye Sterling] ${LABEL} WRITE FAILED — ${result.failed_count} adapter(s) at ${result.at}. Screening is degraded until next successful run.`,
          summary: result.summary,
        }),
      });
    } catch (webhookErr) {
      console.warn(`[${LABEL}] alert webhook failed (non-critical):`, webhookErr instanceof Error ? webhookErr.message : webhookErr);
    }
  }

  const statusCode = result.anyWriteFailed ? 500 : 200;
  return new Response(
    JSON.stringify({ at: result.at, summary: result.summary, anyWriteFailed: result.anyWriteFailed }),
    { status: statusCode, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } },
  );
};

export const config: Config = { schedule: '0 3 * * *' };
