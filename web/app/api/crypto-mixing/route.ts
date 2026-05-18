export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;import { NextResponse } from "next/server";

import { enforce } from "@/lib/server/enforce";
import { getAnthropicClient } from "@/lib/server/llm";
import { sanitizeField, sanitizeText } from "@/lib/server/sanitize-prompt";

export interface CryptoMixingResult {
  mixingRisk: "critical" | "high" | "medium" | "low";
  mixingTechniques: string[];
  obfuscationScore: number;
  traceabilityRating: "traceable" | "partially-traceable" | "untraceable";
  blockchainIntelligence: string;
  recommendedAction:
    | "proceed"
    | "enhanced-monitoring"
    | "freeze-report"
    | "reject";
  reportingBasis: string;
  regulatoryBasis: string;
}


export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: {
    walletAddress: string;
    cryptoType: string;
    transactionHashes: string;
    exchangeContext: string;
    amountUsd: string;
    context: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON" },
      { status: 400, headers: gate.headers }
    );
  }
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "crypto-mixing temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  try {
    const client = getAnthropicClient(apiKey, 55_000);
    const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 700,
        system:
          "You are a UAE AML/CFT compliance expert specialising in cryptocurrency mixing and obfuscation detection. Assess on-chain mixing risk under UAE VASP and FATF standards. Return valid JSON only matching the CryptoMixingResult interface.",
        messages: [
          {
            role: "user",
            content: `Analyse for cryptocurrency mixing and obfuscation risk.\n\nWallet Address: ${sanitizeField(body.walletAddress)}\nCrypto Type: ${sanitizeField(body.cryptoType)}\nTransaction Hashes: ${sanitizeField(body.transactionHashes)}\nExchange Context: ${sanitizeField(body.exchangeContext)}\nAmount (USD): ${sanitizeField(body.amountUsd)}\nContext: ${sanitizeText(body.context)}\n\nReturn JSON with fields: mixingRisk, mixingTechniques[], obfuscationScore (0-100), traceabilityRating, blockchainIntelligence, recommendedAction, reportingBasis, regulatoryBasis.`,
          },
        ],
      });
    const raw =
      response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(
      raw.replace(/```json\n?|\n?```/g, "").trim()
    ) as CryptoMixingResult;
    if (!Array.isArray(result.mixingTechniques)) result.mixingTechniques = [];
    return NextResponse.json({ ok: true, ...result }, { headers: gate.headers });
  } catch {
    return NextResponse.json({ ok: false, error: "crypto-mixing temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers });
  }
}
