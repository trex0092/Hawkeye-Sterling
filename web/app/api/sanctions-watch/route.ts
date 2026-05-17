// GET  /api/sanctions-watch — last watch run status
// POST /api/sanctions-watch — manual trigger (SANCTIONS_CRON_TOKEN required)
//
// Discoverable alias for the canonical sanctions watch endpoint at
// /api/sanctions/watch. The Netlify scheduled functions and MCP `call_api`
// tool use this flatter path; /api/sanctions/watch is the full
// production endpoint called by sanctions-watch-cron.mts.
//
// POST requires Authorization: Bearer <SANCTIONS_CRON_TOKEN>.

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  try {
    let blobsMod: typeof import("@netlify/blobs") | null = null;
    try { blobsMod = await import("@netlify/blobs"); } catch { /* not bound */ }

    if (!blobsMod) {
      return NextResponse.json(
        { ok: true, lastRun: null, note: "Blob store not bound — sanctions watch has not run in this environment" },
        { headers: gate.headers },
      );
    }

    const siteID = process.env["NETLIFY_SITE_ID"] ?? process.env["SITE_ID"];
    const token = process.env["NETLIFY_BLOBS_TOKEN"] ?? process.env["NETLIFY_API_TOKEN"] ?? process.env["NETLIFY_AUTH_TOKEN"];
    const storeOpts = siteID && token
      ? { name: "hawkeye-function-heartbeats", siteID, token, consistency: "strong" as const }
      : { name: "hawkeye-function-heartbeats" };
    const hbStore = blobsMod.getStore(storeOpts);

    const entries = await Promise.all([
      hbStore.get("sanctions-watch-15min", { type: "json" }).catch(() => null),
      hbStore.get("sanctions-watch-1100",  { type: "json" }).catch(() => null),
      hbStore.get("sanctions-watch-1330",  { type: "json" }).catch(() => null),
    ]) as Array<{ lastSuccess?: string; label?: string } | null>;

    const lastRuns = entries.filter(Boolean).map((e) => ({ label: e?.label, lastSuccess: e?.lastSuccess }));
    return NextResponse.json(
      {
        ok: true,
        lastRuns,
        triggerEndpoint: "POST /api/sanctions/watch (requires SANCTIONS_CRON_TOKEN)",
        note: "Scheduled at 04:30, 11:00, 13:30 UTC by sanctions-watch-cron.mts variants",
      },
      { headers: gate.headers },
    );
  } catch (err) {
    console.warn("[sanctions-watch GET]", err instanceof Error ? err.message : String(err));
    return NextResponse.json(
      { ok: true, lastRuns: [], note: "Could not read heartbeat store" },
      { headers: gate.headers },
    );
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  // Require SANCTIONS_CRON_TOKEN — same as the canonical /api/sanctions/watch.
  const expectedToken = process.env["SANCTIONS_CRON_TOKEN"];
  if (!expectedToken) {
    return NextResponse.json(
      { ok: false, error: "SANCTIONS_CRON_TOKEN not configured — trigger disabled" },
      { status: 503 },
    );
  }
  const auth = req.headers.get("authorization") ?? "";
  const provided = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (provided !== expectedToken) {
    return NextResponse.json({ ok: false, error: "invalid token" }, { status: 403 });
  }

  // Delegate to the canonical endpoint which contains the full ingestion logic.
  const base =
    process.env["NEXT_PUBLIC_APP_URL"] ??
    process.env["URL"] ??
    process.env["DEPLOY_PRIME_URL"] ??
    "https://hawkeye-sterling.netlify.app";

  try {
    const res = await fetch(`${base}/api/sanctions/watch`, {
      method: "POST",
      headers: { authorization: `Bearer ${expectedToken}`, "content-type": "application/json" },
      signal: AbortSignal.timeout(55_000),
    });
    const payload = await res.json().catch(() => null);
    return NextResponse.json(payload ?? { ok: false, error: "upstream parse failed" }, { status: res.status });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
