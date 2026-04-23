// Hawkeye Sterling — v1 API guard.
//
// Composable wrapper that applies auth → rate-limit → tenant resolve → audit
// log before a handler runs. Handlers receive a typed RequestContext so they
// never hand-roll this logic. All v1 route handlers must go through withGuard.
//
//   export const POST = withGuard(async (req, ctx) => { ... });
//
// Error envelope on denial: { code, message, traceId }.

import { resolveApiKey } from "./api-keys.js";
import type { ApiKeyRecord } from "./api-keys.js";
import { checkRateLimit, rateLimitHeaders } from "./rate-limit.js";

export interface RequestContext {
  readonly apiKey: ApiKeyRecord;
  readonly tenantId: string;
  readonly traceId: string;
  readonly receivedAt: Date;
}

export interface ErrorEnvelope {
  readonly code: string;
  readonly message: string;
  readonly traceId: string;
}

type Handler = (req: Request, ctx: RequestContext) => Promise<Response> | Response;

function newTraceId(): string {
  // 16 hex chars — compact + grep-friendly in audit logs. Not cryptographically
  // strong; use a dedicated trace header in production.
  const bytes = new Uint8Array(8);
  for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function jsonError(
  status: number,
  envelope: ErrorEnvelope,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(envelope), {
    status,
    headers: {
      "content-type": "application/json",
      "x-trace-id": envelope.traceId,
      ...headers,
    },
  });
}

export function withGuard(handler: Handler): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    const traceId = req.headers.get("x-trace-id") ?? newTraceId();
    const receivedAt = new Date();

    // Authn
    const apiKey = resolveApiKey(req);
    if (!apiKey) {
      return jsonError(401, {
        code: "unauthorized",
        message:
          "Missing or unknown API key. Supply X-Api-Key header or Authorization: Bearer.",
        traceId,
      });
    }

    // Rate-limit
    const rl = checkRateLimit(apiKey);
    const rlHeaders = rateLimitHeaders(rl);
    if (!rl.allowed) {
      return jsonError(
        429,
        {
          code:
            rl.monthlyRemaining === 0
              ? "quota_exceeded"
              : "rate_limited",
          message:
            rl.monthlyRemaining === 0
              ? `Monthly quota (${rl.monthlyLimit}) exhausted. Resets at ${rl.monthlyResetAtSec}.`
              : `Rate limit ${rl.limitPerMinute}/min hit. Retry in ${rl.retryAfterSec}s.`,
          traceId,
        },
        rlHeaders,
      );
    }

    const ctx: RequestContext = {
      apiKey,
      tenantId: apiKey.tenantId,
      traceId,
      receivedAt,
    };

    // Audit
    auditAccess({
      traceId,
      tenantId: ctx.tenantId,
      apiKeyPrefix: apiKey.key.slice(0, 10),
      method: req.method,
      path: new URL(req.url).pathname,
      at: receivedAt.toISOString(),
    });

    try {
      const res = await handler(req, ctx);
      // Stamp rate-limit + trace headers on the outgoing response.
      const merged = new Headers(res.headers);
      for (const [k, v] of Object.entries(rlHeaders)) merged.set(k, v);
      merged.set("x-trace-id", traceId);
      return new Response(res.body, {
        status: res.status,
        statusText: res.statusText,
        headers: merged,
      });
    } catch (err) {
      return jsonError(
        500,
        {
          code: "internal_error",
          message: err instanceof Error ? err.message : "handler failed",
          traceId,
        },
        rlHeaders,
      );
    }
  };
}

/** Minimal audit hook. Default appends to an in-process ring buffer so it's
 *  accessible from /api/v1/audit/... routes during a single deploy. Production
 *  wires this to the existing audit-chain via setAuditSink. */
export interface AuditRecord {
  traceId: string;
  tenantId: string;
  apiKeyPrefix: string;
  method: string;
  path: string;
  at: string;
}

type AuditSink = (record: AuditRecord) => void;

const RING_CAPACITY = 1_000;
const RING: AuditRecord[] = [];
let SINK: AuditSink = (record) => {
  RING.push(record);
  if (RING.length > RING_CAPACITY) RING.shift();
};

export function setAuditSink(fn: AuditSink): void {
  SINK = fn;
}

export function recentAudit(): ReadonlyArray<AuditRecord> {
  return RING.slice();
}

function auditAccess(record: AuditRecord): void {
  try {
    SINK(record);
  } catch {
    /* audit failures must never break the request path */
  }
}
