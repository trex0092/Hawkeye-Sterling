// POST /api/sanctions/operator-refresh
//
// Browser-callable, operator-session-authenticated trigger for a full
// sanctions list re-ingestion. Behaves like /api/admin/trigger-refresh
// but uses the operator session (withGuard) instead of ADMIN_TOKEN, so
// MLROs can force-refresh from the Screening page without needing to
// paste a token.
//
// Calls runIngestionAll() directly from this Lambda — same code path
// the cron functions use — and returns the per-adapter summary.

import { NextResponse } from "next/server";
import { withGuard } from "@/lib/server/guard";
import { invalidateCandidateCache } from "@/lib/server/candidates-loader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handleOperatorRefresh(_req: Request): Promise<NextResponse> {
  let runIngestionAll: (_label: string) => Promise<unknown>;
  try {
    const mod = (await import(
      "../../../../../src/ingestion/run-all.js" as string
    )) as { runIngestionAll: typeof runIngestionAll };
    runIngestionAll = mod.runIngestionAll;
  } catch (err) {
    console.error("[sanctions/operator-refresh] ingestion runner import failed:", err);
    return NextResponse.json(
      {
        ok: false,
        error: "ingestion runner unavailable — please check deployment build artifacts",
      },
      { status: 503 },
    );
  }

  const triggeredAt = new Date().toISOString();
  try {
    const result = (await runIngestionAll("operator-refresh")) as {
      ok: boolean;
      at: string;
      durationMs: number;
      ok_count: number;
      failed_count: number;
      anyWriteFailed: boolean;
      summary: Array<{ listId: string; recordCount: number; errors: string[] }>;
    };

    // Drop the in-process candidate cache so the next screening request
    // reloads fresh entities from the blobs we just wrote.
    invalidateCandidateCache();

    return NextResponse.json(
      {
        triggeredAt,
        ...result,
        hint: result.ok
          ? "Ingestion completed. Reload the page in ~10 s — ticker timestamps should update."
          : "Ingestion completed with errors. Check /api/sanctions/last-errors for per-adapter detail.",
      },
      { status: result.ok ? 200 : 502 },
    );
  } catch (err) {
    console.error("[sanctions/operator-refresh] runIngestionAll threw:", err);
    return NextResponse.json(
      {
        ok: false,
        triggeredAt,
        error: "Ingestion run failed — see server logs for details.",
      },
      { status: 500 },
    );
  }
}

export const POST = withGuard(handleOperatorRefresh);
