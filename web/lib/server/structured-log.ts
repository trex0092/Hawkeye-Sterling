// Hawkeye-Sterling - structured JSON logger.
//
// Implements RULE 4 / OBSERVABILITY-STANDARDS.md section 2: every log
// line carries level, module, requestId, operation, outcome,
// timestamp. Output is a single JSON object per line so Netlify log
// aggregators + downstream tooling can parse without regex.
//
// This module is intentionally tiny - no log levels filtering, no
// transports, no batching. Console is the only sink (Netlify
// captures stdout). Adoption is gradual: new code uses log(); legacy
// console.warn() lines are migrated as they are touched.

export type LogLevel = 'error' | 'warn' | 'log';
export type LogOutcome = 'ok' | 'fail' | 'skip' | 'refused' | 'degraded';

export interface LogFields {
  /**
   * Module / subsystem identifier (e.g. "audit/sign", "ingestion/refresh").
   * Keep stable so operators can grep across deploys.
   */
  module: string;
  /**
   * Short verb describing the action (e.g. "verify-chain", "put-dataset").
   */
  operation: string;
  /**
   * Result of the action. `ok` = success, `fail` = error, `skip` =
   * deliberately not run (e.g. cron lock held), `refused` = security
   * or integrity guard fired, `degraded` = succeeded with reduced fidelity.
   */
  outcome: LogOutcome;
  /**
   * Request id from middleware. Optional only because some call sites
   * run outside a request context (scheduled functions, module load).
   */
  requestId?: string;
  /**
   * Additional structured fields keyed by name. Avoid PII; SHA-hash
   * usernames or other identifiers before adding them here.
   */
  extras?: Record<string, unknown>;
}

interface LogRecord {
  level: LogLevel;
  ts: string;
  module: string;
  operation: string;
  outcome: LogOutcome;
  requestId?: string;
  [k: string]: unknown;
}

function emit(level: LogLevel, fields: LogFields): void {
  const record: LogRecord = {
    level,
    ts: new Date().toISOString(),
    module: fields.module,
    operation: fields.operation,
    outcome: fields.outcome,
    ...(fields.requestId ? { requestId: fields.requestId } : {}),
    ...(fields.extras ?? {}),
  };
  const json = JSON.stringify(record);
  if (level === 'error') {
    console.error(json);
  } else if (level === 'warn') {
    console.warn(json);
  } else {
    console.info(json);
  }
}

export function logError(fields: LogFields): void {
  emit('error', fields);
}

export function logWarn(fields: LogFields): void {
  emit('warn', fields);
}

export function logInfo(fields: LogFields): void {
  emit('log', fields);
}

/**
 * Convenience wrapper: log a caught Error with its message and stack.
 *   logErrorFromException({ module, operation, requestId }, err);
 */
export function logErrorFromException(
  fields: Omit<LogFields, 'outcome'>,
  err: unknown,
): void {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  emit('error', {
    module: fields.module,
    operation: fields.operation,
    outcome: 'fail',
    requestId: fields.requestId,
    extras: {
      ...(fields.extras ?? {}),
      errorMessage: message,
      ...(stack ? { stack } : {}),
    },
  });
}
