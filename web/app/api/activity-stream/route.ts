// JSON polling activity feed. Replaces the SSE ReadableStream implementation
// which is not supported on Netlify Lambda (Node.js runtime).
//
// GET  ?since=<isoTimestamp>  — returns { events: EngineEvent[], serverTime: string }
// POST                        — writes an event to the blob store

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { getJson, listKeys, setJson } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface EngineEvent {
  id: string;
  at: string;
  kind: "HIT" | "CLEAR" | "SYS" | "EU" | "WARN" | "ERR";
  text: string;
}

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const sinceParam = url.searchParams.get("since");
  const since = sinceParam
    ? sinceParam
    : new Date(Date.now() - 30_000).toISOString();

  const serverTime = new Date().toISOString();

  let events: EngineEvent[] = [];
  try {
    const keys = await listKeys("engine-events/");
    const fresh = keys
      .filter((k) => k > `engine-events/${since}`)
      .sort();
    // Return at most 20 events (newest last)
    const slice = fresh.slice(-20);
    const fetched = await Promise.all(
      slice.map((k) => getJson<EngineEvent>(k))
    );
    events = fetched.filter((ev): ev is EngineEvent => ev !== null && ev !== undefined);
  } catch (err) {
    console.warn("[hawkeye] activity-stream listKeys best-effort failed:", err);
  }

  return NextResponse.json({ ok: true, events, serverTime }, { headers: gate.headers });
}

// POST /api/activity-stream — drop a real engine event into the blob queue.
// Other routes (quick-screen, batch-screen, ongoing/run) can call this to
// surface events on the operator's live feed.
export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  let raw: unknown;
  try { raw = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 , headers: gate.headers });
  }
  if (typeof raw !== "object" || raw === null) {
    return NextResponse.json({ ok: false, error: "body must be an object" }, { status: 400 , headers: gate.headers });
  }
  const r = raw as Record<string, unknown>;
  const text = typeof r["text"] === "string" ? r["text"] : "";
  const kindRaw = typeof r["kind"] === "string" ? r["kind"] : "SYS";
  const allowedKinds = new Set(["HIT", "CLEAR", "SYS", "EU", "WARN", "ERR"]);
  const kind = (allowedKinds.has(kindRaw) ? kindRaw : "SYS") as EngineEvent["kind"];
  if (!text.trim()) return NextResponse.json({ ok: false, error: "text required" }, { status: 400 , headers: gate.headers });
  const at = new Date().toISOString();
  const ev: EngineEvent = {
    id: `pe-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
    at,
    kind,
    text: text.slice(0, 500),
  };
  await setJson(`engine-events/${at}-${ev.id}`, ev);
  return NextResponse.json({ ok: true, event: ev }, { headers: gate.headers });
}
