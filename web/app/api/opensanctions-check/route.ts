// POST /api/opensanctions-check
//
// Look up a subject in the OpenSanctions consolidated sanctions dataset
// (~67k entities across UN / US OFAC / EU / UK / Canada OSFI / Australia
// DFAT / UAE EOCN / Switzerland SECO / Japan METI / etc.). Vendored from
// data.opensanctions.org under CC BY-NC 4.0 — see
// web/lib/data/opensanctions/NOTICE.md.
//
// Body shape:
//   { name?: string; identifier?: string; id?: string }
//
// Returns: { match, matchedBy, allNameMatches, signals } where signals
// includes regimeCount, cahraNexus, usOfac, un, eu, uk booleans.

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import {
  enrichSubject,
  openSanctionsStats,
  lookupByCountry,
} from "@/lib/intelligence/openSanctions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

interface Body {
  name?: string;
  identifier?: string;
  id?: string;
  country?: string;
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  if (!body.name && !body.identifier && !body.id && !body.country) {
    return NextResponse.json(
      { ok: false, error: "at least one of name, identifier, id, or country is required" },
      { status: 400 },
    );
  }

  // Country-only mode: list all sanctioned entities tied to a given ISO-2 country.
  if (!body.name && !body.identifier && !body.id && body.country) {
    const matches = lookupByCountry(body.country);
    return NextResponse.json({
      ok: true,
      mode: "country-listing",
      country: body.country.toLowerCase(),
      count: matches.length,
      // Cap at first 100 to keep response reasonable; caller pages with the cursor pattern if needed.
      matches: matches.slice(0, 100),
      truncated: matches.length > 100,
    });
  }

  const enr = enrichSubject(body);

  if (!enr.match) {
    return NextResponse.json({
      ok: true,
      match: null,
      hint: "No OpenSanctions record matched. The dataset covers ~67k sanctioned entities aggregated from ~200 sources; absence is not a guarantee of clearance — manual review still required for high-risk subjects.",
    });
  }

  return NextResponse.json({
    ok: true,
    match: enr.match,
    matchedBy: enr.matchedBy,
    signals: enr.signals,
    allNameMatches: enr.allNameMatches.length > 1 ? enr.allNameMatches : undefined,
  });
}

// GET /api/opensanctions-check  — corpus stats (operator dashboard probe).
export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  return NextResponse.json({ ok: true, corpus: openSanctionsStats() });
}
