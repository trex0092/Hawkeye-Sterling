// POST /api/yente
// Entity matching against yente (opensanctions/yente) — a self-hosted
// FastAPI + ElasticSearch service covering 120+ sanctions/PEP/crime datasets.
// Wraps yente's /match endpoint with the HS auth gate and CORS headers.
//
// Body: { queries: YenteMatchQuery[], threshold?: number, limit?: number, dataset?: string }

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { corsHeaders, corsPreflight } from "@/lib/api/cors";
import { yenteMatch } from "../../../../dist/src/integrations/yente.js";
import type { YenteMatchQuery, YenteMatchOptions } from "../../../../dist/src/integrations/yente.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function OPTIONS(req: Request): Promise<Response> {
  return corsPreflight(req.headers.get("origin"));
}

interface YenteRequestBody {
  queries: YenteMatchQuery[];
  threshold?: number;
  limit?: number;
  dataset?: string;
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  const origin = req.headers.get("origin");
  const cors = corsHeaders(origin);

  let body: YenteRequestBody;
  try {
    body = (await req.json()) as YenteRequestBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400, headers: cors });
  }

  if (!Array.isArray(body.queries) || body.queries.length === 0) {
    return NextResponse.json({ ok: false, error: "queries must be a non-empty array" }, { status: 400, headers: cors });
  }

  if (body.queries.length > 100) {
    return NextResponse.json({ ok: false, error: "max 100 queries per request" }, { status: 400, headers: cors });
  }

  const opts: YenteMatchOptions = {
    threshold: body.threshold,
    limit: body.limit,
    dataset: body.dataset,
  };

  const results = await yenteMatch(body.queries, opts);

  return NextResponse.json(
    { ok: true, results, total: results.length },
    { status: 200, headers: { ...cors, ...(gate.ok ? gate.headers : {}) } },
  );
}
