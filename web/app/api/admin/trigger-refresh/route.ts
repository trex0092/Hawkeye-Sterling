// POST /api/admin/trigger-refresh
//
// Manual force-trigger of the sanctions ingestion pipeline. Bypasses the
// Netlify scheduler entirely — calls runIngestionAll() directly from the
// Next.js Function lambda so an operator can verify the ingestion path
// works on demand instead of waiting for the next */15 cron tick.
//
// Auth: Bearer ADMIN_TOKEN (same secret the rest of the admin surface
// uses). Returns 403 if the header is missing or wrong, 503 if the env
// var isn't configured at all.
//
// Returns the same IngestRunSummary shape as the scheduled functions so
// /api/sanctions/last-errors can be cross-checked immediately after.
//
// Use case: when sanctions_status reports lists empty and we don't know
// if (a) the cron isn't firing or (b) the cron is firing but failing.
// Force-trigger here, watch /api/sanctions/last-errors — one round-trip
// answers both.

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// runIngestionAll's per-adapter timeout is 12 s, run in parallel, so the
// realistic wall-clock is ~15 s including blob writes. 60 s leaves
// generous headroom for a slow adapter + the read-back verification step.
export const maxDuration = 60;

async function timingSafeTokenCheck(got: string, expected: string): Promise<boolean> {
  if (got.length !== expected.length) return false;
  const { timingSafeEqual } = await import("crypto");
  const enc = new TextEncoder();
  const expBuf = enc.encode(expected);
  const gotRaw = enc.encode(got);
  const gotBuf = new Uint8Array(expBuf.length);
  gotBuf.set(gotRaw.slice(0, expBuf.length));
  return timingSafeEqual(expBuf, gotBuf);
}

export async function POST(req: Request): Promise<NextResponse> {
  // Auth — fail closed.
  const expected = process.env["ADMIN_TOKEN"];
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "service unavailable — ADMIN_TOKEN not set" },
      { status: 503 },
    );
  }
  const got = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!got || !(await timingSafeTokenCheck(got, expected))) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  // Dynamic-import the compiled ingestion runner from dist/ so this route
  // doesn't hard-require the build to have completed at type-check time.
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
        error: `ingestion runner unavailable — ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 503 },
    );
  }

  const triggeredAt = new Date().toISOString();
  try {
    const result = (await runIngestionAll("admin-trigger-refresh")) as {
      ok: boolean;
      at: string;
      durationMs: number;
      ok_count: number;
      failed_count: number;
      anyWriteFailed: boolean;
      summary: Array<{ listId: string; recordCount: number; errors: string[] }>;
    };

    return NextResponse.json(
      {
        ok: result.ok,
        triggeredAt,
        ...result,
        hint: result.ok
          ? "Ingestion completed. Check /api/sanctions/status — recordCount should be > 0 within seconds."
          : "Ingestion completed with errors. Check /api/sanctions/last-errors for per-adapter detail.",
      },
      { status: result.ok ? 200 : 502 },
    );
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
}
