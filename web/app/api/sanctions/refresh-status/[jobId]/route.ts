// GET /api/sanctions/refresh-status/[jobId]
//
// Companion to /api/sanctions/operator-refresh: the refresh route fires
// the heavy ingestion in the background and returns a jobId; the
// Screening page polls this endpoint until the job reaches a terminal
// state (completed | failed).
//
// Returns 404 when the jobId is unknown (lookup is tenant-scoped — one
// operator cannot probe another tenant's job ids).

import { NextResponse } from "next/server";
import { withGuard, type RequestContext } from "@/lib/server/guard";
import { readJobStatus } from "@/lib/server/sanctions-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ jobId: string }>;
}

async function handleStatus(
  _req: Request,
  ctx: RequestContext,
  { params }: Params,
): Promise<NextResponse> {
  const { jobId } = await params;
  if (!jobId || !/^[0-9a-fA-F-]{8,}$/.test(jobId)) {
    return NextResponse.json(
      { ok: false, error: "invalid jobId" },
      { status: 400 },
    );
  }
  const record = await readJobStatus(ctx.tenantId, jobId);
  if (!record) {
    return NextResponse.json(
      { ok: false, error: "job not found" },
      { status: 404 },
    );
  }
  return NextResponse.json({ ok: true, ...record });
}

export function GET(
  req: Request,
  routeCtx: { params: Promise<{ jobId: string }> },
): Promise<Response> {
  return withGuard((r, ctx) => handleStatus(r, ctx, routeCtx))(req);
}
