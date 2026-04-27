// POST /api/vessel-check
// IMO number vessel sanctions screening via vessel-check-api.
// Returns ownership chain, flag state, and any sanction list hits.
//
// Body: { imoNumber: string }  — or batch: { imoNumbers: string[] }

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { checkVessel, screenVessels } from "../../../../dist/src/integrations/vesselCheck.js";

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

interface VesselCheckBody {
  imoNumber?: string;
  imoNumbers?: string[];
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok && gate.response.status === 429) return gate.response;
  const gateHeaders = gate.ok ? gate.headers : {};

  let body: VesselCheckBody;
  try {
    body = (await req.json()) as VesselCheckBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400, headers: CORS });
  }

  // Batch mode
  if (Array.isArray(body.imoNumbers) && body.imoNumbers.length > 0) {
    if (body.imoNumbers.length > 50) {
      return NextResponse.json({ ok: false, error: "batch limit is 50 IMO numbers" }, { status: 400, headers: CORS });
    }
    const result = await screenVessels(body.imoNumbers);
    return NextResponse.json({ ok: true, ...result }, { status: 200, headers: { ...CORS, ...gateHeaders } });
  }

  // Single mode
  if (!body.imoNumber?.trim()) {
    return NextResponse.json({ ok: false, error: "imoNumber or imoNumbers is required" }, { status: 400, headers: CORS });
  }

  const result = await checkVessel(body.imoNumber.trim());

  if (!result.ok && result.error?.includes("not configured")) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 503, headers: CORS });
  }

  return NextResponse.json(result, { status: 200, headers: { ...CORS, ...gateHeaders } });
}
