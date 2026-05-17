// GET /api/goaml/entities
//
// Returns the list of reporting entities configured in HAWKEYE_ENTITIES,
// including goAML-specific fields (goamlRentityId, goamlBranch) needed
// for STR/SAR form population and submission validation.
//
// Unlike /api/entities (which strips goAML fields for general use), this
// endpoint exposes the full entity config so the goAML form can select
// the correct reporting entity and pass it to /api/goaml and /api/sar-report.
//
// Auth: Bearer ADMIN_TOKEN (same gate as all other goAML endpoints).

import { NextResponse } from "next/server";
import { loadEntities } from "@/lib/config/entities";
import { enforce } from "@/lib/server/enforce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  try {
    const entities = loadEntities().map((e) => ({
      id: e.id,
      name: e.name,
      goamlRentityId: e.goamlRentityId,
      ...(e.goamlBranch ? { goamlBranch: e.goamlBranch } : {}),
      jurisdiction: e.jurisdiction ?? "AE",
    }));
    const defaultId = process.env["HAWKEYE_DEFAULT_ENTITY_ID"] ?? entities[0]?.id;
    return NextResponse.json(
      { ok: true, entities, ...(defaultId ? { defaultId } : {}) },
      { headers: gate.headers },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[goaml/entities]", message);
    return NextResponse.json(
      {
        ok: false,
        error: "entities-config-malformed",
        message,
        hint: "HAWKEYE_ENTITIES is malformed or missing — check JSON syntax in Netlify env vars.",
      },
      { status: 503, headers: gate.headers },
    );
  }
}
