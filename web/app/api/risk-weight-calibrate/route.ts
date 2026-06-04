// POST /api/risk-weight-calibrate  — trigger weight calibration from feedback
// GET  /api/risk-weight-calibrate  — view current weights + history

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";
import {
  getCurrentWeights,
  getWeightHistory,
  calibrateWeights,
  DEFAULT_WEIGHTS,
} from "@/lib/server/risk-weight-calibrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  void writeAuditChainEntry(
    { event: "risk-weight-calibrate_accessed", actor: gate.keyId },
    tenantIdFromGate(gate),
  ).catch(() => undefined);

  try {
    const [current, history] = await Promise.all([getCurrentWeights(), getWeightHistory()]);
    return NextResponse.json({ ok: true, current, defaults: DEFAULT_WEIGHTS, history }, { headers: gate.headers });
  } catch (err) {
    console.warn("[hawkeye] route handler failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false, error: "weight store unavailable — please retry." }, { status: 503, headers: gate.headers });
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  void writeAuditChainEntry(
    { event: "risk-weight-calibrate_accessed", actor: gate.keyId },
    tenantIdFromGate(gate),
  ).catch(() => undefined);

  const result = await calibrateWeights();
  return NextResponse.json({ ok: true, ...result }, { headers: gate.headers });
}
