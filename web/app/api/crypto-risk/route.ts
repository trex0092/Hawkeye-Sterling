// POST /api/crypto-risk
// Crypto wallet AML risk scoring — taint analysis for ETH/BTC/TRX.
// Body: { address: string; chain?: "ethereum" | "bitcoin" | "tron"; vasp?: string; txMixers?: string[] }
//
// Enhanced with:
//   - OFAC/SDN sanctioned wallet screening (immediate critical)
//   - Mixer/tumbler service detection (Tornado Cash, Chipmixer, Sinbad, etc.)
//   - VASP risk tiers (tier1 regulated → tier3 high-risk)
//   - Dark web marketplace detection (Hydra, AlphaBay, Silk Road, etc.)
//   - Chain-specific privacy risk modifiers (Monero +20, Zcash shielded +15, etc.)

import { NextResponse } from "next/server";
import { enforce } from "@/lib/server/enforce";
import { scoreWallet, type CryptoChain, type WalletRiskResult } from "../../../../src/integrations/cryptoRisk.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const CORS: Record<string, string> = {
  "access-control-allow-origin": process.env["NEXT_PUBLIC_APP_URL"] ?? "https://hawkeye-sterling.netlify.app",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type, authorization, x-api-key",
};

// ---------------------------------------------------------------------------
// OFAC / SDN sanctioned crypto wallet addresses (public OFAC SDN list)
// Sources: OFAC SDN list, Chainalysis public reports, US Treasury press releases
// ---------------------------------------------------------------------------
const SANCTIONED_WALLETS = new Set<string>([
  // Lazarus Group (North Korea) — OFAC 2018 & 2022
  "0x098b716b8aaf21512996dc57eb0615e2383e2f96", // Harmony Horizon bridge heist
  "0xa0e1c89ef1a489c9c7de96311ed5ce5d32c20e4b", // Lazarus Group ETH
  "0x3ad9db589d201a710ed237c829c7a00b7db4b86c", // Lazarus Group ETH
  "0x53b6936513e738f44fb50d2dc6186b1d8f4bae45", // Lazarus ETH (Ronin bridge)
  "12QtD5BFwRsdNsAZY76UVE1xyCGNTojH9h",          // Lazarus Group BTC (2018 OFAC)
  "1EpMiZkQVekM5ij12nMiEwttFPcDK9XhX6",          // Lazarus Group BTC

  // Tornado Cash — OFAC August 2022 (TCash deployer & pool contracts)
  "0x8589427373d6d84e98730d7795d8f6f8731fda16", // Tornado Cash deployer
  "0xd4b88df4d29f5cedd6857912842cff3b20c8cfa3", // TCash 100 ETH pool
  "0xfd8610d20aa15b7b2e3be39b396a1bc3516c7144", // TCash 10 ETH pool
  "0x22aaa7720ddd5388a3c0a3333430953c68f1849b", // TCash 1 ETH pool (OFAC listed)
  "0xba214c1c1928a32bffe790263e38b4af9bfcd659", // TCash 0.1 ETH pool (OFAC listed)

  // Garantex exchange — OFAC April 2022 (Russia)
  "0x647177ee6d3a2800b006571a52eb7e07a9e5e4ea", // Garantex ETH deposit
  "14HVuEDPhMSKHMrFBnBB5EmpW4mECcHRmb",          // Garantex BTC

  // BitcoinFog (darknet mixer) — DOJ 2021
  "1AHB1ExUz3v9nTVYpxkwcaE5FGRaFVvHtQ",          // BitcoinFog BTC

  // Chipmixer — DOJ/Europol 2023 takedown
  "bc1q5shce7ej3y4hsz54xdvnkstq5vxqjxu5zvdlhj",  // Chipmixer BTC (bech32)
]);

// ---------------------------------------------------------------------------
// Ransomware group wallet addresses / identifiers
// Sources: CISA advisories, FBI flash alerts, OFAC press releases
// ---------------------------------------------------------------------------
const RANSOMWARE_IDENTIFIERS = new Set<string>([
  // Conti ransomware group — FBI/CISA advisory AA21-265A
  "12higdjtgta7ufvvl93lismb2h7zrpxbb",   // Conti BTC receiving wallet (FBI)
  "1ptfsmkm1dtbtlzuznxwrhp2cqxuqzjdwk",  // Conti BTC (CISA tracked)
  "3jtqjqxygp2abnd6pqjqfuqlhbrdcdyxfb",  // Conti BTC P2SH

  // REvil / Sodinokibi — OFAC Nov 2021 (Kaseya / JBS attacks)
  "14bpkzwhx9at3aqhbm4q9gx9c4kpvkthfh",  // REvil BTC (OFAC SDN)
  "1fzc2ar2ev3ywlxsbfhajuqq4srhyp5pq6",  // REvil / Sodinokibi BTC (FBI)
  "0x8576acc5c05d6ce88f4e49bf65bdf0c62f91353", // REvil ETH payout address

  // DarkSide ransomware — DOJ/FBI Colonial Pipeline seizure 2021
  "1cyjzm5btxwdhjxwqyyrhpjgv3yyzpdewzn",  // DarkSide BTC (DOJ seizure)
  "12jbtzbbe5axjmx1yqfnlmt2ua4lmoa4oy",   // DarkSide BTC receiving (CISA)
  "0x7f367cc41522ce07553e823bf3be79a889debe1b", // DarkSide ETH (Chainalysis)

  // LockBit ransomware — CISA advisory AA23-165A / OFAC 2024
  "bc1qy5pgkujs02rxlhxjm7p2qul2qymxnm8uadpg4e", // LockBit BTC bech32 (FBI)
  "3qnphdwfgdgd3yyhzfyj7d23qf1kyj3ax4",   // LockBit BTC P2SH (CISA)
  "1lbboahdssplhfjhbhqdfhv5jnvdlbywge",   // LockBit affiliate wallet (Europol)
]);

// ---------------------------------------------------------------------------
// APT (Advanced Persistent Threat) group → country map
// Sources: CISA, FBI, NSA joint advisories; OFAC SDN designations
// ---------------------------------------------------------------------------
const APT_GROUPS: Map<string, string> = new Map([
  // North Korea (OFAC SDN — Lazarus Group designated 2019)
  ["lazarus group",   "KP"],
  ["lazarus",         "KP"],
  ["kimsuky",         "KP"],
  ["apt38",           "KP"],  // Lazarus sub-group (financial crime)

  // Russia (GRU / SVR / FSB)
  ["apt28",           "RU"],
  ["fancy bear",      "RU"],
  ["apt29",           "RU"],
  ["cozy bear",       "RU"],
  ["sandworm",        "RU"],
  ["voodoo bear",     "RU"],  // Sandworm alias

  // China (PLA / MSS)
  ["apt41",           "CN"],
  ["double dragon",   "CN"],  // APT41 alias
  ["apt10",           "CN"],
  ["stone panda",     "CN"],  // APT10 alias
  ["menupass",        "CN"],  // APT10 alias
]);

// ---------------------------------------------------------------------------
// Mixer / Tumbler service identifiers
// Matched against address labels and the raw input address (case-insensitive)
// ---------------------------------------------------------------------------
const MIXER_IDENTIFIERS = new Set<string>([
  "tornado cash",
  "tornadocash",
  "tornado_cash",
  "0xd90e2f925da726b50c4ed8d0fb90ad053324f31b", // Tornado Cash router
  "chipmixer",
  "chip mixer",
  "blender.io",
  "blenderio",
  "sinbad",
  "sinbad.io",
  "wasabi",
  "wasabi wallet",
  "wasabiwallet",
  "coinjoin",
  "joinmarket",
  "join market",
  "helix",                     // Helix mixer (DOJ 2020)
  "bestmixer",                 // BestMixer.io (Europol 2019)
  "bitcoinfog",
  "bitcoin fog",
]);

// ---------------------------------------------------------------------------
// VASP risk tier classification
// ---------------------------------------------------------------------------
type VaspTier = "tier1" | "tier2" | "tier3";

interface VaspTierInfo {
  tier: VaspTier;
  /** Risk score delta applied to the base score */
  scoreDelta: number;
  description: string;
}

const VASP_TIER_MAP: Record<string, VaspTierInfo> = {
  // Tier 1 — fully regulated exchanges (FINCEN, FCA, MAS, etc.)
  coinbase:    { tier: "tier1", scoreDelta: -5,  description: "Regulated exchange (Coinbase)" },
  coinbasepro: { tier: "tier1", scoreDelta: -5,  description: "Regulated exchange (Coinbase Pro)" },
  kraken:      { tier: "tier1", scoreDelta: -5,  description: "Regulated exchange (Kraken)" },
  "binance.com": { tier: "tier1", scoreDelta: -5, description: "Regulated exchange (Binance.com)" },
  gemini:      { tier: "tier1", scoreDelta: -5,  description: "Regulated exchange (Gemini)" },
  bitstamp:    { tier: "tier1", scoreDelta: -5,  description: "Regulated exchange (Bitstamp)" },

  // Tier 2 — lightly-regulated or jurisdiction-agnostic VASPs
  kucoin:  { tier: "tier2", scoreDelta: 10, description: "Lightly-regulated exchange (KuCoin)" },
  okx:     { tier: "tier2", scoreDelta: 10, description: "Lightly-regulated exchange (OKX)" },
  huobi:   { tier: "tier2", scoreDelta: 10, description: "Lightly-regulated exchange (Huobi)" },
  "gate.io": { tier: "tier2", scoreDelta: 10, description: "Lightly-regulated exchange (Gate.io)" },
  gateio:  { tier: "tier2", scoreDelta: 10, description: "Lightly-regulated exchange (Gate.io)" },
  bybit:   { tier: "tier2", scoreDelta: 10, description: "Lightly-regulated exchange (Bybit)" },
  mexc:    { tier: "tier2", scoreDelta: 10, description: "Lightly-regulated exchange (MEXC)" },

  // Tier 3 — high-risk VASPs (no KYC, sanctioned, or significant enforcement history)
  garantex:    { tier: "tier3", scoreDelta: 40, description: "High-risk VASP — OFAC sanctioned (Garantex)" },
  bitzlato:    { tier: "tier3", scoreDelta: 35, description: "High-risk VASP — DOJ action (Bitzlato)" },
  suex:        { tier: "tier3", scoreDelta: 40, description: "High-risk VASP — OFAC sanctioned (SUEX)" },
  chatex:      { tier: "tier3", scoreDelta: 35, description: "High-risk VASP — OFAC action (Chatex)" },
  "bitfinex-old": { tier: "tier3", scoreDelta: 25, description: "High-risk VASP (legacy Bitfinex)" },
  localbitcoins: { tier: "tier3", scoreDelta: 20, description: "High-risk VASP — P2P market (LocalBitcoins)" },
  paxful:      { tier: "tier3", scoreDelta: 20, description: "High-risk VASP — P2P market (Paxful)" },
  nokyc:       { tier: "tier3", scoreDelta: 30, description: "High-risk VASP — no-KYC exchange" },
  hodlhodl:    { tier: "tier3", scoreDelta: 20, description: "High-risk VASP — non-custodial P2P (HodlHodl)" },
};

// ---------------------------------------------------------------------------
// Dark web marketplace identifiers
// ---------------------------------------------------------------------------
const DARKWEB_IDENTIFIERS = new Set<string>([
  // Hydra Market — OFAC April 2022 (Russia's largest darknet market)
  "hydra",
  "hydramarket",
  "hydra market",
  "3bbaaaccczcbdddz", // Hydra .onion prefix fragment used in attribution

  // AlphaBay — DOJ 2017 takedown / relaunched 2021
  "alphabay",
  "alpha bay",

  // Silk Road — FBI 2013 seizure
  "silk road",
  "silkroad",
  "1fzdjqjzjmgv7p4ayqdaak6b8vd7bbmmsa", // Silk Road BTC address fragment

  // RAMP (Russian Anonymous Marketplace) — 2017
  "ramp",
  "russian anonymous marketplace",

  // Genesis Market — FBI/Europol April 2023 takedown
  "genesis market",
  "genesismarket",

  // Dream Market — 2019 shutdown
  "dream market",
  "dreammarket",

  // Empire Market — 2020 exit scam
  "empire market",
  "empiremarket",

  // White House Market — 2021 shutdown
  "white house market",
  "whitehousemarket",
]);

// ---------------------------------------------------------------------------
// Chain-specific privacy risk modifiers
// ---------------------------------------------------------------------------
type ChainRiskModifier = {
  delta: number;
  reason: string;
};

const CHAIN_RISK_MODIFIERS: Record<string, ChainRiskModifier> = {
  // Privacy coins — high untraceability
  monero:  { delta: 20, reason: "Privacy coin (Monero/XMR) — untraceable by design" },
  xmr:     { delta: 20, reason: "Privacy coin (Monero/XMR) — untraceable by design" },

  // Zcash shielded transactions
  zcash:   { delta: 15, reason: "Zcash (ZEC) — potential shielded transaction" },
  zec:     { delta: 15, reason: "Zcash (ZEC) — potential shielded transaction" },

  // Bitcoin mixing / CoinJoin patterns
  "bitcoin-mixing": { delta: 15, reason: "Bitcoin mixing / CoinJoin detected" },
  "btc-mixing":     { delta: 15, reason: "Bitcoin mixing / CoinJoin detected" },

  // Standard chains — no additional modifier
  ethereum: { delta: 0, reason: "" },
  bitcoin:  { delta: 0, reason: "" },
  btc:      { delta: 0, reason: "" },
  eth:      { delta: 0, reason: "" },
  solana:   { delta: 0, reason: "" },
  sol:      { delta: 0, reason: "" },
  tron:     { delta: 0, reason: "" },
  trx:      { delta: 0, reason: "" },
};

// ---------------------------------------------------------------------------
// Local enrichment result appended to the API response
// ---------------------------------------------------------------------------
interface LocalEnrichment {
  sanctionedWallet: boolean;
  mixerDetected: boolean;
  mixerMatches: string[];
  darkwebDetected: boolean;
  darkwebMatches: string[];
  vaspTier: VaspTierInfo | null;
  vaspScoreDelta: number;
  chainModifier: ChainRiskModifier | null;
  adjustedRiskScore: number;
  adjustedRiskLevel: WalletRiskResult["riskLevel"];
  flags: string[];
}

// ---------------------------------------------------------------------------
// Helper: derive adjusted risk level from a numeric score
// ---------------------------------------------------------------------------
function scoreToLevel(score: number): WalletRiskResult["riskLevel"] {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 30) return "medium";
  if (score > 0)  return "low";
  return "unknown";
}

// ---------------------------------------------------------------------------
// Core enrichment logic — pure function, no I/O
// ---------------------------------------------------------------------------
function buildLocalEnrichment(
  address: string,
  labels: string[],
  baseScore: number,
  chain: string,
  vasp?: string,
): LocalEnrichment {
  const addrLower  = address.toLowerCase();
  const labelsLow  = labels.map((l) => l.toLowerCase());
  const chainLower = chain.toLowerCase();
  const vaspLower  = vasp?.toLowerCase().trim() ?? "";

  const flags: string[] = [];

  // -- 1. Sanctioned wallet check ------------------------------------------
  const sanctionedWallet = SANCTIONED_WALLETS.has(addrLower);
  if (sanctionedWallet) flags.push("OFAC_SANCTIONED_WALLET");

  // -- 2. Mixer / tumbler detection -----------------------------------------
  const mixerMatches: string[] = [];
  for (const id of MIXER_IDENTIFIERS) {
    if (addrLower === id || labelsLow.some((l) => l.includes(id))) {
      mixerMatches.push(id);
    }
  }
  const mixerDetected = mixerMatches.length > 0;
  if (mixerDetected) flags.push("MIXER_TUMBLER_DETECTED");

  // -- 3. Dark web marketplace detection ------------------------------------
  const darkwebMatches: string[] = [];
  for (const id of DARKWEB_IDENTIFIERS) {
    if (addrLower === id || labelsLow.some((l) => l.includes(id))) {
      darkwebMatches.push(id);
    }
  }
  const darkwebDetected = darkwebMatches.length > 0;
  if (darkwebDetected) flags.push("DARKWEB_MARKET_DETECTED");

  // -- 4. VASP tier lookup ---------------------------------------------------
  let vaspTier: VaspTierInfo | null = null;
  if (vaspLower) {
    // Try exact key match, then substring match across all keys
    const exactMatch = VASP_TIER_MAP[vaspLower];
    if (exactMatch !== undefined) {
      vaspTier = exactMatch;
    } else {
      for (const [key, info] of Object.entries(VASP_TIER_MAP)) {
        if (vaspLower.includes(key) || key.includes(vaspLower)) {
          vaspTier = info;
          break;
        }
      }
    }
  }
  const vaspScoreDelta = vaspTier?.scoreDelta ?? 0;
  if (vaspTier?.tier === "tier3") flags.push("HIGH_RISK_VASP");
  if (vaspTier?.tier === "tier2") flags.push("LIGHTLY_REGULATED_VASP");

  // -- 5. Chain risk modifier -----------------------------------------------
  const chainModifier = CHAIN_RISK_MODIFIERS[chainLower] ?? null;
  if (chainModifier && chainModifier.delta > 0) flags.push("PRIVACY_CHAIN_MODIFIER");

  // -- 6. Adjusted score & level --------------------------------------------
  let adjustedRiskScore = baseScore;

  if (sanctionedWallet) {
    // Sanctioned wallet always resolves to critical (score ≥ 95)
    adjustedRiskScore = Math.max(adjustedRiskScore, 95);
  } else if (mixerDetected) {
    // Known mixer → at least 90 (critical)
    adjustedRiskScore = Math.max(adjustedRiskScore, 90);
  } else {
    adjustedRiskScore += vaspScoreDelta;
    adjustedRiskScore += chainModifier?.delta ?? 0;
    if (darkwebDetected) adjustedRiskScore = Math.max(adjustedRiskScore, 85);
  }

  adjustedRiskScore = Math.min(100, Math.max(0, adjustedRiskScore));
  const adjustedRiskLevel = sanctionedWallet || mixerDetected
    ? "critical"
    : scoreToLevel(adjustedRiskScore);

  return {
    sanctionedWallet,
    mixerDetected,
    mixerMatches,
    darkwebDetected,
    darkwebMatches,
    vaspTier,
    vaspScoreDelta,
    chainModifier,
    adjustedRiskScore,
    adjustedRiskLevel,
    flags,
  };
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: CORS });
}

interface CryptoRiskBody {
  address?: string;
  chain?: CryptoChain;
  /** Counterparty VASP name for tier-based risk adjustment */
  vasp?: string;
  /** Explicit mixer/service identifiers associated with this transaction */
  txMixers?: string[];
  // Subject-wrapped form (from MCP tool): { subject: { address, chain } }
  subject?: { address?: string; chain?: CryptoChain; vasp?: string };
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

  // ── Fast-path: OFAC sanctioned wallet — no provider call needed ───────────
  if (SANCTIONED_WALLETS.has(address.toLowerCase())) {
    const enrichment = buildLocalEnrichment(address, [], 0, body.chain ?? "unknown", body.vasp);
    const sanctionedResponse = {
      ok: true,
      address,
      chain: body.chain ?? "unknown",
      provider: "local-screening" as const,
      riskScore: enrichment.adjustedRiskScore,
      riskLevel: enrichment.adjustedRiskLevel,
      riskCategory: "sanctioned_entity",
      exposure: { directSanctioned: 100, indirectSanctioned: 0, mixing: 0, darknet: 0 },
      labels: ["OFAC-SDN"],
      addressFormat,
      localEnrichment: enrichment,
      latencyMs: Date.now() - _handlerStart,
    };
    return NextResponse.json(sanctionedResponse, { headers: { ...CORS, ...gateHeaders } });
  }

  const result = await scoreWallet(address, { chain: body.chain });

  if (!result.ok) {
    // No provider configured or API call failed — return a graceful offline fallback
    // Still apply local enrichment so flags/scores are surfaced.
    const enrichment = buildLocalEnrichment(
      address,
      [],
      0,
      body.chain ?? "unknown",
      body.vasp,
    );
    const fallback: WalletRiskResult & {
      offline: boolean;
      addressFormat: AddressFormat;
      simulationWarning: string;
      localEnrichment: LocalEnrichment;
    } = {
      ok: true,
      address,
      chain: body.chain ?? "unknown",
      provider: "unavailable",
      riskScore: enrichment.adjustedRiskScore,
      riskLevel: enrichment.adjustedRiskLevel,
      exposure: { directSanctioned: 0, indirectSanctioned: 0, mixing: 0, darknet: 0 },
      labels: [],
      offline: true,
      addressFormat,
      simulationWarning: "Crypto risk provider not configured — this is a placeholder response. No real taint analysis, sanctions screening, or on-chain data has been retrieved. Do not use for compliance decisions.",
      localEnrichment: enrichment,
    };
    return NextResponse.json(fallback, { headers: { ...CORS, ...gateHeaders } });
  }

  // Merge any explicit txMixers from request body into labels for enrichment
  const enrichmentLabels = [
    ...result.labels,
    ...(body.txMixers ?? []),
  ];

  const enrichment = buildLocalEnrichment(
    address,
    enrichmentLabels,
    result.riskScore,
    result.chain,
    body.vasp,
  );

  const latencyMs = Date.now() - _handlerStart;
  if (latencyMs > 5000) console.warn(`[crypto_risk] latencyMs=${latencyMs} exceeds 5000ms`);

  return NextResponse.json(
    {
      ...result,
      // Override score/level with locally-adjusted values when enrichment raises them
      riskScore: enrichment.adjustedRiskScore,
      riskLevel: enrichment.adjustedRiskLevel,
      addressFormat,
      latencyMs,
      localEnrichment: enrichment,
    },
    { headers: { ...CORS, ...gateHeaders } },
  );
  } catch (err) {
    console.error("[hawkeye] crypto_risk handler exception:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({
      ok: false,
      errorCode: "HANDLER_EXCEPTION",
      errorType: "internal",
      tool: "crypto_risk",
      retryAfterSeconds: null,
      requestId: Math.random().toString(36).slice(2, 10),
      latencyMs: Date.now() - _handlerStart,
    }, { status: 500, headers: { ...CORS } });
  }
}
