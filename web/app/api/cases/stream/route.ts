import { enforce } from "@/lib/server/enforce";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { readLastChangeAt, loadAllCases } from "@/lib/server/case-vault";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// GET /api/cases/stream
//
// Server-Sent Events feed of case-vault changes for the authenticated
// tenant. The browser opens an EventSource; this handler holds the
// connection up to ~24s (Netlify Functions cap is 26s; 24s leaves
// headroom for the close handshake).
//
// Inside the hold window, we poll the tenant's _meta blob every 2s.
// When `lastChangeAt` advances past the value the client sent (via
// the `since` query param or Last-Event-ID header), we emit:
//
//   event: change
//   data: { tenant, lastChangeAt, cases: CaseRecord[] }
//
// and close the stream. The browser auto-reconnects, immediately
// receiving the latest snapshot if more changes happened, or holding
// again if the server is quiet.
//
// If 24s elapse with no change, we emit a `ping` event and close so
// the EventSource can re-establish the connection (browsers throttle
// reconnects so this is gentle on the function budget too).
//
// Auth: EventSource doesn't support custom headers in browsers, so
// the admin token (when needed) is passed via `?token=...` query
// param. Same `enforce()` gate as the other case routes — keys map
// to tenant-scoped vault paths.

const HOLD_MS = 24_000;
const POLL_INTERVAL_MS = 2_000;

function sseHeaders(): Record<string, string> {
  return {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "x-accel-buffering": "no",
  };
}

function encode(event: string, data: unknown): Uint8Array {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  return new TextEncoder().encode(payload);
}

export async function GET(req: Request): Promise<Response> {
  // EventSource can't set Authorization headers — accept ?token= as a
  // fallback. We rebuild a Request with the header so enforce() can
  // verify either path.
  const url = new URL(req.url);
  const tokenParam = url.searchParams.get("token");
  const reqForGate = tokenParam
    ? new Request(req.url, {
        method: req.method,
        headers: {
          authorization: `Bearer ${tokenParam}`,
          accept: req.headers.get("accept") ?? "*/*",
        },
      })
    : req;

  const gate = await enforce(reqForGate);
  if (!gate.ok) return gate.response;
  const tenant = tenantIdFromGate(gate);

  const since =
    url.searchParams.get("since") ??
    req.headers.get("last-event-id") ??
    new Date(0).toISOString();

  const stream = new ReadableStream({
    async start(controller): Promise<void> {
      const start = Date.now();
      // Open with a hello event so the client knows the connection
      // is live (some proxies hold buffered output until the first
      // flush).
      controller.enqueue(
        encode("hello", { tenant, since, holdMs: HOLD_MS }),
      );

      let closed = false;
      const close = (): void => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      // Bail early if the client disconnects (browser tab closed,
      // EventSource cancelled). AbortSignal listener fires once.
      req.signal.addEventListener("abort", close, { once: true });

      try {
        while (!closed && Date.now() - start < HOLD_MS) {
          const last = await readLastChangeAt(tenant);
          if (last > since) {
            const cases = await loadAllCases(tenant);
            controller.enqueue(
              encode("change", {
                tenant,
                lastChangeAt: last,
                cases,
              }),
            );
            close();
            return;
          }
          // Sleep, then re-check. Keepalive comment every 10s so
          // intermediary proxies (corporate firewalls, CDN) don't
          // close the connection on idle.
          const elapsed = Date.now() - start;
          if (elapsed > 0 && elapsed % 10_000 < POLL_INTERVAL_MS) {
            controller.enqueue(new TextEncoder().encode(": keepalive\n\n"));
          }
          await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        }
        if (!closed) {
          controller.enqueue(encode("ping", { tenant, at: new Date().toISOString() }));
          close();
        }
      } catch (err) {
        console.error("[cases/stream] stream error:", err instanceof Error ? err.message : err);
        try {
          controller.enqueue(
            encode("error", {
              error: "Stream error — please reconnect.",
            }),
          );
        } catch {
          /* stream already torn down */
        }
        close();
      }
    },
  });

  return new Response(stream, { status: 200, headers: sseHeaders() });
}
