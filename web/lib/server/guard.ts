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

export function withGuard(handler: Handler): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    const traceId = req.headers.get("x-trace-id") ?? newTraceId();
    const receivedAt = new Date();

    const gate = await enforce(req, { requireAuth: true });
    if (!gate.ok) {
      const nr = gate.response;
      const merged = new Headers(nr.headers);
      merged.set("x-trace-id", traceId);
      return new Response(nr.body, { status: nr.status, headers: merged });
    }

    // enforce with requireAuth: true guarantees record is non-null.
    const apiKey = gate.record!;

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
