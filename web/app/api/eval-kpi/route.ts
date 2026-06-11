// GET  /api/eval-kpi — latest KPI snapshot for the MLRO Advisor evaluation
//                      dashboard (Layer 7).
// POST /api/eval-kpi — token-authed upload of a fresh snapshot.
//
// The snapshot is produced by the weekly eval workflow
// (.github/workflows/nightly-eval.yml, Mondays 03:00 UTC, plus manual
// workflow_dispatch runs). CI POSTs the resulting kpi-snapshot.json here
// and it persists in Netlify Blobs — serverless instances have no shared
// disk, so an on-disk file only works in local dev. GET therefore reads
// Blobs first, then falls back to the local file, then to the empty state.

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { getStore } from "@netlify/blobs";
import { promises as fs } from "node:fs";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const SNAPSHOT_PATH = path.resolve(process.cwd(), "..", "data/eval/kpi-snapshot.json");
const BLOB_STORE = "hawkeye-eval-kpi";
const BLOB_KEY = "kpi-snapshot";
const NO_SNAPSHOT_MESSAGE =
  "No KPI snapshot recorded yet. The weekly eval workflow (Mondays 03:00 UTC, " +
  "or a manual nightly-eval workflow_dispatch run) produces and uploads it.";

const CORS: Record<string, string> = {
  "access-control-allow-origin": process.env["NEXT_PUBLIC_APP_URL"] ?? process.env["URL"] ?? "https://hawkeye-sterling.netlify.app",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type, authorization, x-api-key",
};

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS });
}

async function readBlobSnapshot(): Promise<unknown | null> {
  try {
    const store = getStore(BLOB_STORE);
    const raw = await store.get(BLOB_KEY, { type: "json" });
    return raw ?? null;
  } catch (err) {
    console.warn("[eval-kpi] blob read failed — falling back to disk:", err instanceof Error ? err.message : String(err));
    return null;
  }
}

export async function GET(req: Request): Promise<Response> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  void writeAuditChainEntry(
    { event: "eval-kpi_accessed", actor: gate.keyId },
    tenantIdFromGate(gate),
  ).catch(() => undefined);

  const fromBlob = await readBlobSnapshot();
  if (fromBlob) {
    return NextResponse.json({ ok: true, snapshot: fromBlob }, { headers: { ...gate.headers, ...CORS } });
  }

  try {
    const raw = await fs.readFile(SNAPSHOT_PATH, "utf8"); // nosemgrep: detect-non-literal-fs -- safe: SNAPSHOT_PATH is a compile-time constant derived from process.cwd(), not user input
    const snap = JSON.parse(raw);
    return NextResponse.json({ ok: true, snapshot: snap }, { headers: { ...gate.headers, ...CORS } });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") console.error("[eval-kpi] failed to read snapshot", err);
    return NextResponse.json(
      { ok: true, snapshot: null, message: NO_SNAPSHOT_MESSAGE },
      { headers: { ...gate.headers, ...CORS } }
    );
  }
}

// CI upload — accepts the kpi-snapshot.json body and persists it to Blobs.
export async function POST(req: Request): Promise<Response> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  let snapshot: Record<string, unknown>;
  try {
    snapshot = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400, headers: { ...gate.headers, ...CORS } });
  }
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return NextResponse.json({ ok: false, error: "Snapshot must be a JSON object" }, { status: 400, headers: { ...gate.headers, ...CORS } });
  }

  const stored = { ...snapshot, uploadedAt: new Date().toISOString() };
  try {
    const store = getStore(BLOB_STORE);
    await store.setJSON(BLOB_KEY, stored);
  } catch (err) {
    console.error("[eval-kpi] blob write failed:", err);
    return NextResponse.json({ ok: false, error: "Snapshot store unavailable" }, { status: 503, headers: { ...gate.headers, ...CORS } });
  }

  void writeAuditChainEntry(
    { event: "eval-kpi_snapshot.uploaded", actor: gate.keyId, meta: { keys: Object.keys(snapshot).length } },
    tenantIdFromGate(gate),
  ).catch(() => undefined);

  return NextResponse.json({ ok: true }, { status: 201, headers: { ...gate.headers, ...CORS } });
}
