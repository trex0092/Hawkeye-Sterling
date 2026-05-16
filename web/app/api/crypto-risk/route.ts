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
  "access-control-allow-origin": process.env["NEXT_PUBLIC_APP_URL"] ?? "https://hawkeye-sterling.netlify.app",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type, authorization, x-api-key",
};

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: CORS });
}

interface CryptoRiskBody {
  address?: string;
  chain?: CryptoChain;
  // Subject-wrapped form (from MCP tool): { subject: { address, chain } }
  subject?: { address?: string; chain?: CryptoChain };
}

type AddressFormat = "BTC-P2PKH" | "BTC-P2SH" | "BTC-bech32" | "ETH" | "unknown";

function detectAddressFormat(address: string): AddressFormat {
  if (/^1[a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(address)) return "BTC-P2PKH";
  if (/^3[a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(address)) return "BTC-P2SH";
  if (/^bc1[a-z0-9]{6,87}$/.test(address)) return "BTC-bech32";
  if (/^0x[0-9a-fA-F]{40}$/.test(address)) return "ETH";
  return "unknown";
}

export async function POST(req: Request): Promise<NextResponse> {
  const _handlerStart = Date.now();
  try {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  const gateHeaders = gate.ok ? gate.headers : {};

  let body: CryptoRiskBody;
  try {
    const raw = (await req.json()) as CryptoRiskBody;
    // Unwrap subject envelope sent by the MCP tool layer.
    body = (raw.subject && typeof raw.subject === "object")
      ? { ...raw.subject, ...raw, subject: undefined }
      : raw;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400, headers: { ...gate.headers, ...CORS } });
  }

  if (!body.address?.trim()) {
    return NextResponse.json({ ok: false, error: "address is required" }, { status: 400, headers: { ...gate.headers, ...CORS } });
  }

  const address = body.address.trim();
  const addressFormat = detectAddressFormat(address);
  const result = await scoreWallet(address, { chain: body.chain });

  if (!result.ok) {
    // No provider configured or API call failed — return a graceful offline fallback
    const fallback: WalletRiskResult & { offline: boolean; addressFormat: AddressFormat; simulationWarning: string } = {
      ok: true,
      address,
      chain: body.chain ?? "unknown",
      provider: "unavailable",
      riskScore: 0,
      riskLevel: "unknown",
      exposure: { directSanctioned: 0, indirectSanctioned: 0, mixing: 0, darknet: 0 },
      labels: [],
      offline: true,
      addressFormat,
      simulationWarning: "Crypto risk provider not configured — this is a placeholder response. No real taint analysis, sanctions screening, or on-chain data has been retrieved. Do not use for compliance decisions.",
    };
    return NextResponse.json(fallback, { headers: { ...CORS, ...gateHeaders } });
  }

  const latencyMs = Date.now() - _handlerStart;
  if (latencyMs > 5000) console.warn(`[crypto_risk] latencyMs=${latencyMs} exceeds 5000ms`);
  return NextResponse.json({ ...result, addressFormat, latencyMs }, { headers: { ...CORS, ...gateHeaders } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({
      ok: false,
      errorCode: "HANDLER_EXCEPTION",
      errorType: "internal",
      tool: "crypto_risk",
      message,
      retryAfterSeconds: null,
      requestId: Math.random().toString(36).slice(2, 10),
      latencyMs: Date.now() - _handlerStart,
    }, { status: 500 , headers: {} });
  }
}
