// POST /api/sanctions/watch
//
// Called by netlify/functions/sanctions-watch-cron.mts (and the
// companion 1100 / 1330 variants) on the 04:30 / 11:00 / 13:30 UTC
// schedule.  Runs every SOURCE_ADAPTER, writes the ingestion report to
// Netlify Blobs, and returns { ok, at, summary }.
//
// Auth: Bearer <SANCTIONS_CRON_TOKEN> — identical pattern to
//   /api/ongoing/run (ONGOING_RUN_TOKEN).  A missing env var locks the
//   endpoint entirely (503) rather than silently opening it.
//   A wrong token returns 403.
//
// The route is intentionally fat (runs all adapters) because it is only
// called from scheduled functions, never from a user-facing request.
// Per-adapter timeout: 90 s.  Total wall-clock budget: ~10 min
// (Netlify function limit).

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

const ADAPTER_TIMEOUT_MS = 90_000;

// Inline the IngestionReport shape to avoid a cross-package type import
// that might not survive the Next.js bundler in all environments.
interface IngestionReport {
  listId: string;
  sourceUrl: string;
  recordCount: number;
  checksum: string;
  fetchedAt: number;
  durationMs: number;
  errors: string[];
  sourceVersion?: string;
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms`)),
      ms,
    );
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

async function timingSafeTokenCheck(got: string, expected: string): Promise<boolean> {
  if (got.length !== expected.length) return false;
  const { timingSafeEqual } = await import("crypto");
  const enc = new TextEncoder();
  const expBuf = enc.encode(expected);
  const gotRaw = enc.encode(got);
  const gotBuf = new Uint8Array(expBuf.length);
  gotBuf.set(gotRaw.slice(0, expBuf.length));
  return timingSafeEqual(expBuf, gotBuf);
}

export async function POST(req: Request): Promise<NextResponse> {
  // ── Auth ───────────────────────────────────────────────────────────
  const expected = process.env["SANCTIONS_CRON_TOKEN"];
  if (!expected) {
    // Env var not configured on this Netlify site — lock the endpoint.
    return NextResponse.json(
      { ok: false, error: "service unavailable — SANCTIONS_CRON_TOKEN not set" },
      { status: 503 },
    );
  }
  const got =
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!(await timingSafeTokenCheck(got, expected))) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  // ── Ingestion ──────────────────────────────────────────────────────
  // Dynamic imports so the heavyweight adapters don't inflate cold-start
  // time for other routes.
  let SOURCE_ADAPTERS: Array<{
    id: string;
    sourceUrl: string;
    fetch(): Promise<{ entities: unknown[]; rawChecksum: string; sourceVersion?: string }>;
  }>;
  let getBlobsStore: () => Promise<{
    putDataset(id: string, entities: unknown[], report: IngestionReport): Promise<void>;
  }>;

  try {
    const ingestion = await import(
      "../../../../../dist/src/ingestion/index.js" as string
    ) as { SOURCE_ADAPTERS: typeof SOURCE_ADAPTERS };
    SOURCE_ADAPTERS = ingestion.SOURCE_ADAPTERS as typeof SOURCE_ADAPTERS;

    const blobsMod = await import(
      "../../../../../dist/src/ingestion/blobs-store.js" as string
    ) as { getBlobsStore: typeof getBlobsStore };
    getBlobsStore = blobsMod.getBlobsStore;
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: `ingestion module unavailable — ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 503 },
    );
  }

  let store: Awaited<ReturnType<typeof getBlobsStore>>;
  try {
    store = await getBlobsStore();
  } catch (err) {
    // Netlify Blobs not bound on this site (NETLIFY_SITE_ID / context missing).
    return NextResponse.json(
      {
        ok: false,
        error: `blob store unavailable — ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 503 },
    );
  }

  const summary: IngestionReport[] = [];

  for (const adapter of SOURCE_ADAPTERS) {
    const started = Date.now();
    const report: IngestionReport = {
      listId: adapter.id,
      sourceUrl: adapter.sourceUrl,
      recordCount: 0,
      checksum: "",
      fetchedAt: started,
      durationMs: 0,
      errors: [],
    };
    try {
      const { entities, rawChecksum, sourceVersion } = await withTimeout(
        adapter.fetch(),
        ADAPTER_TIMEOUT_MS,
        `adapter ${adapter.id}`,
      );
      report.recordCount = entities.length;
      report.checksum = rawChecksum;
      if (sourceVersion) report.sourceVersion = sourceVersion;
      report.durationMs = Date.now() - started;
      try {
        await store.putDataset(adapter.id, entities, report);
      } catch (writeErr) {
        report.errors.push(
          `blob write failed: ${writeErr instanceof Error ? writeErr.message : String(writeErr)}`,
        );
      }
    } catch (err) {
      report.errors.push(err instanceof Error ? err.message : String(err));
      report.durationMs = Date.now() - started;
    }
    summary.push(report);
  }

  const failedAdapters = summary.filter((r) => r.errors.length > 0);
  return NextResponse.json(
    {
      ok: failedAdapters.length === 0,
      at: new Date().toISOString(),
      summary,
      ...(failedAdapters.length > 0
        ? { failedAdapters: failedAdapters.map((r) => r.listId) }
        : {}),
    },
    { status: failedAdapters.length === 0 ? 200 : 503 },
  );
}
