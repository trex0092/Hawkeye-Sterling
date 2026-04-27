// POST /api/crypto-risk
// Cryptocurrency wallet AML risk scoring.
// Supports Januus (free, currently paused), Chainalysis KYT, and Elliptic Lens.
// Auto-detects chain from address format (ETH/BTC/TRX).
// Returns risk score 0–100, taint exposure breakdown, and entity labels.
//
// Body: { address: string, chain?: "ethereum" | "bitcoin" | "tron" }

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { scoreWallet } from "../../../../dist/src/integrations/cryptoRisk.js";
import type { CryptoChain } from "../../../../dist/src/integrations/cryptoRisk.js";

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

const VALID_CHAINS: CryptoChain[] = ["ethereum", "bitcoin", "tron", "unknown"];

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await enforce(req);
  if (!gate.ok && gate.response.status === 429) return gate.response;
  const gateHeaders = gate.ok ? gate.headers : {};

  let body: { address?: string; chain?: string };
  try {
    body = (await req.json()) as { address?: string; chain?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400, headers: CORS });
  }

  const address = body.address?.trim();
  if (!address || address.length < 26 || address.length > 100) {
    return NextResponse.json(
      { ok: false, error: "address must be a valid crypto wallet address" },
      { status: 400, headers: CORS },
    );
  }

  const chain = VALID_CHAINS.includes(body.chain as CryptoChain)
    ? (body.chain as CryptoChain)
    : undefined;

  const result = await scoreWallet(address, { chain });

  return NextResponse.json(result, {
    status: result.ok ? 200 : result.provider === "unavailable" ? 503 : 502,
    headers: { ...CORS, ...gateHeaders },
  });
}
