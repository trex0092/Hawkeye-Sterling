// Hawkeye Sterling — crypto intelligence pack (Layers 124-130).

export interface WalletProfile {
  address: string;
  chain: string;
  firstSeenAt?: string;
  txCount?: number;
  uniqueCounterparties?: number;
  totalInflowUsd?: number;
  totalOutflowUsd?: number;
  exposureTags?: string[];        // ["mixer","sanctioned_cluster","darknet",...]
  defiProtocols?: string[];       // ["uniswap","aave","tornado_cash",...]
  bridgeUses?: Array<{ from: string; to: string; at: string }>;
  nftActivity?: Array<{ collection: string; flips: number }>;
  stableCoinHoldingsUsd?: Record<string, number>;
}

// 124. Wallet age scorer (younger = riskier)
export function walletAgeScore(w: WalletProfile, nowMs = Date.now()): { score: number; ageDays: number; tier: string } {
  if (!w.firstSeenAt) return { score: 75, ageDays: 0, tier: "unknown_age" };
  const t = Date.parse(w.firstSeenAt);
  const days = Math.max(0, (nowMs - t) / 86400000);
  let score = 0; let tier = "mature";
  if (days < 7) { score = 90; tier = "very_new"; }
  else if (days < 30) { score = 75; tier = "new"; }
  else if (days < 180) { score = 45; tier = "young"; }
  else if (days < 730) { score = 20; tier = "established"; }
  else { score = 5; tier = "mature"; }
  return { score, ageDays: Math.round(days), tier };
}

// 125. Activity-entropy scorer (bursty / sparse / steady)
export function walletActivityEntropy(w: WalletProfile): { entropyTier: "bursty" | "steady" | "sparse" | "unknown"; rationale: string } {
  if (!w.txCount || !w.firstSeenAt) return { entropyTier: "unknown", rationale: "insufficient telemetry" };
  const ageDays = Math.max(1, (Date.now() - Date.parse(w.firstSeenAt)) / 86400000);
  const perDay = w.txCount / ageDays;
  const cpRatio = w.uniqueCounterparties ? w.uniqueCounterparties / w.txCount : 0;
  if (perDay > 50) return { entropyTier: "bursty", rationale: `${perDay.toFixed(0)} tx/day — bursty activity.` };
  if (perDay < 0.05) return { entropyTier: "sparse", rationale: `${(perDay * 30).toFixed(1)} tx/month — sparse activity.` };
  if (cpRatio < 0.05) return { entropyTier: "bursty", rationale: `Repeated counterparties (${(cpRatio * 100).toFixed(0)}% unique).` };
  return { entropyTier: "steady", rationale: `${perDay.toFixed(1)} tx/day, ${(cpRatio * 100).toFixed(0)}% unique counterparties — normal.` };
}

// 126. Mixer / tumbler exposure scorer
const MIXER_TAGS = new Set(["mixer", "tornado_cash", "tumbler", "wasabi", "samourai", "monero_swap"]);
export function mixerExposure(w: WalletProfile): { exposed: boolean; severity: "critical" | "high" | "medium" | "low" | "clear"; tags: string[] } {
  const tags = (w.exposureTags ?? []).filter((t) => MIXER_TAGS.has(t.toLowerCase()));
  if (tags.includes("tornado_cash")) return { exposed: true, severity: "critical", tags };
  if (tags.length > 0) return { exposed: true, severity: "high", tags };
  return { exposed: false, severity: "clear", tags: [] };
}

// 127. DeFi protocol exposure
const HIGH_RISK_PROTOCOLS = new Set(["tornado_cash", "railgun", "aztec", "ren_bridge"]);
export function defiExposure(w: WalletProfile): { highRisk: string[]; mediumRisk: string[]; rationale: string } {
  const protos = w.defiProtocols ?? [];
  const high = protos.filter((p) => HIGH_RISK_PROTOCOLS.has(p.toLowerCase()));
  const medium = protos.filter((p) => !HIGH_RISK_PROTOCOLS.has(p.toLowerCase()));
  return {
    highRisk: high,
    mediumRisk: medium,
    rationale: high.length > 0
      ? `High-risk DeFi exposure: ${high.join(", ")}. Apply enhanced source-of-funds review.`
      : `${medium.length} DeFi protocol(s) used — within normal envelope.`,
  };
}

// 128. Cross-chain bridge tracking
const SANCTIONED_BRIDGES = new Set(["ren_bridge", "anyswap_legacy"]);
export function bridgeTracking(w: WalletProfile): { sanctionedBridge: boolean; bridgeCount: number; uniqueChains: string[] } {
  const uses = w.bridgeUses ?? [];
  const sanctioned = uses.some((u) => SANCTIONED_BRIDGES.has(u.from.toLowerCase()) || SANCTIONED_BRIDGES.has(u.to.toLowerCase()));
  const chains = new Set<string>();
  for (const u of uses) { chains.add(u.from); chains.add(u.to); }
  return { sanctionedBridge: sanctioned, bridgeCount: uses.length, uniqueChains: [...chains] };
}

// 129. NFT wash-trading detector
export function nftWashTrading(w: WalletProfile): { suspicious: boolean; rationale: string } {
  const acts = w.nftActivity ?? [];
  const suspicious = acts.find((a) => a.flips >= 5);
  if (suspicious) return { suspicious: true, rationale: `${suspicious.flips} flips of "${suspicious.collection}" — wash-trading pattern.` };
  return { suspicious: false, rationale: "No wash-trading pattern detected." };
}

// 130. Stable-coin off-ramp profile
export function stableCoinOffRamp(w: WalletProfile): { dominant?: string; concentration: number; rationale: string } {
  const h = w.stableCoinHoldingsUsd ?? {};
  const total = Object.values(h).reduce((s, v) => s + v, 0);
  if (total === 0) return { concentration: 0, rationale: "No stablecoin holdings." };
  const sorted = Object.entries(h).sort((a, b) => b[1] - a[1]);
  const dominant = sorted[0]!;
  const concentration = dominant[1] / total;
  return {
    dominant: dominant[0],
    concentration: Number(concentration.toFixed(2)),
    rationale: concentration > 0.9
      ? `${(concentration * 100).toFixed(0)}% in ${dominant[0]} — single-stablecoin off-ramp pattern.`
      : `Diversified stablecoin holdings — within normal.`,
  };
}
