// POST /api/gleif
// GLEIF LEI lookup — returns entity record and ownership chain.
// Body: { lei: string; maxDepth?: number } | { query: string; limit?: number }

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { lookupLei, searchGleif } from "../../../../dist/src/integrations/gleif.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type, authorization, x-api-key",
};

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: CORS });
}

interface GleifBody {
  lei?: string;
  maxDepth?: number;
  query?: string;
  limit?: number;
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok && gate.response.status === 429) return gate.response;
  const gateHeaders = gate.ok ? gate.headers : {};

  let body: GleifBody;
  try {
    body = (await req.json()) as GleifBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400, headers: CORS });
  }

  // Name search mode
  if (body.query?.trim()) {
    let results: Awaited<ReturnType<typeof searchGleif>>;
    try {
      results = await searchGleif(body.query.trim(), body.limit ?? 20);
    } catch (err) {
      console.error("[gleif] searchGleif failed", err);
      return NextResponse.json(
        { ok: false, error: "GLEIF search unavailable — please retry. An empty result here is not a 'no matches' finding." },
        { status: 503, headers: { ...CORS, ...gateHeaders } },
      );
    }
    return NextResponse.json({ ok: true, results }, { status: 200, headers: { ...CORS, ...gateHeaders } });
  }

  // LEI lookup mode
  if (!body.lei?.trim()) {
    return NextResponse.json({ ok: false, error: "lei or query is required" }, { status: 400, headers: CORS });
  }

  let result: Awaited<ReturnType<typeof lookupLei>>;
  try {
    result = await lookupLei(body.lei.trim(), { maxDepth: body.maxDepth ?? 3 });
  } catch (err) {
    console.error("[gleif] lookupLei failed", err);
    return NextResponse.json(
      { ok: false, error: "GLEIF lookup unavailable — please retry. A null entity here is not a 'not registered' finding." },
      { status: 503, headers: { ...CORS, ...gateHeaders } },
    );
  }

  if (!result.ok && result.error?.includes("not configured")) {
    return NextResponse.json(
      { ok: true, lei: body.lei.trim(), entity: null, ownershipChain: [], note: "GLEIF service not configured — manual review required." },
      { status: 200, headers: { ...CORS, ...gateHeaders } },
    );
  }

  return NextResponse.json(result, { status: 200, headers: { ...CORS, ...gateHeaders } });
}
