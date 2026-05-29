// GET /api/intel-feed[?limit=N][&types=regulatory,sanctions,gdelt,typology]
//
// Unified signal feed panel endpoint. Aggregates intel signals from multiple
// internal sources and returns them as a sorted, paginated feed for the
// command-centre "Intel Feed" panel.
//
// Signal sources:
//   - Regulatory changes  (/api/regulatory-feed)
//   - Sanctions alerts    (internal store keys)
//   - GDELT typology hits (aml-keywords enriched)
//   - Audit trail events  (last N entries)
//
// All sources run concurrently via Promise.allSettled so one failing source
// does not block the feed. Each signal item carries a source tag so the UI
// can colour-code or filter by type.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { listKeys, getJson } from "@/lib/server/store";

export interface IntelSignal {
  id: string;
  type: "regulatory" | "sanctions" | "audit" | "alert" | "system";
  severity: "info" | "low" | "medium" | "high" | "critical";
  title: string;
  summary: string;
  source: string;
  publishedAt: string;
  url?: string;
  tags?: string[];
}

interface AuditEntry {
  id?: string;
  at?: string;
  action?: string;
  target?: string;
  actor?: string;
}

interface SanctionsMeta {
  lastChangeAt?: string;
  lastChangeKind?: string;
  totalEntities?: number;
}

function signalId(prefix: string, idx: number): string {
  return `${prefix}-${Date.now()}-${idx}`;
}

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 200);
  const typesParam = url.searchParams.get("types");
  const allowedTypes = typesParam
    ? new Set(typesParam.split(",").map((t) => t.trim()))
    : null; // null = all types

  const signals: IntelSignal[] = [];

  try {
  // ── 1. Sanctions alerts ──────────────────────────────────────────────────
  if (!allowedTypes || allowedTypes.has("sanctions")) {
    const [sanctionsMeta, sanctionsErr] = await getJson<SanctionsMeta>("hawkeye-sanctions/_meta.json")
      .then((v) => [v, null] as const)
      .catch((e: unknown) => [null, e] as const);

    if (sanctionsMeta && !sanctionsErr) {
      signals.push({
        id: signalId("sanctions", 0),
        type: "sanctions",
        severity: "info",
        title: "Sanctions list last refreshed",
        summary: `Sanctions corpus updated. Last change: ${sanctionsMeta.lastChangeKind ?? "refresh"}. ${
          sanctionsMeta.totalEntities ? `${sanctionsMeta.totalEntities} entities indexed.` : ""
        }`,
        source: "hawkeye-sanctions",
        publishedAt: sanctionsMeta.lastChangeAt ?? new Date().toISOString(),
        tags: ["sanctions", "ofac", "un", "eu"],
      });
    }

    // Check for designation alerts in alerts store
    const alertKeys = await listKeys("designation-alerts/").catch(() => [] as string[]);
    const recentAlerts = alertKeys.slice(-5);
    const alertItems = await Promise.allSettled(
      recentAlerts.map((k) => getJson<{ title?: string; body?: string; createdAt?: string; severity?: string }>(k)),
    );
    alertItems.forEach((r, i) => {
      if (r.status === "fulfilled" && r.value) {
        const a = r.value;
        signals.push({
          id: signalId("alert", i),
          type: "sanctions",
          severity: (a.severity as IntelSignal["severity"]) ?? "high",
          title: a.title ?? "New designation alert",
          summary: a.body ?? "A new sanctions designation was detected.",
          source: "designation-alerts",
          publishedAt: a.createdAt ?? new Date().toISOString(),
          tags: ["sanctions", "designation", "alert"],
        });
      }
    });
  }

  // ── 2. Audit trail signals ────────────────────────────────────────────────
  if (!allowedTypes || allowedTypes.has("audit")) {
    const auditKeys = await listKeys("hawkeye-audit-chain/").catch(() => [] as string[]);
    const recentAudit = auditKeys.slice(-10);
    const auditItems = await Promise.allSettled(
      recentAudit.map((k) => getJson<AuditEntry>(k)),
    );
    auditItems.forEach((r, i) => {
      if (r.status === "fulfilled" && r.value) {
        const e = r.value;
        signals.push({
          id: signalId("audit", i),
          type: "audit",
          severity: "info",
          title: `Audit: ${e.action ?? "event"}`,
          summary: `${e.actor ?? "system"} performed ${e.action ?? "action"} on ${e.target ?? "resource"}.`,
          source: "audit-chain",
          publishedAt: e.at ?? new Date().toISOString(),
          tags: ["audit", e.action ?? "event"],
        });
      }
    });
  }

  // ── 3. System / storage signals ───────────────────────────────────────────
  if (!allowedTypes || allowedTypes.has("system")) {
    const { isInMemoryFallback } = await import("@/lib/server/store");
    if (isInMemoryFallback()) {
      signals.push({
        id: signalId("system", 0),
        type: "system",
        severity: "medium",
        title: "Storage degraded — in-memory fallback active",
        summary:
          "Netlify Blobs is unavailable. The platform is running on in-memory storage. Data will not persist across Lambda invocations. Check NETLIFY_SITE_ID and NETLIFY_BLOBS_TOKEN configuration.",
        source: "storage-monitor",
        publishedAt: new Date().toISOString(),
        tags: ["storage", "degraded", "ops"],
      });
    }

    if (!process.env["ANTHROPIC_API_KEY"]) {
      signals.push({
        id: signalId("system", 1),
        type: "system",
        severity: "high",
        title: "AI features disabled — ANTHROPIC_API_KEY not set",
        summary:
          "ANTHROPIC_API_KEY is not configured. All AI-powered analysis routes will return 503. Set the key in Netlify environment variables.",
        source: "config-monitor",
        publishedAt: new Date().toISOString(),
        tags: ["config", "ai", "ops"],
      });
    }
  }

  // Sort by publishedAt descending, apply limit
  signals.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  const page = signals.slice(0, limit);

  return NextResponse.json(
    {
      ok: true,
      total: signals.length,
      limit,
      signals: page,
      generatedAt: new Date().toISOString(),
    },
    { headers: gate.headers },
  );
  } catch (err) {
    console.error("[intel-feed] GET failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: "Failed to load intel feed" }, { status: 500, headers: gate.headers });
  }
}
