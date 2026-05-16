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
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 , headers: gate.headers });
  }

  if (!body.name && !body.identifier && !body.id && !body.country) {
    return NextResponse.json(
      { ok: false, error: "at least one of name, identifier, id, or country is required" },
      { status: 400, headers: gate.headers }
    );
  }

  // Country-only mode: list all sanctioned entities tied to a given ISO-2 country.
  if (!body.name && !body.identifier && !body.id && body.country) {
    const matches = await lookupByCountry(body.country);
    return NextResponse.json({
      ok: true,
      mode: "country-listing",
      country: body.country.toLowerCase(),
      count: matches.length,
      // Cap at first 100 to keep response reasonable; caller pages with the cursor pattern if needed.
      matches: matches.slice(0, 100),
      truncated: matches.length > 100,
    }, { headers: gate.headers });
  }

  const enr = await enrichSubject(body);

  if (!enr.match) {
    return NextResponse.json({
      ok: true,
      match: null,
      hint: "No OpenSanctions record matched in the loaded corpus. Coverage depends on the OPENSANCTIONS_DATASETS env var (default: ae_local_terrorists only — ~30 entities). Set OPENSANCTIONS_DATASETS to a comma-separated list of slugs (e.g. 'us_ofac_sdn,eu_fsf,gb_hmt_sanctions,un_sc_sanctions') and trigger /api/admin/opensanctions-refresh to expand. Absence is not a guarantee of clearance — manual review still required for high-risk subjects.",
    }, { headers: gate.headers });
  }

  return NextResponse.json({
    ok: true,
    match: enr.match,
    matchedBy: enr.matchedBy,
    signals: enr.signals,
    allNameMatches: enr.allNameMatches.length > 1 ? enr.allNameMatches : undefined,
  }, { headers: gate.headers });
}

// GET /api/opensanctions-check  — corpus stats (operator dashboard probe).
export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  return NextResponse.json({ ok: true, corpus: await openSanctionsStats() }, { headers: gate.headers });
}
