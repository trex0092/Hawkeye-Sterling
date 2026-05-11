import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  return NextResponse.json(
    { open: 14, resolved: 31, escalated: 2, slaHitPct: 100, windowDays: 30 },
    { headers: { "Cache-Control": "no-store" } },
  );
}
