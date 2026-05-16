import { NextResponse } from "next/server";
import { TIERS } from "@/lib/data/tiers";
import { enforce } from "@/lib/server/enforce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  return NextResponse.json({ ok: true, tiers: Object.values(TIERS) , headers: gate.headers });
}
