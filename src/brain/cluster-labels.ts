// Hawkeye Sterling — on-chain wallet-cluster labels.
// Taxonomic labels the brain can attach to wallet clusters. Real cluster
// data comes from Phase-2 on-chain analytics vendor; this file fixes the
// vocabulary so findings can be machine-parsed.

export type ClusterLabel =
  | 'exchange_tier1'
  | 'exchange_tier2'
  | 'exchange_unregulated'
  | 'dex'
  | 'bridge'
  | 'mixer'
  | 'privacy_protocol'
  | 'sanctioned'
  | 'ransomware'
  | 'darknet_market'
  | 'gambling'
  | 'mining_pool'
  | 'payment_processor'
  | 'staking_service'
  | 'lending_platform'
  | 'derivatives_venue'
  | 'custody_institutional'
  | 'self_custody_individual'
  | 'smart_contract_protocol'
  | 'scam'
  | 'defi_exploit_proceeds'
  | 'stablecoin_issuer'
  | 'nft_marketplace'
  | 'unclassified';

export interface ClusterLabelMeta {
  id: ClusterLabel;
  inherentRisk: number; // 0..1
  description: string;
  reasoningModes: string[];
}

export const CLUSTER_LABELS: ClusterLabelMeta[] = [
  { id: 'exchange_tier1', inherentRisk: 0.2, description: 'Regulated exchange in Tier-1 jurisdiction with CDD/travel-rule.', reasoningModes: ['source_credibility'] },
  { id: 'exchange_tier2', inherentRisk: 0.4, description: 'Regulated exchange in lower-tier jurisdiction.', reasoningModes: ['source_credibility'] },
  { id: 'exchange_unregulated', inherentRisk: 0.8, description: 'Exchange operating without discernible regulatory oversight.', reasoningModes: ['source_credibility'] },
  { id: 'dex', inherentRisk: 0.6, description: 'Decentralised exchange contract.', reasoningModes: ['defi_smart_contract'] },
  { id: 'bridge', inherentRisk: 0.65, description: 'Cross-chain bridge protocol.', reasoningModes: ['bridge_crossing_trace', 'bridge_risk'] },
  { id: 'mixer', inherentRisk: 0.95, description: 'Coin-mixing service.', reasoningModes: ['mixer_forensics', 'taint_propagation'] },
  { id: 'privacy_protocol', inherentRisk: 0.9, description: 'Privacy-enhancing protocol (e.g. privacy-pool style).', reasoningModes: ['privacy_coin_reasoning'] },
  { id: 'sanctioned', inherentRisk: 1.0, description: 'Address designated by an authoritative sanctions list.', reasoningModes: ['sanction_wallet_cluster', 'sanctions_regime_matrix'] },
  { id: 'ransomware', inherentRisk: 1.0, description: 'Address tied to ransomware payment campaigns.', reasoningModes: ['ransomware_payment_trace'] },
  { id: 'darknet_market', inherentRisk: 0.95, description: 'Address tied to a darknet marketplace.', reasoningModes: ['darknet_market_flow'] },
  { id: 'gambling', inherentRisk: 0.6, description: 'On-chain gambling venue.', reasoningModes: ['online_gambling_deposit_velocity' as string] },
  { id: 'mining_pool', inherentRisk: 0.3, description: 'Mining pool payout addresses.', reasoningModes: [] },
  { id: 'payment_processor', inherentRisk: 0.4, description: 'Crypto payment processor.', reasoningModes: [] },
  { id: 'staking_service', inherentRisk: 0.35, description: 'Staking / validator operator.', reasoningModes: [] },
  { id: 'lending_platform', inherentRisk: 0.55, description: 'Lending / borrowing DeFi platform.', reasoningModes: ['flash_loan_exploit'] },
  { id: 'derivatives_venue', inherentRisk: 0.6, description: 'Perpetuals or options venue.', reasoningModes: [] },
  { id: 'custody_institutional', inherentRisk: 0.25, description: 'Regulated institutional custodian.', reasoningModes: [] },
  { id: 'self_custody_individual', inherentRisk: 0.4, description: 'Individual self-custody wallet.', reasoningModes: [] },
  { id: 'smart_contract_protocol', inherentRisk: 0.5, description: 'Smart-contract protocol address.', reasoningModes: ['smart_contract_static_analysis'] },
  { id: 'scam', inherentRisk: 0.95, description: 'Address associated with rug pull / scam / phishing.', reasoningModes: ['rug_pull_detection'] },
  { id: 'defi_exploit_proceeds', inherentRisk: 0.95, description: 'Proceeds of DeFi exploit.', reasoningModes: ['flash_loan_exploit', 'defi_smart_contract'] },
  { id: 'stablecoin_issuer', inherentRisk: 0.4, description: 'Stablecoin issuer mint/burn address.', reasoningModes: ['stablecoin_reserve'] },
  { id: 'nft_marketplace', inherentRisk: 0.5, description: 'NFT marketplace contract.', reasoningModes: ['nft_wash'] },
  { id: 'unclassified', inherentRisk: 0.6, description: 'Address not yet classified; treat as elevated pending enrichment.', reasoningModes: ['source_credibility'] },
];

export const CLUSTER_LABEL_BY_ID: Map<ClusterLabel, ClusterLabelMeta> =
  new Map(CLUSTER_LABELS.map((c) => [c.id, c]));
