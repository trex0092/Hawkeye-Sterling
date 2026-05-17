// GET /api/disposition
//
// Returns a summary of case dispositions stored by the compliance
// pipeline. Provides an aggregate count by disposition status so
// the MCP `disposition` tool and dashboard can probe the endpoint
// without hitting a 404.
//
// This is a read-only status/summary route. The mutation endpoint is
// POST /api/cases/[id]/disposition (individual case disposition).

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { listKeys, getJson } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

interface DispositionRecord {
  caseId: string;
  disposition: string;
  decidedAt?: string;
  decidedBy?: string;
}

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  try {
    const keys = await listKeys("disposition/").catch(() => [] as string[]);
    const loaded = await Promise.all(
      keys.map((k) => getJson<DispositionRecord>(k).catch(() => null)),
    );
    const records = loaded.filter((r): r is DispositionRecord => r !== null);
    const summary: Record<string, number> = {};
    for (const r of records) {
      const d = r.disposition ?? "unknown";
      summary[d] = (summary[d] ?? 0) + 1;
    }
    return NextResponse.json(
      {
        ok: true,
        total: records.length,
        summary,
        recent: records
          .sort((a, b) => (b.decidedAt ?? "").localeCompare(a.decidedAt ?? ""))
          .slice(0, 20),
        note: "Individual case disposition: POST /api/cases/[id]/disposition",
      },
      { headers: gate.headers },
    );
  } catch (err) {
    console.warn("[disposition GET]", err instanceof Error ? err.message : String(err));
    return NextResponse.json(
      { ok: true, total: 0, summary: {}, recent: [] },
      { headers: gate.headers },
    );
  }
}
