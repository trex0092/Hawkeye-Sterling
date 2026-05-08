// GET /api/health
//
// Lightweight liveness probe. Returns 200 when the Next.js function
// runtime is alive and the compiled brain module is importable.
// Netlify health checks, load-balancers, and uptime monitors can
// poll this without hitting rate-limit logic or Blobs storage.
//
// Response: { ok: true, status: "healthy", ts, runtime, buildId }

import { NextResponse } from "next/server";
import { quickScreen } from "../../../../dist/src/brain/quick-screen.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 5;

const BUILD_ID = process.env["NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA"] ??
  process.env["COMMIT_REF"] ??
  "unknown";

let brainOk: boolean | null = null;
let brainDetail: string | null = null;

function checkBrain(): { ok: boolean; detail: string } {
  if (brainOk !== null) return { ok: brainOk, detail: brainDetail ?? "" };
  try {
    const probe = quickScreen({ name: "HealthProbe" }, [], { maxHits: 0 });
    brainOk = typeof probe === "object" && probe !== null;
    brainDetail = brainOk ? "ok" : "quickScreen returned non-object";
  } catch (err) {
    brainOk = false;
    brainDetail = err instanceof Error ? err.message : String(err);
  }
  return { ok: brainOk, detail: brainDetail ?? "" };
}

export function GET(): NextResponse {
  const brain = checkBrain();
  const status = brain.ok ? "healthy" : "degraded";
  const code = brain.ok ? 200 : 503;
  return NextResponse.json(
    {
      ok: brain.ok,
      status,
      ts: new Date().toISOString(),
      runtime: "nodejs",
      buildId: BUILD_ID,
      brain: { ok: brain.ok, detail: brain.detail },
    },
    { status: code },
  );
}
