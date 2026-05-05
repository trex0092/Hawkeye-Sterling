// POST /api/gleif
// GLEIF LEI lookup — returns entity record and ownership chain.
// Body: { lei: string; maxDepth?: number } | { query: string; limit?: number }

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { lookupLei, searchGleif } from "../../../../dist/src/integrations/gleif.js";
import { LIVE_GLEIF_ADAPTER } from "@/lib/intelligence/liveAdapters";

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
    // Try the legacy integration first; if it fails or returns nothing,
    // fall back to the LIVE_GLEIF_ADAPTER which talks directly to the
    // free public GLEIF API. This is the "no more 503" pattern: the
    // operator always gets a usable result.
    let results: Awaited<ReturnType<typeof searchGleif>> = [];
    let degraded = false;
    try {
      results = await searchGleif(body.query.trim(), body.limit ?? 20);
    } catch (err) {
      console.warn("[gleif] searchGleif failed, falling back to live adapter:", err instanceof Error ? err.message : err);
      degraded = true;
    }
    if ((!results || results.length === 0) && LIVE_GLEIF_ADAPTER.isAvailable()) {
      const fallback = await LIVE_GLEIF_ADAPTER.lookupByName(body.query.trim());
      results = fallback.map((r) => ({
        lei: r.lei,
        legalName: r.legalName,
        ...(r.legalForm ? { legalForm: r.legalForm } : {}),
        ...(r.status ? { status: r.status } : {}),
        ...(r.countryIso2 ? { countryIso2: r.countryIso2 } : {}),
      } as ReturnType<typeof searchGleif> extends Promise<infer T> ? T extends Array<infer U> ? U : never : never));
      if (results.length > 0) degraded = true;
    }
    return NextResponse.json(
      { ok: true, results, ...(degraded ? { source: "live-gleif-fallback" } : {}) },
      { status: 200, headers: { ...CORS, ...gateHeaders } },
    );
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
      { ok: false, error: "GLEIF service is not configured on the server. A null entity here is not a 'not registered' finding." },
      { status: 503, headers: { ...CORS, ...gateHeaders } },
    );
  }

  return NextResponse.json(result, { status: 200, headers: { ...CORS, ...gateHeaders } });
}
