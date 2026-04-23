import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";

import { quickScreen } from "../../../../dist/src/brain/quick-screen.js";
import { evaluateRedlines } from "../../../../dist/src/brain/redlines.js";
import { classifyAdverseKeywords } from "@/lib/data/adverse-keywords";
import { isInMemoryFallback } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STARTED_AT = new Date().toISOString();

interface Check {
  name: string;
  status: "operational" | "degraded" | "down";
  latencyMs: number;
  note?: string;
}

async function time<T>(fn: () => Promise<T> | T): Promise<{ ok: true; value: T; latencyMs: number } | { ok: false; error: string; latencyMs: number }> {
  const started = Date.now();
  try {
    const value = await fn();
    return { ok: true, value, latencyMs: Date.now() - started };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      latencyMs: Date.now() - started,
    };
  }
}

async function checkScreening(): Promise<Check> {
  const r = await time(() => quickScreen({ name: "statusping" }, [], {}));
  if (!r.ok) return { name: "screening", status: "down", latencyMs: r.latencyMs, note: r.error };
  const result = r.value as { severity?: string };
  if (typeof result.severity !== "string") {
    return { name: "screening", status: "degraded", latencyMs: r.latencyMs, note: "unexpected result shape" };
  }
  return { name: "screening", status: "operational", latencyMs: r.latencyMs };
}

async function checkSuperBrain(): Promise<Check> {
  // Super-brain composes quickScreen + redlines + classifiers. Probe the
  // same pieces so a bundler regression (e.g. the styled-jsx import that
  // broke Super Brain in April 2026) surfaces here without having to
  // loop back through HTTP.
  const r = await time(() => {
    const screen = quickScreen({ name: "statusping" }, [], {});
    const redlines = evaluateRedlines([]);
    return { screen, redlines };
  });
  if (!r.ok) return { name: "super-brain", status: "down", latencyMs: r.latencyMs, note: r.error };
  return { name: "super-brain", status: "operational", latencyMs: r.latencyMs };
}

async function checkAdverseMedia(): Promise<Check> {
  const r = await time(() => classifyAdverseKeywords("sanctions bribery arrest"));
  if (!r.ok) return { name: "adverse-media", status: "down", latencyMs: r.latencyMs, note: r.error };
  if (!Array.isArray(r.value) || r.value.length === 0) {
    return { name: "adverse-media", status: "degraded", latencyMs: r.latencyMs, note: "classifier returned no hits on canary input" };
  }
  return { name: "adverse-media", status: "operational", latencyMs: r.latencyMs };
}

async function checkWeaponizedBrain(): Promise<Check> {
  const filePath = path.join(process.cwd(), "web", "public", "weaponized-brain.json");
  const r = await time(async () => {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as { ok?: boolean; manifest?: unknown };
    if (!parsed.ok || !parsed.manifest) throw new Error("manifest missing ok/manifest");
    return parsed;
  });
  if (!r.ok) {
    // Fall back to the sibling path when Netlify changes cwd.
    const alt = path.join(process.cwd(), "public", "weaponized-brain.json");
    const r2 = await time(async () => {
      const raw = await fs.readFile(alt, "utf8");
      const parsed = JSON.parse(raw) as { ok?: boolean; manifest?: unknown };
      if (!parsed.ok || !parsed.manifest) throw new Error("manifest missing ok/manifest");
      return parsed;
    });
    if (!r2.ok) return { name: "weaponized-brain", status: "down", latencyMs: r.latencyMs + r2.latencyMs, note: r2.error };
    return { name: "weaponized-brain", status: "operational", latencyMs: r2.latencyMs };
  }
  return { name: "weaponized-brain", status: "operational", latencyMs: r.latencyMs };
}

function checkStorage(): Check {
  const started = Date.now();
  if (isInMemoryFallback()) {
    return {
      name: "storage",
      status: "degraded",
      latencyMs: Date.now() - started,
      note: "in-memory fallback — Netlify Blobs not bound",
    };
  }
  return { name: "storage", status: "operational", latencyMs: Date.now() - started };
}

export async function GET(): Promise<NextResponse> {
  const checks: Check[] = await Promise.all([
    checkScreening(),
    checkSuperBrain(),
    checkAdverseMedia(),
    checkWeaponizedBrain(),
    Promise.resolve(checkStorage()),
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
