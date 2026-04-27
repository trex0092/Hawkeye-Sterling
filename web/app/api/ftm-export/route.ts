// POST /api/ftm-export
// Converts a batch of subject records into FollowTheMoney (FtM) NDJSON format.
// Output is compatible with:
//   ftm aggregate  — cross-source deduplication
//   ftm cypher     — Neo4j import
//   ftm gexf       — Gephi / NetworkX graph export
//   ftm rdf        — RDF knowledge graph export
//
// Body: { entries: NormalisedListEntry[], includeSanctions?: boolean }
// Returns: text/plain NDJSON stream (one entity per line)

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { entriesToFtmStream } from "../../../../dist/src/ingestion/ftm-mapper.js";
import type { NormalisedListEntry } from "../../../../dist/src/brain/watchlist-adapters.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type, authorization, x-api-key",
};

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: CORS });
}

interface FtmExportBody {
  entries: NormalisedListEntry[];
  includeSanctions?: boolean;
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok && gate.response.status === 429) return gate.response;

  let body: FtmExportBody;
  try {
    body = (await req.json()) as FtmExportBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400, headers: CORS });
  }

  if (!Array.isArray(body.entries) || body.entries.length === 0) {
    return NextResponse.json({ ok: false, error: "entries must be a non-empty array" }, { status: 400, headers: CORS });
  }

  if (body.entries.length > 10_000) {
    return NextResponse.json({ ok: false, error: "max 10,000 entries per export" }, { status: 400, headers: CORS });
  }

  const ndjson = entriesToFtmStream(body.entries, body.includeSanctions ?? true);

  return new NextResponse(ndjson, {
    status: 200,
    headers: {
      ...CORS,
      "content-type": "application/x-ndjson",
      "content-disposition": `attachment; filename="hawkeye-sterling-${Date.now()}.ftm.json"`,
    },
  });
}
