// GET /api/wikidata-pep
// Wikidata SPARQL PEP enrichment lookup.
//
// Query parameters:
//   name — person name to query (required)
//
// Returns { ok: true, profiles: WikidataPepProfile[], query: name }.
// Auth required.

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { enrichPepFromWikidata, type WikidataPepProfile } from "@/lib/intelligence/wikidata-pep";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req, { requireJsonBody: false });
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const name = url.searchParams.get("name")?.trim() ?? "";

  if (!name) {
    return NextResponse.json(
      { ok: false, error: "name query parameter is required" },
      { status: 400, headers: gate.headers },
    );
  }

  if (name.length > 200) {
    return NextResponse.json(
      { ok: false, error: "name must be 200 characters or fewer" },
      { status: 400, headers: gate.headers },
    );
  }

  const profiles: WikidataPepProfile[] = await enrichPepFromWikidata(name);

  return NextResponse.json(
    { ok: true, profiles, query: name, count: profiles.length },
    { headers: gate.headers },
  );
}
