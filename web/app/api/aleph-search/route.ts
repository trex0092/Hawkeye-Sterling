// POST /api/aleph-search
// Investigative entity & document search via the Aleph platform (OCCRP).
// Uses aleph-client.ts — defaults to aleph.occrp.org; override via ALEPH_HOST.

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { writeAuditChainEntry } from "@/lib/server/audit-chain";
import { tenantIdFromGate } from "@/lib/server/tenant";
import { searchEntities, matchEntities, getEntityNeighbours } from "@/lib/server/aleph-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

interface Body {
  query?: string;
  schema?: string;
  limit?: number;
  mode?: "search" | "match" | "neighbours";
  entityId?: string; // for neighbours mode
  properties?: Record<string, string[]>; // for match mode
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const tenant = tenantIdFromGate(gate);

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400, headers: gate.headers });
  }

  try {
    if (body.mode === "neighbours" && body.entityId) {
      const results = await getEntityNeighbours(body.entityId, body.limit ?? 20);
      void writeAuditChainEntry({
        event: "aleph_search.neighbours.completed",
        actor: gate.keyId,
        entityId: body.entityId,
        hitCount: results.length,
        source: "aleph/occrp",
      }, tenant).catch(() => {});
      return NextResponse.json({ ok: true, mode: "neighbours", entityId: body.entityId, results, source: "aleph/occrp" }, { headers: gate.headers });
    }

    if (body.mode === "match" && body.properties) {
      const result = await matchEntities(
        [{ schema: body.schema ?? "Thing", properties: body.properties }],
        { limit: body.limit ?? 10 },
      );
      void writeAuditChainEntry({
        event: "aleph_search.match.completed",
        actor: gate.keyId,
        schema: body.schema ?? "Thing",
        hitCount: (result.results[0] ?? []).length,
        source: "aleph/occrp",
      }, tenant).catch(() => {});
      return NextResponse.json({ ok: true, mode: "match", results: result.results[0] ?? [], source: "aleph/occrp" }, { headers: gate.headers });
    }

    const query = body.query?.trim() ?? "";
    if (!query) {
      return NextResponse.json({ ok: false, error: "query is required for search mode" }, { status: 400, headers: gate.headers });
    }

    const result = await searchEntities(query, { schema: body.schema, limit: body.limit ?? 10 });
    void writeAuditChainEntry({
      event: "aleph_search.search.completed",
      actor: gate.keyId,
      query,
      hitCount: result.results.length,
      source: "aleph/occrp",
    }, tenant).catch(() => {});
    return NextResponse.json(
      { ok: true, mode: "search", query, total: result.total, results: result.results, source: "aleph/occrp" },
      { headers: gate.headers },
    );
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 502, headers: gate.headers },
    );
  }
}
