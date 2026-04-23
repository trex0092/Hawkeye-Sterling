import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STARTED_AT = new Date().toISOString();

interface Check {
  name: string;
  status: "operational" | "degraded" | "down";
  latencyMs: number;
  note?: string;
}

async function probe(name: string, url: string, init?: RequestInit): Promise<Check> {
  const started = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2_000);
    const res = await fetch(url, { ...init, signal: controller.signal });
    clearTimeout(timer);
    const latency = Date.now() - started;
    if (res.status >= 500) {
      return { name, status: "down", latencyMs: latency, note: `server ${res.status}` };
    }
    if (res.status >= 400) {
      return { name, status: "degraded", latencyMs: latency, note: `client ${res.status}` };
    }
    return { name, status: "operational", latencyMs: latency };
  } catch (err) {
    return {
      name,
      status: "down",
      latencyMs: Date.now() - started,
      note: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function GET(req: Request): Promise<NextResponse> {
  const origin = new URL(req.url).origin;
  const checks = await Promise.all([
    probe("screening", `${origin}/api/quick-screen`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ subject: { name: "statusping" }, candidates: [] }),
    }),
    probe("super-brain", `${origin}/api/super-brain`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ subject: { name: "statusping" } }),
    }),
    probe("adverse-media", `${origin}/api/news-search?q=statusping`),
    probe("weaponized-brain", `${origin}/weaponized-brain.json`),
  ]);

  const worstStatus: Check["status"] = checks.some((c) => c.status === "down")
    ? "down"
    : checks.some((c) => c.status === "degraded")
      ? "degraded"
      : "operational";

  const nowMs = Date.now();
  const startedMs = Date.parse(STARTED_AT);
  const uptimeSec = Math.max(0, Math.round((nowMs - startedMs) / 1_000));

  return NextResponse.json({
    ok: true,
    status: worstStatus,
    uptimeSec,
    startedAt: STARTED_AT,
    now: new Date().toISOString(),
    checks,
    sla: {
      uptimeTargetPct: 99.99,
      url: "/status",
    },
  });
}
