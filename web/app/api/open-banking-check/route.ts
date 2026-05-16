// POST /api/open-banking-check
//
// Look up a financial-institution counterparty in the Open Banking Tracker
// dataset (vendored from not-a-bank/open-banking-tracker-data, see
// web/lib/data/open-banking/NOTICE.md).
//
// Body shape (any one of name/bic/domain/id is enough; combine for best match):
//   { name?: string; bic?: string; domain?: string; websiteUrl?: string; id?: string }
//
// Returns the matched provider, the match key, derived AML risk signals,
// linked Open Banking API aggregators (relationship graph edges), and any
// ownership chain. If no match → { match: null }.

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { enrichSubject, openBankingStats } from "@/lib/intelligence/openBankingTracker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

interface Body {
  name?: string;
  bic?: string;
  domain?: string;
  websiteUrl?: string;
  id?: string;
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

  if (!body.name && !body.bic && !body.domain && !body.websiteUrl && !body.id) {
    return NextResponse.json(
      { ok: false, error: "at least one of name, bic, domain, websiteUrl, or id is required" },
      { status: 400, headers: gate.headers }
    );
  }
  if (body.name && body.name.length > 500) {
    return NextResponse.json({ ok: false, error: "name exceeds 500-character limit" }, { status: 400 , headers: gate.headers });
  }
  if (body.domain && body.domain.length > 2000) {
    return NextResponse.json({ ok: false, error: "domain exceeds 2000-character limit" }, { status: 400 , headers: gate.headers });
  }
  if (body.websiteUrl && body.websiteUrl.length > 2000) {
    return NextResponse.json({ ok: false, error: "websiteUrl exceeds 2000-character limit" }, { status: 400 , headers: gate.headers });
  }

  const enrichment = enrichSubject(body);

  if (!enrichment.provider) {
    return NextResponse.json({
      ok: true,
      match: null,
      hint: "No Open Banking Tracker record matched. The dataset covers ~57k banks worldwide; absence is not a red flag — the institution may simply not be tracked.",
    }, { headers: gate.headers });
  }

  return NextResponse.json({
    ok: true,
    match: enrichment.provider,
    matchedBy: enrichment.matchedBy,
    signals: enrichment.signals,
    relationships: {
      apiAggregators: enrichment.aggregators,
      ownership: enrichment.ownership,
    },
    isTpp: enrichment.isTpp,
  }, { headers: gate.headers });
}

// GET /api/open-banking-check  — corpus stats (operator dashboard probe).
export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  return NextResponse.json({ ok: true, corpus: openBankingStats() , headers: gate.headers });
}
