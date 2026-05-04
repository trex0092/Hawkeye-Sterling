// POST /api/crypto-risk
// Crypto wallet AML risk scoring — taint analysis for ETH/BTC/TRX.
// Body: { address: string; chain?: "ethereum" | "bitcoin" | "tron" }

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { scoreWallet } from "../../../../dist/src/integrations/cryptoRisk.js";
import type { CryptoChain, WalletRiskResult } from "../../../../dist/src/integrations/cryptoRisk.js";

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

  if (!result.ok) {
    // No provider configured or API call failed — return a graceful offline fallback
    const address = body.address.trim();
    const fallback: WalletRiskResult & { offline: boolean } = {
      ok: true,
      address,
      chain: body.chain ?? "unknown",
      provider: "unavailable",
      riskScore: 0,
      riskLevel: "unknown",
      exposure: { directSanctioned: 0, indirectSanctioned: 0, mixing: 0, darknet: 0 },
      labels: [],
      offline: true,
    };
    return NextResponse.json(fallback, { headers: { ...CORS, ...gateHeaders } });
  }

  return NextResponse.json(result, { headers: { ...CORS, ...gateHeaders } });
}
