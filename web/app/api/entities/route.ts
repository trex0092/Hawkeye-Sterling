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
    console.error("[entities]", err instanceof Error ? err.message : err);
    return NextResponse.json({
      ok: true,
      entities: [],
      note: "HAWKEYE_ENTITIES is malformed or missing — returned empty list. Check JSON syntax in Netlify env vars.",
    });
  }
}
