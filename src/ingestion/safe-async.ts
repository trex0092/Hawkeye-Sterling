// Hawkeye-Sterling — fire-and-forget safety net.
//
// Multiple call sites in the ingestion + scheduled-function path use
// `void someAsync()` to avoid blocking the request thread on a
// non-critical write (audit logs, structured-error persistence,
// alert webhooks). If those promises reject, the rejection is
// unhandled — Node's default behaviour is to log to stderr and (in
// strict-mode runtimes) crash the process.
//
// Netlify Lambdas don't crash but DO write the unhandled rejection
// to the function log as an opaque stack trace with no context
// about which fire-and-forget call site triggered it. This module
// gives those call sites a structured catch so the failure is
// attributable.
//
// Usage:
//   import { fireAndForget } from '../ingestion/safe-async.js';
//   fireAndForget('audit-log/entry', logAuditEvent(e));
//
// The label is logged on rejection so the operator can grep
// `[safe-async]` and see which call site failed.

export interface FireAndForgetOptions {
  /** Optional override for the structured logger. Defaults to console. */
  logger?: { error: (msg: string, meta?: Record<string, unknown>) => void };
  /** Suppress error logging. Use only when the rejection is genuinely fine. */
  silent?: boolean;
}

/**
 * Attach a structured-log catch to a fire-and-forget promise. Returns
 * void so callers can drop it inline.
 *
 *   fireAndForget('audit-log/entry', logAuditEvent(e));
 *
 * The label appears in every log line so call sites are attributable.
 * Errors are NEVER re-thrown — that would defeat the fire-and-forget
 * pattern. If the call site needs failure propagation, it should
 * await the promise directly.
 */
export function fireAndForget(
  label: string,
  promise: Promise<unknown>,
  opts: FireAndForgetOptions = {},
): void {
  const logger = opts.logger ?? console;
  promise.catch((err: unknown) => {
    if (opts.silent) return;
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    logger.error(`[safe-async] ${label} rejected: ${message}`, {
      label,
      message,
      ...(stack ? { stack } : {}),
      at: new Date().toISOString(),
    });
  });
}

/**
 * Install a single process-level handler for any unhandled rejection or
 * uncaught exception that slips past `fireAndForget()`. Designed to be
 * idempotent — safe to call from multiple module loads in the same
 * Lambda warm instance.
 */
let _installed = false;
export function installGlobalAsyncSafetyNet(): void {
  if (_installed) return;
  _installed = true;

  process.on('unhandledRejection', (reason: unknown) => {
    const message = reason instanceof Error ? reason.message : String(reason);
    const stack = reason instanceof Error ? reason.stack : undefined;
    console.error(`[safe-async] UNHANDLED_REJECTION: ${message}`, {
      message,
      ...(stack ? { stack } : {}),
      at: new Date().toISOString(),
    });
  });

  process.on('uncaughtException', (err: Error) => {
    console.error(`[safe-async] UNCAUGHT_EXCEPTION: ${err.message}`, {
      message: err.message,
      stack: err.stack,
      at: new Date().toISOString(),
    });
    // Do NOT exit the process. Netlify Lambdas survive a single
    // uncaught exception per invocation; crashing here would 5xx the
    // current request unnecessarily. The next request gets a fresh
    // call stack.
  });
}
