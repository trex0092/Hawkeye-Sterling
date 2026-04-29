// POST /api/crypto-risk
// Crypto wallet AML risk scoring — taint analysis for ETH/BTC/TRX.
// Body: { address: string; chain?: "ethereum" | "bitcoin" | "tron" }

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { scoreWallet } from "../../../../dist/src/integrations/cryptoRisk.js";
import type { CryptoChain } from "../../../../dist/src/integrations/cryptoRisk.js";

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

interface CryptoRiskBody {
  address?: string;
  chain?: CryptoChain;
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok && gate.response.status === 429) return gate.response;
  const gateHeaders = gate.ok ? gate.headers : {};

  let body: CryptoRiskBody;
  try {
    body = (await req.json()) as CryptoRiskBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400, headers: CORS });
  }

  if (!body.address?.trim()) {
    return NextResponse.json({ ok: false, error: "address is required" }, { status: 400, headers: CORS });
  }

  const result = await scoreWallet(body.address.trim(), { chain: body.chain });

  if (!result.ok && result.error?.includes("not configured")) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 503, headers: CORS });
  }

  return NextResponse.json(result, { status: result.ok ? 200 : 502, headers: { ...CORS, ...gateHeaders } });
}
