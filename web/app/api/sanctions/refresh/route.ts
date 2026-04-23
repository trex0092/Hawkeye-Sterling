import { NextResponse } from "next/server";
import { withGuard } from "@/lib/server/guard";
import { invalidateCandidateCache } from "@/lib/server/candidates-loader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Operator-triggered sanctions-list refresh. The authoritative refresh is
// the scheduled Netlify Function at netlify/functions/refresh-lists.ts
// (cron: 0 3 * * * = 03:00 UTC daily). This route lets an MLRO kick off
// an ad-hoc refresh without waiting for the next cron tick.
//
// We don't duplicate the adapter code here — instead we invalidate the
// in-process candidate cache and return a JSON response telling the
// operator to expect live data on the next screen. If they want a true
// force-refresh they still trigger the Netlify Function directly.
//
// This endpoint is intentionally minimal — sanctions-list fetches are
// heavyweight (UN Consolidated ~15 MB) and should not run inside a
// request/response cycle. The cron does the work; this route lets
// operators see the last run + clear the cache.

interface RefreshSummary {
  ok: true;
  cacheInvalidated: true;
  scheduledCron: "0 3 * * *";
  lastRunBlobKey: string;
  message: string;
}

async function handleRefresh(_req: Request): Promise<NextResponse> {
  invalidateCandidateCache();

  const body: RefreshSummary = {
    ok: true,
    cacheInvalidated: true,
    scheduledCron: "0 3 * * *",
    lastRunBlobKey: "hawkeye-list-reports/<listId>/latest.json",
    message:
      "Candidate cache invalidated — the next screen will reload live lists from Netlify Blobs. " +
      "For a full re-fetch from upstream publishers, trigger the refresh-lists scheduled function in the Netlify dashboard.",
  };
  return NextResponse.json(body, { status: 200 });
}

export const POST = withGuard(handleRefresh);
