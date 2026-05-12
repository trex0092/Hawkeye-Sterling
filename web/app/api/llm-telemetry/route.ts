// GET /api/llm-telemetry  — per-call records + rolling summary
//
// Returns cost attribution per model and per route. Requires MLRO/admin auth.

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { listCalls, getSummary } from "@/lib/server/llm-telemetry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  const { searchParams } = new URL(req.url);
  const rawLimit = parseInt(searchParams.get("limit") ?? "", 10);
  const limit = Math.min(isNaN(rawLimit) ? 100 : rawLimit, 500);

  const [calls, summary] = await Promise.all([listCalls(limit), getSummary()]);
  return NextResponse.json({ ok: true, summary, calls, count: calls.length }, { headers: gate.headers });
}
