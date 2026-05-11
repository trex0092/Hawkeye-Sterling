export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;import { NextResponse } from "next/server";

import { enforce } from "@/lib/server/enforce";
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

const FALLBACK: CryptoMixingResult = {
  mixingRisk: "critical",
  mixingTechniques: [
    "CoinJoin mixing — 47 inputs merged in single Bitcoin transaction",
    "Chain-hopping: BTC → Monero → ETH → USDT across 4 exchanges",
    "Peel chain — sequential small transactions to obfuscate trail",
    "Tornado Cash interaction detected — OFAC-sanctioned mixer (Aug 2022)",
  ],
  obfuscationScore: 91,
  traceabilityRating: "untraceable",
  blockchainIntelligence:
    "On-chain analysis (Chainalysis/Elliptic equivalent) shows funds originated from wallet cluster associated with 2024 DeFi exploit ($3.2M loss). Post-mixing destination wallet shows interaction with known darknet market deposit address. 91% of input value is of indeterminate origin after mixing.",
  recommendedAction: "freeze-report",
  reportingBasis:
    "File STR immediately citing VASP exposure to OFAC-sanctioned mixer (Tornado Cash) and DeFi exploit origin. OFAC reporting obligation applies to UAE entities with US nexus. Freeze VASP account and reject withdrawal.",
  regulatoryBasis:
    "FATF R.15 (virtual assets), UAE CBUAE VASP Framework 2023, OFAC Advisory on Illicit Finance Risks of Crypto Mixing (Oct 2022), UAE FDL 10/2025 Art.2 (ML offence)",
};

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
      { status: 400 }
    );
  }
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "crypto-mixing temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers});
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      signal: AbortSignal.timeout(55_000),
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1500,
        system:
          "You are a UAE AML/CFT compliance expert specialising in cryptocurrency mixing and obfuscation detection. Assess on-chain mixing risk under UAE VASP and FATF standards. Return valid JSON only matching the CryptoMixingResult interface.",
        messages: [
          {
            role: "user",
            content: `Analyse for cryptocurrency mixing and obfuscation risk.\n\nWallet Address: ${body.walletAddress}\nCrypto Type: ${body.cryptoType}\nTransaction Hashes: ${body.transactionHashes}\nExchange Context: ${body.exchangeContext}\nAmount (USD): ${body.amountUsd}\nContext: ${body.context}\n\nReturn JSON with fields: mixingRisk, mixingTechniques[], obfuscationScore (0-100), traceabilityRating, blockchainIntelligence, recommendedAction, reportingBasis, regulatoryBasis.`,
          },
        ],
      }),
    });
    if (!response.ok) return NextResponse.json({ ok: false, error: "crypto-mixing temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers});
    const data = (await response.json()) as {
      content: Array<{ type: string; text: string }>;
    };
    const raw =
      data.content[0]?.type === "text" ? data.content[0].text : "{}";
    const result = JSON.parse(
      raw.replace(/```json\n?|\n?```/g, "").trim()
    ) as CryptoMixingResult;
    return NextResponse.json({ ok: true, ...result }, { headers: gate.headers });
  } catch {
    return NextResponse.json({ ok: false, error: "crypto-mixing temporarily unavailable - please retry." }, { status: 503 , headers: gate.headers});
  }
}
