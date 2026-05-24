// GET /api/corporate-registry
// Corporate registry lookup via OpenCorporates.
//
// Query parameters:
//   name         — company name to search (required)
//   jurisdiction — ISO 3166-1 alpha-2 or OpenCorporates jurisdiction code (optional)
//
// Returns { ok: true, records: CorporateRecord[], source: "opencorporates", query: string }.
// Auth required.

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { searchCorporateRegistry, type CorporateRecord } from "@/lib/intelligence/opencorporates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req, { requireJsonBody: false });
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const name = url.searchParams.get("name")?.trim() ?? "";
  const jurisdiction = url.searchParams.get("jurisdiction")?.trim() || undefined;

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

  const records: CorporateRecord[] = await searchCorporateRegistry(name, jurisdiction);

  return NextResponse.json(
    {
      ok: true,
      records,
      source: "opencorporates" as const,
      query: name,
      ...(jurisdiction ? { jurisdiction } : {}),
      count: records.length,
    },
    { headers: gate.headers },
  );
}
