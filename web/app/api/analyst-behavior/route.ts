// GET /api/analyst-behavior
//   Returns the UEBA report for the authenticated tenant's analyst activity.
//   Reads analyst events from Netlify Blobs (store: hawkeye-ueba).
//   Query param: windowDays (default 30, max 90).
//
// POST /api/analyst-behavior
//   Records a single analyst activity event.
//   Body: { kind, meta? } — actor is derived from the authenticated identity.
//
// Auth: standard session cookie or API key (analyst+ role).
//
// Storage layout (hawkeye-ueba store):
//   {tenantId}/events/{YYYYMMDD}.json  — daily event array, append-only

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { tenantIdFromGate } from "@/lib/server/tenant";
import {
  makeAnalystEvent,
  buildUEBAReport,
  type AnalystEvent,
  type AnalystEventKind,
} from "../../../../src/monitoring/analyst-behavior.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_WINDOW_DAYS = 90;
const STORE_NAME = "hawkeye-ueba";

// ── Blob store helpers ────────────────────────────────────────────────────────

interface BlobStore {
  get: (_key: string, _opts?: { type?: string }) => Promise<unknown>;
  set: (_key: string, _value: string) => Promise<void>;
}

async function getUebaStore(): Promise<BlobStore | null> {
  try {
    const { getStore } = await import("@netlify/blobs") as unknown as {
      getStore: (_opts: {
        name: string;
        siteID?: string;
        token?: string;
        consistency?: string;
      }) => BlobStore;
    };
    return getStore({
      name: STORE_NAME,
      siteID: process.env["NETLIFY_SITE_ID"],
      token: process.env["NETLIFY_BLOBS_TOKEN"] ?? process.env["NETLIFY_TOKEN"],
      consistency: "strong",
    });
  } catch {
    return null;
  }
}

function dayKey(tenantId: string, date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${tenantId}/events/${y}${m}${d}.json`;
}

async function loadEventsForWindow(
  store: BlobStore,
  tenantId: string,
  windowDays: number,
): Promise<AnalystEvent[]> {
  const events: AnalystEvent[] = [];
  const now = new Date();

  const fetches = Array.from({ length: Math.min(windowDays + 1, MAX_WINDOW_DAYS) }, (_, i) => {
    const date = new Date(now.getTime() - i * 86_400_000);
    const key = dayKey(tenantId, date);
    return store.get(key, { type: "text" }).then((raw) => {
      if (!raw || typeof raw !== "string") return;
      try {
        const parsed = JSON.parse(raw) as AnalystEvent[];
        if (Array.isArray(parsed)) events.push(...parsed);
      } catch {
        // malformed day file — skip
      }
    }).catch(() => { /* blob not found — day has no events */ });
  });

  await Promise.all(fetches);
  return events;
}

async function appendEvent(
  store: BlobStore,
  tenantId: string,
  event: AnalystEvent,
): Promise<void> {
  const key = dayKey(tenantId, new Date(event.at));
  let existing: AnalystEvent[] = [];
  try {
    const raw = await store.get(key, { type: "text" });
    if (raw && typeof raw === "string") {
      const parsed = JSON.parse(raw) as AnalystEvent[];
      if (Array.isArray(parsed)) existing = parsed;
    }
  } catch { /* no existing events for today */ }

  existing.push(event);
  await store.set(key, JSON.stringify(existing));
}

// ── Handlers ─────────────────────────────────────────────────────────────────

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  const tenantId = tenantIdFromGate(gate);
  const url = new URL(req.url);
  const windowDays = Math.min(
    parseInt(url.searchParams.get("windowDays") ?? "30", 10) || 30,
    MAX_WINDOW_DAYS,
  );

  const store = await getUebaStore();
  if (!store) {
    return NextResponse.json(
      {
        ok: true,
        report: null,
        message: "UEBA store unavailable — Netlify Blobs not configured. Events are logged once the store is provisioned.",
      },
      { headers: gate.headers },
    );
  }

  const events = await loadEventsForWindow(store, tenantId, windowDays);
  const report = buildUEBAReport(events, windowDays);

  return NextResponse.json({ ok: true, report, windowDays }, { headers: gate.headers });
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  const tenantId = tenantIdFromGate(gate);

  let body: { kind: AnalystEventKind; meta?: AnalystEvent["meta"] };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400, headers: gate.headers });
  }

  if (!body.kind) {
    return NextResponse.json({ ok: false, error: "kind is required" }, { status: 400, headers: gate.headers });
  }

  const actor = gate.keyId ?? "unknown";
  const event = makeAnalystEvent(actor, body.kind, body.meta);

  const store = await getUebaStore();
  if (store) {
    try {
      await appendEvent(store, tenantId, event);
    } catch (err) {
      console.error("[analyst-behavior] failed to persist event:", err);
    }
  }

  return NextResponse.json({ ok: true, eventId: event.id }, { status: 201, headers: gate.headers });
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204 });
}
