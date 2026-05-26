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
import { isRedisConfigured } from "@/lib/cache/redis";
import { gdeltCacheStats } from "@/lib/intelligence/gdelt-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

const STARTED_AT = new Date().toISOString();

function buildPrometheusText(uptimeMs: number, redisConfigured: boolean): string {
  const ts = Date.now();
  const lines: string[] = [];

  function gauge(name: string, help: string, value: number, labels?: Record<string, string>): void {
    const labelStr = labels
      ? `{${Object.entries(labels).map(([k, v]) => `${k}="${v.replace(/"/g, '\\"')}"`).join(",")}}`
      : "";
    lines.push(`# HELP ${name} ${help}`);
    lines.push(`# TYPE ${name} gauge`);
    lines.push(`${name}${labelStr} ${value} ${ts}`);
  }

  gauge("hawkeye_uptime_seconds", "Server uptime in seconds since last cold start", uptimeMs / 1000);
  gauge("hawkeye_redis_configured", "1 if Upstash Redis is configured, 0 otherwise", redisConfigured ? 1 : 0);
  gauge(
    "hawkeye_build_info",
    "Build metadata — always 1, use labels to read values",
    1,
    {
      service: "hawkeye-sterling",
      version: "3.0.0",
      env: process.env.NODE_ENV ?? "development",
    },
  );

  return lines.join("\n") + "\n";
}

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

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
        ...Object.fromEntries(gate.headers.entries()),
      },
    });
  }

  const cache = gdeltCacheStats();

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
