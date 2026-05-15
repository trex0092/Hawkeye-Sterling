// GET /api/health
//
// Lightweight liveness probe. Returns 200 when the Next.js function
// runtime is alive. Brain check is best-effort — a missing dist/ folder
// (local dev) degrades to "degraded" instead of crashing.
//
// Response: { ok: true, status: "healthy", ts, runtime, buildId, commitRef }

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 5;

// Resolve build identity from CI/CD environment variables injected at
// build time. Checked in priority order: Netlify → Vercel → generic CI.
const BUILD_ID =
  process.env["HAWKEYE_BUILD_COMMIT_REF"] ??  // inlined by next.config.mjs (audit M-06)
  process.env["NETLIFY_BUILD_ID"] ??
  process.env["NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA"] ??
  process.env["BUILD_ID"] ??
  "unknown";

// Audit M-06: Netlify doesn't forward COMMIT_REF to the Lambda runtime,
// so direct process.env reads fall through to "unknown". next.config.mjs
// inlines the build-time SHA as HAWKEYE_BUILD_COMMIT_REF; read that first.
const COMMIT_REF = (
  process.env["HAWKEYE_BUILD_COMMIT_REF"] ??
  process.env["APP_VERSION"] ??
  process.env["GIT_COMMIT_SHA"] ??
  process.env["COMMIT_REF"] ??
  process.env["NETLIFY_COMMIT_REF"] ??
  process.env["VERCEL_GIT_COMMIT_SHA"] ??
  process.env["GIT_COMMIT"] ??
  "unknown"
).slice(0, 7);

let brainOk: boolean | null = null;
let brainDetail: string | null = null;

async function checkBrain(): Promise<{ ok: boolean; detail: string }> {
  if (brainOk !== null) return { ok: brainOk, detail: brainDetail ?? "" };
  try {
    const mod = await import("../../../../dist/src/brain/quick-screen.js").catch(() => null);
    const quickScreen = (mod as { quickScreen?: unknown } | null)?.quickScreen;
    if (typeof quickScreen !== "function") {
      brainOk = false;
      brainDetail = "BRAIN_MODULE_MISSING";
    } else {
      const probe = (quickScreen as (s: unknown, c: unknown[], o: unknown) => unknown)({ name: "HealthProbe" }, [], { maxHits: 0 });
      brainOk = typeof probe === "object" && probe !== null;
      brainDetail = brainOk ? "ok" : "quickScreen returned non-object";
    }
  } catch (err) {
    brainOk = false;
    brainDetail = err instanceof Error ? err.message : String(err);
  }
  return { ok: brainOk!, detail: brainDetail! };
}

export async function GET(req: Request): Promise<NextResponse> {
  const brain = await checkBrain();
  const status = brain.ok ? "healthy" : "degraded";
  const code = brain.ok ? 200 : 200; // always 200 for liveness; use status field to detect degraded

  // Only expose deployment details (buildId, commitRef) to authenticated callers.
  const gate = await enforce(req, { requireAuth: false });
  const authenticated = gate.ok && gate.keyId !== "anonymous";

  return NextResponse.json(
    {
      ok: true,
      status,
      ts: new Date().toISOString(),
      runtime: "nodejs",
      ...(authenticated ? { buildId: BUILD_ID, commitRef: COMMIT_REF } : {}),
      brain: { ok: brain.ok, detail: brain.ok ? brain.detail : "BRAIN_CHECK_FAILED" },
    },
    { status: code },
  );
}
