import { NextResponse } from "next/server";
import { writeAuditEvent } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CryptoThreatBody {
  address: string;
  chain: string;
  riskScore: number;
  riskLevel: string;
  riskCategory?: string;
  exposure: { directSanctioned: number; indirectSanctioned: number; mixing: number; darknet: number };
  labels: string[];
  taintedTransactions?: number;
  totalTransactions?: number;
}

interface CryptoThreat {
  complianceVerdict: "block" | "escalate" | "enhanced_kyc" | "monitor" | "clear";
  fatfR15Exposure: string;
  varaUaeRelevance: string;
  sanctionsNexus: string;
  typologies: string[];
  narrative: string;
  requiredActions: string[];
  reportingObligation: boolean;
  reportingBasis: string;
}

const FALLBACK: CryptoThreat = {
  complianceVerdict: "monitor",
  fatfR15Exposure: "API key not configured",
  varaUaeRelevance: "",
  sanctionsNexus: "",
  typologies: [],
  narrative: "",
  requiredActions: [],
  reportingObligation: false,
  reportingBasis: "",
};

export async function POST(req: Request): Promise<NextResponse> {
  let body: CryptoThreatBody;
  try {
    body = (await req.json()) as CryptoThreatBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }

  writeAuditEvent(
    "analyst",
    "crypto.ai-threat-analysis",
    `address=${body.address} chain=${body.chain} riskScore=${body.riskScore} riskLevel=${body.riskLevel}`,
  );

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "crypto-threat temporarily unavailable - please retry." }, { status: 503 });
  }

  const userContent = [
    `Address: ${body.address}`,
    `Chain: ${body.chain}`,
    `Risk score: ${body.riskScore}`,
    `Risk level: ${body.riskLevel}`,
    body.riskCategory ? `Risk category: ${body.riskCategory}` : null,
    `Labels: ${body.labels.length > 0 ? body.labels.join(", ") : "none"}`,
    `Direct sanctioned exposure: ${body.exposure.directSanctioned.toFixed(2)}%`,
    `Indirect sanctioned exposure: ${body.exposure.indirectSanctioned.toFixed(2)}%`,
    `Mixing / tumbling exposure: ${body.exposure.mixing.toFixed(2)}%`,
    `Darknet market exposure: ${body.exposure.darknet.toFixed(2)}%`,
    body.taintedTransactions != null
      ? `Tainted transactions: ${body.taintedTransactions} / ${body.totalTransactions ?? "unknown"}`
      : null,
    "",
    "Decision rules: direct sanctioned exposure > 0% → block or escalate; mixing > 10% → escalate; darknet > 5% → escalate; riskScore ≥70 → enhanced_kyc minimum.",
    "",
    "Return ONLY valid JSON — no markdown fences, no commentary — matching this exact schema:",
    `{`,
    `  "complianceVerdict": "block" | "escalate" | "enhanced_kyc" | "monitor" | "clear",`,
    `  "fatfR15Exposure": "string — FATF R.15 / Travel Rule implications",`,
    `  "varaUaeRelevance": "string — VARA/CBUAE UAE-specific regulatory implications",`,
    `  "sanctionsNexus": "string — whether sanctions exposure is material and which regimes",`,
    `  "typologies": ["string array e.g. 'mixer usage', 'darknet market exposure', 'layering through DEX'"],`,
    `  "narrative": "string — 2-3 sentence compliance narrative for the case file",`,
    `  "requiredActions": ["string array — specific compliance actions required"],`,
    `  "reportingObligation": boolean,`,
    `  "reportingBasis": "string — if reportingObligation true, which rule triggers it"`,
    `}`,
  ]
    .filter((l) => l !== null)
    .join("\n");

  let result: CryptoThreat;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      signal: AbortSignal.timeout(22_000),
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 600,
        system:
          "You are a UAE VASP compliance analyst specializing in blockchain forensics and FATF R.15 virtual asset risk. Analyze this on-chain risk data and produce a compliance assessment. Return ONLY valid JSON — no markdown fences, no commentary.",
        messages: [{ role: "user", content: userContent }],
      }),
    });

    if (!res.ok) {
      return NextResponse.json({ ok: false, error: "crypto-threat temporarily unavailable - please retry." }, { status: 503 });
    }

    const data = (await res.json()) as {
      content?: { type: string; text: string }[];
    };
    const text = data?.content?.[0]?.text ?? "";
    const stripped = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    result = JSON.parse(stripped) as CryptoThreat;
  } catch {
    return NextResponse.json({ ok: false, error: "crypto-threat temporarily unavailable - please retry." }, { status: 503 });
  }

  return NextResponse.json({ ok: true, ...result });
}
