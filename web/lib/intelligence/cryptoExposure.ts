// Hawkeye Sterling — crypto wallet exposure analyzer (Layer #21).
//
// Pure-function analyzer over a wallet-graph supplied by the screening
// route (typically sourced from Chainalysis / TRM / Elliptic adapters).
// Detects direct match, 1-hop exposure, and mixer / sanctioned-cluster
// proximity.

export type WalletCluster =
  | "ofac_sdn_wallet"
  | "tornado_cash"
  | "lazarus_group"
  | "russian_ofac"
  | "iranian_ofac"
  | "darknet_market"
  | "ransomware_payment"
  | "scam_or_fraud"
  | "mixer_unspecified"
  | "exchange_unlicensed"
  | "sanctioned_jurisdiction_exchange"
  | "high_risk_other";

export interface WalletNode {
  address: string;
  chain: "btc" | "eth" | "trx" | "sol" | "bsc" | "polygon" | "other";
  /** Direct cluster tag, if known. */
  cluster?: WalletCluster | null;
  /** Risk score 0..100 from the third-party provider. */
  providerRisk?: number;
  /** First-hop counterparties — addresses this wallet has interacted with. */
  oneHopCounterparties?: Array<{ address: string; cluster?: WalletCluster | null; volumeUsd?: number }>;
}

export interface CryptoExposureReport {
  exposed: boolean;
  /** Worst tier of exposure across all wallets. */
  exposureTier: "direct" | "one_hop" | "indirect" | "clean";
  directClusters: WalletCluster[];
  oneHopClusters: WalletCluster[];
  walletCount: number;
  rationale: string;
  redFlags: string[];
}

const CRITICAL_CLUSTERS = new Set<WalletCluster>([
  "ofac_sdn_wallet",
  "tornado_cash",
  "lazarus_group",
  "russian_ofac",
  "iranian_ofac",
]);

const HIGH_CLUSTERS = new Set<WalletCluster>([
  "darknet_market",
  "ransomware_payment",
  "mixer_unspecified",
  "sanctioned_jurisdiction_exchange",
]);

export function analyzeCrypto(wallets: WalletNode[]): CryptoExposureReport {
  if (wallets.length === 0) {
    return {
      exposed: false,
      exposureTier: "clean",
      directClusters: [],
      oneHopClusters: [],
      walletCount: 0,
      rationale: "No wallets registered against this subject.",
      redFlags: [],
    };
  }
  const direct = new Set<WalletCluster>();
  const oneHop = new Set<WalletCluster>();
  for (const w of wallets) {
    if (w.cluster) direct.add(w.cluster);
    for (const cp of w.oneHopCounterparties ?? []) {
      if (cp.cluster) oneHop.add(cp.cluster);
    }
  }
  const redFlags: string[] = [];
  for (const c of direct) {
    if (CRITICAL_CLUSTERS.has(c)) redFlags.push(`Direct cluster: ${c.replace(/_/g, " ")}`);
    else if (HIGH_CLUSTERS.has(c)) redFlags.push(`Direct cluster (high): ${c.replace(/_/g, " ")}`);
  }
  for (const c of oneHop) {
    if (CRITICAL_CLUSTERS.has(c)) redFlags.push(`1-hop cluster: ${c.replace(/_/g, " ")}`);
  }
  const tier: CryptoExposureReport["exposureTier"] =
    [...direct].some((c) => CRITICAL_CLUSTERS.has(c) || HIGH_CLUSTERS.has(c))
      ? "direct"
      : [...oneHop].some((c) => CRITICAL_CLUSTERS.has(c))
        ? "one_hop"
        : oneHop.size > 0 || direct.size > 0
          ? "indirect"
          : "clean";
  return {
    exposed: tier !== "clean",
    exposureTier: tier,
    directClusters: Array.from(direct),
    oneHopClusters: Array.from(oneHop),
    walletCount: wallets.length,
    rationale:
      tier === "clean"
        ? `${wallets.length} wallets analysed; no high-risk cluster exposure.`
        : tier === "indirect"
          ? `${wallets.length} wallets analysed; indirect exposure to ${[...direct, ...oneHop].length} clusters.`
          : tier === "one_hop"
            ? `1-hop counterparty exposure to a critical cluster — counts as constructive sanctions exposure.`
            : `Direct cluster exposure to a sanctioned / mixer wallet — refuse the relationship.`,
    redFlags,
  };
}
