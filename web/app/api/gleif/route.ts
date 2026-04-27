// GET  /api/gleif?lei=<LEI>&depth=<1-10>   — LEI record + ownership chain
// GET  /api/gleif?q=<name>&limit=<n>       — search by legal name
// Calls the GLEIF public REST API (no auth required).

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { lookupLei, searchGleif } from "../../../../dist/src/integrations/gleif.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "content-type, authorization, x-api-key",
};

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok && gate.response.status === 429) return gate.response;
  const gateHeaders = gate.ok ? gate.headers : {};

  const url = new URL(req.url);
  const lei = url.searchParams.get("lei")?.trim();
  const query = url.searchParams.get("q")?.trim();
  const depth = parseInt(url.searchParams.get("depth") ?? "5", 10);
  const limit = parseInt(url.searchParams.get("limit") ?? "10", 10);

  if (lei) {
    if (!/^[A-Z0-9]{20}$/.test(lei)) {
      return NextResponse.json(
        { ok: false, error: "LEI must be exactly 20 uppercase alphanumeric characters" },
        { status: 400, headers: CORS },
      );
    }
    const result = await lookupLei(lei, { maxDepth: Math.min(10, Math.max(1, depth)) });
    return NextResponse.json(result, {
      status: result.ok ? 200 : 404,
      headers: { ...CORS, ...gateHeaders },
    });
  }

  if (query) {
    const results = await searchGleif(query, Math.min(50, Math.max(1, limit)));
    return NextResponse.json(
      { ok: true, results, total: results.length },
      { status: 200, headers: { ...CORS, ...gateHeaders } },
    );
  }

  return NextResponse.json(
    { ok: false, error: "Provide ?lei=<LEI> or ?q=<name>" },
    { status: 400, headers: CORS },
  );
}
