// GET /api/admin/trigger-list-refresh
//
// Manual force-trigger for UAE EOCN + LTL ingestion. Runs the full
// runIngestionAll() pipeline (all adapters) then reads the resulting
// blob store counts for uae_eocn and uae_ltl specifically. Designed
// for the MLRO to verify list freshness after a 161h staleness incident
// or when UAE lists show 0 rows.
//
// Auth: Bearer ADMIN_TOKEN (same as other admin routes).
// Returns 200 even when adapters partially fail so callers can see
// which specific lists recovered and which still need attention.
//
// Response shape:
//   { eocn_rows: N, ltl_rows: N, timestamp: "<ISO>", status: "ok" | "partial" | "error" }

import { NextResponse } from "next/server";
import { getJson } from "@/lib/server/store";
import { invalidateCandidateCache } from "@/lib/server/candidates-loader";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
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

interface ListReport {
  recordCount?: number;
  fetchedAt?: string;
}

async function readListRowCount(listId: string): Promise<number> {
  try {
    const report = await getJson<ListReport>(`${listId}/latest.json`);
    return typeof report?.recordCount === "number" ? report.recordCount : 0;
  } catch {
    return 0;
  }
}

export async function GET(req: Request): Promise<NextResponse> {
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

  let runIngestionAll: (_label: string) => Promise<unknown>;
  try {
    const mod = (await import(
      "../../../../../src/ingestion/run-all.js" as string
    )) as { runIngestionAll: typeof runIngestionAll };
    runIngestionAll = mod.runIngestionAll;
  } catch (err) {
    console.error("[trigger-list-refresh] failed to load ingestion runner:", err instanceof Error ? err.message : String(err));
    return NextResponse.json(
      {
        ok: false,
        error: "ingestion service unavailable",
      },
      { status: 503 },
    );
  }

  const triggeredAt = new Date().toISOString();
  try {
    const result = (await runIngestionAll("admin-trigger-list-refresh")) as {
      ok: boolean;
      at: string;
      durationMs: number;
      ok_count: number;
      failed_count: number;
      anyWriteFailed: boolean;
      summary: Array<{ listId: string; recordCount: number; errors: string[] }>;
    };

    invalidateCandidateCache();

    // Read UAE-specific row counts from the hawkeye-list-reports blob store.
    // These are written by runIngestionAll via putDataset in blobs-store.ts.
    // Using the report store (hawkeye-list-reports) rather than hawkeye-lists
    // gives us the post-ingest recordCount without loading the full entity list.
    const [eocnRows, ltlRows] = await Promise.all([
      readListRowCount("uae_eocn"),
      readListRowCount("uae_ltl"),
    ]);

    const status = result.ok
      ? "ok"
      : result.anyWriteFailed
        ? "partial"
        : "error";

    void writeAuditChainEntry(
      {
        event: "sanctions.uae_list_refresh_triggered",
        actor: "admin",
        triggeredAt,
        ok: result.ok,
        eocnRows,
        ltlRows,
        durationMs: result.durationMs,
      },
      "admin",
    ).catch((err) =>
      console.warn("[trigger-list-refresh] audit chain write failed:", err instanceof Error ? err.message : String(err)),
    );

    return NextResponse.json(
      {
        ok: result.ok,
        eocn_rows: eocnRows,
        ltl_rows: ltlRows,
        timestamp: triggeredAt,
        status,
        durationMs: result.durationMs,
        ok_count: result.ok_count,
        failed_count: result.failed_count,
        hint: eocnRows === 0 || ltlRows === 0
          ? "UAE lists still show 0 rows — check NETLIFY_BLOBS_TOKEN and UAE_EOCN_SEED_PATH / UAE_LTL_SEED_PATH env vars"
          : "UAE lists refreshed successfully",
      },
      { status: 200 },
    );
  } catch (err) {
    console.error("[trigger-list-refresh] runIngestionAll threw:", err instanceof Error ? err.message : String(err));
    return NextResponse.json(
      {
        ok: false,
        eocn_rows: 0,
        ltl_rows: 0,
        timestamp: triggeredAt,
        status: "error",
        error: "ingestion service unavailable",
      },
      { status: 500 },
    );
  }
}
