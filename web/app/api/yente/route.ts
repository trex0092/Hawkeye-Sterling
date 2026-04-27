import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { yenteMatch } from "../../../../dist/src/integrations/yente.js";

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

interface YenteQuery {
  name: string;
  nationality?: string;
  birthDate?: string;
  schema?: "Person" | "Organization" | "Company" | "Vessel" | "LegalEntity";
}

interface Body {
  queries: YenteQuery[];
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok && gate.response.status === 429) return gate.response;
  const gateHeaders = gate.ok ? gate.headers : {};

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400, headers: CORS });
  }

  if (!Array.isArray(body?.queries) || body.queries.length === 0) {
    return NextResponse.json({ ok: false, error: "queries must be a non-empty array" }, { status: 400, headers: CORS });
  }

  if (body.queries.length > 50) {
    return NextResponse.json({ ok: false, error: "max 50 queries per request" }, { status: 400, headers: CORS });
  }

  const validQueries = body.queries.filter((q) => typeof q?.name === "string" && q.name.trim());
  if (validQueries.length === 0) {
    return NextResponse.json({ ok: false, error: "all queries are missing a name field" }, { status: 400, headers: CORS });
  }

  try {
    const results = await yenteMatch(validQueries);
    return NextResponse.json(
      { ok: true, results, queriedAt: new Date().toISOString() },
      { headers: { ...CORS, ...gateHeaders } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.toLowerCase().includes("not configured") || msg.toLowerCase().includes("econnrefused")) {
      return NextResponse.json(
        { ok: false, error: "Yente service not configured", detail: "Set YENTE_URL in Netlify environment variables." },
        { status: 503, headers: CORS },
      );
    }
    return NextResponse.json(
      { ok: false, error: "yente match failed", detail: msg },
      { status: 502, headers: CORS },
    );
  }
}
