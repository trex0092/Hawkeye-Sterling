// Hawkeye Sterling — transaction-monitoring rule catalogue.
// Named TM rules with typed parameters. Rules are DECLARATIVE; execution lives
// in Phase-2 pipeline. Each rule binds to reasoning modes + typologies so the
// alert narrative can cite them automatically.

export type TmRuleClass = 'threshold' | 'velocity' | 'pattern' | 'network' | 'anomaly' | 'geo' | 'crypto';

export interface TmRule {
  id: string;
  name: string;
  ruleClass: TmRuleClass;
  description: string;
  parameters: Record<string, number | string | boolean>;
  reasoningModes: string[];
  typologies: string[];
  defaultPriority: 'low' | 'medium' | 'high';
}

export const TM_RULES: TmRule[] = [
  // Thresholds
  { id: 'tm_cash_single_above_dpms', name: 'Single cash transaction ≥ DPMS threshold', ruleClass: 'threshold', description: 'Flag any single cash transaction at or above the DPMS threshold.', parameters: { thresholdAed: 55000 }, reasoningModes: ['dpms_retail_threshold'], typologies: ['dpms_retail'], defaultPriority: 'high' },
  { id: 'tm_cash_linked_above_dpms', name: 'Linked cash transactions ≥ DPMS threshold', ruleClass: 'threshold', description: 'Aggregate linked cash transactions within N days; flag if total ≥ threshold.', parameters: { thresholdAed: 55000, windowDays: 30 }, reasoningModes: ['dpms_retail_threshold', 'link_analysis'], typologies: ['structuring'], defaultPriority: 'high' },
  // Velocity
  { id: 'tm_velocity_spike_7d', name: '7-day velocity spike', ruleClass: 'velocity', description: 'Transaction count or value in trailing 7 days > N× historical baseline.', parameters: { multiple: 3, zScore: 3.0 }, reasoningModes: ['velocity_analysis', 'spike_detection'], typologies: ['structuring', 'pass_through'], defaultPriority: 'medium' },
  { id: 'tm_velocity_just_below_threshold', name: 'Repeated transactions just below threshold', ruleClass: 'velocity', description: 'N transactions within X days at 90–99% of the reporting threshold.', parameters: { countMin: 3, windowDays: 14, bandLow: 0.9, bandHigh: 0.99 }, reasoningModes: ['velocity_analysis', 'spike_detection'], typologies: ['structuring'], defaultPriority: 'high' },
  // Patterns
  { id: 'tm_pattern_round_amounts', name: 'Round-amount recurrence', ruleClass: 'pattern', description: 'Recurring round-amount transactions without commercial rationale.', parameters: { roundness: 1000, minCount: 3 }, reasoningModes: ['narrative_coherence'], typologies: ['round_number_activity'], defaultPriority: 'low' },
  { id: 'tm_pattern_dormant_reactivation', name: 'Dormant reactivation before inbound', ruleClass: 'pattern', description: 'Account dormant ≥ 180 days receives inbound ≥ AED 50k within 7 days of reactivation.', parameters: { dormantDays: 180, inflowAed: 50000, windowDays: 7 }, reasoningModes: ['pattern_of_life', 'timeline_reconstruction'], typologies: ['dormant_reactivation'], defaultPriority: 'medium' },
  { id: 'tm_pattern_pass_through_same_day', name: 'Same-day in-and-out', ruleClass: 'pattern', description: 'Inbound and outbound same day with narrow net margin.', parameters: { marginPct: 5 }, reasoningModes: ['velocity_analysis', 'chain_analysis'], typologies: ['pass_through'], defaultPriority: 'high' },
  // Network
  { id: 'tm_network_funnel_account', name: 'Funnel-account pattern', ruleClass: 'network', description: 'Multiple unrelated payers feed one account with consolidated outbound.', parameters: { uniquePayersMin: 5, outboundShare: 0.8 }, reasoningModes: ['community_detection', 'link_analysis'], typologies: ['funnel_accounts'], defaultPriority: 'high' },
  { id: 'tm_network_nested_corresp', name: 'Nested correspondent flow', ruleClass: 'network', description: 'Downstream bank routed through respondent without direct relationship.', parameters: {}, reasoningModes: ['corresp_nested_bank_flow'], typologies: ['correspondent_banking'], defaultPriority: 'medium' },
  // Anomaly
  { id: 'tm_anomaly_peer_group', name: 'Peer-group anomaly', ruleClass: 'anomaly', description: 'Customer activity deviates > 3σ from peer segment mean.', parameters: { sigma: 3 }, reasoningModes: ['peer_group_anomaly'], typologies: [], defaultPriority: 'medium' },
  { id: 'tm_anomaly_time_of_day', name: 'Time-of-day anomaly', ruleClass: 'anomaly', description: 'Material transactions outside customer\'s established time profile.', parameters: {}, reasoningModes: ['pattern_of_life'], typologies: [], defaultPriority: 'low' },
  // Geo
  { id: 'tm_geo_high_risk_nexus', name: 'High-risk country nexus', ruleClass: 'geo', description: 'Transaction counterparty resident / incorporated in high-risk country.', parameters: { tier: 'very_high' }, reasoningModes: ['jurisdiction_cascade'], typologies: [], defaultPriority: 'high' },
  { id: 'tm_geo_cahra_supply_chain', name: 'CAHRA supply-chain', ruleClass: 'geo', description: 'Refinery input sourced from active CAHRA country.', parameters: {}, reasoningModes: ['oecd_annex_ii_discipline'], typologies: ['dpms_refinery'], defaultPriority: 'high' },
  // Crypto
  { id: 'tm_crypto_mixer_inbound', name: 'Inbound from known mixer', ruleClass: 'crypto', description: 'Inbound traceable to a known mixer / privacy protocol cluster.', parameters: {}, reasoningModes: ['mixer_forensics'], typologies: ['mixer_usage'], defaultPriority: 'high' },
  { id: 'tm_crypto_sanction_cluster_hop', name: 'Within N hops of sanctioned cluster', ruleClass: 'crypto', description: 'Counterparty within N hops of a sanction-designated wallet.', parameters: { hops: 2 }, reasoningModes: ['sanction_wallet_cluster', 'chain_analysis'], typologies: ['sanction_cluster_proximity'], defaultPriority: 'high' },
  { id: 'tm_crypto_travel_rule_gap', name: 'Travel-rule data gap', ruleClass: 'crypto', description: 'In-scope crypto transfer missing originator/beneficiary data.', parameters: { aboveAed: 3500 }, reasoningModes: ['vasp_travel_rule', 'completeness_audit'], typologies: ['vasp'], defaultPriority: 'high' },
  { id: 'tm_crypto_bridge_rapid_swap', name: 'Bridge + rapid swap + off-ramp', ruleClass: 'crypto', description: 'Cross-chain bridge followed by rapid swap into stablecoin then off-ramp.', parameters: { windowMinutes: 30 }, reasoningModes: ['bridge_crossing_trace', 'chain_analysis'], typologies: ['bridge_hop_offramp'], defaultPriority: 'medium' },
  // Trade finance
  { id: 'tm_tf_unit_price_outlier', name: 'Unit price outlier vs HS-benchmark', ruleClass: 'anomaly', description: 'LC unit price deviates > N% from global HS-code benchmark.', parameters: { deltaPct: 25 }, reasoningModes: ['commodity_price_anomaly', 'regression'], typologies: ['commodity_price_outlier'], defaultPriority: 'medium' },
  { id: 'tm_tf_ais_gap', name: 'Vessel AIS gap during LC route', ruleClass: 'pattern', description: 'Declared vessel has AIS silence exceeding N hours on LC route.', parameters: { gapHours: 12 }, reasoningModes: ['vessel_ais_gap_analysis'], typologies: ['dark_vessel_stss'], defaultPriority: 'high' },
];

export const TM_RULE_BY_ID: Map<string, TmRule> = new Map(TM_RULES.map((r) => [r.id, r]));
