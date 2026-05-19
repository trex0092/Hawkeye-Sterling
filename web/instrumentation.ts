// AsyncLocalStorage.snapshot() was added in Node.js 22.3.0.
// Next.js 15.5 compiled runtimes (app-page, app-route) capture
//   let eV = globalThis.AsyncLocalStorage
// at module load time, then call eV.snapshot() on every request.
//
// Polyfill strategy (three layers):
//   1. scripts/patch-als.cjs patches node-environment-baseline.js at build time
//      so snapshot is set the moment globalThis.AsyncLocalStorage is assigned.
//   2. This file patches globalThis.AsyncLocalStorage directly on server startup
//      (before the first request), covering cases where the build patch missed.
//   3. BannerPlugin in next.config.mjs patches at the top of each webpack chunk.

function applySnapshotPolyfill(cls: unknown) {
  if (cls && typeof (cls as { snapshot?: unknown }).snapshot !== 'function') {
    (cls as { snapshot: unknown }).snapshot = function snapshot() {
      return function runSnapshot(fn: (...a: unknown[]) => unknown, ...rest: unknown[]) {
        return fn(...rest)
      }
    }
  }
}

if (process.env.NEXT_RUNTIME !== 'edge') {
  // Patch globalThis.AsyncLocalStorage directly — this is the same object
  // that app-page/app-route runtimes capture as `eV` / `tz`.
  applySnapshotPolyfill((globalThis as Record<string, unknown>).AsyncLocalStorage)

  // Also patch via both require() forms in case of separate module cache entries.
  try {
    applySnapshotPolyfill((require('async_hooks') as { AsyncLocalStorage: unknown }).AsyncLocalStorage)
  } catch { /* not available in this runtime */ }
  try {
    applySnapshotPolyfill((require('node:async_hooks') as { AsyncLocalStorage: unknown }).AsyncLocalStorage)
  } catch { /* not available in this runtime */ }
}

// ── Startup environment validation ──────────────────────────────────────────
// Validate required secrets at server startup so a misconfigured deploy
// surfaces immediately in logs rather than silently failing on first request.
// We WARN rather than throw — throwing here would crash the Lambda cold-start
// even in local dev where secrets are intentionally absent. Ops teams should
// monitor for these log lines and treat them as P0 deployment incidents.

const REQUIRED_SECRETS: Array<{ key: string; minLen: number; genCmd: string }> = [
  { key: "SESSION_SECRET", minLen: 32, genCmd: "openssl rand -hex 32" },
  { key: "JWT_SIGNING_SECRET", minLen: 24, genCmd: "openssl rand -base64 32" },
  { key: "AUDIT_CHAIN_SECRET", minLen: 32, genCmd: "openssl rand -hex 64" },
  { key: "ADMIN_TOKEN", minLen: 16, genCmd: "openssl rand -hex 32" },
];

function validateSecrets(): void {
  if (process.env.NEXT_RUNTIME === 'edge') return; // edge has limited env access
  const isProduction = process.env.NODE_ENV === 'production';
  for (const { key, minLen, genCmd } of REQUIRED_SECRETS) {
    const val = process.env[key];
    if (!val) {
      const msg = `[startup] MISSING required env var ${key}. Generate with: ${genCmd}`;
      if (isProduction) {
        console.error(msg);
      } else {
        console.warn(msg);
      }
    } else if (val.length < minLen) {
      console.error(
        `[startup] ${key} is too short (${val.length} chars, min ${minLen}). ` +
        `Generate a stronger value with: ${genCmd}`,
      );
    }
  }
}

export async function register() {
  // Re-apply after Next.js startup completes in case globalThis.AsyncLocalStorage
  // was set after module evaluation (defensive — should already be set by now).
  if (process.env.NEXT_RUNTIME !== 'edge') {
    applySnapshotPolyfill((globalThis as Record<string, unknown>).AsyncLocalStorage)
    validateSecrets();
  }

  // OpenTelemetry SDK setup — only in Node.js runtime, not edge
  if (process.env.NEXT_RUNTIME !== 'edge' && process.env.NODE_ENV !== 'test') {
    try {
      // Lazy imports to avoid bundling OTel in edge runtime
      const { NodeSDK } = await import('@opentelemetry/sdk-node').catch(() => ({ NodeSDK: null }));
      const { getNodeAutoInstrumentations } = await import('@opentelemetry/auto-instrumentations-node').catch(() => ({ getNodeAutoInstrumentations: () => [] }));
      const { Resource } = await import('@opentelemetry/resources').catch(() => ({ Resource: null }));
      const { SEMRESATTRS_SERVICE_NAME, SEMRESATTRS_SERVICE_VERSION } = await import('@opentelemetry/semantic-conventions').catch(() => ({ SEMRESATTRS_SERVICE_NAME: 'service.name', SEMRESATTRS_SERVICE_VERSION: 'service.version' }));

      if (NodeSDK && Resource) {
        const sdk = new NodeSDK({
          resource: new Resource({
            [SEMRESATTRS_SERVICE_NAME]: 'hawkeye-sterling',
            [SEMRESATTRS_SERVICE_VERSION]: '3.0.0',
            'deployment.environment': process.env.NODE_ENV ?? 'development',
          }),
          instrumentations: typeof getNodeAutoInstrumentations === 'function' ? getNodeAutoInstrumentations({
            '@opentelemetry/instrumentation-fs': { enabled: false },
          }) : [],
        });
        sdk.start();
        console.info('[hawkeye] OpenTelemetry SDK started');

        // Graceful shutdown
        process.on('SIGTERM', () => {
          sdk.shutdown().then(() => {
            console.info('[hawkeye] OpenTelemetry SDK shut down');
          }).catch((err) => {
            console.error('[hawkeye] OpenTelemetry shutdown error:', err);
          });
        });
      }
    } catch (err) {
      // OTel is optional — if packages are missing, continue without tracing
      console.warn('[hawkeye] OpenTelemetry not available:', err instanceof Error ? err.message : String(err));
    }
  }
}

// Tracer singleton for use in route handlers
// Usage: const span = getTracer().startSpan('operation-name');
export function getTracer() {
  try {
    const { trace } = require('@opentelemetry/api') as typeof import('@opentelemetry/api');
    return trace.getTracer('hawkeye-sterling', '3.0.0');
  } catch {
    // Return no-op tracer when OTel not available
    return {
      startSpan: () => ({
        end: () => {},
        setStatus: () => {},
        setAttributes: () => {},
        setAttribute: () => {},
      }),
      startActiveSpan: (_name: string, fn: (span: unknown) => unknown) => fn({ end: () => {}, setStatus: () => {}, setAttributes: () => {}, setAttribute: () => {} }),
    };
  }
}
