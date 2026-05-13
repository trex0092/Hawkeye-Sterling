// POST /api/asana/escalation-hook
//
// Asana webhook receiver — fires generate_sar_report when a task in the
// Hawkeye Sterling V2 team (GID 1213645083721318) transitions to status
// "Escalated". Resolves Section B2 of the V1↔V2 workflow merge.
//
// Two distinct request flows arrive at this endpoint:
//
//   1. HANDSHAKE — first request after registering the webhook in Asana.
//      Asana sends X-Hook-Secret with a random secret. We MUST echo it back
//      in the response header verbatim and return HTTP 200 with empty body.
//      The secret is persisted to Blobs so subsequent event payloads can be
//      HMAC-verified.
//
//   2. EVENT — every subsequent request. Asana includes X-Hook-Signature
//      (HMAC-SHA256 hex of the request body, keyed with the secret). We
//      verify the signature, parse the events array, and trigger SAR
//      generation for any task that transitioned to Escalated.
//
// Registration (do this once, outside this code):
//   POST https://app.asana.com/api/1.0/webhooks
//   Authorization: Bearer $ASANA_ACCESS_TOKEN
//   {
//     "data": {
//       "resource": "1213645083721318",     // V2 team GID
//       "target":   "https://hawkeye-sterling.netlify.app/api/asana/escalation-hook",
//       "filters":  [{ "resource_type": "task", "action": "changed", "fields": ["custom_fields"] }]
//     }
//   }
//
// Env vars consumed:
//   ASANA_ACCESS_TOKEN          — needed to fetch task details + upload attachments
//   ASANA_ESCALATION_STATUS     — optional override (default: "Escalated")
//   ASANA_WEBHOOK_SECRET        — optional fallback if Blobs unavailable
//
// Blobs:
//   store "webhook-secrets" key "asana-escalation" → { secret, registeredAt }

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const ASANA_BASE = "https://app.asana.com/api/1.0";
const SECRET_STORE = "webhook-secrets";
const SECRET_KEY = "asana-escalation";
const DEFAULT_ESCALATED_STATUS = "Escalated";
const FETCH_TIMEOUT_MS = 8_000;

// ─── Blob secret persistence ────────────────────────────────────────────────

interface StoredSecret {
  secret: string;
  registeredAt: string;
}

interface BlobLikeStore {
  get(key: string, opts?: { type: "json" }): Promise<unknown>;
  setJSON(key: string, value: unknown): Promise<unknown>;
}

async function getBlobsStore(name: string): Promise<BlobLikeStore | null> {
  try {
    const mod = await import("@netlify/blobs").catch(() => null);
    if (!mod) return null;
    const siteID = process.env["NETLIFY_SITE_ID"] ?? process.env["SITE_ID"];
    const token =
      process.env["NETLIFY_BLOBS_TOKEN"] ??
      process.env["NETLIFY_API_TOKEN"] ??
      process.env["NETLIFY_AUTH_TOKEN"];
    const opts: { name: string; siteID?: string; token?: string; consistency: "strong" } = {
      name,
      consistency: "strong",
    };
    if (siteID) opts.siteID = siteID;
    if (token) opts.token = token;
    return mod.getStore(opts) as unknown as BlobLikeStore;
  } catch (err) {
    console.warn("[asana-hook] blobs unavailable:", err instanceof Error ? err.message : err);
    return null;
  }
}

async function persistSecret(secret: string): Promise<void> {
  const store = await getBlobsStore(SECRET_STORE);
  if (!store) return;
  const value: StoredSecret = { secret, registeredAt: new Date().toISOString() };
  await store.setJSON(SECRET_KEY, value);
}

async function loadSecret(): Promise<string | null> {
  const store = await getBlobsStore(SECRET_STORE);
  if (store) {
    const v = await store.get(SECRET_KEY, { type: "json" }).catch(() => null) as StoredSecret | null;
    if (v?.secret) return v.secret;
  }
  return process.env["ASANA_WEBHOOK_SECRET"] ?? null;
}

// ─── HMAC verification ──────────────────────────────────────────────────────

async function verifySignature(body: string, signature: string, secret: string): Promise<boolean> {
  try {
    const { createHmac, timingSafeEqual } = await import("crypto");
    const expected = createHmac("sha256", secret).update(body, "utf8").digest("hex");
    if (expected.length !== signature.length) return false;
    // Cast Buffer → Uint8Array view explicitly — Node Buffer extends Uint8Array
    // at runtime, but TS 5.7+ strict typings require the explicit view to call
    // timingSafeEqual without a type error.
    const a = new Uint8Array(Buffer.from(expected, "utf8"));
    const b = new Uint8Array(Buffer.from(signature, "utf8"));
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// ─── Asana API helpers ──────────────────────────────────────────────────────

async function asanaFetch<T = unknown>(path: string, init?: RequestInit): Promise<T | null> {
  const token = process.env["ASANA_ACCESS_TOKEN"] ?? process.env["ASANA_TOKEN"];
  if (!token) {
    console.warn("[asana-hook] no ASANA_ACCESS_TOKEN configured — skipping Asana call");
    return null;
  }
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${ASANA_BASE}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/json",
        "content-type": "application/json",
        ...(init?.headers ?? {}),
      },
      signal: ctl.signal,
    });
    if (!res.ok) {
      console.warn(`[asana-hook] ${path} returned ${res.status}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.warn(`[asana-hook] ${path} failed:`, err instanceof Error ? err.message : err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

interface AsanaTask {
  gid: string;
  name?: string;
  notes?: string;
  custom_fields?: Array<{
    gid: string;
    name?: string;
    display_value?: string;
    enum_value?: { name?: string } | null;
  }>;
}

interface AsanaEvent {
  action?: string;          // "changed" | "added" | "removed"
  resource?: { gid?: string; resource_type?: string };
  change?: {
    field?: string;         // "custom_fields" when status changes
    new_value?: { display_value?: string; name?: string } | null;
  };
}

// ─── SAR trigger ────────────────────────────────────────────────────────────

function originForSelfFetch(req: Request): string {
  // Resolve our own origin so the internal /api/sar-report call goes back to
  // this same Lambda. URL header is auto-injected by Netlify; NEXT_PUBLIC_APP_URL
  // is the explicit override; the request host is the last-resort fallback.
  const explicit = process.env["NEXT_PUBLIC_APP_URL"];
  if (explicit) return new URL("/", explicit).origin;
  const netlifyUrl = process.env["URL"] ?? process.env["DEPLOY_PRIME_URL"];
  if (netlifyUrl) return new URL("/", netlifyUrl).origin;
  const host = req.headers.get("host");
  if (host) {
    const proto = req.headers.get("x-forwarded-proto") ?? "https";
    return `${proto}://${host}`;
  }
  return "https://hawkeye-sterling.netlify.app";
}

async function triggerSar(task: AsanaTask, origin: string): Promise<{ goamlXmlBase64?: string; ok: boolean; error?: string }> {
  try {
    const subjectName = task.name ?? "Unknown subject";
    const res = await fetch(`${origin}/api/sar-report`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        subject: {
          id: task.gid,
          name: subjectName,
        },
        narrative: task.notes ?? `Auto-escalated from Asana task ${task.gid}. Source case requires SAR/STR filing per FDL 10/2025.`,
        filingType: "STR",
      }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) {
      return { ok: false, error: `SAR endpoint returned HTTP ${res.status}` };
    }
    const body = await res.json() as { goaml?: { xmlBase64?: string } };
    const xml = body.goaml?.xmlBase64;
    if (xml) return { ok: true, goamlXmlBase64: xml };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function attachToTask(taskGid: string, xmlBase64: string): Promise<void> {
  // Asana attachments use multipart/form-data, NOT JSON. The asanaFetch helper
  // is JSON-only, so we do this call directly.
  const token = process.env["ASANA_ACCESS_TOKEN"] ?? process.env["ASANA_TOKEN"];
  if (!token) return;
  try {
    const xmlBuf = Buffer.from(xmlBase64, "base64");
    // Re-copy into a fresh Uint8Array — Buffer's ArrayBufferView identity
    // doesn't survive the TS lib types Blob() expects in this build target.
    const xmlBytes = new Uint8Array(xmlBuf.byteLength);
    xmlBytes.set(xmlBuf);
    const form = new FormData();
    form.append("parent", taskGid);
    form.append(
      "file",
      new Blob([xmlBytes], { type: "application/xml" }),
      `STR-${taskGid}-${Date.now()}.xml`,
    );
    await fetch(`${ASANA_BASE}/attachments`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: form,
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    console.warn("[asana-hook] attach failed:", err instanceof Error ? err.message : err);
  }
}

async function commentOnTask(taskGid: string, text: string): Promise<void> {
  await asanaFetch(`/tasks/${taskGid}/stories`, {
    method: "POST",
    body: JSON.stringify({ data: { text } }),
  });
}

// ─── Event processor ────────────────────────────────────────────────────────

function statusFromEvent(event: AsanaEvent): string | null {
  if (event.action !== "changed") return null;
  if (event.change?.field !== "custom_fields") return null;
  return event.change.new_value?.display_value ?? event.change.new_value?.name ?? null;
}

async function processEvents(events: AsanaEvent[], origin: string): Promise<{ processed: number; triggered: number }> {
  const escalatedStatus = process.env["ASANA_ESCALATION_STATUS"] ?? DEFAULT_ESCALATED_STATUS;
  let triggered = 0;
  for (const event of events) {
    const newStatus = statusFromEvent(event);
    if (!newStatus || newStatus !== escalatedStatus) continue;
    const taskGid = event.resource?.gid;
    if (!taskGid) continue;

    const task = await asanaFetch<{ data: AsanaTask }>(`/tasks/${taskGid}?opt_fields=name,notes,custom_fields`);
    if (!task?.data) continue;

    const result = await triggerSar(task.data, origin);
    if (!result.ok) {
      await commentOnTask(taskGid, `Hawkeye Sterling auto-SAR failed: ${result.error ?? "unknown error"}. Please trigger manually.`);
      continue;
    }
    triggered++;
    if (result.goamlXmlBase64) {
      await attachToTask(taskGid, result.goamlXmlBase64);
      await commentOnTask(taskGid, `Hawkeye Sterling: SAR draft generated and attached. MLRO must review the goAML XML before filing via goaml.uae.gov.ae (FDL 10/2025 Art.32).`);
    } else {
      await commentOnTask(taskGid, `Hawkeye Sterling: SAR generated but no goAML XML returned. Check /api/sar-report logs.`);
    }
  }
  return { processed: events.length, triggered };
}

// ─── HTTP entry point ───────────────────────────────────────────────────────

export async function POST(req: Request): Promise<NextResponse> {
  const rawBody = await req.text();

  // Handshake: Asana includes X-Hook-Secret on the first request after the
  // webhook is registered. Echo it back, persist, return 200. No HMAC yet.
  const hookSecret = req.headers.get("x-hook-secret");
  if (hookSecret) {
    await persistSecret(hookSecret).catch((err) => {
      console.warn("[asana-hook] persistSecret failed:", err instanceof Error ? err.message : err);
    });
    return new NextResponse(null, {
      status: 200,
      headers: { "X-Hook-Secret": hookSecret },
    });
  }

  // Event: must be signed. Verify HMAC before doing anything else.
  const signature = req.headers.get("x-hook-signature");
  if (!signature) {
    return NextResponse.json({ ok: false, error: "missing X-Hook-Signature" }, { status: 400 });
  }

  const secret = await loadSecret();
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "webhook secret not yet registered — perform handshake first" },
      { status: 503 },
    );
  }

  const valid = await verifySignature(rawBody, signature, secret);
  if (!valid) {
    return NextResponse.json({ ok: false, error: "signature verification failed" }, { status: 401 });
  }

  let payload: { events?: AsanaEvent[] } = {};
  try {
    payload = JSON.parse(rawBody) as { events?: AsanaEvent[] };
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const events = Array.isArray(payload.events) ? payload.events : [];
  const origin = originForSelfFetch(req);
  const result = await processEvents(events, origin);

  return NextResponse.json({ ok: true, ...result });
}

// Asana also probes with GET sometimes. Respond 200 so the dashboard shows green.
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    ok: true,
    endpoint: "asana-escalation-hook",
    info: "POST endpoint for Asana webhook. Register via /api/1.0/webhooks then trigger task status change to fire.",
  });
}
