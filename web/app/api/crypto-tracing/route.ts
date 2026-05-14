export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/server/llm";
import { enforce } from "@/lib/server/enforce";
// ── Request Body ──────────────────────────────────────────────────────────────

export interface CryptoTracingBody {
  walletAddress: string;
  blockchain: "bitcoin" | "ethereum" | "tron" | "monero" | "litecoin" | "bnb" | "solana" | "other";
  transactionHistory: string;
  entityName: string;
  exchangeOrigin: string;
  transactionPatterns: {
    highFrequency: boolean;
    largeSingleTx: boolean;
    mixerUsed: boolean;
    privacyCoinConversion: boolean;
    peeling: boolean;
    consolidation: boolean;
    layering: boolean;
  };
  riskFlags: {
    darknetMarket: boolean;
    ransomware: boolean;
    scam: boolean;
    sanctions: boolean;
    childExploitation: boolean;
    terroristFinancing: boolean;
  };
  context: string;
}

// ── Result Types ──────────────────────────────────────────────────────────────

export interface CryptoTracingResult {
  ok: true;
  overallRiskScore: number;
  riskTier: "low" | "medium" | "high" | "critical" | "severe";
  blockchainAnalysis: {
    blockchain: string;
    privacyLevel: "transparent" | "semi-private" | "private";
    traceabilityScore: number;
    analysisLimitations: string[];
  };
  mixerExposure: {
    detected: boolean;
    mixerType: string;
    indirectExposure: boolean;
    hopsFromMixer: number;
    estimatedTaintedFunds: string;
  };
  darknetExposure: {
    detected: boolean;
    marketplaces: string[];
    transactionVolume: string;
    confidence: number;
  };
  ransomwareLinks: {
    detected: boolean;
    knownGroups: string[];
    paymentRole: "victim" | "facilitator" | "launderer" | "none";
    associatedIncidents: string[];
  };
  sanctionsExposure: {
    ofacSdn: boolean;
    euSanctions: boolean;
    unSanctions: boolean;
    matchedAddresses: string[];
    indirectExposure: boolean;
  };
  typologyAnalysis: Array<{
    typology: string;
    detected: boolean;
    confidence: number;
    description: string;
    evidence: string;
    fatfRef: string;
  }>;
  travelRuleCompliance: {
    required: boolean;
    status: "compliant" | "non_compliant" | "unclear";
    missingInformation: string[];
    recommendation: string;
  };
  exchangeRisk: {
    originExchange: string;
    exchangeRiskRating: "low" | "medium" | "high" | "unregulated";
    kycStrength: "strong" | "weak" | "none" | "unknown";
    jurisdiction: string;
  };
  financialCrimeLinks: Array<{
    crimeType: string;
    confidence: number;
    description: string;
  }>;
  regulatoryObligations: Array<{
    obligation: string;
    regulation: string;
    authority: string;
    deadline: string;
  }>;
  redFlags: string[];
  recommendation: "clear" | "monitor" | "request_wallet_verification" | "enhanced_monitoring" | "file_str" | "freeze_assets" | "report_to_law_enforcement";
  immediateActions: string[];
  investigativeNextSteps: string[];
  blockchainForensicsTools: string[];
  summary: string;
}

// ── POST Handler ──────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const gate = await enforce(req);
  if (!gate.ok) return gate.response;
  let body: Partial<CryptoTracingBody>;
  try {
    body = (await req.json()) as Partial<CryptoTracingBody>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return NextResponse.json({ ok: false, error: "crypto-tracing temporarily unavailable - please retry." }, { status: 503 });

  try {
    const client = getAnthropicClient(apiKey, 55_000);

    const tp = body.transactionPatterns ?? {};
    const rf = body.riskFlags ?? {};

    const userMessage = `BLOCKCHAIN FORENSICS REQUEST

Wallet Address: ${body.walletAddress ?? "Not provided"}
Blockchain: ${body.blockchain ?? "Not specified"}
Entity Name: ${body.entityName ?? "Unknown"}
Exchange of Origin: ${body.exchangeOrigin ?? "Unknown"}

TRANSACTION HISTORY / DESCRIPTION:
${body.transactionHistory ?? "Not provided"}

TRANSACTION PATTERN FLAGS:
- High Frequency Transactions: ${(tp as Record<string, boolean>).highFrequency ? "YES" : "NO"}
- Large Single Transaction: ${(tp as Record<string, boolean>).largeSingleTx ? "YES" : "NO"}
- Mixer / Tumbler Used: ${(tp as Record<string, boolean>).mixerUsed ? "YES" : "NO"}
- Privacy Coin Conversion: ${(tp as Record<string, boolean>).privacyCoinConversion ? "YES" : "NO"}
- Peeling Chain Pattern: ${(tp as Record<string, boolean>).peeling ? "YES" : "NO"}
- Consolidation Pattern: ${(tp as Record<string, boolean>).consolidation ? "YES" : "NO"}
- Layering Detected: ${(tp as Record<string, boolean>).layering ? "YES" : "NO"}

RISK FLAGS RAISED:
- Darknet Market Association: ${(rf as Record<string, boolean>).darknetMarket ? "YES — HIGH PRIORITY" : "NO"}
- Ransomware Association: ${(rf as Record<string, boolean>).ransomware ? "YES — HIGH PRIORITY" : "NO"}
- Scam / Fraud: ${(rf as Record<string, boolean>).scam ? "YES" : "NO"}
- Sanctions Exposure: ${(rf as Record<string, boolean>).sanctions ? "YES — CRITICAL" : "NO"}
- Child Exploitation Material: ${(rf as Record<string, boolean>).childExploitation ? "YES — CRITICAL / LAW ENFORCEMENT REFERRAL" : "NO"}
- Terrorist Financing: ${(rf as Record<string, boolean>).terroristFinancing ? "YES — CRITICAL / IMMEDIATE FREEZE" : "NO"}

ADDITIONAL CONTEXT:
${body.context ?? "None provided"}

Perform a comprehensive blockchain forensics and crypto AML analysis. Assess all typologies, exposures, and regulatory obligations. Produce the full JSON result as specified. Be maximally detailed and technically rigorous.`;

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      system: [
        {
          type: "text",
          text: "You are the world's most advanced blockchain forensics and crypto AML analyst. Analyse all provided information and return ONLY valid JSON (no markdown fences, no preamble) with the CryptoTracingResult structure.",
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: userMessage,
        },
      ],
    });

    const raw = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const result = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim()) as CryptoTracingResult;
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ ok: false, error: "crypto-tracing temporarily unavailable - please retry." }, { status: 503 });
  }
}
