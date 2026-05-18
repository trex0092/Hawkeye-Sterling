// POST /api/admin/refresh-sanctions
//
// Admin-protected manual trigger for the sanctions ingest pipeline.
// Delegates to /api/sanctions/refresh (cache invalidation) and
// /api/admin/trigger-refresh (full ingestion run via runIngestionAll).
//
// /api/sanctions/refresh is intentionally lightweight — it invalidates the
// in-process candidate cache but does not re-fetch upstream lists (those are
// heavyweight, e.g. UN Consolidated ~15 MB, and belong in the scheduled cron).
// To get a true force-re-ingest the operator should hit trigger-refresh; this
// endpoint runs both in sequence so the cache is also cleared after the ingest.
//
// Auth: withGuard (Bearer ADMIN_TOKEN or portal admin token).
// Returns { ok, triggeredAt, message, hint } on success.
// Returns { ok: false, error, triggeredAt } with status 500 on failure.

import { NextResponse } from "next/server";
import { withGuard, type RequestContext } from "@/lib/server/guard";
import { invalidateCandidateCache } from "@/lib/server/candidates-loader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// runIngestionAll's per-adapter timeout is ~12 s, adapters run in parallel.
// 60 s leaves generous headroom for slow adapters + blob writes.
export const maxDuration = 60;

async function handleRefreshSanctions(
  _req: Request,
  _ctx: RequestContext,
): Promise<NextResponse> {
  const triggeredAt = new Date().toISOString();

  // Attempt a full ingestion run via the compiled runner.
  // Dynamic-import so this route doesn't hard-require the dist/ build at
  // type-check time (mirrors the pattern in trigger-refresh/route.ts).
  let runIngestionAll: (label: string) => Promise<unknown>;
  try {
    const mod = (await import(
      "../../../../../dist/src/ingestion/run-all.js" as string
    )) as { runIngestionAll: typeof runIngestionAll };
    runIngestionAll = mod.runIngestionAll;
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        triggeredAt,
        error: `ingestion runner unavailable — ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 500 },
    );
  }

  let results: unknown;
  try {
    results = await runIngestionAll("admin-refresh-sanctions");
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        triggeredAt,
        error: `runIngestionAll threw — ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 500 },
    );
  }

  // Invalidate the in-process candidate cache so subsequent screening requests
  // pick up the freshly ingested data without waiting for the TTL to expire.
  invalidateCandidateCache();

  return NextResponse.json(
    {
      ok: true,
      triggeredAt,
      message: "Sanctions refresh triggered successfully",
      hint: "Check /api/sanctions/status in 60s to verify entity counts",
      results,
    },
    { status: 200 },
  );
}

export const POST = withGuard(handleRefreshSanctions);

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 200,
    headers: {
      Allow: "POST, OPTIONS",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
