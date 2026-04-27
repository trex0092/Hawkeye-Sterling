// POST /api/domain-intel
// Domain intelligence via web-check (Lissy93/web-check).
// Fetches WHOIS age, malware flags, email security, SSL, and domain rank.
// Computes a composite AML risk score (0–100) with named risk factors.
//
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

const DOMAIN_RE = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+$/;

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok && gate.response.status === 429) return gate.response;
  const gateHeaders = gate.ok ? gate.headers : {};

  let body: { domain?: string };
  try {
    body = (await req.json()) as { domain?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400, headers: CORS });
  }

  const domain = body.domain?.trim().toLowerCase();
  if (!domain || !DOMAIN_RE.test(domain)) {
    return NextResponse.json({ ok: false, error: "invalid domain name" }, { status: 400, headers: CORS });
  }

  const result = await domainIntel(domain);

  return NextResponse.json(result, {
    status: result.ok ? 200 : 503,
    headers: { ...CORS, ...gateHeaders },
  });
}
