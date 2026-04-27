// POST /api/adverse-media
// Taranis AI adverse-media search for a subject name.
// Returns NLP-enriched news items with entity extraction, tags, and
// AML-relevant adverse classification (sanction/fraud/crime/corruption).
//
// Body: { subject: string, dateFrom?: string, dateTo?: string, limit?: number, minRelevance?: number }

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { searchAdverseMedia } from "../../../../dist/src/integrations/taranisAi.js";

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

interface AdverseMediaBody {
  subject: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  minRelevance?: number;
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok && gate.response.status === 429) return gate.response;
  const gateHeaders = gate.ok ? gate.headers : {};

  let body: AdverseMediaBody;
  try {
    body = (await req.json()) as AdverseMediaBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400, headers: CORS });
  }

  if (!body.subject?.trim()) {
    return NextResponse.json({ ok: false, error: "subject is required" }, { status: 400, headers: CORS });
  }

  const result = await searchAdverseMedia(body.subject.trim(), {
    ...(body.dateFrom !== undefined ? { dateFrom: body.dateFrom } : {}),
    ...(body.dateTo !== undefined ? { dateTo: body.dateTo } : {}),
    limit: body.limit ?? 50,
    minRelevance: body.minRelevance ?? 0,
  });

  if (!result.ok) {
    const status = result.error?.includes("not configured") ? 503 : 502;
    return NextResponse.json({ ok: false, error: result.error }, { status, headers: CORS });
  }

  return NextResponse.json(result, { status: 200, headers: { ...CORS, ...gateHeaders } });
}
