// GET /api/screening/health
//
// Screening subsystem health probe. Checks:
//   - brain quickScreen module importability
//   - watchlist corpus availability (loadCandidates)
//   - sanctions list freshness (from Blobs metadata)
//
// Returns structured status so the UI integration status panel and
// regulator-facing SLA dashboards can surface per-component health.
//
// No auth required (liveness/readiness probes must work without creds).

import { NextResponse } from "next/server";
import { getJson } from "@/lib/server/store";
import { quickScreen } from "../../../../../dist/src/brain/quick-screen.js";
import { loadCandidates } from "@/lib/server/candidates-loader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

type ComponentStatus = "healthy" | "degraded" | "down" | "unconfigured";

interface ComponentCheck {
  name: string;
  status: ComponentStatus;
  detail?: string;
  latencyMs?: number;
}

async function checkBrainEngine(): Promise<ComponentCheck> {
  const t0 = Date.now();
  try {
    const r = quickScreen({ name: "HealthProbe" }, [], { maxHits: 0 });
    const ok = typeof r === "object" && r !== null;
    return {
      name: "brain_engine",
      status: ok ? "healthy" : "degraded",
      detail: ok ? "quickScreen callable" : "returned null",
      latencyMs: Date.now() - t0,
    };
  } catch {
    return {
      name: "brain_engine",
      status: "down",
      detail: "BRAIN_MODULE_MISSING",
      latencyMs: Date.now() - t0,
    };
  }
}

async function checkWatchlistCorpus(): Promise<ComponentCheck> {
  const t0 = Date.now();
  try {
    const candidates = await loadCandidates();
    if (!Array.isArray(candidates) || candidates.length === 0) {
      return {
        name: "watchlist_corpus",
        status: "degraded",
        detail: `loadCandidates returned ${Array.isArray(candidates) ? "empty array" : "non-array"}`,
        latencyMs: Date.now() - t0,
      };
    }
    return {
      name: "watchlist_corpus",
      status: "healthy",
      detail: `${candidates.length.toLocaleString()} entries loaded`,
      latencyMs: Date.now() - t0,
    };
  } catch {
    return {
      name: "watchlist_corpus",
      status: "down",
      detail: "CORPUS_LOAD_ERROR",
      latencyMs: Date.now() - t0,
    };
  }
}

async function checkSanctionsLists(): Promise<ComponentCheck> {
  const t0 = Date.now();
  try {
    const meta = await getJson<{ updatedAt?: string; totalEntries?: number }>(
      "sanctions/meta.json",
    );
    if (!meta) {
      return {
        name: "sanctions_lists",
        status: "degraded",
        detail: "CORPUS_MISSING",
        latencyMs: Date.now() - t0,
      };
    }
    const ageMs = meta.updatedAt ? Date.now() - Date.parse(meta.updatedAt) : Infinity;
    const STALE_MS = 36 * 60 * 60 * 1000;
    const stale = ageMs > STALE_MS;
    return {
      name: "sanctions_lists",
      status: stale ? "degraded" : "healthy",
      detail: `${meta.totalEntries ?? "?"} entries, last updated ${meta.updatedAt ?? "unknown"} (${stale ? "STALE" : "fresh"})`,
      latencyMs: Date.now() - t0,
    };
  } catch {
    return {
      name: "sanctions_lists",
      status: "degraded",
      detail: "CORPUS_READ_ERROR",
      latencyMs: Date.now() - t0,
    };
  }
}

export async function GET(): Promise<NextResponse> {
  const [engine, corpus, sanctions] = await Promise.all([
    checkBrainEngine(),
    checkWatchlistCorpus(),
    checkSanctionsLists(),
  ]);

  const checks: ComponentCheck[] = [engine, corpus, sanctions];
  const allHealthy = checks.every((c) => c.status === "healthy");
  const anyDown = checks.some((c) => c.status === "down");
  const overallStatus: ComponentStatus = allHealthy
    ? "healthy"
    : anyDown
      ? "down"
      : "degraded";
  const httpStatus = allHealthy ? 200 : anyDown ? 503 : 207;

  return NextResponse.json(
    {
      ok: allHealthy,
      status: overallStatus,
      ts: new Date().toISOString(),
      checks,
    },
    { status: httpStatus },
  );
}
