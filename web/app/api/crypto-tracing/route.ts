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

// ── Comprehensive Fallback ────────────────────────────────────────────────────

const FALLBACK: CryptoTracingResult = {
  ok: true,
  overallRiskScore: 82,
  riskTier: "critical",
  blockchainAnalysis: {
    blockchain: "Ethereum (ERC-20)",
    privacyLevel: "semi-private",
    traceabilityScore: 71,
    analysisLimitations: [
      "Cross-chain bridge transactions break the on-chain trail — funds moved via Arbitrum bridge cannot be natively traced on Ethereum.",
      "Tornado Cash interaction obscures pre-mixing provenance beyond 3-hop heuristic confidence threshold.",
      "Smart contract interactions (DEX swaps) may conceal ultimate beneficiary via token-for-token exchanges.",
      "ERC-20 token transfers require separate token contract analysis beyond base ETH tracing.",
    ],
  },
  mixerExposure: {
    detected: true,
    mixerType: "Tornado Cash (10 ETH pool)",
    indirectExposure: true,
    hopsFromMixer: 2,
    estimatedTaintedFunds: "~34% of total inbound volume (est. 8.4 ETH tainted)",
  },
  darknetExposure: {
    detected: true,
    marketplaces: ["AlphaBay successor cluster", "Unattributed dark-market wallet cluster DN-447"],
    transactionVolume: "Estimated 1.2–2.1 ETH indirect exposure via 3-hop chain",
    confidence: 67,
  },
  ransomwareLinks: {
    detected: false,
    knownGroups: [],
    paymentRole: "none",
    associatedIncidents: [],
  },
  sanctionsExposure: {
    ofacSdn: true,
    euSanctions: false,
    unSanctions: false,
    matchedAddresses: ["0x8589427373D6D84E98730D7795D8f6f8731FDA16 (OFAC SDN — Tornado Cash)"],
    indirectExposure: true,
  },
  typologyAnalysis: [
    {
      typology: "Mixer / Tumbler Usage",
      detected: true,
      confidence: 89,
      description: "Funds transited through Tornado Cash privacy pools, a sanctioned OFAC mixer, before reaching the subject wallet.",
      evidence: "Two deposits into 10 ETH Tornado Cash pool identified 4 days prior to receipt.",
      fatfRef: "FATF Virtual Assets Red Flag Indicators (2020) — Indicator 5: Use of mixing or tumbling services",
    },
    {
      typology: "Peeling Chain",
      detected: true,
      confidence: 74,
      description: "Sequential small outbound transfers reducing wallet balance incrementally.",
      evidence: "14 sequential transfers observed over 6 days, each 0.45–0.92 ETH.",
      fatfRef: "FATF Guidance on Virtual Assets and Virtual Asset Service Providers (2021) §65 — layering typologies",
    },
  ],
  travelRuleCompliance: {
    required: true,
    status: "non_compliant",
    missingInformation: [
      "Originator name and account number not provided by sending VASP",
      "No IVMS101-format data received for transfers exceeding USD 1,000 threshold",
    ],
    recommendation: "Apply Travel Rule requirements under FATF R.16 (2019 VASP guidance).",
  },
  exchangeRisk: {
    originExchange: "Binance (indirect — 2 hops)",
    exchangeRiskRating: "medium",
    kycStrength: "strong",
    jurisdiction: "Global / Cayman Islands (registered); UAE (VARA licensed)",
  },
  financialCrimeLinks: [
    {
      crimeType: "Money Laundering — Layering Stage",
      confidence: 82,
      description: "Transaction pattern consistent with layering.",
    },
  ],
  regulatoryObligations: [
    {
      obligation: "File Suspicious Transaction Report (STR) to UAE FIU via goAML within 35 days of suspicion arising",
      regulation: "UAE FDL 10/2025 Art.12; CBUAE AML Standards §10",
      authority: "UAE Financial Intelligence Unit (FIU)",
      deadline: "Within 35 days of suspicion (CBUAE) / immediately where TF suspected",
    },
  ],
  redFlags: [
    "Direct interaction with OFAC-sanctioned Tornado Cash mixer addresses",
    "Peeling chain pattern detected over 6 consecutive days — consistent with ML layering",
  ],
  recommendation: "file_str",
  immediateActions: [
    "FREEZE wallet and suspend all pending transactions pending MLRO decision. Do not tip off customer.",
    "File STR with UAE FIU via goAML immediately — OFAC SDN exposure and darknet linkage meet STR threshold.",
  ],
  investigativeNextSteps: [
    "Conduct full UTXO/cluster analysis using Chainalysis Reactor to map all linked addresses.",
  ],
  blockchainForensicsTools: [
    "Chainalysis Reactor",
    "Elliptic Investigator",
    "TRM Labs Forensics",
  ],
  summary: "This Ethereum wallet presents a CRITICAL risk profile (score: 82/100) based on confirmed OFAC SDN exposure via Tornado Cash and active ML typologies.",
};

// ── Comprehensive System Prompt ───────────────────────────────────────────────

const SYSTEM_PROMPT = `You are the world's most advanced blockchain forensics and crypto AML analyst. Analyse all provided information and return ONLY valid JSON (no markdown fences, no preamble) matching the CryptoTracingResult structure.

Risk scoring: 0-20=low, 21-40=medium, 41-60=high, 61-80=critical, 81-100=severe`;

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

Perform a comprehensive blockchain forensics and crypto AML analysis.`;

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
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
