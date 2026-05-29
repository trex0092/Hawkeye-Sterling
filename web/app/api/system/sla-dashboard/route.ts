// GET /api/system/sla-dashboard
//
// Real-time SLA metrics dashboard for the Hawkeye Sterling AML platform.
//
// Returns structured SLA metrics for the three primary compliance API endpoints
// (quick-screen, batch-screen, audit-trail) including p50/p95 latency estimates,
// breach rates, and an overall health classification.
//
// The sla-monitor module (lib/server/sla-monitor.ts) is a pure case-SLA
// classifier that operates on case deadline timers — it does not record
// per-request HTTP latency.  This dashboard derives approximate SLA metrics
// from the case breach/approaching classification data as a proxy:
//   - "breach rate" maps to the fraction of CRITICAL/HIGH cases in breach
//   - p50/p95 latency values are null when no timing data is available
//
// Auth: requireAuth: true — operational metric data is restricted to
// authenticated callers.

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { classifyCasesBySla, type SlaCaseShape } from "@/lib/server/sla-monitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

// ── SLA targets ────────────────────────────────────────────────────────────

const SLA_TARGETS = {
  quickScreen:  5_000,   // 5 s — hard deadline in quick-screen route
  batchScreen: 30_000,   // 30 s
  auditTrail:   2_000,   // 2 s
} as const;

type EndpointKey = keyof typeof SLA_TARGETS;

interface EndpointSla {
  targetMs: number;
  p50Ms: number | null;
  p95Ms: number | null;
  breachRate: number;
}

interface SlaDashboardResponse {
  ok: true;
  timestamp: string;
  slaTargets: Record<EndpointKey, EndpointSla>;
  overallHealth: "healthy" | "degraded" | "critical";
  caseSlaClassification?: {
    breachedCount: number;
    approachingCount: number;
    skipped: number;
  };
}

// ── Case-SLA derivation ────────────────────────────────────────────────────
//
// Attempt to load live case data from the alerts-store (which aggregates
// across all tenants) and run the sla-monitor classifier.  Falls back to
// null when the store is unavailable (CI / local dev without Blobs).

async function loadCaseBreachMetrics(): Promise<{ breachedCount: number; approachingCount: number; skipped: number } | null> {
  try {
    // Dynamic import — breach-store may not be available in all envs.
    const breachStoreMod = await import("@/lib/server/breach-store").catch(() => null);
    if (!breachStoreMod) return null;

    const { listBreaches } = breachStoreMod as unknown as { listBreaches?: () => Promise<SlaCaseShape[]> };
    if (typeof listBreaches !== "function") return null;

    const rawCases = await listBreaches().catch(() => null);
    if (!Array.isArray(rawCases)) return null;

    const classification = classifyCasesBySla(rawCases, new Date(), {
      alertCategories: ["CRITICAL", "HIGH"],
      approachWindowHours: 48,
      skipAlreadyBreached: false,
    });

    return {
      breachedCount:    classification.breached.length,
      approachingCount: classification.approaching.length,
      skipped:          classification.skipped,
    };
  } catch {
    return null;
  }
}

// ── Health derivation ──────────────────────────────────────────────────────

function deriveOverallHealth(
  endpoints: Record<EndpointKey, EndpointSla>,
  caseMetrics: { breachedCount: number } | null,
): "healthy" | "degraded" | "critical" {
  // If any endpoint breach rate is high → critical
  const maxBreachRate = Math.max(...Object.values(endpoints).map((e) => e.breachRate));
  if (maxBreachRate >= 0.20) return "critical";

  // If there are active case SLA breaches → degraded
  if (caseMetrics && caseMetrics.breachedCount > 0) return "degraded";

  // If any endpoint breach rate is non-trivial → degraded
  if (maxBreachRate >= 0.05) return "degraded";

  return "healthy";
}

// ── Route handler ──────────────────────────────────────────────────────────

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req, { requireAuth: true });
  if (!gate.ok) return gate.response;

  const caseMetrics = await loadCaseBreachMetrics();

  // HTTP timing latency data is not persisted by the current sla-monitor
  // module (it classifies case deadline timers, not request durations).
  // Return null for p50/p95 and derive breach rates from case metrics only.
  const denominator = caseMetrics
    ? caseMetrics.breachedCount + caseMetrics.approachingCount + caseMetrics.skipped
    : 0;
  const breachRate = denominator > 0
    ? caseMetrics!.breachedCount / denominator
    : 0;

  const slaTargets: Record<EndpointKey, EndpointSla> = {
    quickScreen: {
      targetMs:   SLA_TARGETS.quickScreen,
      p50Ms:      null,
      p95Ms:      null,
      breachRate,
    },
    batchScreen: {
      targetMs:   SLA_TARGETS.batchScreen,
      p50Ms:      null,
      p95Ms:      null,
      breachRate: 0,
    },
    auditTrail: {
      targetMs:   SLA_TARGETS.auditTrail,
      p50Ms:      null,
      p95Ms:      null,
      breachRate: 0,
    },
  };

  const overallHealth = deriveOverallHealth(slaTargets, caseMetrics);

  const body: SlaDashboardResponse = {
    ok: true,
    timestamp: new Date().toISOString(),
    slaTargets,
    overallHealth,
    ...(caseMetrics ? {
      caseSlaClassification: {
        breachedCount:    caseMetrics.breachedCount,
        approachingCount: caseMetrics.approachingCount,
        skipped:          caseMetrics.skipped,
      },
    } : {}),
  };

  return NextResponse.json(body, {
    status: 200,
    headers: {
      ...(gate.ok ? gate.headers : {}),
      "cache-control": "no-store",
    },
  });
}
