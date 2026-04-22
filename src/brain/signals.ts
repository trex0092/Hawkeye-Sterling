// Hawkeye Sterling — named signals / feature registry.
// A signal is a small, named, typed feature the rule engine consumes.
// Signals are DECLARATIVE; computation lives in Phase-2 pipeline.

export type SignalKind = 'boolean' | 'number' | 'enum' | 'string' | 'geo_iso2';

export interface Signal {
  id: string;
  kind: SignalKind;
  description: string;
  domain: 'customer' | 'transaction' | 'relationship' | 'entity' | 'vessel' | 'wallet' | 'document' | 'system';
  valuesEnum?: string[];
  defaultValue?: string | number | boolean;
}

export const SIGNALS: Signal[] = [
  { id: 's_cust_is_pep', kind: 'boolean', description: 'Customer classified as PEP.', domain: 'customer' },
  { id: 's_cust_is_rca', kind: 'boolean', description: 'Customer classified as RCA of a PEP.', domain: 'customer' },
  { id: 's_cust_tax_residency_highrisk', kind: 'boolean', description: 'Tax residence in high-risk jurisdiction.', domain: 'customer' },
  { id: 's_cust_industry_code', kind: 'string', description: 'NACE / ISIC industry code.', domain: 'customer' },
  { id: 's_cust_is_npo', kind: 'boolean', description: 'Customer is an NPO.', domain: 'customer' },
  { id: 's_cust_is_vasp', kind: 'boolean', description: 'Customer is a VASP.', domain: 'customer' },
  { id: 's_cust_age_days', kind: 'number', description: 'Days since relationship start.', domain: 'customer' },
  { id: 's_cust_edd_complete', kind: 'boolean', description: 'EDD pack complete.', domain: 'customer' },
  { id: 's_cust_ubo_opacity', kind: 'number', description: 'UBO opacity score 0..1.', domain: 'customer' },
  { id: 's_cust_screening_hours_since_last', kind: 'number', description: 'Hours since last screening.', domain: 'customer' },
  { id: 's_cust_adverse_media_categories_count', kind: 'number', description: 'Distinct adverse-media categories cited.', domain: 'customer' },

  { id: 's_tx_amount_aed', kind: 'number', description: 'Transaction amount in AED.', domain: 'transaction' },
  { id: 's_tx_currency', kind: 'string', description: 'Transaction currency ISO-4217.', domain: 'transaction' },
  { id: 's_tx_channel', kind: 'enum', description: 'Channel: cash / wire / card / crypto / cheque / other.', domain: 'transaction', valuesEnum: ['cash', 'wire', 'card', 'crypto', 'cheque', 'other'] },
  { id: 's_tx_is_inbound', kind: 'boolean', description: 'Inbound (true) vs outbound.', domain: 'transaction' },
  { id: 's_tx_cross_border', kind: 'boolean', description: 'Crosses a national border.', domain: 'transaction' },
  { id: 's_tx_counterparty_iso2', kind: 'geo_iso2', description: 'Counterparty country ISO-2.', domain: 'transaction' },
  { id: 's_tx_structuring_window_count', kind: 'number', description: 'Count of near-threshold transactions in last 14 days.', domain: 'transaction' },
  { id: 's_tx_zscore_velocity', kind: 'number', description: 'Rolling z-score of transaction count.', domain: 'transaction' },
  { id: 's_tx_round_amount_flag', kind: 'boolean', description: 'Amount is a round multiple.', domain: 'transaction' },
  { id: 's_tx_same_day_passthrough', kind: 'boolean', description: 'Inbound and outbound on same day with narrow margin.', domain: 'transaction' },

  { id: 's_wallet_mixer_hops', kind: 'number', description: 'Minimum hops to a known mixer cluster.', domain: 'wallet' },
  { id: 's_wallet_sanction_hops', kind: 'number', description: 'Minimum hops to a sanctioned address cluster.', domain: 'wallet' },
  { id: 's_wallet_is_privacy_protocol', kind: 'boolean', description: 'Address associated with a privacy protocol.', domain: 'wallet' },

  { id: 's_ent_age_days', kind: 'number', description: 'Days since entity incorporation.', domain: 'entity' },
  { id: 's_ent_has_bearer_shares', kind: 'boolean', description: 'Entity has bearer shares in chain.', domain: 'entity' },
  { id: 's_ent_has_nominee_directors', kind: 'boolean', description: 'Entity has nominee directors.', domain: 'entity' },
  { id: 's_ent_group_layers', kind: 'number', description: 'Number of ownership layers to natural person.', domain: 'entity' },
  { id: 's_ent_jurisdiction_iso2', kind: 'geo_iso2', description: 'Entity jurisdiction of incorporation.', domain: 'entity' },

  { id: 's_vessel_ais_gap_hours', kind: 'number', description: 'Maximum AIS silence hours in voyage.', domain: 'vessel' },
  { id: 's_vessel_flag_state', kind: 'geo_iso2', description: 'Flag state ISO-2.', domain: 'vessel' },

  { id: 's_rel_screening_scope_count', kind: 'number', description: 'Number of lists included in last screen.', domain: 'relationship' },
  { id: 's_rel_has_open_str', kind: 'boolean', description: 'An STR exists for the relationship.', domain: 'relationship' },
  { id: 's_rel_has_active_freeze', kind: 'boolean', description: 'An active freeze exists on the relationship.', domain: 'relationship' },

  { id: 's_doc_freshness_days', kind: 'number', description: 'Age (days) of most recently uploaded KYC document.', domain: 'document' },
  { id: 's_doc_tamper_flag', kind: 'boolean', description: 'Tamper detection fired on a document.', domain: 'document' },

  { id: 's_sys_charter_hash', kind: 'string', description: 'Compliance-charter integrity hash at decision time.', domain: 'system' },
  { id: 's_sys_brain_version', kind: 'string', description: 'Brain version at decision time.', domain: 'system' },
];

export const SIGNAL_BY_ID: Map<string, Signal> = new Map(SIGNALS.map((s) => [s.id, s]));
export const SIGNALS_BY_DOMAIN: Record<string, Signal[]> = SIGNALS.reduce(
  (acc, s) => { (acc[s.domain] ||= []).push(s); return acc; },
  {} as Record<string, Signal[]>,
);
