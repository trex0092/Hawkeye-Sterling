// GET /api/retention
//
// Returns the retention policy status — record count in the feedback
// journal snapshot and the configured retention window.
//
// The scheduled function (netlify/functions/retention-scheduler.mts)
// enforces FDL 10/2025 Art.20 ten-year retention + PDPL Art.13
// data-minimisation daily at 23:15 UTC. This GET endpoint lets operators
// check retention health without waiting for the scheduled run.

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

const DEFAULT_RETENTION_DAYS = 10 * 365;
const STORE_NAME = "hawkeye-feedback-journal";
const SNAPSHOT_KEY = "all-records.json";

interface OutcomeRecord { runId: string; at: string }

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  const retentionDays = (() => {
    const v = parseInt(process.env["RETENTION_DAYS"] ?? String(DEFAULT_RETENTION_DAYS), 10);
    return Number.isFinite(v) && v > 0 ? v : DEFAULT_RETENTION_DAYS;
  })();

  try {
    let blobsMod: typeof import("@netlify/blobs") | null = null;
    try { blobsMod = await import("@netlify/blobs"); } catch { /* blobs not bound */ }

    if (!blobsMod) {
      return NextResponse.json(
        { ok: true, retentionDays, total: null, note: "Blob store not bound — retention scheduler inactive in this environment" },
        { headers: gate.headers },
      );
    }

    const store = blobsMod.getStore(STORE_NAME);
    const raw = await store.get(SNAPSHOT_KEY, { type: "text" }).catch(() => null) as string | null;
    if (!raw) {
      return NextResponse.json(
        { ok: true, retentionDays, total: 0, note: "No feedback journal snapshot found — no records to purge" },
        { headers: gate.headers },
      );
    }

    let records: OutcomeRecord[] = [];
    try { records = JSON.parse(raw) as OutcomeRecord[]; } catch { /* ignore */ }

    const now = Date.now();
    const eligibleForPurge = records.filter((r) => {
      if (!r?.at) return false;
      const t = Date.parse(r.at);
      return Number.isFinite(t) && Math.floor((now - t) / 86_400_000) > retentionDays;
    });

    return NextResponse.json(
      {
        ok: true,
        retentionDays,
        total: records.length,
        eligibleForPurge: eligibleForPurge.length,
        note: "Purge runs daily at 23:15 UTC via retention-scheduler scheduled function (FDL 10/2025 Art.20)",
      },
      { headers: gate.headers },
    );
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.warn("[retention GET]", detail);
    return NextResponse.json(
      {
        ok: false,
        errorCode: "STORE_READ_FAILED",
        retentionDays,
        total: null,
        error: "Could not read feedback journal",
        detail,
      },
      { status: 503, headers: gate.headers },
    );
  }
}
