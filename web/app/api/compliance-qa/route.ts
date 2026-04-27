// POST /api/compliance-qa
// Regulatory Q&A via AML-MultiAgent-RAG (luuisotorres/AML-MultiAgent-RAG).
// Routes through the 4-agent pipeline: RAG Agent → Confidence Agent →
// Consistency Agent → Orchestrator. Returns source-cited answers with
// confidence/consistency scores and a quality gate decision.
//
// Body: { query: string, mode?: "multi-agent" | "single" }

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { askComplianceQuestion } from "../../../../dist/src/integrations/complianceRag.js";
import type { ComplianceQuestion } from "../../../../dist/src/integrations/complianceRag.js";

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
  mode?: ComplianceQuestion["mode"];
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

  const query = body.query?.trim();
  if (!query || query.length < 10) {
    return NextResponse.json(
      { ok: false, error: "query must be at least 10 characters" },
      { status: 400, headers: CORS },
    );
  }
  if (query.length > 2000) {
    return NextResponse.json(
      { ok: false, error: "query too long (max 2000 characters)" },
      { status: 400, headers: CORS },
    );
  }

  const result = await askComplianceQuestion({
    query,
    mode: body.mode ?? "multi-agent",
  });

  return NextResponse.json(result, {
    status: result.ok ? 200 : 503,
    headers: { ...CORS, ...gateHeaders },
  });
}
