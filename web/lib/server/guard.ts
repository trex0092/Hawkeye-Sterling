// Hawkeye Sterling — v1 API guard.
//
// Composable wrapper that applies auth → rate-limit → tenant resolve → audit
// log before a handler runs. Handlers receive a typed RequestContext so they
// never hand-roll this logic. All v1 route handlers must go through withGuard.
//
//   export const POST = withGuard(async (req, ctx) => { ... });
//
// Error envelope on denial: { code, message, traceId }.
//
// NOTE: New routes should prefer calling `enforce(req)` directly (enforce.ts),
// which returns a structured result and handles anonymous callers with free-tier
// rate-limiting. `withGuard` is kept for existing routes that need the
// RequestContext; it calls enforce internally with requireAuth: true.

import { randomBytes } from "node:crypto";
import { enforce } from "./enforce";
import type { ApiKeyRecord } from "./api-keys.js";

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
  return randomBytes(8).toString("hex");
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

    const gate = await enforce(req, { requireAuth: true });
    if (!gate.ok) {
      const nr = gate.response;
      const merged = new Headers(nr.headers);
      merged.set("x-trace-id", traceId);
      return new Response(nr.body, { status: nr.status, headers: merged });
    }

    // The admin-bypass path in enforce() sets record: null (no stored key
    // record exists for the portal admin token). Construct a synthetic context
    // so withGuard handlers never dereference a null record.
    const apiKey: ApiKeyRecord = gate.record ?? {
      id: "portal_admin",
      hash: "",
      name: "Portal Admin",
      tier: "enterprise" as ApiKeyRecord["tier"],
      email: "admin@portal.internal",
      createdAt: new Date().toISOString(),
      usageMonthly: 0,
      usageResetAt: new Date().toISOString(),
      _version: 0,
    };

    const ctx: RequestContext = {
      apiKey,
      tenantId: apiKey.email,
      traceId,
      receivedAt,
    };

    auditAccess({
      traceId,
      tenantId: ctx.tenantId,
      apiKeyPrefix: apiKey.id.slice(0, 10),
      method: req.method,
      path: new URL(req.url).pathname,
      at: receivedAt.toISOString(),
    });

    try {
      const res = await handler(req, ctx);
      const merged = new Headers(res.headers);
      for (const [k, v] of Object.entries(gate.headers)) merged.set(k, v);
      merged.set("x-trace-id", traceId);
      return new Response(res.body, {
        status: res.status,
        statusText: res.statusText,
        headers: merged,
      });
    } catch (err) {
      return new Response(
        JSON.stringify({
          code: "internal_error",
          message: err instanceof Error ? err.message : "handler failed",
          traceId,
        } satisfies ErrorEnvelope),
        {
          status: 500,
          headers: {
            "content-type": "application/json",
            "x-trace-id": traceId,
            ...gate.headers,
          },
        },
      );
    }
  };
}

/** Minimal audit hook. The default sink writes to an in-process ring buffer.
 *  In a serverless environment each Lambda instance has its own ring, so the
 *  buffer only covers requests routed to the current warm instance. Wire a
 *  persistent sink via setAuditSink for cross-instance audit coverage. */
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
// Serves same-instance "recent access" queries quickly. Records are also
// written to Netlify Blobs asynchronously for cross-instance persistence.
const RING_CAPACITY = 1_000;
const RING: AuditRecord[] = new Array<AuditRecord>(RING_CAPACITY);
let RING_HEAD = 0;
let RING_SIZE = 0;

// Persistent sink: append each access record to a daily blob in Netlify Blobs.
// Failures are silently swallowed — audit persistence must never break the
// request path. The ring buffer still captures same-instance records even when
// Blobs is unavailable (e.g. local dev without NETLIFY_SITE_ID).
async function persistAuditRecord(record: AuditRecord): Promise<void> {
  try {
    // Lazy import avoids a circular dependency between guard.ts and store.ts
    // (store.ts is already used heavily in API routes that import guard.ts).
    const { getJson, setJson } = await import("./store");
    const day = record.at.slice(0, 10); // YYYY-MM-DD
    const key = `access-audit/${day}.json`;
    const existing = (await getJson<AuditRecord[]>(key)) ?? [];
    // Cap per-day log at 50k entries to prevent runaway blob growth.
    const updated = [...existing, record].slice(-50_000);
    await setJson(key, updated);
  } catch {
    // Swallow — audit persistence is best-effort.
  }
}

let SINK: AuditSink = (record) => {
  RING[RING_HEAD % RING_CAPACITY] = record;
  RING_HEAD++;
  if (RING_SIZE < RING_CAPACITY) RING_SIZE++;
  // Fire-and-forget persistence — does not block the response.
  void persistAuditRecord(record);
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
