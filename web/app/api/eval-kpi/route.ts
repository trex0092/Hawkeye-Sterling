// GET /api/eval-kpi
//
// Returns the latest KPI snapshot for the MLRO Advisor evaluation
// dashboard (Layer 7). Reads from the on-disk regression snapshot
// produced by the nightly run; if no snapshot exists yet (fresh
// deploy), returns a structured "no-data" response so the dashboard
// can render its empty state without a 500.
//
// Production wiring (separate change): a Netlify scheduled function
// runs nightly, replays every scenario through /api/mlro-advisor in
// each mode, calls eval-harness.computeKpis(), and writes the
// snapshot JSON. This route is the read side.

import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SNAPSHOT_PATH = path.resolve(process.cwd(), "..", "data/eval/kpi-snapshot.json");

const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "content-type, authorization, x-api-key",
};

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS });
}

export async function GET(): Promise<Response> {
  try {
    const raw = await fs.readFile(SNAPSHOT_PATH, "utf8");
    const snap = JSON.parse(raw);
    return NextResponse.json({ ok: true, snapshot: snap }, { headers: CORS });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return NextResponse.json(
        {
          ok: true,
          snapshot: null,
          message:
            "No KPI snapshot on disk yet. The nightly regression run produces this; expect ~24h after first deploy.",
        },
        { headers: CORS },
      );
    }
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500, headers: CORS },
    );
  }
}
