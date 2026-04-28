import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { auditBrain } from "../../../../../dist/src/brain/audit.js";
import { weaponizedIntegrity } from "../../../../../dist/src/brain/weaponized.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok && gate.response.status === 429) return gate.response;
  const gateHeaders: Record<string, string> = gate.ok ? gate.headers : {};

  try {
    const report = auditBrain(false);
    const integrity = weaponizedIntegrity();
    return NextResponse.json({ ok: true, report, integrity }, { headers: gateHeaders });
  } catch (err) {
    console.error("[weaponized-brain/audit]", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { ok: false, error: "audit unavailable" },
      { status: 500, headers: gateHeaders },
    );
  }
}
