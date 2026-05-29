import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { listBatchRuns, getBatchRun } from "@/lib/server/batch-history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const runId = url.searchParams.get("runId");

  if (runId) {
    const run = await getBatchRun(runId);
    if (!run) {
      return NextResponse.json({ ok: false, error: "run not found" }, { status: 404, headers: gate.headers });
    }
    return NextResponse.json({ ok: true, run }, { headers: gate.headers });
  }

  const runs = await listBatchRuns();
  return NextResponse.json({ ok: true, runs }, { headers: gate.headers });
}
