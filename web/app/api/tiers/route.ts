import { NextResponse } from "next/server";
import { TIERS } from "@/lib/data/tiers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ ok: true, tiers: Object.values(TIERS) });
}
