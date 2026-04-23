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

// Whether the API key registry is populated. Used to decide whether to enforce
// auth on UI-facing routes: if no keys are configured the app is running in
// demo/dev mode and we pass requests through without a key requirement.
function apiKeysConfigured(): boolean {
  const raw = process.env["HAWKEYE_API_KEYS"];
  return Boolean(raw && raw.trim() && raw.trim() !== "[]");
}

// Sanitize a caller-supplied trace ID so it can be safely echoed in headers
// and log lines: strip everything outside printable ASCII 0x20-0x7E and cap length.
function sanitizeTraceId(raw: string): string {
  return raw.replace(/[^\x20-\x7E]/g, "").slice(0, 64);
}

export function withGuard(handler: Handler): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    const rawTrace = req.headers.get("x-trace-id");
    const traceId = rawTrace ? sanitizeTraceId(rawTrace) || newTraceId() : newTraceId();
    const receivedAt = new Date();

    // Authn — skip when no API keys are configured (demo / local-dev mode).
    // In production, HAWKEYE_API_KEYS must be set or every call is rejected.
    if (apiKeysConfigured()) {
      const apiKey = resolveApiKey(req);
      if (!apiKey) {
        return jsonError(401, {
          code: "unauthorized",
          message:
            "Missing or unknown API key. Supply X-Api-Key header or Authorization: Bearer.",
          traceId,
        });
      }
    }

    // Re-resolve for the context — null in demo mode (no keys configured).
    const apiKey = resolveApiKey(req);

    // Rate-limit — skip when no key is present (demo mode).
    const rl = apiKey ? checkRateLimit(apiKey) : null;
    const rlHeaders = rl ? rateLimitHeaders(rl) : {};
    if (rl && !rl.allowed) {
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

    const demoKey: ApiKeyRecord = {
      key: "demo",
      tenantId: "demo",
      tier: "free",
      monthlyQuota: Number.POSITIVE_INFINITY,
      issuedAt: receivedAt.toISOString(),
    };
    const ctx: RequestContext = {
      apiKey: apiKey ?? demoKey,
      tenantId: apiKey?.tenantId ?? "demo",
      traceId,
      receivedAt,
    };

    // Audit
    auditAccess({
      traceId,
      tenantId: ctx.tenantId,
      apiKeyPrefix: ctx.apiKey.key.slice(0, 10),
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

// Fixed-capacity ring buffer with O(1) insert via index wraparound.
const RING_CAPACITY = 1_000;
const RING: AuditRecord[] = new Array<AuditRecord>(RING_CAPACITY);
let RING_HEAD = 0;
let RING_SIZE = 0;
let SINK: AuditSink = (record) => {
  RING[RING_HEAD % RING_CAPACITY] = record;
  RING_HEAD++;
  if (RING_SIZE < RING_CAPACITY) RING_SIZE++;
};

export function setAuditSink(fn: AuditSink): void {
  SINK = fn;
}

export function recentAudit(): ReadonlyArray<AuditRecord> {
  if (RING_SIZE < RING_CAPACITY) return RING.slice(0, RING_SIZE);
  // Return entries in chronological order, starting from the oldest slot.
  const start = RING_HEAD % RING_CAPACITY;
  return [...RING.slice(start, RING_CAPACITY), ...RING.slice(0, start)].filter(Boolean);
}

function auditAccess(record: AuditRecord): void {
  try {
    SINK(record);
  } catch {
    /* audit failures must never break the request path */
  }
}
