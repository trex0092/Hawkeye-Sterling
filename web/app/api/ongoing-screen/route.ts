// GET /api/ongoing-screen
//
// Returns the ongoing-screening status — count of enrolled subjects and
// last run timestamp from the function heartbeat.
//
// The scheduled function (netlify/functions/ongoing-screen.mts) runs
// hourly and calls POST /api/ongoing/run (protected by ONGOING_RUN_TOKEN).
// This GET endpoint is the operator-facing status view.
//
// For the enrollment roster (GET/POST/DELETE subjects), use /api/ongoing.
// To trigger an immediate run: POST /api/ongoing/run (ONGOING_RUN_TOKEN).

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { listKeys } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  // Count enrolled subjects from the ongoing blob store.
  const enrolledCount = await listKeys("ongoing/subject/")
    .then((k) => k.length)
    .catch(() => null);

  // Read last heartbeat from the scheduled function.
  let lastRun: string | null = null;
  try {
    let blobsMod: typeof import("@netlify/blobs") | null = null;
    try { blobsMod = await import("@netlify/blobs"); } catch { /* not bound */ }
    if (blobsMod) {
      const siteID = process.env["NETLIFY_SITE_ID"] ?? process.env["SITE_ID"];
      const token = process.env["NETLIFY_BLOBS_TOKEN"] ?? process.env["NETLIFY_API_TOKEN"] ?? process.env["NETLIFY_AUTH_TOKEN"];
      const storeOpts = siteID && token
        ? { name: "hawkeye-function-heartbeats", siteID, token, consistency: "strong" as const }
        : { name: "hawkeye-function-heartbeats" };
      const hbStore = blobsMod.getStore(storeOpts);
      const hb = await hbStore.get("ongoing-screen", { type: "json" }).catch(() => null) as { lastSuccess?: string } | null;
      lastRun = hb?.lastSuccess ?? null;
    }
  } catch { /* non-fatal */ }

  return NextResponse.json(
    {
      ok: true,
      enrolledSubjects: enrolledCount,
      lastRun,
      scheduleNote: "Runs hourly via ongoing-screen.mts → POST /api/ongoing/run",
      rosterEndpoint: "GET /api/ongoing (enroll/list/remove subjects)",
      triggerEndpoint: "POST /api/ongoing/run (requires ONGOING_RUN_TOKEN)",
    },
    { headers: gate.headers },
  );
}
