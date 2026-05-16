// POST /api/alerts/[id]/dismiss — mark a designation alert as read/dismissed

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { dismissAlert } from "@/lib/server/alerts-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 , headers: gate.headers });
    let dismissedBy: string | undefined;
    try {
      const body = (await req.json()) as { dismissedBy?: string };
      if (typeof body.dismissedBy === "string") dismissedBy = body.dismissedBy;
    } catch { /* body is optional */ }
    const ok = await dismissAlert(id, dismissedBy);
    if (!ok) return NextResponse.json({ ok: false, error: "alert not found" }, { status: 404 , headers: gate.headers });
    return NextResponse.json({ ok: true }, { headers: gate.headers });
  } catch (err) {
    console.error("[alerts/dismiss]", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { ok: false, error: "alert store unavailable — dismiss not persisted" },
      { status: 503, headers: gate.headers }
    );
  }
}
