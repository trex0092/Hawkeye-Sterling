// POST /api/admin/opensanctions-refresh
//
// Operator-on-demand trigger for the OpenSanctions per-dataset refresh
// pipeline. Pulls every configured dataset (default: ae_local_terrorists,
// override via OPENSANCTIONS_DATASETS env), normalises, merges, and
// writes the consolidated array to the `hawkeye-opensanctions` Blob.
//
// Companion to the scheduled function at
// `netlify/functions/opensanctions-refresh.mts` (weekly Sunday 02:30
// UTC). Use this route when you need an immediate refresh without
// waiting for the next cron tick — e.g. after rotating to a new
// dataset list or recovering from a transient OpenSanctions outage.
//
// Auth: Bearer ADMIN_TOKEN. Returns 503 if the env var isn't set.
//
// Returns the same RefreshResult shape the scheduled function returns,
// so /api/admin/opensanctions-import (which uploads a pre-built JSON)
// and this route share an output contract that operators can diff.

import { NextResponse } from "next/server";
import {
  refreshOpenSanctionsBlob,
  resolveDatasetList,
} from "@/lib/intelligence/opensanctions-datasets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function timingSafeTokenCheck(got: string, expected: string): Promise<boolean> {
  if (got.length !== expected.length) return false;
  const { timingSafeEqual } = await import("node:crypto");
  const enc = new TextEncoder();
  const a = enc.encode(expected);
  const b = enc.encode(got);
  const ab = new Uint8Array(a.length);
  ab.set(b.slice(0, a.length));
  return timingSafeEqual(a, ab);
}

export async function POST(req: Request): Promise<NextResponse> {
  const expected = process.env["ADMIN_TOKEN"];
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "service unavailable — ADMIN_TOKEN not set" },
      { status: 503 },
    );
  }
  const got = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!got || !(await timingSafeTokenCheck(got, expected))) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  try {
    const result = await refreshOpenSanctionsBlob();
    return NextResponse.json(result, { status: result.ok ? 200 : 502 });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: `refresh threw — ${err instanceof Error ? err.message : String(err)}`,
        at: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}

// GET surfaces the resolved dataset list + endpoint metadata so operators
// can confirm the env wiring before triggering a refresh.
export async function GET(req: Request): Promise<NextResponse> {
  const expected = process.env["ADMIN_TOKEN"];
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "service unavailable — ADMIN_TOKEN not set" },
      { status: 503 },
    );
  }
  const got = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!got || !(await timingSafeTokenCheck(got, expected))) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  return NextResponse.json({
    ok: true,
    datasets: resolveDatasetList(),
    schedule: "30 2 * * 0 (Sunday 02:30 UTC, via netlify/functions/opensanctions-refresh)",
    blobKey: "hawkeye-opensanctions/sanctions.json",
  });
}
