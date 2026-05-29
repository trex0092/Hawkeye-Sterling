// GET /api/pep-family-graph?name=<name>
//
// Returns the PEP family relationship network for the given subject
// using Wikidata SPARQL (properties P26/spouse, P40/child, P22/father,
// P25/mother, P3373/sibling). Nodes include relationship labels and
// whether each person is themselves a PEP based on Wikidata positions.
//
// Auth required (cost: 2).

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import {
  fetchPepFamilyNetwork,
  type PepFamilyNetwork,
} from "@/lib/intelligence/wikidata-pep";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req, { requireAuth: true, requireJsonBody: false, cost: 2 });
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const name = url.searchParams.get("name")?.trim() ?? "";

  if (!name) {
    return NextResponse.json(
      { ok: false, error: "name query parameter is required" },
      { status: 400, headers: gate.headers },
    );
  }

  if (name.length > 300) {
    return NextResponse.json(
      { ok: false, error: "name must be 300 characters or fewer" },
      { status: 400, headers: gate.headers },
    );
  }

  let network: PepFamilyNetwork;
  try {
    network = await fetchPepFamilyNetwork(name);
  } catch (err) {
    console.error(
      "[pep-family-graph] fetchPepFamilyNetwork failed:",
      err instanceof Error ? err.message : String(err),
    );
    return NextResponse.json(
      { ok: false, error: "PEP family network lookup failed" },
      { status: 500, headers: gate.headers },
    );
  }

  return NextResponse.json(
    { ok: true, ...network },
    { headers: gate.headers },
  );
}
