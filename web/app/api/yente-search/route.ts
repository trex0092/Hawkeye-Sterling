// POST /api/yente-search
// Entity search via yente / OpenSanctions.
// Uses yente-client.ts — self-hosted or public OpenSanctions API.

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { searchEntities, matchEntity } from "@/lib/server/yente-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

interface Body {
  query?: string;
  schema?: string;
  dataset?: string;
  limit?: number;
  // Structured match fields for higher-precision matching
  name?: string;
  birthDate?: string;
  nationality?: string;
  registrationNumber?: string;
  mode?: "search" | "match";
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400, headers: gate.headers });
  }

  const query = body.query?.trim() ?? body.name?.trim() ?? "";
  if (!query) {
    return NextResponse.json({ ok: false, error: "query or name is required" }, { status: 400, headers: gate.headers });
  }

  try {
    if (body.mode === "match" || body.birthDate || body.nationality || body.registrationNumber) {
      // Structured FTM matching — higher precision
      const result = await matchEntity(
        {
          schema: body.schema ?? "Thing",
          properties: {
            name: [query],
            ...(body.birthDate ? { birthDate: [body.birthDate] } : {}),
            ...(body.nationality ? { nationality: [body.nationality] } : {}),
            ...(body.registrationNumber ? { registrationNumber: [body.registrationNumber] } : {}),
          },
        },
        { dataset: body.dataset, limit: body.limit ?? 10 },
      );
      return NextResponse.json(
        {
          ok: true,
          mode: "match",
          query,
          total: result.total,
          results: result.results,
          source: "yente/opensanctions",
        },
        { headers: gate.headers },
      );
    }

    // Text search
    const result = await searchEntities(query, {
      schema: body.schema,
      dataset: body.dataset,
      limit: body.limit ?? 10,
    });

    return NextResponse.json(
      {
        ok: true,
        mode: "search",
        query,
        total: result.total,
        results: result.results,
        source: "yente/opensanctions",
      },
      { headers: gate.headers },
    );
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 502, headers: gate.headers },
    );
  }
}
