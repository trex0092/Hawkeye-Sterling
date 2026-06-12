// Hawkeye Sterling — scheduled refresh trigger (daily 03:00 UTC).
//
// Netlify SCHEDULED functions are hard-capped at ~30 s wall time, which is
// why the in-process pipeline historically ran with the 20 s per-adapter
// leash — and why the slow government endpoints (au_dfat XLSX, ch_seco
// SESAM, intermittently eu_fsf) timed out on every scheduled tick.
// Background functions get a 15-minute budget but cannot carry a schedule
// themselves (a `schedule` config on a `-background` function deploys but
// never fires). So the nightly refresh is split:
//
//   1. THIS function keeps the 03:00 UTC cron and delegates by POSTing to
//      /.netlify/functions/refresh-lists-background, which acks 202
//      immediately and runs the full pipeline with the 60 s per-adapter
//      leash (BACKGROUND_ADAPTER_TIMEOUT_MS) — the daily full-budget pass
//      that lets au_dfat / ch_seco / eu_fsf actually finish.
//   2. If the delegation POST fails — Lambda-to-own-origin fetches have
//      historically hit TLS-handshake failures on this platform (see
//      run-all.ts / warm-pool.mts) — it falls back to running the pipeline
//      in-process with the 20 s leash, i.e. exactly the pre-split behaviour,
//      so the nightly refresh can degrade but never silently disappear.
//
// Double-run safety: the pipeline's 10-minute blob lock (refresh-lists/lock)
// means that if the worker did receive a delegation the trigger mistakenly
// judged failed, the in-process fallback sees the lock and skips.
//
// The shared pipeline (snapshot/diff/designation alerts/meta/heartbeat)
// lives in netlify/lib/refresh-lists-core.ts.

import type { Config } from '@netlify/functions';
import { runRefreshListsPipeline, isAuthorizedRefreshRequest } from '../lib/refresh-lists-core.js';

const LABEL = 'refresh-lists';

// Matches the scheduled-function default in src/ingestion/run-all.ts —
// the fallback runs inside THIS function's ~30 s budget, so the leash must
// leave room for the lock/snapshot/diff/status tail around the fan-out.
// Deliberately NO heavyAdapterTimeoutMs: the heavy adapters (au_dfat /
// ch_seco / jp_mof — see HEAVY_ADAPTER_IDS) cannot fit au_dfat's 40 s
// download + event-loop-blocking parse in this budget, so the fallback
// skips them silently; the background worker is their guaranteed path.
const FALLBACK_ADAPTER_TIMEOUT_MS = 20_000;

// Delegation ack budget. Background functions return 202 before doing any
// work, so anything beyond a few seconds means the self-fetch path is
// broken (TLS handshake failure) and we should fall back in-process.
const DELEGATE_ACK_TIMEOUT_MS = 5_000;

async function delegateToBackgroundWorker(): Promise<{ ok: boolean; detail: string }> {
  const baseUrl =
    process.env['URL'] ??
    process.env['DEPLOY_PRIME_URL'] ??
    'https://hawkeye-sterling.netlify.app';
  const workerUrl = `${baseUrl}/.netlify/functions/refresh-lists-background`;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), DELEGATE_ACK_TIMEOUT_MS);
  try {
    const res = await fetch(workerUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Forward the scheduler trust signal so the worker's auth gate
        // (isAuthorizedRefreshRequest) accepts the hop. Same accepted
        // posture as the rest of the scheduled ingestion fleet: forging
        // this header only triggers an idempotent, lock-protected refresh.
        'x-netlify-scheduled-function': 'true',
        ...(process.env['ADMIN_TOKEN'] ? { authorization: `Bearer ${process.env['ADMIN_TOKEN']}` } : {}),
      },
      body: JSON.stringify({ triggeredBy: LABEL, at: new Date().toISOString() }),
      signal: ctl.signal,
    });
    // Netlify acks background invocations with 202. Treat any 2xx as a
    // successful hand-off (a 200 would mean the worker ran synchronously,
    // e.g. under `netlify dev` emulation — still a success).
    if (res.ok) {
      return { ok: true, detail: `worker acked HTTP ${res.status}` };
    }
    return { ok: false, detail: `worker returned HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(t);
  }
}

export default async (req: Request): Promise<Response> => {
  // Auth guard — only the Netlify scheduler (x-nf-event header) or callers
  // with ADMIN_TOKEN are permitted. Prevents unauthenticated manual HTTP
  // triggers from acquiring the idempotency lock and blocking scheduled runs.
  // (Header details + accepted trust posture: see isAuthorizedRefreshRequest
  // in netlify/lib/refresh-lists-core.ts.)
  if (!isAuthorizedRefreshRequest(req)) {
    return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  // Preferred path: hand the run to the background worker (15-min budget,
  // 60 s per-adapter leash — the slow-list daily refresh).
  const delegated = await delegateToBackgroundWorker();
  if (delegated.ok) {
    console.info(`[${LABEL}] delegated nightly refresh to refresh-lists-background (${delegated.detail})`);
    return new Response(
      JSON.stringify({
        ok: true,
        delegated: true,
        worker: 'refresh-lists-background',
        detail: delegated.detail,
        at: new Date().toISOString(),
      }),
      { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } },
    );
  }

  // Fallback: run in-process with the scheduled-function leash. Heavy
  // adapters are skipped (no heavyAdapterTimeoutMs — they cannot fit this
  // ~30 s budget and skipping logs no errors); every light list still
  // refreshes and the heartbeat/meta still write.
  console.warn(
    `[${LABEL}] delegation to refresh-lists-background failed (${delegated.detail}) — ` +
    `running in-process with adapterTimeoutMs=${FALLBACK_ADAPTER_TIMEOUT_MS}`,
  );
  const { status, body } = await runRefreshListsPipeline({
    adapterTimeoutMs: FALLBACK_ADAPTER_TIMEOUT_MS,
    runLabel: LABEL,
  });
  return new Response(JSON.stringify({ ...body, delegated: false, delegationError: delegated.detail }), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
};

export const config: Config = { schedule: '0 3 * * *' };
