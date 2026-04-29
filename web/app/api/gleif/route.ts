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
    const results = await searchGleif(body.query.trim(), body.limit ?? 20);
    return NextResponse.json({ ok: true, results }, { status: 200, headers: { ...CORS, ...gateHeaders } });
  }

  // LEI lookup mode
  if (!body.lei?.trim()) {
    return NextResponse.json({ ok: false, error: "lei or query is required" }, { status: 400, headers: CORS });
  }

  const result = await lookupLei(body.lei.trim(), { maxDepth: body.maxDepth ?? 3 });

  if (!result.ok && result.error?.includes("not configured")) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 503, headers: CORS });
  }

  return NextResponse.json(result, { status: result.ok ? 200 : 502, headers: { ...CORS, ...gateHeaders } });
}
