// POST /api/risk-weight-calibrate  — trigger weight calibration from feedback
// GET  /api/risk-weight-calibrate  — view current weights + history

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import {
  getCurrentWeights,
  getWeightHistory,
  calibrateWeights,
  DEFAULT_WEIGHTS,
} from "@/lib/server/risk-weight-calibrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  try {
    const [current, history] = await Promise.all([getCurrentWeights(), getWeightHistory()]);
    return NextResponse.json({ ok: true, current, defaults: DEFAULT_WEIGHTS, history , headers: gate.headers });
  } catch {
    return NextResponse.json({ ok: false, error: "weight store unavailable — please retry." }, { status: 503, headers: gate.headers });
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  const result = await calibrateWeights();
  return NextResponse.json({ ok: true, ...result , headers: gate.headers });
}
