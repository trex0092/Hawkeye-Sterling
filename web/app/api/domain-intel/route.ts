// POST /api/domain-intel
// Domain intelligence — WHOIS, malware, email security, SSL, risk score.
// Body: { domain: string }

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { domainIntel } from "../../../../dist/src/integrations/webCheck.js";

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

interface DomainIntelBody {
  domain?: string;
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok && gate.response.status === 429) return gate.response;
  const gateHeaders = gate.ok ? gate.headers : {};

  let body: DomainIntelBody;
  try {
    body = (await req.json()) as DomainIntelBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400, headers: CORS });
  }

  if (!body.domain?.trim()) {
    return NextResponse.json({ ok: false, error: "domain is required" }, { status: 400, headers: CORS });
  }

  const result = await domainIntel(body.domain.trim());

  if (!result.ok && result.error?.includes("not configured")) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 503, headers: CORS });
  }

  return NextResponse.json(result, { status: result.ok ? 200 : 502, headers: { ...CORS, ...gateHeaders } });
}
