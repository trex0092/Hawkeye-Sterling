import { NextResponse } from "next/server";
import { loadEntities } from "@/lib/config/entities";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public list of reporting entities — populates the STR/SAR form's
// entity dropdown. Only id + name are returned; goAML rentity IDs and
// branch codes stay server-side to avoid leaking the FIU registration
// numbers into the browser bundle.

export function GET(): NextResponse {
  try {
    const entities = loadEntities().map((e) => ({
      id: e.id,
      name: e.name,
    }));
    const defaultId = process.env["HAWKEYE_DEFAULT_ENTITY_ID"] ?? entities[0]?.id;
    return NextResponse.json({
      ok: true,
      entities,
      ...(defaultId ? { defaultId } : {}),
    });
  } catch (err) {
    // Audit DR-02: returning 200 with empty entities masked HAWKEYE_ENTITIES
    // JSON-parse failures as "no entities configured". MLRO forms rendered
    // unusable but operators saw nothing wrong. Now: 503 surfaces the
    // misconfiguration so monitors and the UI both treat it as a real fault.
    const message = err instanceof Error ? err.message : String(err);
    console.error("[entities]", message);
    return NextResponse.json({
      ok: false,
      error: "entities-config-malformed",
      message,
      hint: "HAWKEYE_ENTITIES is malformed or missing — check JSON syntax in Netlify env vars.",
    }, { status: 503 });
  }
}
