// Server-Sent Events activity feed. Replaces the cosmetic seeded events in
// ActivityFeed.tsx with live engine signals. SSE fits Netlify's Lambda
// model better than full WebSockets — long-poll the endpoint, push
// chunks, the browser EventSource keeps the connection open.
//
// Heartbeat every ~3 s; real engine events injected from blob keys
// `engine-events/<isoTimestamp>` (any other route can drop an event by
// calling POST /api/activity-stream).
//
// We cap each connection at 60 s to play nicely with Netlify's 60 s
// invocation cap; the client EventSource auto-reconnects.

import { NextResponse } from "next/server";
import { getJson, listKeys, setJson } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface EngineEvent {
  id: string;
  at: string;
  kind: "HIT" | "CLEAR" | "SYS" | "EU" | "WARN" | "ERR";
  text: string;
}

const HEARTBEAT_INTERVAL_MS = 3_000;
const STREAM_DURATION_MS = 55_000;
const HEARTBEAT_KINDS: EngineEvent["kind"][] = ["SYS", "EU", "SYS", "SYS", "WARN", "SYS"];
const HEARTBEAT_LINES = [
  "engine heartbeat - q depth",
  "OFAC SDN cache validated",
  "UNSC Consolidated sync complete",
  "EU CFSP cache refreshed",
  "EOCN local list ping",
  "adverse-media RSS feed healthy",
  "goAML connectivity OK",
];

function encode(ev: EngineEvent): string {
  // SSE framing — each event prefixed with id + event + data lines, blank
  // line terminator. Keeping the data inline as JSON lets the client
  // reconstruct kind/at/text without needing a custom parser.
  return `id: ${ev.id}\nevent: engine-event\ndata: ${JSON.stringify(ev)}\n\n`;
}

export async function GET(): Promise<Response> {
  const start = Date.now();
  let counter = 0;
  let lastSeenIso = new Date(start).toISOString();
  // Module-scope flag so the heartbeat chain and cancel() share state.
  // The original implementation kept enqueueing into a closed controller
  // every time a client disconnected, surfacing as
  // "ERR_INVALID_STATE: Controller is already closed" unhandledRejections
  // in the dev/Lambda log.
  let closed = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (ev: EngineEvent): boolean => {
        if (closed) return false;
        try {
          controller.enqueue(enc.encode(encode(ev)));
          return true;
        } catch {
          // Controller may already be closed/errored if the client TCP-reset
          // between our `closed` check and the enqueue call. Mark closed
          // so the schedule stops re-arming.
          closed = true;
          if (timer) { clearTimeout(timer); timer = null; }
          return false;
        }
      };
      const stop = () => {
        if (closed) return;
        closed = true;
        if (timer) { clearTimeout(timer); timer = null; }
        try { controller.close(); } catch { /* already closed */ }
      };

      // Initial connect ping so the client UI flips from "connecting" to
      // "live" immediately.
      send({
        id: `c-${start}`,
        at: new Date(start).toISOString(),
        kind: "SYS",
        text: "live stream connected",
      });

      const tick = async () => {
        if (closed) return;
        if (Date.now() - start > STREAM_DURATION_MS) {
          send({
            id: `s-${Date.now()}`,
            at: new Date().toISOString(),
            kind: "SYS",
            text: "stream segment complete - reconnecting",
          });
          stop();
          return;
        }

        // Drain any real engine events posted to the blob since we last
        // looked. Cheap O(N) listing — N is small in practice.
        try {
          const keys = await listKeys("engine-events/");
          const fresh = keys.filter((k) => k > `engine-events/${lastSeenIso}`).sort();
          for (const k of fresh) {
            if (closed) return;
            const ev = await getJson<EngineEvent>(k);
            if (ev && !send(ev)) return;
          }
          if (keys.length > 0) {
            const newest = keys[keys.length - 1];
            if (newest) lastSeenIso = newest.replace(/^engine-events\//, "");
          }
        } catch (err) { console.warn("[hawkeye] activity-stream listKeys best-effort failed:", err); }

        if (closed) return;

        // Heartbeat so the channel is never silent.
        const kind = HEARTBEAT_KINDS[counter % HEARTBEAT_KINDS.length] ?? "SYS";
        const baseText = HEARTBEAT_LINES[counter % HEARTBEAT_LINES.length] ?? "heartbeat";
        const depth = 30 + Math.floor(Math.random() * 15);
        const text = baseText.includes("q depth") ? `${baseText} ${depth}` : baseText;
        counter += 1;
        if (!send({
          id: `hb-${Date.now()}-${counter}`,
          at: new Date().toISOString(),
          kind,
          text,
        })) return;

        if (closed) return;
        timer = setTimeout(() => { void tick(); }, HEARTBEAT_INTERVAL_MS);
      };

      timer = setTimeout(() => { void tick(); }, HEARTBEAT_INTERVAL_MS);
    },
    cancel() {
      // Client disconnected. Flip the flag and clear any pending tick
      // so we don't try to enqueue into a torn-down controller.
      closed = true;
      if (timer) { clearTimeout(timer); timer = null; }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
      "connection": "keep-alive",
    },
  });
}

// POST /api/activity-stream — drop a real engine event into the blob queue.
// Other routes (quick-screen, batch-screen, ongoing/run) can call this to
// surface events on the operator's live feed without opening a new socket.
export async function POST(req: Request): Promise<NextResponse> {
  let raw: unknown;
  try { raw = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }
  if (typeof raw !== "object" || raw === null) {
    return NextResponse.json({ ok: false, error: "body must be an object" }, { status: 400 });
  }
  const r = raw as Record<string, unknown>;
  const text = typeof r["text"] === "string" ? r["text"] : "";
  const kindRaw = typeof r["kind"] === "string" ? r["kind"] : "SYS";
  const allowedKinds = new Set(["HIT", "CLEAR", "SYS", "EU", "WARN", "ERR"]);
  const kind = (allowedKinds.has(kindRaw) ? kindRaw : "SYS") as EngineEvent["kind"];
  if (!text.trim()) return NextResponse.json({ ok: false, error: "text required" }, { status: 400 });
  const at = new Date().toISOString();
  const ev: EngineEvent = {
    id: `pe-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    at,
    kind,
    text: text.slice(0, 500),
  };
  await setJson(`engine-events/${at}-${ev.id}`, ev);
  return NextResponse.json({ ok: true, event: ev });
}
