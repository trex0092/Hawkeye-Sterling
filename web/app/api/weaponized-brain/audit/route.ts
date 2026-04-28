import { NextResponse } from "next/server";
import { withGuard } from "@/lib/server/guard";
import { auditBrain } from "../../../../../dist/src/brain/audit.js";
import { weaponizedIntegrity } from "../../../../../dist/src/brain/weaponized.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

async function handle(): Promise<NextResponse> {
  try {
    const report = auditBrain(false);
    const integrity = weaponizedIntegrity();
    return NextResponse.json({ ok: true, report, integrity });
  } catch (err) {
    console.error("[weaponized-brain/audit]", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { ok: false, error: "audit unavailable" },
      { status: 500 },
    );
  }
}

export const GET = withGuard(handle);
