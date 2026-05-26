// Hawkeye Sterling — safe OTel tracer wrapper for server libs.
//
// Wraps @opentelemetry/api so every compliance boundary can add spans
// without crashing when OTel is not configured. The no-op tracer (returned
// when OTel is absent or the package is not installed) has identical
// semantics — span.end() is a no-op, attribute writes are discarded.
//
// Usage (zero-overhead when OTel absent):
//   import { trace, startSpan } from '@/lib/server/tracer';
//   const span = startSpan('audit-chain.write', { 'aml.tenant': tenantId });
//   try { ... } finally { span.end(); }

let _api: typeof import('@opentelemetry/api') | null = null;
try {
  // Synchronous require — safe in Node.js server context.
  // Wraps in try/catch so the module loads even when the OTel package is absent.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  _api = require('@opentelemetry/api');
} catch {
  // OTel not installed — all spans will be no-ops.
}

const TRACER_NAME = 'hawkeye-sterling';
const TRACER_VERSION = '3.0.0';

interface NoOpSpan {
  setAttribute(_key: string, _value: string | number | boolean): void;
  setStatus(_status: { code: number }): void;
  recordException(_err: Error): void;
  end(): void;
}

const NO_OP_SPAN: NoOpSpan = {
  setAttribute: (_key: string, _value: string | number | boolean) => {},
  setStatus: (_status: { code: number }) => {},
  recordException: (_err: Error) => {},
  end: () => {},
};

function getTracer() {
  if (!_api) return null;
  try {
    return _api.trace.getTracer(TRACER_NAME, TRACER_VERSION);
  } catch {
    return null;
  }
}

export type AmlSpan = NoOpSpan;

/** Start a named span with optional string attributes. Returns a span that is
 *  always safe to call .end() on — falls back to a no-op span when OTel is
 *  absent or throws. Caller MUST call span.end() (in a finally block). */
export function startSpan(
  name: string,
  attributes?: Record<string, string | number | boolean>,
): AmlSpan {
  const tracer = getTracer();
  if (!tracer) return NO_OP_SPAN;
  try {
    const span = tracer.startSpan(name);
    if (attributes) {
      for (const [k, v] of Object.entries(attributes)) {
        span.setAttribute(k, v);
      }
    }
    return span as unknown as AmlSpan;
  } catch {
    return NO_OP_SPAN;
  }
}

/** SpanStatus codes — mirrors @opentelemetry/api SpanStatusCode without the import. */
export const SpanStatus = { OK: 1, ERROR: 2 } as const;
