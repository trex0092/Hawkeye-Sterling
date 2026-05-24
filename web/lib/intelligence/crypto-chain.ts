// Hawkeye Sterling — Crypto Chain Analysis
// Provides wallet risk analysis via provider cascade:
//   Chainalysis KYT → Elliptic → internal heuristic
//
// Configure by setting env vars:
//   CHAINALYSIS_API_KEY             → use Chainalysis KYT
//   ELLIPTIC_API_KEY + ELLIPTIC_API_SECRET → use Elliptic
//   (neither set)                   → internal heuristic fallback

export interface ChainAnalysisResult {
  address: string;
  chain: "bitcoin" | "ethereum" | "tron" | "other";
  riskScore: number;
  riskCategory: "blacklisted" | "high_risk" | "medium_risk" | "low_risk" | "clean";
  exposures: {
    entity: string;
    category: string; // "darknet_market" | "mixer" | "exchange" | "ransomware" | "terrorism"
    percentage: number; // % of funds from this entity
    direct: boolean;
  }[];
  vasps: string[];       // VASPs (exchanges) the address has transacted with
  clusterSize: number;   // number of addresses in the same ownership cluster
  firstSeen?: string;
  lastSeen?: string;
  provider: "chainalysis" | "elliptic" | "internal_heuristic";
}

// ---------------------------------------------------------------------------
// Known blacklisted addresses (fictional test addresses for heuristic mode)
// ---------------------------------------------------------------------------
const BLACKLISTED_TEST_ADDRESSES = new Set<string>([
  "0x000000000000000000000000000000000000dead",
  "0xdeaddeaddeaddeaddeaddeaddeaddeaddead0000",
  "1BlacklistedAddressTestHawkeyeSterling01",
  "TBlacklistedAddressTronTestHawkeye12345",
  "bc1qblacklistedtestaddresshawkeyesterling",
]);

// ---------------------------------------------------------------------------
// Chain detection from address format
// ---------------------------------------------------------------------------
function detectChain(address: string): ChainAnalysisResult["chain"] {
  const addr = address.trim();

  // Ethereum: 0x + 40 hex chars
  if (/^0x[0-9a-fA-F]{40}$/.test(addr)) return "ethereum";

  // Bitcoin: starts with 1 (P2PKH), 3 (P2SH), or bc1 (bech32/P2WPKH/P2WSH)
  if (/^1[a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(addr)) return "bitcoin";
  if (/^3[a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(addr)) return "bitcoin";
  if (/^bc1[a-z0-9]{6,87}$/.test(addr)) return "bitcoin";

  // TRON: starts with T + 33 base58 chars
  if (/^T[a-km-zA-HJ-NP-Z1-9]{33}$/.test(addr)) return "tron";

  return "other";
}

// ---------------------------------------------------------------------------
// Risk score → category mapping
// ---------------------------------------------------------------------------
function scoreToCategory(score: number): ChainAnalysisResult["riskCategory"] {
  if (score >= 90) return "blacklisted";
  if (score >= 60) return "high_risk";
  if (score >= 30) return "medium_risk";
  if (score > 0) return "low_risk";
  return "clean";
}

// ---------------------------------------------------------------------------
// Internal heuristic — no API key required
// ---------------------------------------------------------------------------
function internalHeuristic(address: string): ChainAnalysisResult {
  const addr = address.trim();
  const addrLower = addr.toLowerCase();
  const chain = detectChain(addr);

  const exposures: ChainAnalysisResult["exposures"] = [];
  let riskScore = 0;

  // Check against known blacklisted test addresses
  if (BLACKLISTED_TEST_ADDRESSES.has(addrLower) || BLACKLISTED_TEST_ADDRESSES.has(addr)) {
    return {
      address: addr,
      chain,
      riskScore: 100,
      riskCategory: "blacklisted",
      exposures: [
        {
          entity: "Blacklist",
          category: "mixer",
          percentage: 100,
          direct: true,
        },
      ],
      vasps: [],
      clusterSize: 1,
      provider: "internal_heuristic",
    };
  }

  // Bitcoin P2SH (starts with "3") — mixers frequently use P2SH
  // Slightly elevated risk — not definitive, just a heuristic signal
  if (chain === "bitcoin" && addr.startsWith("3")) {
    riskScore += 20;
    exposures.push({
      entity: "Unknown (P2SH — possible mixer output)",
      category: "mixer",
      percentage: 20,
      direct: false,
    });
  }

  // Bech32 (bc1) — generally lower risk, modern standard output format
  if (chain === "bitcoin" && addr.startsWith("bc1")) {
    riskScore = Math.max(0, riskScore - 5);
  }

  const riskCategory = scoreToCategory(riskScore);

  return {
    address: addr,
    chain,
    riskScore,
    riskCategory,
    exposures,
    vasps: [],
    clusterSize: 1,
    provider: "internal_heuristic",
  };
}

// ---------------------------------------------------------------------------
// Chainalysis KYT connector
// Activated when CHAINALYSIS_API_KEY is set.
// ---------------------------------------------------------------------------
async function chainalysisCheck(address: string): Promise<ChainAnalysisResult> {
  const apiKey = process.env["CHAINALYSIS_API_KEY"]!;
  const chain = detectChain(address);

  // Map our chain names to Chainalysis asset identifiers
  const assetMap: Record<ChainAnalysisResult["chain"], string> = {
    bitcoin: "BTC",
    ethereum: "ETH",
    tron: "TRX",
    other: "ETH", // fallback
  };
  const asset = assetMap[chain];

  // Register the address and request risk data
  // Chainalysis KYT v2 API — address risk endpoint
  const registerRes = await fetch(
    `https://api.chainalysis.com/api/kyt/v2/users/hawkeye/transfers/received`,
    {
      method: "POST",
      headers: {
        "Token": apiKey,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({
        network: asset,
        asset,
        transferReference: address,
        outputAddress: address,
        externalId: `hawkeye-${Date.now()}`,
      }),
    },
  );

  if (!registerRes.ok) {
    console.warn(`[crypto-chain] Chainalysis registration failed (${registerRes.status}) — falling back to heuristic`);
    return internalHeuristic(address);
  }

  const data = (await registerRes.json()) as {
    externalId?: string;
    riskScore?: number;
    riskRating?: string;
    clusterName?: string;
    clusterCategory?: string;
    exposures?: Array<{
      category: string;
      value: number;
      exposure: "direct" | "indirect";
    }>;
  };

  const riskScore = data.riskScore ?? 0;
  const exposures: ChainAnalysisResult["exposures"] = (data.exposures ?? []).map((e) => ({
    entity: data.clusterName ?? "Unknown",
    category: e.category,
    percentage: e.value,
    direct: e.exposure === "direct",
  }));

  return {
    address,
    chain,
    riskScore,
    riskCategory: scoreToCategory(riskScore),
    exposures,
    vasps: data.clusterCategory ? [data.clusterCategory] : [],
    clusterSize: 1,
    provider: "chainalysis",
  };
}

// ---------------------------------------------------------------------------
// Elliptic connector
// Activated when ELLIPTIC_API_KEY + ELLIPTIC_API_SECRET are both set.
// ---------------------------------------------------------------------------
async function ellipticCheck(address: string): Promise<ChainAnalysisResult> {
  const apiKey = process.env["ELLIPTIC_API_KEY"]!;
  const apiSecret = process.env["ELLIPTIC_API_SECRET"]!;
  const chain = detectChain(address);

  // Elliptic Lens Wallet API
  const res = await fetch(
    `https://aml-api.elliptic.co/v2/wallet/synchronous`,
    {
      method: "POST",
      headers: {
        "key": apiKey,
        "secret": apiSecret,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({
        subject: {
          asset: chain === "bitcoin" ? "BTC" : chain === "tron" ? "TRX" : "ETH",
          type: "address",
          hash: address,
        },
        type: "wallet_exposure",
      }),
    },
  );

  if (!res.ok) {
    console.warn(`[crypto-chain] Elliptic check failed (${res.status}) — falling back to heuristic`);
    return internalHeuristic(address);
  }

  const data = (await res.json()) as {
    risk_score_detail?: {
      risk_score?: number;
    };
    exposures?: Array<{
      value?: number;
      direct?: boolean;
      entity?: { name?: string; category?: string };
    }>;
    cluster?: {
      size?: number;
      inflows?: { vasp_names?: string[] };
    };
  };

  const riskScore = Math.round((data.risk_score_detail?.risk_score ?? 0) * 100);
  const exposures: ChainAnalysisResult["exposures"] = (data.exposures ?? []).map((e) => ({
    entity: e.entity?.name ?? "Unknown",
    category: e.entity?.category ?? "unknown",
    percentage: Math.round((e.value ?? 0) * 100),
    direct: e.direct ?? false,
  }));

  const vasps: string[] = data.cluster?.inflows?.vasp_names ?? [];
  const clusterSize = data.cluster?.size ?? 1;

  return {
    address,
    chain,
    riskScore,
    riskCategory: scoreToCategory(riskScore),
    exposures,
    vasps,
    clusterSize,
    provider: "elliptic",
  };
}

// ---------------------------------------------------------------------------
// Public interface — provider cascade
// ---------------------------------------------------------------------------

/** Analyze a wallet address using the best available provider:
 *  Chainalysis → Elliptic → internal heuristic */
export async function analyzeWalletChain(address: string): Promise<ChainAnalysisResult> {
  const chainalysisKey = process.env["CHAINALYSIS_API_KEY"];
  if (chainalysisKey) {
    try {
      return await chainalysisCheck(address);
    } catch (err) {
      console.warn("[crypto-chain] Chainalysis error, trying Elliptic:", err instanceof Error ? err.message : String(err));
    }
  }

  const ellipticKey = process.env["ELLIPTIC_API_KEY"];
  const ellipticSecret = process.env["ELLIPTIC_API_SECRET"];
  if (ellipticKey && ellipticSecret) {
    try {
      return await ellipticCheck(address);
    } catch (err) {
      console.warn("[crypto-chain] Elliptic error, falling back to heuristic:", err instanceof Error ? err.message : String(err));
    }
  }

  return internalHeuristic(address);
}
