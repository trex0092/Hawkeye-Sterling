// GET /api/mlro-advisor/result?jobId=<id>
//
// Polls the result of an async MLRO advisor job.
// Jobs are created by POST /api/mlro-advisor with body.async=true.
// The POST returns { jobId, status: "queued" } immediately; this
// endpoint returns the full result once the job completes.
//
// Job lifecycle: queued → running → completed | failed
// TTL: job blobs expire after 24h (not enforced here — ops can clear manually).

import { NextResponse } from "next/server";
import { withGuard, type RequestContext } from "@/lib/server/guard";
import { getJson } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

const SAFE_ID_RE = /^[a-zA-Z0-9_\-]{4,128}$/;

export interface MlroJobRecord {
  jobId: string;
  status: "queued" | "running" | "completed" | "failed";
  createdAt: string;
  updatedAt: string;
  tenantId?: string;
  question?: string;
  result?: unknown;
  error?: string;
  latencyMs?: number;
}

function jobKey(jobId: string): string {
  return `hawkeye-mlro-jobs/${jobId}.json`;
}

async function handleGet(req: Request, ctx: RequestContext): Promise<NextResponse> {
  const url = new URL(req.url);
  const jobId = url.searchParams.get("jobId")?.trim();

  if (!jobId || !SAFE_ID_RE.test(jobId)) {
    return NextResponse.json(
      { ok: false, error: "jobId required (alphanumeric/._-, 4-128 chars)" },
      { status: 400 },
    );
  }

  const job = await getJson<MlroJobRecord>(jobKey(jobId));

  if (!job) {
    return NextResponse.json(
      { ok: false, error: "job not found", jobId },
      { status: 404 },
    );
  }

  // Tenant isolation — only return jobs belonging to this tenant.
  if (job.tenantId && job.tenantId !== ctx.tenantId) {
    return NextResponse.json(
      { ok: false, error: "job not found", jobId },
      { status: 404 },
    );
  }

  if (job.status === "queued" || job.status === "running") {
    return NextResponse.json(
      {
        ok: true,
        jobId,
        status: job.status,
        createdAt: job.createdAt,
        message: "Job in progress — poll again in a few seconds.",
      },
      { status: 202 },
    );
  }

  if (job.status === "failed") {
    return NextResponse.json(
      {
        ok: false,
        jobId,
        status: "failed",
        error: job.error ?? "Job failed",
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      },
      { status: 200 },
    );
  }

  // completed
  return NextResponse.json({
    ok: true,
    jobId,
    status: "completed",
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    latencyMs: job.latencyMs,
    result: job.result,
  });
}

export const GET = withGuard(handleGet);
