// POST /api/benford
// Benford's Law forensic accounting analysis for a set of transaction amounts.
// Returns MAD, chi-squared, p-value, per-digit breakdown, and risk tier.
//
// Body: { amounts: number[], label?: string }

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { analyseBenford } from "../../../../dist/src/brain/benford.js";

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

interface BenfordBody {
  amounts: number[];
  label?: string;
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok && gate.response.status === 429) return gate.response;
  const gateHeaders = gate.ok ? gate.headers : {};

  let body: BenfordBody;
  try {
    body = (await req.json()) as BenfordBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400, headers: CORS });
  }

  if (!Array.isArray(body.amounts) || body.amounts.length === 0) {
    return NextResponse.json({ ok: false, error: "amounts array is required" }, { status: 400, headers: CORS });
  }

  const result = analyseBenford({
    amounts: body.amounts,
    ...(body.label !== undefined ? { label: body.label } : {}),
  });

  const status = result.ok ? 200 : result.risk === "insufficient-data" ? 422 : 200;
  return NextResponse.json(result, { status, headers: { ...CORS, ...gateHeaders } });
}
