// Hawkeye Sterling — warm-pool keep-alive (audit follow-up #37).
//
// Scheduled every 4 minutes (well inside the AWS Lambda ~15-minute idle
// reclamation window). Performs cheap GET pings against hot-path API
// routes so each backing Lambda container stays initialised. The
// screening hot path (POST /api/quick-screen, POST /api/agent/screen)
// has Anthropic-bound latency; cold-start TS module init on top can
// add 600-900ms — this function reduces p95 to sub-300ms.
//
// Charter P9: pings are HEAD where supported, otherwise lightweight
// GET. They never mutate state and never carry subject PII.

import type { Config } from '@netlify/functions';

const RUN_LABEL = 'warm-pool';
const TIMEOUT_MS = 4_000;

// Hot-path routes whose Lambda containers we keep warm.
const KEEPALIVE_ROUTES: ReadonlyArray<{ path: string; method: 'GET' | 'HEAD' }> = [
  { path: '/api/health', method: 'GET' },
  { path: '/api/agent/screen', method: 'HEAD' },
  { path: '/api/agent/stream-screen', method: 'HEAD' },
  { path: '/api/agent/batch-screen', method: 'HEAD' },
  { path: '/api/quick-screen', method: 'HEAD' },
];

async function pingWithTimeout(url: string, method: 'GET' | 'HEAD'): Promise<{ ok: boolean; status?: number; durationMs: number; error?: string }> {
  const startedAt = Date.now();
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { method, signal: ctrl.signal, headers: { 'x-warm-pool': '1' } });
    return { ok: res.status < 500, status: res.status, durationMs: Date.now() - startedAt };
  } catch (err) {
    return { ok: false, durationMs: Date.now() - startedAt, error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(t);
  }
}

export default async function handler(req: Request): Promise<Response> {
  const startedAt = Date.now();
  const origin = process.env['URL'] ?? process.env['DEPLOY_PRIME_URL'] ?? new URL(req.url).origin;
  const results = await Promise.all(
    KEEPALIVE_ROUTES.map((r) => pingWithTimeout(`${origin}${r.path}`, r.method).then((o) => ({ route: r.path, ...o }))),
  );

  return new Response(
    JSON.stringify({
      label: RUN_LABEL,
      origin,
      results,
      durationMs: Date.now() - startedAt,
    }, null, 2),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

export const config: Config = {
  // Every 4 minutes — inside the ~15-minute Lambda idle reclamation window.
  schedule: '*/4 * * * *',
};
