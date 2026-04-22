// Hawkeye Sterling — named typology catalogue.
// A typology is a canonical pattern-of-conduct description. The brain uses
// typologies as labels on findings and as graph edges between red flags and
// reasoning modes. Typologies are descriptive only — they are NEVER legal
// conclusions (P3 of the compliance charter).

export type TypologyId =
  | 'structuring'
  | 'smurfing'
  | 'tbml'
  | 'dpms_retail'
  | 'dpms_refinery'
  | 'bullion_wholesale'
  | 'pep'
  | 'pep_rca'
  | 'sanctions_evasion'
  | 'proliferation'
  | 'vasp'
  | 'tbml_phantom_shipment'
  | 'correspondent_banking'
  | 'shell_company_chain'
  | 'nominee_directors'
  | 'cash_courier'
  | 'real_estate_cash'
  | 'art_dealer'
  | 'yacht_jet'
  | 'family_office'
  | 'insurance_wrap'
  | 'fund_capital_call'
  | 'market_manipulation'
  | 'insider_trading'
  | 'advance_fee_fraud'
  | 'bec_fraud'
  | 'invoice_fraud'
  | 'synthetic_identity'
  | 'ponzi_pyramid'
  | 'phoenix_company'
  | 'npo_diversion'
  | 'kleptocracy'
  | 'human_trafficking'
  | 'wildlife_trafficking'
  | 'narcotics_trafficking'
  | 'arms_trafficking'
  | 'maritime_stss'
  | 'privacy_coin_laundering'
  | 'mixer_usage'
  | 'nft_wash_trade'
  | 'defi_exploit';

export interface Typology {
  id: TypologyId;
  displayName: string;
  describes: string;
  redFlagIds: string[];
  reasoningModes: string[];
  doctrines: string[];
}

export const TYPOLOGIES: Typology[] = [
  { id: 'structuring', displayName: 'Structuring / smurfing', describes: 'Breaking transactions below reporting thresholds.', redFlagIds: ['rf_structuring_threshold', 'rf_structuring_branches'], reasoningModes: ['velocity_analysis', 'spike_detection', 'pattern_of_life'], doctrines: ['fatf_rba'] },
  { id: 'smurfing', displayName: 'Smurfing (multi-agent structuring)', describes: 'Distributed cash deposits across many agents.', redFlagIds: ['rf_structuring_threshold'], reasoningModes: ['peer_group_anomaly', 'link_analysis', 'community_detection'], doctrines: ['fatf_rba'] },
  { id: 'tbml', displayName: 'Trade-Based Money Laundering', describes: 'Laundering value through trade mis-invoicing or phantom shipment.', redFlagIds: ['rf_tbml_over_invoice', 'rf_tbml_phantom_shipment', 'rf_tbml_ucp600_gap'], reasoningModes: ['tbml_overlay', 'tbml_over_invoicing', 'tbml_phantom_shipment', 'ucp600_discipline'], doctrines: ['fatf_rba'] },
  { id: 'dpms_retail', displayName: 'DPMS retail cash', describes: 'Retail precious-metals transactions with cash red flags.', redFlagIds: ['rf_dpms_cash_walk_in', 'rf_dpms_no_receipt'], reasoningModes: ['dpms_retail_threshold', 'kpi_dpms_thirty'], doctrines: ['uae_moe_dnfbp_circulars', 'lbma_rgg'] },
  { id: 'dpms_refinery', displayName: 'DPMS refinery supply chain', describes: 'Doré/scrap inputs from CAHRA without OECD documentation.', redFlagIds: ['rf_dpms_refiner_cahra'], reasoningModes: ['lbma_rgg_five_step', 'oecd_ddg_annex', 'provenance_trace'], doctrines: ['lbma_rgg', 'oecd_ddg'] },
  { id: 'bullion_wholesale', displayName: 'Bullion wholesale loco split', describes: 'Wholesale bullion routed via split loco arrangements.', redFlagIds: [], reasoningModes: ['source_triangulation', 'jurisdiction_cascade'], doctrines: ['lbma_rgg'] },
  { id: 'pep', displayName: 'Politically Exposed Person', describes: 'Subject holds or recently held prominent public function.', redFlagIds: ['rf_pep_wealth_mismatch', 'rf_pep_family_nominee'], reasoningModes: ['pep_domestic_minister', 'narrative_coherence'], doctrines: ['wolfsberg_faq', 'uae_fdl_20_2018'] },
  { id: 'pep_rca', displayName: 'PEP — Relatives & Close Associates', describes: 'Exposure via family or close associates of a PEP.', redFlagIds: ['rf_pep_family_nominee'], reasoningModes: ['link_analysis', 'timeline_reconstruction'], doctrines: ['wolfsberg_faq'] },
  { id: 'sanctions_evasion', displayName: 'Sanctions evasion', describes: 'Arrangements designed to circumvent sanctions.', redFlagIds: ['rf_sanc_shell_chain', 'rf_sanc_stss'], reasoningModes: ['sanctions_regime_matrix', 'list_walk', 'jurisdiction_cascade'], doctrines: ['uae_cd_74_2020'] },
  { id: 'proliferation', displayName: 'Proliferation financing', describes: 'Financing of WMD-related procurement or logistics.', redFlagIds: ['rf_sanc_dual_use'], reasoningModes: ['pf_dual_use_controls', 'attack_tree'], doctrines: ['uae_cd_74_2020'] },
  { id: 'vasp', displayName: 'Virtual-asset service provider', describes: 'Crypto-native risk patterns.', redFlagIds: ['rf_vasp_mixer', 'rf_vasp_travel_rule_gap'], reasoningModes: ['vasp_wallet_screen', 'vasp_travel_rule', 'chain_analysis'], doctrines: ['fatf_rba'] },
  { id: 'tbml_phantom_shipment', displayName: 'Phantom shipment', describes: 'Paper trade with no underlying movement of goods.', redFlagIds: ['rf_tbml_phantom_shipment'], reasoningModes: ['tbml_phantom_shipment', 'sanctions_maritime_stss'], doctrines: ['fatf_rba'] },
  { id: 'correspondent_banking', displayName: 'Nested correspondent banking', describes: 'Respondent providing services to downstream banks without RE visibility.', redFlagIds: [], reasoningModes: ['corresp_nested_bank_flow', 'kyb_strict'], doctrines: ['wolfsberg_correspondent'] },
  { id: 'shell_company_chain', displayName: 'Shell-company chain', describes: 'Layered shell entities in opaque jurisdictions.', redFlagIds: ['rf_sanc_shell_chain', 'rf_ubo_common_address'], reasoningModes: ['ubo_tree_walk', 'community_detection'], doctrines: ['fatf_rba'] },
  { id: 'nominee_directors', displayName: 'Nominee directors / shareholders', describes: 'Formal parties hiding true controller.', redFlagIds: ['rf_ubo_bearer_shares'], reasoningModes: ['ubo_nominee_directors', 'entity_resolution'], doctrines: ['fatf_rba'] },
  { id: 'cash_courier', displayName: 'Cross-border cash courier', describes: 'Currency or negotiable instruments moved physically across borders.', redFlagIds: [], reasoningModes: ['cash_courier_ctn', 'jurisdiction_cascade'], doctrines: ['fatf_rba'] },
  { id: 'real_estate_cash', displayName: 'Real estate cash purchase', describes: 'High-value property bought in cash or via shell.', redFlagIds: [], reasoningModes: ['real_estate_cash', 'source_triangulation'], doctrines: ['fatf_rba'] },
  { id: 'art_dealer', displayName: 'Art dealer private sale', describes: 'Art sold through private channels with weak provenance.', redFlagIds: [], reasoningModes: ['art_dealer', 'provenance_trace'], doctrines: [] },
  { id: 'yacht_jet', displayName: 'Yacht / jet beneficial use', describes: 'Luxury assets registered through chains of intermediaries.', redFlagIds: [], reasoningModes: ['yacht_jet', 'ubo_tree_walk'], doctrines: [] },
  { id: 'family_office', displayName: 'Single-family / multi-family office', describes: 'Family office structures used to mask UBO or source of wealth.', redFlagIds: [], reasoningModes: ['family_office_signal', 'ubo_tree_walk'], doctrines: [] },
  { id: 'insurance_wrap', displayName: 'Insurance wrap', describes: 'Life-insurance / investment wrappers used to layer funds.', redFlagIds: [], reasoningModes: ['insurance_wrap', 'narrative_coherence'], doctrines: [] },
  { id: 'fund_capital_call', displayName: 'Fund capital call with unclear source', describes: 'Limited-partner capital call where SoW cannot be verified.', redFlagIds: [], reasoningModes: ['fund_capital_call' as string, 'source_triangulation'], doctrines: [] },
  { id: 'market_manipulation', displayName: 'Market manipulation', describes: 'Wash trades, spoofing, front-running.', redFlagIds: [], reasoningModes: ['market_manipulation', 'wash_trade', 'spoofing', 'front_running'], doctrines: [] },
  { id: 'insider_trading', displayName: 'Insider trading', describes: 'Trading on material non-public information.', redFlagIds: [], reasoningModes: ['insider_threat', 'timeline_reconstruction'], doctrines: [] },
  { id: 'advance_fee_fraud', displayName: 'Advance-fee fraud', describes: 'Victim pays a fee against a promised benefit that never materialises.', redFlagIds: [], reasoningModes: ['advance_fee', 'narrative_coherence'], doctrines: [] },
  { id: 'bec_fraud', displayName: 'Business Email Compromise', describes: 'Fraudulent payment redirect via compromised or spoofed email.', redFlagIds: [], reasoningModes: ['bec_fraud', 'linguistic_forensics'], doctrines: [] },
  { id: 'invoice_fraud', displayName: 'Invoice fraud', describes: 'False or duplicated invoices used to extract payment.', redFlagIds: [], reasoningModes: ['invoice_fraud', 'reconciliation'], doctrines: [] },
  { id: 'synthetic_identity', displayName: 'Synthetic identity', describes: 'Identity fabricated by combining real and fake attributes.', redFlagIds: [], reasoningModes: ['synthetic_id', 'entity_resolution'], doctrines: [] },
  { id: 'ponzi_pyramid', displayName: 'Ponzi / pyramid scheme', describes: 'Returns paid from new-investor capital.', redFlagIds: [], reasoningModes: ['ponzi_scheme', 'time_series'], doctrines: [] },
  { id: 'phoenix_company', displayName: 'Phoenix company', describes: 'Liquidation-resurrection pattern to shed liabilities.', redFlagIds: [], reasoningModes: ['phoenix_company', 'timeline_reconstruction'], doctrines: [] },
  { id: 'npo_diversion', displayName: 'NPO diversion', describes: 'Charity funds diverted to non-charitable purposes in conflict zones.', redFlagIds: [], reasoningModes: ['source_triangulation', 'jurisdiction_cascade'], doctrines: ['fatf_rba'] },
  { id: 'kleptocracy', displayName: 'Kleptocracy / grand corruption', describes: 'State-capture-level misappropriation of public funds.', redFlagIds: ['rf_pep_wealth_mismatch'], reasoningModes: ['pep_domestic_minister', 'source_triangulation'], doctrines: ['wolfsberg_faq'] },
  { id: 'human_trafficking', displayName: 'Human trafficking / modern slavery', describes: 'Financial patterns associated with trafficking in persons.', redFlagIds: [], reasoningModes: ['pattern_of_life', 'velocity_analysis'], doctrines: [] },
  { id: 'wildlife_trafficking', displayName: 'Wildlife trafficking', describes: 'Financial patterns associated with IWT.', redFlagIds: [], reasoningModes: ['pattern_of_life', 'jurisdiction_cascade'], doctrines: [] },
  { id: 'narcotics_trafficking', displayName: 'Narcotics trafficking', describes: 'Financial patterns associated with drug trafficking.', redFlagIds: [], reasoningModes: ['jurisdiction_cascade', 'pattern_of_life'], doctrines: [] },
  { id: 'arms_trafficking', displayName: 'Arms / weapons smuggling', describes: 'Illicit weapons movement and financing.', redFlagIds: [], reasoningModes: ['sanctions_regime_matrix', 'pf_dual_use_controls'], doctrines: [] },
  { id: 'maritime_stss', displayName: 'Maritime STSS with AIS gap', describes: 'Ship-to-ship transfer while AIS is disabled.', redFlagIds: ['rf_sanc_stss'], reasoningModes: ['sanctions_maritime_stss', 'velocity_analysis'], doctrines: [] },
  { id: 'privacy_coin_laundering', displayName: 'Privacy-coin laundering', describes: 'Conversion through privacy-preserving coins.', redFlagIds: [], reasoningModes: ['privacy_coin_reasoning', 'chain_analysis'], doctrines: [] },
  { id: 'mixer_usage', displayName: 'Mixer / tumbler usage', describes: 'Funds routed through coin mixers or tumblers.', redFlagIds: ['rf_vasp_mixer'], reasoningModes: ['chain_analysis', 'taint_propagation'], doctrines: [] },
  { id: 'nft_wash_trade', displayName: 'NFT wash trade', describes: 'Self-dealing NFT trades to launder or manipulate price.', redFlagIds: [], reasoningModes: ['nft_wash', 'wash_trade'], doctrines: [] },
  { id: 'defi_exploit', displayName: 'DeFi smart-contract exploit', describes: 'Illicit proceeds from DeFi protocol exploit.', redFlagIds: [], reasoningModes: ['defi_smart_contract', 'chain_analysis'], doctrines: [] },
];

export const TYPOLOGY_BY_ID: Map<TypologyId, Typology> = new Map(
  TYPOLOGIES.map((t) => [t.id, t]),
);
