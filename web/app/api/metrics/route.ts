// GET /api/metrics — lightweight in-process metrics endpoint.
//
// Supports two response formats via content negotiation:
//   - JSON (default): structured object with uptime, cache, infrastructure.
//   - Prometheus text (Accept: text/plain or ?format=prometheus):
//     Prometheus exposition format v0.0.4 for scraping by Grafana, Datadog, etc.
//
// Metrics reset on Lambda cold start — this is intentional; the status page
// rebuilds them quickly on each invocation cycle.
//
// Auth: Bearer ADMIN_TOKEN (admin-only — operational data is sensitive).

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { isRedisConfigured } from "@/lib/cache/redis";
import { gdeltCacheStats } from "@/lib/intelligence/gdelt-cache";
import { getCounters, getGauges } from "@/lib/server/metrics-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

const STARTED_AT = new Date().toISOString();

// Prometheus exposition format label-value escaping per text format 0.0.4 spec.
// Order matters: backslash first, then newline, then double-quote.
function promEscapeLabelValue(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/"/g, '\\"');
}

function buildPrometheusText(uptimeMs: number, redisConfigured: boolean): string {
  const ts = Date.now();
  const lines: string[] = [];
  // Track emitted family names to guarantee exactly one # HELP / # TYPE per family
  // even if a dynamic counter/gauge name collides with a static metric name.
  const emittedFamilies = new Set<string>();

  function emitFamily(
    type: "gauge" | "counter",
    name: string,
    help: string,
    samples: Array<{ labels: string; value: number }>,
  ): void {
    if (emittedFamilies.has(name)) return;
    emittedFamilies.add(name);
    lines.push(`# HELP ${name} ${help}`);
    lines.push(`# TYPE ${name} ${type}`);
    for (const { labels, value } of samples) {
      lines.push(`${name}${labels} ${value} ${ts}`);
    }
  }

  const nodeEnvSafe = promEscapeLabelValue(process.env["NODE_ENV"] ?? "development");

  emitFamily("gauge", "hawkeye_uptime_seconds", "Server uptime in seconds since last cold start",
    [{ labels: "", value: uptimeMs / 1000 }]);
  emitFamily("gauge", "hawkeye_redis_configured", "1 if Upstash Redis is configured, 0 otherwise",
    [{ labels: "", value: redisConfigured ? 1 : 0 }]);
  emitFamily("gauge", "hawkeye_build_info", "Build metadata — always 1, use labels to read values",
    [{ labels: `{service="hawkeye-sterling",version="3.0.0",env="${nodeEnvSafe}"}`, value: 1 }]);

  // Compliance counters from metrics-store (drift, bias, hallucination alerts, etc.)
  // Prometheus spec requires exactly one # HELP and # TYPE per metric family
  // (name without labels). Group by family name to avoid duplicate declarations.
  const counterFamilies = new Map<string, { labels: string; value: number }[]>();
  for (const { key, value } of getCounters()) {
    const braceIdx = key.indexOf("{");
    const name = braceIdx === -1 ? key : key.slice(0, braceIdx);
    const labels = braceIdx === -1 ? "" : key.slice(braceIdx);
    if (!counterFamilies.has(name)) counterFamilies.set(name, []);
    counterFamilies.get(name)!.push({ labels, value });
  }
  for (const [name, samples] of counterFamilies) {
    emitFamily("counter", name, "Hawkeye compliance event counter", samples);
  }

  // Compliance gauges (circuit breaker states, etc.)
  const gaugeFamilies = new Map<string, { labels: string; value: number }[]>();
  for (const { key, value } of getGauges()) {
    const braceIdx = key.indexOf("{");
    const name = braceIdx === -1 ? key : key.slice(0, braceIdx);
    const labels = braceIdx === -1 ? "" : key.slice(braceIdx);
    if (!gaugeFamilies.has(name)) gaugeFamilies.set(name, []);
    gaugeFamilies.get(name)!.push({ labels, value });
  }
  for (const [name, samples] of gaugeFamilies) {
    emitFamily("gauge", name, "Hawkeye compliance gauge", samples);
  }

  return lines.join("\n") + "\n";
}

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  void writeAuditChainEntry(
    { event: "metrics_accessed", actor: gate.keyId },
    tenantIdFromGate(gate),
  ).catch(() => undefined);

  const uptimeMs = Date.now() - new Date(STARTED_AT).getTime();
  const redisConfigured = isRedisConfigured();

  // Content negotiation: Prometheus scrapers send Accept: text/plain
  // or callers can append ?format=prometheus
  const url = new URL(req.url);
  const wantsPrometheus =
    (req.headers.get("accept") ?? "").includes("text/plain") ||
    url.searchParams.get("format") === "prometheus";

  if (wantsPrometheus) {
    return new NextResponse(buildPrometheusText(uptimeMs, redisConfigured), {
      status: 200,
      headers: {
        "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
        ...gate.headers,
      },
    });
  }

  const cache = gdeltCacheStats();

  const counters = Object.fromEntries(getCounters().map(({ key, value }) => [key, value]));
  const gauges = Object.fromEntries(getGauges().map(({ key, value }) => [key, value]));

  return NextResponse.json({
    ok: true,
    generatedAt: new Date().toISOString(),
    uptime: {
      startedAt:   STARTED_AT,
      uptimeMs,
      uptimeHuman: formatUptime(uptimeMs),
    },
    cache: {
      gdelt: cache,
    },
    infrastructure: {
      redisConfigured,
      redisNote: redisConfigured
        ? "Upstash Redis connected — GDELT cache persists across Lambda cold starts."
        : "Redis not configured — GDELT cache is in-memory only (resets on cold start).",
    },
    complianceMetrics: {
      note: "In-process counters — reset on Lambda cold start. Use Prometheus scrape for time-series.",
      counters,
      gauges,
    },
  }, { headers: gate.headers });
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 204,
    headers: {
      Allow: "GET, OPTIONS",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

function formatUptime(ms: number): string {
  const s = Math.floor(ms / 1_000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}
