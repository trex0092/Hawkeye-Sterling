import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { auditBrain } from "../../../../../dist/src/brain/audit.js";
import { weaponizedIntegrity } from "../../../../../dist/src/brain/weaponized.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request): Promise<NextResponse> {
  // Outer try/catch ensures we ALWAYS return a parseable JSON body. An
  // uncaught throw inside enforce() (rate-limit, store, etc.) escapes the
  // Lambda — Netlify then returns HTTP 500 with an empty body, which the
  // UI surfaces as "Audit failed: HTTP 500 (empty body)".
  try {
    const gate = await enforce(req);
    if (!gate.ok) {
      // Forward upstream gate response (401 unauth, 429 quota, etc.) instead
      // of swallowing non-429 failures and falling through to auditBrain.
      return gate.response;
    }
    const gateHeaders: Record<string, string> = gate.headers;
    try {
      const report = auditBrain(false);
      const integrity = weaponizedIntegrity();
      return NextResponse.json({ ok: true, report, integrity }, { headers: gateHeaders });
    } catch (err) {
      console.error("[weaponized-brain/audit]", err instanceof Error ? err.message : err);
      return NextResponse.json(
        { ok: false, error: `audit unavailable: ${err instanceof Error ? err.message : String(err)}` },
        { status: 500, headers: gateHeaders },
      );
    }
  } catch (err) {
    console.error("[weaponized-brain/audit] outer", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { ok: false, error: `audit gate error: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 },
    );
  }
}
