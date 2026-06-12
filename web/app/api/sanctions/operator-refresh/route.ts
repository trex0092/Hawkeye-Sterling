// POST /api/sanctions/operator-refresh
//
// Browser-callable, operator-session-authenticated trigger for a full
// sanctions list re-ingestion. Behaves like /api/admin/trigger-refresh
// but uses the operator session (withGuard) instead of ADMIN_TOKEN, so
// MLROs can force-refresh from the Screening page without needing to
// paste a token.
//
// Previously this awaited runIngestionAll() synchronously, which blocked
// the Lambda for 15-30 s. Netlify's edge inactivity timeout (~26 s) would
// then kill the connection and the browser would see an HTML 504 page
// even when the work was actually proceeding. To fix the user-visible
// "Refresh failed (HTTP 504)" banner, the route now:
//
//   1. Generates a jobId and writes a "running" status record.
//   2. Returns 202 { jobId, status: "running" } within a few ms.
//   3. Continues runIngestionAll() in the background, writing the
//      terminal status when it finishes.
//
// The Screening page polls /api/sanctions/refresh-status/[jobId] for
// the outcome. If the background work outlives the Lambda's
// maxDuration, the status will remain "running" until the next refresh
// — the client gracefully shows a "still running, check back later"
// message in that case instead of flashing an error.
//
// TIME BUDGET REALITY (production, 2026-06-12): the post-202 work is a
// detached promise on the same Lambda invocation (no waitUntil). It runs
// on borrowed time — maxDuration is 60 s, yet adapters from the
// 12:07:13 job were still logging at 12:08:58 (+105 s), so Netlify's
// Next runtime demonstrably lets the continuation run well past the
// declared cap (and a frozen warm instance resumes it on thaw). Minutes
// are therefore PLAUSIBLE but NOT GUARANTEED here, which is why:
//   · tier 1 (light adapters, 45 s parallel leash) runs first, so all
//     light-list blob writes are committed before any heavy parse can
//     monopolise the event loop or the Lambda gets reaped;
//   · tier 2 (au_dfat / ch_seco, sequential, 120 s each) is best-effort
//     intraday — the nightly refresh-lists-background worker (900 s
//     budget, same 120 s heavy leash) is the GUARANTEED heavy path.

import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { withGuard, type RequestContext } from "@/lib/server/guard";
import { invalidateCandidateCache } from "@/lib/server/candidates-loader";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { writeJobStatus, type SanctionsJobRecord } from "@/lib/server/sanctions-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface IngestionResult {
  ok: boolean;
  at: string;
  durationMs: number;
  ok_count: number;
  failed_count: number;
  anyWriteFailed: boolean;
  summary: Array<{ listId: string; recordCount: number; errors: string[] }>;
}

async function handleOperatorRefresh(_req: Request, ctx: RequestContext): Promise<NextResponse> {
  let runIngestionAll: (
    _label: string,
    _opts?: { adapterTimeoutMs?: number; heavyAdapterTimeoutMs?: number },
  ) => Promise<unknown>;
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

  const jobId = randomUUID();
  const triggeredAt = new Date().toISOString();
  const initial: SanctionsJobRecord = {
    jobId,
    status: "running",
    tenantId: ctx.tenantId,
    startedAt: triggeredAt,
  };
  await writeJobStatus(initial);

  void writeAuditChainEntry(
    { event: "sanctions.ingestion_triggered", actor: ctx.apiKey.id, meta: { jobId } },
    ctx.tenantId,
  ).catch((e: unknown) =>
    console.warn("[audit] write failed:", e instanceof Error ? e.message : String(e)),
  );

  // Fire-and-forget the heavy work so the response can return inside
  // the edge inactivity window. Writes the terminal status when
  // runIngestionAll resolves OR rejects so the status endpoint always
  // converges to a known state.
  void (async () => {
    try {
      // Tier 1 keeps the 45 s light leash (vs the crons' 20 s). Tier 2 runs
      // au_dfat / ch_seco sequentially at 120 s each — sized for au_dfat's
      // 40 s download + ~60 s exceljs parse, and only reachable because the
      // post-202 continuation has been observed to live >105 s in prod (see
      // header). If the Lambda is reaped mid-heavy-tier the light lists are
      // already written and the nightly background worker remains the
      // guaranteed heavy refresh.
      const result = (await runIngestionAll("operator-refresh", {
        adapterTimeoutMs: 45_000,
        heavyAdapterTimeoutMs: 120_000,
      })) as IngestionResult;
      invalidateCandidateCache();
      await writeJobStatus({
        jobId,
        status: "completed",
        tenantId: ctx.tenantId,
        startedAt: triggeredAt,
        completedAt: new Date().toISOString(),
        result: {
          ok: result.ok,
          durationMs: result.durationMs,
          ok_count: result.ok_count,
          failed_count: result.failed_count,
          anyWriteFailed: result.anyWriteFailed,
          summary: result.summary,
        },
      });
      void writeAuditChainEntry(
        {
          event: "sanctions.ingestion_completed",
          actor: ctx.apiKey.id,
          meta: { jobId, ok_count: result.ok_count, failed_count: result.failed_count },
        },
        ctx.tenantId,
      ).catch((e: unknown) =>
        console.warn("[audit] write failed:", e instanceof Error ? e.message : String(e)),
      );
    } catch (err) {
      console.error("[sanctions/operator-refresh] background ingestion failed:", err);
      const detail = err instanceof Error ? err.message : String(err);
      await writeJobStatus({
        jobId,
        status: "failed",
        tenantId: ctx.tenantId,
        startedAt: triggeredAt,
        completedAt: new Date().toISOString(),
        error: detail,
      });
      void writeAuditChainEntry(
        {
          event: "sanctions.ingestion_failed",
          actor: ctx.apiKey.id,
          meta: { jobId, error: detail },
        },
        ctx.tenantId,
      ).catch((e: unknown) =>
        console.warn("[audit] write failed:", e instanceof Error ? e.message : String(e)),
      );
    }
  })();

  return NextResponse.json(
    {
      ok: true,
      jobId,
      status: "running",
      triggeredAt,
      statusUrl: `/api/sanctions/refresh-status/${jobId}`,
      hint: "Ingestion started — poll the statusUrl every few seconds until status is completed or failed.",
    },
    { status: 202 },
  );
}

export const POST = withGuard(handleOperatorRefresh);
