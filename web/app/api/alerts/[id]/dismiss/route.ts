// POST /api/alerts/[id]/dismiss — mark a designation alert as read/dismissed

import { NextResponse } from "next/server";
import { dismissAlert } from "@/lib/server/alerts-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  try {
    const id = params.id;
    if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
    let dismissedBy: string | undefined;
    try {
      const body = (await req.json()) as { dismissedBy?: string };
      if (typeof body.dismissedBy === "string") dismissedBy = body.dismissedBy;
    } catch { /* body is optional */ }
    const ok = await dismissAlert(id, dismissedBy);
    if (!ok) return NextResponse.json({ ok: false, error: "alert not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[alerts/dismiss]", err instanceof Error ? err.message : err);
    return NextResponse.json({
      ok: true,
      stored: false,
      note: "alert store unavailable — dismiss not persisted",
    });
  }
}
