// POST /api/adverse-media
// Weaponized adverse-media pipeline:
//   1. Fetch from Taranis AI (live OSINT news feed)
//   2. Classify each item against the 737-keyword taxonomy (12 categories)
//   3. Map to FATF predicate offenses + reasoning modes
//   4. Score severity (critical/high/medium/low/clear)
//   5. Evaluate SAR trigger (FATF R.20)
//   6. Generate MLRO investigation narrative
//
// Returns a full AdverseMediaSubjectVerdict — MLRO-grade intelligence report.
//
// Body: { subject: string, dateFrom?: string, dateTo?: string, limit?: number, minRelevance?: number }

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { searchAdverseMedia } from "../../../../dist/src/integrations/taranisAi.js";
import { analyseAdverseMediaResult } from "../../../../dist/src/brain/adverse-media-analyser.js";

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

  const subject = body.subject.trim();

  const taranisResult = await searchAdverseMedia(subject, {
    ...(body.dateFrom !== undefined ? { dateFrom: body.dateFrom } : {}),
    ...(body.dateTo !== undefined ? { dateTo: body.dateTo } : {}),
    limit: body.limit ?? 50,
    minRelevance: body.minRelevance ?? 0,
  });

  if (!taranisResult.ok) {
    const status = taranisResult.error?.includes("not configured") ? 503 : 502;
    return NextResponse.json({ ok: false, error: taranisResult.error }, { status, headers: CORS });
  }

  // Run the weaponized analyser — full MLRO-grade intelligence pipeline
  const verdict = analyseAdverseMediaResult(subject, taranisResult);

  return NextResponse.json(
    {
      ok: true,
      // Raw Taranis counts for backward compat
      totalCount: taranisResult.totalCount,
      adverseCount: taranisResult.adverseCount,
      highRelevanceCount: taranisResult.highRelevanceCount,
      // Weaponized analysis
      verdict,
    },
    { status: 200, headers: { ...CORS, ...gateHeaders } },
  );
}
