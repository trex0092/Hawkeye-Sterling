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
  | 'defi_exploit'
  // Wave 4 — FATF 2021 environmental-crime predicate + carbon-market fraud +
  // insider-threat (distinct from insider_trading MNPI) + AI-governance /
  // AI-enabled synthetic-media fraud typologies.
  | 'environmental_crime'
  | 'carbon_market_fraud'
  | 'insider_threat'
  | 'ai_governance_breach'
  | 'ai_synthetic_media_fraud'
  // Wave 5 — expanded typology surface
  | 'hawala_network'
  | 'cyber_extortion'
  | 'romance_fraud'
  | 'tax_evasion_offshore'
  | 'customs_fraud'
  | 'social_media_investment_fraud'
  | 'precious_stones'
  | 'gambling_ml'
  | 'loan_stacking'
  | 'bust_out_fraud'
  | 'real_estate_over_valuation'
  | 'luxury_goods_ml'
  | 'legal_services_ml'
  | 'crypto_ransomware'
  | 'payroll_fraud'
  | 'professional_money_laundering'
  | 'funnel_account'
  | 'cash_intensive_business'
  | 'correspondent_shell'
  | 'virtual_iban_abuse'
  | 'invoice_discounting_fraud'
  | 'crypto_p2p_exchange'
  | 'daigou_parallel_import'
  | 'construction_ml'
  | 'healthcare_billing_fraud'
  // Wave 6 — crypto on-/off-ramp obfuscation, free-zone bearer-share loopholes
  | 'crypto_onramp_obfuscation'
  | 'bearer_share_fz_loophole';

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
  { id: 'tbml', displayName: 'Trade-Based Money Laundering', describes: 'Laundering value through trade mis-invoicing or phantom shipment.', redFlagIds: ['rf_tbml_over_invoice', 'rf_tbml_phantom_shipment', 'rf_tbml_ucp600_gap', 'rf_tbml_round_trip', 'rf_tbml_unit_price_outlier'], reasoningModes: ['tbml_overlay', 'tbml_over_invoicing', 'tbml_phantom_shipment', 'ucp600_discipline'], doctrines: ['fatf_rba'] },
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
  { id: 'shell_company_chain', displayName: 'Shell-company chain', describes: 'Layered shell entities in opaque jurisdictions.', redFlagIds: ['rf_sanc_shell_chain', 'rf_ubo_common_address', 'rf_shell_director_overlap', 'rf_shell_back_to_back'], reasoningModes: ['ubo_tree_walk', 'community_detection'], doctrines: ['fatf_rba'] },
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
  { id: 'synthetic_identity', displayName: 'Synthetic identity', describes: 'Identity fabricated by combining real and fake attributes.', redFlagIds: ['rf_synthetic_id_thin_file'], reasoningModes: ['synthetic_id', 'entity_resolution'], doctrines: [] },
  { id: 'ponzi_pyramid', displayName: 'Ponzi / pyramid scheme', describes: 'Returns paid from new-investor capital.', redFlagIds: [], reasoningModes: ['ponzi_scheme', 'time_series'], doctrines: [] },
  { id: 'phoenix_company', displayName: 'Phoenix company', describes: 'Liquidation-resurrection pattern to shed liabilities.', redFlagIds: [], reasoningModes: ['phoenix_company', 'timeline_reconstruction'], doctrines: [] },
  { id: 'npo_diversion', displayName: 'NPO diversion', describes: 'Charity funds diverted to non-charitable purposes in conflict zones.', redFlagIds: ['rf_npo_field_office_cash_payouts', 'rf_npo_donor_chain_circular'], reasoningModes: ['source_triangulation', 'jurisdiction_cascade'], doctrines: ['fatf_rba'] },
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
  // ── Wave 4 typologies ────────────────────────────────────────────────
  { id: 'environmental_crime', displayName: 'Environmental crime (FATF 2021 predicate)', describes: 'Illegal mining, logging, fishing, or waste trafficking laundered through trade or commodity rails.', redFlagIds: ['rf_dpms_refiner_cahra'], reasoningModes: ['oecd_ddg_annex', 'provenance_trace', 'jurisdiction_cascade'], doctrines: ['fatf_rba', 'oecd_ddg'] },
  { id: 'carbon_market_fraud', displayName: 'Carbon-market & VCM offset fraud', describes: 'Phantom, double-counted, or washed carbon credits in voluntary or compliance carbon markets.', redFlagIds: [], reasoningModes: ['provenance_trace', 'source_triangulation', 'narrative_coherence'], doctrines: ['fatf_rba'] },
  { id: 'insider_threat', displayName: 'Insider threat — IP / trade-secret exfiltration', describes: 'Privileged-access abuse exfiltrating intellectual property, trade secrets, or sensitive data to external parties; distinct from insider_trading (MNPI).', redFlagIds: [], reasoningModes: ['timeline_reconstruction', 'pattern_of_life', 'velocity_analysis'], doctrines: ['three_lines_defence'] },
  { id: 'ai_governance_breach', displayName: 'AI governance breach (EU AI Act / NIST / ISO 42001)', describes: 'Deployment or operation of an AI system in breach of the 2026 governance stack — conformity assessment skipped, high-risk tier mis-classified, model inventory absent, fairness monitoring disabled, or kill-switch / human-in-the-loop bypassed.', redFlagIds: [], reasoningModes: ['narrative_coherence', 'source_triangulation'], doctrines: [] },
  { id: 'ai_synthetic_media_fraud', displayName: 'AI synthetic-media fraud', describes: 'Deepfake / voice-clone / generative-AI fraud used to impersonate executives, bypass KYC liveness, or fabricate evidence. Includes CEO deepfake BEC, AI-generated KYC documents, and autonomous-agent scams.', redFlagIds: [], reasoningModes: ['linguistic_forensics', 'entity_resolution', 'timeline_reconstruction'], doctrines: [] },
  // ── Wave 5 — expanded typology surface ──────────────────────────────
  { id: 'hawala_network', displayName: 'Hawala / informal value transfer', describes: 'Value transfer outside formal banking using trust-based brokers (hawaladars); settlement via commodity, trade, or bilateral netting.', redFlagIds: [], reasoningModes: ['pattern_of_life', 'jurisdiction_cascade'], doctrines: ['fatf_rba'] },
  { id: 'cyber_extortion', displayName: 'Cyber extortion / ransomware proceeds', describes: 'Ransom payments in crypto laundered via chain-hopping, mixers, and OTC desk cash-outs.', redFlagIds: [], reasoningModes: ['chain_analysis', 'taint_propagation', 'velocity_analysis'], doctrines: [] },
  { id: 'romance_fraud', displayName: 'Romance / pig-butchering fraud', describes: 'Victim cultivated through social media and induced to transfer funds or crypto to fraudster.', redFlagIds: [], reasoningModes: ['pattern_of_life', 'narrative_coherence'], doctrines: [] },
  { id: 'tax_evasion_offshore', describes: 'Undeclared income routed through offshore structures to avoid domestic tax obligations; FATF all-crimes predicate.', displayName: 'Tax evasion — offshore structuring', redFlagIds: [], reasoningModes: ['jurisdiction_cascade', 'source_triangulation'], doctrines: ['fatf_rba'] },
  { id: 'customs_fraud', displayName: 'Customs / tariff fraud', describes: 'Mis-classification, under-valuation, or country-of-origin falsification on import / export declarations.', redFlagIds: [], reasoningModes: ['tbml_over_invoicing', 'provenance_trace'], doctrines: [] },
  { id: 'social_media_investment_fraud', displayName: 'Social-media investment fraud', describes: 'Fraudulent investment schemes promoted via social media; victims wire to mule accounts.', redFlagIds: [], reasoningModes: ['narrative_coherence', 'pattern_of_life'], doctrines: [] },
  { id: 'precious_stones', displayName: 'Precious stones / gemstone smuggling', describes: 'Uncut diamonds, rubies, emeralds used as value-transfer mechanism across jurisdictions.', redFlagIds: [], reasoningModes: ['provenance_trace', 'jurisdiction_cascade'], doctrines: ['fatf_rba'] },
  { id: 'gambling_ml', displayName: 'Gambling / casino ML', describes: 'Cash placement through casino chips, online gambling accounts, or sports-betting promo-abuse.', redFlagIds: [], reasoningModes: ['casino_junket_flow', 'velocity_analysis'], doctrines: [] },
  { id: 'loan_stacking', displayName: 'Loan stacking / credit abuse', describes: 'Multiple simultaneous loan applications to different lenders using same collateral or fabricated documents.', redFlagIds: [], reasoningModes: ['velocity_analysis', 'entity_resolution'], doctrines: [] },
  { id: 'bust_out_fraud', displayName: 'Bust-out / credit-card fraud', describes: 'Credit facility built up and then maxed out with no intent to repay; proceeds laundered.', redFlagIds: [], reasoningModes: ['pattern_of_life', 'velocity_analysis'], doctrines: [] },
  { id: 'real_estate_over_valuation', displayName: 'Real-estate over / under-valuation', describes: 'Deliberate mispricing of property to transfer value between buyer and seller parties.', redFlagIds: [], reasoningModes: ['real_estate_cash', 'source_triangulation'], doctrines: ['fatf_rba'] },
  { id: 'luxury_goods_ml', displayName: 'Luxury goods as value transfer', describes: 'Watches, handbags, jewellery purchased to store or transfer illicit value with minimal paper trail.', redFlagIds: [], reasoningModes: ['pattern_of_life', 'provenance_trace'], doctrines: [] },
  { id: 'legal_services_ml', displayName: 'Legal-services / lawyer ML', describes: 'Client account, escrow, or legal privilege misused to layer funds.', redFlagIds: [], reasoningModes: ['source_triangulation', 'narrative_coherence'], doctrines: ['wolfsberg_faq'] },
  { id: 'crypto_ransomware', displayName: 'Crypto ransomware monetisation', describes: 'Ransomware operator cash-out path: ransom wallet → mixing → OTC → fiat; UN Consolidated / OFAC SDN exposure.', redFlagIds: [], reasoningModes: ['chain_analysis', 'taint_propagation', 'sanctions_regime_matrix'], doctrines: [] },
  { id: 'payroll_fraud', displayName: 'Payroll / ghost-employee fraud', describes: 'Fictitious payees added to payroll; funds routed to mule accounts controlled by fraudster.', redFlagIds: [], reasoningModes: ['reconciliation', 'pattern_of_life'], doctrines: [] },
  { id: 'professional_money_laundering', displayName: 'Professional money laundering network', describes: 'Specialist third-party services providing layering infrastructure for multiple criminal clients.', redFlagIds: [], reasoningModes: ['community_detection', 'link_analysis'], doctrines: ['fatf_rba'] },
  { id: 'funnel_account', displayName: 'Funnel / mule account', describes: 'Account that aggregates proceeds from multiple victims then rapidly disburses to third parties; a key money-mule indicator.', redFlagIds: ['rf_funnel_rapid_disburse'], reasoningModes: ['velocity_analysis', 'pattern_of_life'], doctrines: [] },
  { id: 'cash_intensive_business', displayName: 'Cash-intensive business ML', describes: 'Commingling illicit cash into revenues of a cash-heavy business (restaurant, carwash, parking).', redFlagIds: [], reasoningModes: ['pattern_of_life', 'risk_adjusted'], doctrines: [] },
  { id: 'correspondent_shell', displayName: 'Correspondent banking — shell respondent', describes: 'Shell bank or unregulated entity accessing the formal system through a correspondent relationship.', redFlagIds: [], reasoningModes: ['corresp_nested_bank_flow', 'kyb_strict'], doctrines: ['wolfsberg_correspondent'] },
  { id: 'virtual_iban_abuse', displayName: 'Virtual IBAN / EMI account abuse', describes: 'Electronic money institution or virtual IBAN account used to obscure ultimate beneficiary or aggregate mule payments.', redFlagIds: [], reasoningModes: ['velocity_analysis', 'entity_resolution'], doctrines: [] },
  { id: 'invoice_discounting_fraud', displayName: 'Invoice discounting / factoring fraud', describes: 'Fictitious or inflated receivables discounted to obtain financing; linked to TBML variants.', redFlagIds: [], reasoningModes: ['tbml_over_invoicing', 'reconciliation'], doctrines: [] },
  { id: 'crypto_p2p_exchange', displayName: 'Crypto P2P exchange / OTC desk ML', describes: 'Peer-to-peer crypto trading or unlicensed OTC desk used to convert illicit crypto to fiat without KYC.', redFlagIds: [], reasoningModes: ['chain_analysis', 'vasp_travel_rule'], doctrines: ['fatf_rba'] },
  { id: 'daigou_parallel_import', displayName: 'Daigou / parallel-import trade ML', describes: 'Cross-border resale of luxury or restricted goods using parallel-import channels to exploit price arbitrage and obscure value transfer.', redFlagIds: [], reasoningModes: ['tbml_overlay', 'provenance_trace'], doctrines: [] },
  { id: 'construction_ml', displayName: 'Construction / infrastructure ML', describes: 'Inflated contracts, ghost sub-contractors, and kickbacks in large-scale construction projects.', redFlagIds: [], reasoningModes: ['source_triangulation', 'reconciliation'], doctrines: ['fatf_rba'] },
  { id: 'healthcare_billing_fraud', displayName: 'Healthcare / insurance billing fraud', describes: 'Fraudulent claims, phantom procedures, or upcoding generating illicit proceeds then laundered.', redFlagIds: [], reasoningModes: ['reconciliation', 'pattern_of_life'], doctrines: [] },
  // Wave 6 — additional weaponization
  { id: 'crypto_onramp_obfuscation', displayName: 'Crypto on-/off-ramp obfuscation', describes: 'Card-funded or cash-funded crypto purchase rapidly chain-hopped through mixers, privacy coins, or P2P/OTC desks to convert proceeds to fiat with no KYC link.', redFlagIds: ['rf_crypto_onramp_card_to_mixer', 'rf_crypto_offramp_otc_cash'], reasoningModes: ['chain_analysis', 'taint_propagation', 'velocity_analysis', 'vasp_travel_rule'], doctrines: ['fatf_rba'] },
  { id: 'bearer_share_fz_loophole', displayName: 'Bearer-share / free-zone loophole', describes: 'UAE / GCC free-zone holding entity used as substance-light invoicing vehicle, often combined with bearer-share-equivalent ownership to obscure UBO and bypass mainland AML supervision.', redFlagIds: ['rf_bearer_share_fz_holding', 'rf_fz_no_substance'], reasoningModes: ['ubo_bearer_shares', 'ubo_tree_walk', 'jurisdiction_cascade', 'kyb_strict'], doctrines: ['fatf_rba', 'uae_fdl_20_2018'] },
];

export const TYPOLOGY_BY_ID: Map<TypologyId, Typology> = new Map(
  TYPOLOGIES.map((t) => [t.id, t]),
);
