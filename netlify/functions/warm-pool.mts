// Hawkeye Sterling — warm-pool keep-alive (audit follow-up #37).
//
// Scheduled every 4 minutes (well inside the AWS Lambda ~15-minute idle
// reclamation window). Two warming strategies, both attempted every tick:
//
//   1. HTTP pings against hot-path API routes. May fail on Netlify when
//      a Lambda fetches its own public origin (TLS-handshake failure
//      observed historically), but kept here because (a) where it works
//      it's the only thing that warms the Next.js function lambda and
//      (b) failures are caught and reported, never silent.
//
//   2. In-process module touches. Imports the compiled brain hot-path
//      modules (quick-screen, redlines, adverse-media) and invokes the
//      cheapest deterministic function each exposes. This warms the
//      *Netlify function* Lambda — separate from the Next.js Lambda —
//      and exercises module-level initialisation (v8 code cache).
//
// Charter P9: pings carry no subject PII. The in-process touches use
// the literal "__warm__" sentinel so any leaked audit entries are
// trivially identifiable as warming traffic, not real screening input.

import type { Config } from '@netlify/functions';

const RUN_LABEL = 'warm-pool';
const PING_TIMEOUT_MS = 4_000;

// Use GET (not HEAD) — Next.js route handlers explicitly export GET/POST,
// HEAD is auto-derived but several handlers in this repo gate on `req.method`
// equality and return 405 for HEAD even when the underlying logic is read-only.
const KEEPALIVE_ROUTES: ReadonlyArray<{ path: string; method: 'GET' }> = [
  { path: '/api/status', method: 'GET' },
];

async function pingWithTimeout(
  url: string,
  method: 'GET',
): Promise<{ ok: boolean; status?: number; durationMs: number; error?: string }> {
  const startedAt = Date.now();
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), PING_TIMEOUT_MS);
  try {
    const res = await fetch(url, { method, signal: ctrl.signal, headers: { 'x-warm-pool': '1' } });
    return { ok: res.status < 500, status: res.status, durationMs: Date.now() - startedAt };
  } catch (err) {
    return {
      ok: false,
      durationMs: Date.now() - startedAt,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(t);
  }
}

interface InProcessTouch {
  task: string;
  ok: boolean;
  durationMs: number;
  error?: string;
}

async function touchBrainModules(): Promise<InProcessTouch[]> {
  // The `as string` cast on each dynamic import path defeats Next/Netlify
  // bundler static analysis so the modules are loaded from the bundled
  // dist/ tree at runtime instead of inlined at build time. Same pattern
  // /api/sanctions/watch/route.ts uses for the ingestion barrel.
  const tasks: ReadonlyArray<{ task: string; run: () => Promise<unknown> }> = [
    {
      task: 'brain:quick-screen',
      run: async () => {
        const m = await import('../../dist/src/brain/quick-screen.js' as string) as {
          quickScreen?: (subject: { name: string }, candidates: unknown[]) => unknown;
        };
        return m.quickScreen?.({ name: '__warm__' }, []) ?? null;
      },
    },
    {
      task: 'brain:redlines',
      run: async () => {
        const m = await import('../../dist/src/brain/redlines.js' as string) as {
          evaluateRedlines?: (firedIds: string[]) => unknown;
        };
        return m.evaluateRedlines?.([]) ?? null;
      },
    },
    {
      task: 'brain:adverse-media',
      run: async () => {
        const m = await import('../../dist/src/brain/adverse-media.js' as string) as {
          classifyAdverseMedia?: (text: string) => unknown;
        };
        return m.classifyAdverseMedia?.('') ?? null;
      },
    },
  ];

  const out: InProcessTouch[] = [];
  for (const t of tasks) {
    const started = Date.now();
    try {
      await t.run();
      out.push({ task: t.task, ok: true, durationMs: Date.now() - started });
    } catch (err) {
      out.push({
        task: t.task,
        ok: false,
        durationMs: Date.now() - started,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return out;
}

export default async function handler(req: Request): Promise<Response> {
  const startedAt = Date.now();
  const origin = process.env['URL'] ?? process.env['DEPLOY_PRIME_URL'] ?? new URL(req.url).origin;

  const [httpResults, moduleResults] = await Promise.all([
    Promise.all(
      KEEPALIVE_ROUTES.map((r) =>
        pingWithTimeout(`${origin}${r.path}`, r.method).then((o) => ({ route: r.path, ...o })),
      ),
    ),
    touchBrainModules(),
  ]);

  return new Response(
    JSON.stringify(
      {
        label: RUN_LABEL,
        origin,
        httpPings: httpResults,
        moduleTouches: moduleResults,
        durationMs: Date.now() - startedAt,
      },
      null,
      2,
    ),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

export const config: Config = {
  // Every 4 minutes — inside the ~15-minute Lambda idle reclamation window.
  schedule: '*/4 * * * *',
};
