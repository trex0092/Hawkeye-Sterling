// GET /api/health
//
// Lightweight liveness probe. Returns 200 when the Next.js function
// runtime is alive. Brain check is best-effort — a missing dist/ folder
// (local dev) degrades to "degraded" instead of crashing.
//
// Response: { ok: true, status: "healthy", ts, runtime, buildId, commitRef }

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 5;

// Resolve build identity from CI/CD environment variables injected at
// build time. Checked in priority order: Netlify → Vercel → generic CI.
const BUILD_ID =
  process.env["NETLIFY_BUILD_ID"] ??
  process.env["NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA"] ??
  process.env["BUILD_ID"] ??
  "unknown";

const COMMIT_REF = (
  process.env["COMMIT_REF"] ??
  process.env["NETLIFY_COMMIT_REF"] ??
  process.env["VERCEL_GIT_COMMIT_SHA"] ??
  process.env["GIT_COMMIT"] ??
  "dev"
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
      brainDetail = "brain not built — dist/src/brain/quick-screen.js missing";
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

export async function GET(): Promise<NextResponse> {
  const brain = await checkBrain();
  const status = brain.ok ? "healthy" : "degraded";
  const code = brain.ok ? 200 : 200; // always 200 for liveness; use status field to detect degraded
  return NextResponse.json(
    {
      ok: true,
      status,
      ts: new Date().toISOString(),
      runtime: "nodejs",
      buildId: BUILD_ID,
      commitRef: COMMIT_REF,
      brain: { ok: brain.ok, detail: brain.detail },
    },
    { status: code },
  );
}
