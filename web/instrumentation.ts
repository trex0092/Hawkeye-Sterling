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
  // ENV-002 (forensic audit batch 3): cron-protecting tokens were absent
  // from startup validation. Production routes return 503 on missing token
  // — that's correct fail-closed behaviour, but ops had no surface signal
  // until the first scheduled invocation attempted and the alert pipeline
  // (paradoxically, dependent on these same tokens) failed. Add them at
  // 16 chars to match the existing ADMIN_TOKEN floor and the timing-safe
  // comparison key length used in route handlers.
  { key: "ONGOING_RUN_TOKEN", minLen: 16, genCmd: "openssl rand -hex 32" },
  { key: "SANCTIONS_CRON_TOKEN", minLen: 16, genCmd: "openssl rand -hex 32" },
  { key: "CRON_SECRET", minLen: 16, genCmd: "openssl rand -hex 32" },
  // ANTHROPIC_API_KEY: required for all AI routes; egress gate fail-closes without it.
  // Listed last because its absence degrades AI features, not auth/audit integrity.
  { key: "ANTHROPIC_API_KEY", minLen: 20, genCmd: "obtain from https://console.anthropic.com/settings/keys" },
];

// Required public env vars — not secrets, but routes break without them.
const REQUIRED_PUBLIC_VARS: Array<{ key: string; hint: string }> = [
  {
    key: "NEXT_PUBLIC_APP_URL",
    hint: "Set to the canonical deployment URL (e.g. https://hawkeye-sterling.netlify.app). " +
      "Missing causes self-referential fetch() calls and CORS allowlist to fall back to the hardcoded default.",
  },
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
  for (const { key, hint } of REQUIRED_PUBLIC_VARS) {
    if (!process.env[key]) {
      console.warn(`[startup] ${key} is not set. ${hint}`);
    }
  }

  // AuditLedger persistence warning. The in-process AuditLedger is in-memory
  // only — entries are lost on Lambda cold-start. A persistent audit store
  // (Netlify Blobs 10-year or S3-equivalent) is required for FATF R.11 / UAE
  // FDL 10/2025 Art.22 5-year retention. See HIGH-1 in SECURITY-NOTES.md.
  if (isProduction) {
    const hasAuditStorage =
      Boolean(process.env['AUDIT_BLOBS_STORE']) ||
      Boolean(process.env['AUDIT_S3_BUCKET']) ||
      Boolean(process.env['NETLIFY_BLOBS_TOKEN'] ?? process.env['NETLIFY_API_TOKEN']);
    if (!hasAuditStorage) {
      console.error(
        '[startup] AuditLedger has no confirmed durable storage binding. ' +
        'In-process ledger entries are lost on Lambda cold-start. ' +
        'Configure NETLIFY_BLOBS_TOKEN or an equivalent to satisfy FATF R.11 5-year retention.',
      );
    }
  }

  // Production warnings for important-but-not-fatal missing vars.
  if (isProduction) {
    if (!process.env['RATE_LIMIT_STRICT'] || process.env['RATE_LIMIT_STRICT'] !== 'true') {
      console.warn('[startup] RATE_LIMIT_STRICT is not set to "true" — rate limiting uses soft Blobs fallback in production. Set RATE_LIMIT_STRICT=true for fail-closed rate limiting.');
    }
    if (!process.env['EGRESS_GATE_ENABLED'] || process.env['EGRESS_GATE_ENABLED'] !== 'true') {
      console.warn('[startup] EGRESS_GATE_ENABLED is not set to "true" — tipping-off egress gate is DISABLED. SAR/STR narratives are not checked for tipping-off language. Set EGRESS_GATE_ENABLED=true in production.');
    }

    // ENV-010: Egress gate cross-check. If gate IS active (default), it
    // depends on ANTHROPIC_API_KEY — without the key every SAR/STR narrative
    // gets "held_review" and humans must approve manually. That's correct
    // fail-closed, but ops should see it at startup, not on every SAR.
    const gateDisabled = process.env['EGRESS_GATE_DISABLED'] === 'true';
    if (!gateDisabled && !process.env['ANTHROPIC_API_KEY']) {
      console.error(
        '[startup] CRITICAL: Egress gate is ACTIVE (FDL 10/2025 Art.17 tipping-off checks) but ANTHROPIC_API_KEY is missing. ' +
        'Every SAR/STR will return held_review until the key is set or EGRESS_GATE_DISABLED=true is acknowledged.',
      );
    }

    // ENV-003: Upstash Redis is used for fail-closed rate limiting in
    // production. If either URL or token is malformed (typo, partial paste)
    // every limiter call silently degrades to the Blobs soft path — a
    // burst can multiply effective limit by parallel request count.
    const redisUrl = process.env['UPSTASH_REDIS_REST_URL'];
    const redisToken = process.env['UPSTASH_REDIS_REST_TOKEN'];
    if (redisUrl || redisToken) {
      const urlOk = redisUrl && /^https:\/\/[a-z0-9-]+\.[a-z0-9.-]+\/?$/i.test(redisUrl);
      const tokenOk = redisToken && redisToken.length >= 32;
      if (!urlOk) {
        console.error(
          '[startup] UPSTASH_REDIS_REST_URL is set but does not look like a valid https://*.upstash.io URL. ' +
          'Rate limiting will silently degrade to the Blobs soft path.',
        );
      }
      if (!tokenOk) {
        console.error(
          '[startup] UPSTASH_REDIS_REST_TOKEN is set but is too short (need >= 32 chars). ' +
          'Rate limiting will silently degrade to the Blobs soft path.',
        );
      }
    }
  }

  // goAML entity IDs: warn if still using placeholder value.
  const goamlId =
    process.env['GOAML_RENTITY_ID'] ??
    (process.env['HAWKEYE_ENTITIES']
      ? (() => {
          try {
            const arr = JSON.parse(process.env['HAWKEYE_ENTITIES']!) as Array<{ goamlRentityId?: string }>;
            return Array.isArray(arr) ? arr.map((e) => e.goamlRentityId).join(',') : '';
          } catch { return ''; }
        })()
      : '');
  if (isProduction && (!goamlId || goamlId.includes('REPLACE_ME') || goamlId.includes('PENDING_FIU'))) {
    console.error(
      '[startup] goAML entity ID is missing or still set to a placeholder. ' +
      'Set HAWKEYE_ENTITIES (or legacy GOAML_RENTITY_ID) to the FIU-assigned entity ID ' +
      'before submitting any live STR/SAR filings via goAML.',
    );
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
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore – optional peer dep, caught below
      const { NodeSDK } = await import('@opentelemetry/sdk-node').catch(() => ({ NodeSDK: null }));
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore – optional peer dep, caught below
      const { getNodeAutoInstrumentations } = await import('@opentelemetry/auto-instrumentations-node').catch(() => ({ getNodeAutoInstrumentations: () => [] }));
      const { Resource } = await import('@opentelemetry/resources').catch(() => ({ Resource: null }));
      const { SEMRESATTRS_SERVICE_NAME, SEMRESATTRS_SERVICE_VERSION } = await import('@opentelemetry/semantic-conventions').catch(() => ({ SEMRESATTRS_SERVICE_NAME: 'service.name', SEMRESATTRS_SERVICE_VERSION: 'service.version' }));

      if (NodeSDK && Resource) {
        // Wire OTLP HTTP exporter when OTEL_EXPORTER_OTLP_ENDPOINT is set.
        // Lazy import keeps the package optional — deploy without it and the
        // SDK still starts; add the env var + package to enable export.
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore – optional peer dep, caught below
        const { OTLPTraceExporter } = await import('@opentelemetry/exporter-trace-otlp-http')
          .catch(() => ({ OTLPTraceExporter: null }));

        function parseOtelHeaders(raw: string): Record<string, string> {
          if (!raw) return {};
          return Object.fromEntries(
            raw.split(',')
              .map((h) => h.split('=') as [string, string])
              .filter(([k]) => k && k.trim()),
          );
        }

        const spanExporter = OTLPTraceExporter && process.env.OTEL_EXPORTER_OTLP_ENDPOINT
          ? new OTLPTraceExporter({
              url: `${process.env.OTEL_EXPORTER_OTLP_ENDPOINT.replace(/\/$/, '')}/v1/traces`,
              headers: parseOtelHeaders(process.env.OTEL_EXPORTER_OTLP_HEADERS ?? ''),
            })
          : undefined;

        const sdk = new NodeSDK({
          resource: new Resource({
            [SEMRESATTRS_SERVICE_NAME]: 'hawkeye-sterling',
            [SEMRESATTRS_SERVICE_VERSION]: '3.0.0',
            'deployment.environment': process.env.NODE_ENV ?? 'development',
          }),
          ...(spanExporter ? { traceExporter: spanExporter } : {}),
          instrumentations: typeof getNodeAutoInstrumentations === 'function' ? getNodeAutoInstrumentations({
            '@opentelemetry/instrumentation-fs': { enabled: false },
          }) : [],
        });
        sdk.start();
        const exporterInfo = spanExporter
          ? `(OTLP → ${process.env.OTEL_EXPORTER_OTLP_ENDPOINT})`
          : '(no exporter — set OTEL_EXPORTER_OTLP_ENDPOINT to export traces)';
        console.info(`[hawkeye] OpenTelemetry SDK started ${exporterInfo}`);

        // Graceful shutdown
        process.on('SIGTERM', () => {
          sdk.shutdown().then(() => {
            console.info('[hawkeye] OpenTelemetry SDK shut down');
          }).catch((err: unknown) => {
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
