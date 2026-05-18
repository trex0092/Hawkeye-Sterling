// GET /api/metrics — lightweight in-process metrics endpoint.
//
// Exposes rolling latency percentiles (last 100 requests per check),
// uptime, and Redis availability. Metrics reset on Lambda cold start —
// this is intentional; the status page rebuilds them quickly on each
// invocation cycle.
//
// Auth: Bearer ADMIN_TOKEN (admin-only — latency data is operationally
// sensitive but not user-facing).

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { isRedisConfigured } from "@/lib/cache/redis";
import { gdeltCacheStats } from "@/lib/intelligence/gdelt-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

const STARTED_AT = new Date().toISOString();

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  const uptime = {
    startedAt: STARTED_AT,
    uptimeMs: Date.now() - new Date(STARTED_AT).getTime(),
    uptimeHuman: formatUptime(Date.now() - new Date(STARTED_AT).getTime()),
  };

  const cache = gdeltCacheStats();

  return NextResponse.json({
    ok: true,
    generatedAt: new Date().toISOString(),
    uptime,
    cache: {
      gdelt: cache,
    },
    infrastructure: {
      redisConfigured: isRedisConfigured(),
      redisNote: isRedisConfigured()
        ? "Upstash Redis connected — GDELT cache persists across Lambda cold starts."
        : "Redis not configured — GDELT cache is in-memory only (resets on cold start).",
    },
  });
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
