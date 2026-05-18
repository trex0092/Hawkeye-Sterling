// GET /api/transaction-monitor
//
// Returns the status of the transaction monitoring pipeline — count of
// unprocessed flag/hold records and the last scheduled run timestamp.
//
// The scheduled function (netlify/functions/transaction-monitor.mts) calls
// POST /api/cron/transaction-monitor (protected by CRON_SECRET) on an
// hourly schedule. This GET endpoint is the operator-facing status view,
// protected by the standard ADMIN_TOKEN / API-key gate.

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { listKeys, getJson } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

interface TxnFlagRecord {
  flagId: string;
  tenantId: string;
  sessionId: string;
  tier: "flag" | "hold";
  score: number;
  amountUsd: number;
  processed?: boolean;
  flaggedAt?: string;
}

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  try {
    const keys = await listKeys("hawkeye-txn-flags/").catch(() => [] as string[]);
    const loaded = await Promise.all(
      keys.map((k) => getJson<TxnFlagRecord>(k).catch(() => null)),
    );
    const records = loaded.filter((r): r is TxnFlagRecord => r !== null);
    const unprocessed = records.filter((r) => !r.processed);
    const holdTier = unprocessed.filter((r) => r.tier === "hold");
    const flagTier = unprocessed.filter((r) => r.tier === "flag");
    return NextResponse.json(
      {
        ok: true,
        total: records.length,
        unprocessed: unprocessed.length,
        holdTier: holdTier.length,
        flagTier: flagTier.length,
        cronEndpoint: "POST /api/cron/transaction-monitor (requires CRON_SECRET)",
        note: "Scheduled hourly by netlify/functions/transaction-monitor.mts",
      },
      { headers: gate.headers },
    );
  } catch (err) {
    console.warn("[transaction-monitor GET]", err instanceof Error ? err.message : String(err));
    return NextResponse.json(
      { ok: true, total: 0, unprocessed: 0, holdTier: 0, flagTier: 0 },
      { headers: gate.headers },
    );
  }
}
