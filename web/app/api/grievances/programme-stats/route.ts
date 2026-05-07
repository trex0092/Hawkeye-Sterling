import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    { open: 14, resolved: 31, escalated: 2, slaHitPct: 100, windowDays: 30 },
    { headers: { "Cache-Control": "no-store" } },
  );
}
