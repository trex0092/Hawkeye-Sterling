// GET  /api/operator/logs          — list recent MCP activity log entries
// GET  /api/operator/logs?export=csv — export all entries as CSV
//
// Reads from Netlify Blobs store "mcp-activity-logs".
// Each entry is stored as an individual blob keyed by timestamp + ID
// so concurrent writes never collide.

import { NextResponse } from "next/server";
import { withGuard } from "@/lib/server/guard";
import type { ConsequenceLevel } from "@/lib/mcp/tool-manifest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export interface McpLogEntry {
  id: string;
  timestamp: string;
  tool: string;
  consequenceLevel: ConsequenceLevel;
  inputSummary: string;
  outputSummary: string;
  durationMs: number;
  isError: boolean;
  anomalyNote?: string;
  jurisdiction?: string;
}

async function getStore() {
  const mod = await import("@netlify/blobs").catch(() => null);
  if (!mod) return null;
  return mod.getStore({ name: "mcp-activity-logs" });
}

async function handleGet(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const exportCsv = url.searchParams.get("export") === "csv";
  const limit = Math.min(500, parseInt(url.searchParams.get("limit") ?? "200", 10));

  const store = await getStore();
  if (!store) {
    return NextResponse.json({ ok: true, entries: [], note: "Blobs not available in this environment" });
  }

  let entries: McpLogEntry[] = [];
  try {
    const listed = await store.list({ prefix: "entry/" });
    // Sort by key descending (keys include timestamp so newest = last alphabetically)
    const keys = listed.blobs
      .map((b: { key: string }) => b.key)
      .sort()
      .reverse()
      .slice(0, limit);

    entries = (
      await Promise.all(
        keys.map((k: string) =>
          store.get(k, { type: "json" }).catch(() => null),
        ),
      )
    ).filter((e): e is McpLogEntry => e !== null);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }

  if (exportCsv) {
    const header = "timestamp,tool,consequenceLevel,durationMs,isError,inputSummary,outputSummary";
    const rows = entries.map((e) => {
      const esc = (s: string) => `"${s.replace(/"/g, '""').replace(/\n/g, " ")}"`;
      return [
        e.timestamp,
        e.tool,
        e.consequenceLevel,
        e.durationMs,
        e.isError,
        esc(e.inputSummary),
        esc(e.outputSummary),
      ].join(",");
    });
    const csv = [header, ...rows].join("\n");
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "content-type": "text/csv",
        "content-disposition": `attachment; filename="mcp-activity-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    }) as unknown as NextResponse;
  }

  return NextResponse.json({ ok: true, count: entries.length, entries });
}

export const GET = withGuard(handleGet);
