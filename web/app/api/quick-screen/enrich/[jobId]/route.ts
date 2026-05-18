// GET /api/quick-screen/enrich/[jobId]
//
// Polling endpoint for deferred enrichment results. When quick-screen hits its
// 2.8s hard deadline it returns enrichmentPending:true plus an enrichJobId.
// The client polls here until complete:true is returned.
//
// On first poll (status=pending): internally re-calls /api/quick-screen with
//   the x-enrich-job-id header set so the deadline is skipped and adapters
//   run to completion. Result is cached in Netlify Blobs.
// On subsequent polls (status=complete): returns the cached result immediately.
// After 30 minutes the job expires and 404 is returned.

import { type NextRequest, NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { getEnrichmentJob } from "@/lib/server/enrichment-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 25;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
): Promise<NextResponse> {
  const gate = await enforce(req, { requireAuth: true });
  if (!gate.ok) return gate.response as NextResponse;

  const { jobId } = await params;
  if (!jobId || typeof jobId !== "string") {
    return NextResponse.json({ ok: false, error: "jobId required" }, { status: 400 });
  }

  const job = await getEnrichmentJob(jobId);
  if (!job) {
    return NextResponse.json(
      { ok: false, error: "enrichment job not found or expired", enrichJobId: jobId },
      { status: 404 },
    );
  }

  // Already complete — return cached result.
  if (job.status === "complete" && job.fullResult) {
    return NextResponse.json(
      { ok: true, complete: true, enrichJobId: jobId, result: job.fullResult },
      { headers: gate.headers },
    );
  }

  // Still pending — trigger full enrichment by re-calling quick-screen with
  // the x-enrich-job-id header. This skips the hard deadline so all
  // adapters (news, registries, LLM) run to completion. The result is
  // persisted by quick-screen before returning.
  const base =
    process.env["URL"] ??
    process.env["DEPLOY_PRIME_URL"] ??
    "https://hawkeye-sterling.netlify.app";

  const authHeader = req.headers.get("authorization") ?? "";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(`${base}/api/quick-screen`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: authHeader,
        "x-enrich-job-id": jobId,
      },
      body: JSON.stringify(job.subject),
      signal: controller.signal,
    });

    const enriched = await res.json() as Record<string, unknown>;
    return NextResponse.json(
      { ok: true, complete: true, enrichJobId: jobId, result: enriched },
      { status: res.ok ? 200 : 502, headers: gate.headers },
    );
  } catch (err) {
    // If enrichment timed out or failed, return the partial result so the
    // client is never left waiting indefinitely.
    return NextResponse.json(
      {
        ok: true,
        complete: false,
        enrichJobId: jobId,
        result: job.partialResult,
        enrichmentError: err instanceof Error ? err.message : String(err),
      },
      { status: 200, headers: gate.headers },
    );
  } finally {
    clearTimeout(timeout);
  }
}
