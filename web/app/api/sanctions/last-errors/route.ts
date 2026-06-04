// GET /api/sanctions/last-errors
//
// Read-only operator dashboard: returns the most recent adapter-failure
// entries written by src/ingestion/error-log.ts when an adapter fetch,
// parse, blob-write, or read-back-verify step fails.
//
// Purpose: surface the actual failure reason for sanctions ingestion
// without operators needing Netlify Function-log access. Closes the
// diagnostic feedback loop on "why are my sanctions lists empty?".
//
// Privacy: only adapter ids, HTTP status codes, error messages, and
// timestamps. No subject PII (adapters fetch public watchlists, not
// customer data).
//
// Auth: same `enforce` gate as the rest of /api/sanctions/*.

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

interface IngestErrorEntry {
  at: string;
  source: string;
  adapterId: string;
  phase: "fetch" | "parse" | "write" | "verify";
  message: string;
  httpStatus?: number;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  void writeAuditChainEntry(
    { event: "sanctions.last-errors_accessed", actor: gate.keyId },
    tenantIdFromGate(gate),
  ).catch(() => undefined);

  const url = new URL(req.url);
  const requested = Number.parseInt(url.searchParams.get("limit") ?? "", 10);
  const limit =
    Number.isFinite(requested) && requested > 0
      ? Math.min(requested, MAX_LIMIT)
      : DEFAULT_LIMIT;

  // Dynamic-import the compiled module from dist/ so this route doesn't
  // hard-require the build to have completed at type-check time.
  let entries: IngestErrorEntry[] = [];
  try {
    const mod = (await import(
      "../../../../../src/ingestion/error-log.js" as string
    )) as {
      listRecentIngestErrors: (_limit?: number) => Promise<IngestErrorEntry[]>;
    };
    entries = await mod.listRecentIngestErrors(limit);
  } catch (err) {
    console.error("[sanctions/last-errors] ingest-error log module unavailable:", err);
    return NextResponse.json(
      {
        ok: false,
        error: "ingest-error log unavailable — please check deployment build artifacts",
        entries: [],
      },
      { status: 503, headers: gate.headers },
    );
  }

  // Group by adapter so operators see at a glance which adapters are
  // failing most frequently. Latest-first within each group.
  const byAdapter: Record<string, IngestErrorEntry[]> = {};
  for (const e of entries) {
    if (!byAdapter[e.adapterId]) byAdapter[e.adapterId] = [];
    byAdapter[e.adapterId]!.push(e);
  }

  return NextResponse.json(
    {
      ok: true,
      generatedAt: new Date().toISOString(),
      total: entries.length,
      entries,
      byAdapter,
    },
    { headers: gate.headers },
  );
}
