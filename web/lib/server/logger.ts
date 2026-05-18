// Structured request logger for API route handlers.
//
// Works in both Node.js Lambda and Edge runtimes (no Node-only APIs).
// No external dependencies.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LogEntry {
  level: "info" | "warn" | "error";
  route: string;
  requestId?: string;
  latencyMs?: number;
  status?: number;
  actor?: string;
  event?: string;
  detail?: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Redaction
// ---------------------------------------------------------------------------

const SENSITIVE_KEY_RE = /secret|token|key|password|auth/i;

function redactEntry(entry: LogEntry): LogEntry {
  const redacted: LogEntry = { level: entry.level, route: entry.route };

  for (const k of Object.keys(entry)) {
    const val = (entry as Record<string, unknown>)[k];
    if (SENSITIVE_KEY_RE.test(k)) {
      (redacted as Record<string, unknown>)[k] = "[REDACTED]";
    } else {
      (redacted as Record<string, unknown>)[k] = val;
    }
  }

  return redacted;
}

// ---------------------------------------------------------------------------
// Core log function
// ---------------------------------------------------------------------------

/**
 * Writes a structured JSON log line to console.
 * Format: [hawkeye] <level> <route> <event> <detail> latencyMs=N status=N
 */
export function log(entry: LogEntry): void {
  const safe = redactEntry(entry);

  // Build human-readable prefix for readability in CloudWatch / Netlify logs.
  const parts: string[] = [`[hawkeye]`, safe.level, safe.route];
  if (safe.event) parts.push(String(safe.event));
  if (safe.detail) parts.push(String(safe.detail));
  if (safe.latencyMs !== undefined) parts.push(`latencyMs=${safe.latencyMs}`);
  if (safe.status !== undefined) parts.push(`status=${safe.status}`);

  const jsonLine = JSON.stringify({ ...safe, _msg: parts.join(" ") });

  switch (safe.level) {
    case "warn":
      console.warn(jsonLine);
      break;
    case "error":
      console.error(jsonLine);
      break;
    default:
      console.info(jsonLine);
  }
}

// ---------------------------------------------------------------------------
// Convenience helpers
// ---------------------------------------------------------------------------

/**
 * Log a completed HTTP request.
 */
export function logRequest(
  route: string,
  requestId: string,
  status: number,
  latencyMs: number,
  extra?: Record<string, unknown>,
): void {
  const level: LogEntry["level"] =
    status >= 500 ? "error" : status >= 400 ? "warn" : "info";

  log({
    level,
    route,
    requestId,
    status,
    latencyMs,
    event: "request",
    ...extra,
  });
}

/**
 * Log an error (thrown exception or rejection) from a route handler.
 */
export function logError(
  route: string,
  err: unknown,
  extra?: Record<string, unknown>,
): void {
  const detail =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : "unknown error";

  const stack = err instanceof Error ? err.stack : undefined;

  log({
    level: "error",
    route,
    event: "unhandled_error",
    detail,
    ...(stack ? { stack } : {}),
    ...extra,
  });
}

/**
 * Log an audit event (user action with an actor).
 */
export function logAudit(
  route: string,
  event: string,
  actor: string,
  extra?: Record<string, unknown>,
): void {
  log({
    level: "info",
    route,
    event,
    actor,
    ...extra,
  });
}
