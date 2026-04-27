// POST /api/compliance-qa
// Regulatory Q&A RAG — multi-agent or single-agent pipeline.
// Body: { query: string; mode?: "multi-agent" | "single" }

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { askComplianceQuestion } from "../../../../dist/src/integrations/complianceRag.js";

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

interface ComplianceQaBody {
  query?: string;
  mode?: "multi-agent" | "single";
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok && gate.response.status === 429) return gate.response;
  const gateHeaders = gate.ok ? gate.headers : {};

  let body: ComplianceQaBody;
  try {
    body = (await req.json()) as ComplianceQaBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400, headers: CORS });
  }

  if (!body.query?.trim()) {
    return NextResponse.json({ ok: false, error: "query is required" }, { status: 400, headers: CORS });
  }

  const result = await askComplianceQuestion({
    query: body.query.trim(),
    mode: body.mode ?? "single",
  });

  if (!result.ok && result.error?.includes("not configured")) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 503, headers: CORS });
  }

  return NextResponse.json(result, { status: result.ok ? 200 : 502, headers: { ...CORS, ...gateHeaders } });
}
