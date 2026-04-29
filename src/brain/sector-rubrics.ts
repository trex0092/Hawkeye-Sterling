// Hawkeye Sterling — sector risk rubrics.
// Quantified scoring rubrics per sector. Each rubric has dimensions, anchors,
// and a default weight profile. The brain uses these to drive sector-aware
// risk scoring without re-inventing the wheel per case.

export type RubricDimension = {
  id: string;
  label: string;
  weight: number;          // 0..1; per-rubric weights sum to 1.0
  anchors: { score: 0 | 25 | 50 | 75 | 100; description: string }[];
};

export interface SectorRubric {
  id: string;
  sector: string;
  description: string;
  dimensions: RubricDimension[];
  reasoningModes: string[];
}

const D = (id: string, label: string, weight: number,
  a0: string, a25: string, a50: string, a75: string, a100: string,
): RubricDimension => ({
  id, label, weight,
  anchors: [
    { score: 0, description: a0 },
    { score: 25, description: a25 },
    { score: 50, description: a50 },
    { score: 75, description: a75 },
    { score: 100, description: a100 },
  ],
});

export const SECTOR_RUBRICS: SectorRubric[] = [
  {
    id: 'rub_dpms_retail',
    sector: 'dpms_retail',
    description: 'Retail precious-metals counter sales.',
    reasoningModes: ['dpms_retail_threshold', 'cash_courier_ctn', 'velocity_analysis'],
    dimensions: [
      D('cash_intensity', 'Cash intensity', 0.35,
        'Card / digital only', 'Mostly digital', 'Mixed cash + digital',
        'Mostly cash', 'Cash only across all transactions'),
      D('transaction_size', 'Average transaction size vs DPMS threshold', 0.25,
        'Far below', 'Below', 'Around', 'Above', 'Repeatedly above without KYC'),
      D('customer_familiarity', 'Customer relationship history', 0.15,
        'Long-term, full file', 'Established', 'Some history', 'New', 'Walk-in only'),
      D('id_verification', 'ID verification quality', 0.15,
        'Full + biometric', 'Government-ID + secondary', 'Government-ID only', 'Photocopy only', 'Refused / declined'),
      D('linked_party_pattern', 'Linked-party / structuring signals', 0.10,
        'None', 'Sporadic', 'Repeating', 'Clustered', 'Coordinated multi-party'),
    ],
  },
  {
    id: 'rub_dpms_refinery',
    sector: 'dpms_refinery',
    description: 'Refinery / wholesale bullion supply chain.',
    reasoningModes: ['lbma_rgg_five_step', 'oecd_annex_ii_discipline', 'provenance_trace'],
    dimensions: [
      D('country_of_origin', 'Country-of-origin risk', 0.30,
        'Low-risk single source', 'Mixed low-risk', 'Mixed including medium', 'Includes high-risk', 'Includes CAHRA without docs'),
      D('chain_completeness', 'Chain-of-custody completeness', 0.25,
        'Unbroken end-to-end', 'Minor gaps documented', 'Some gaps', 'Significant gaps', 'Missing or fabricated'),
      D('assay_reconciliation', 'Assay vs refinery reconciliation', 0.15,
        'Within 0.05%', 'Within 0.2%', 'Within 0.5%', 'Within 1%', 'Beyond 1% or refused'),
      D('counterparty_diligence', 'Supplier diligence depth', 0.20,
        'Independent audit + LBMA', 'Independent audit', 'Self-assessment', 'Trust-based', 'No diligence'),
      D('recycling_provenance', 'Recycled-input provenance', 0.10,
        'Verified', 'Documented', 'Self-declared', 'Unclear', 'Round-trip suspected'),
    ],
  },
  {
    id: 'rub_vasp',
    sector: 'vasp',
    description: 'Virtual-asset service provider.',
    reasoningModes: ['vasp_wallet_screen', 'vasp_travel_rule', 'chain_analysis'],
    dimensions: [
      D('licence_status', 'Licensing status', 0.25,
        'Tier-1 jurisdiction licence', 'Tier-2 licence', 'Pending', 'Operating without licence in regulated jurisdiction', 'Sanctions or enforcement against'),
      D('travel_rule', 'Travel-rule maturity', 0.20,
        'Full compliance', 'Compliant w/ counterparties', 'Partial', 'Manual workarounds', 'Not implemented'),
      D('chain_screening', 'On-chain screening', 0.20,
        'Real-time multi-vendor', 'Single vendor real-time', 'Daily batch', 'Ad-hoc', 'None'),
      D('mixer_exposure', 'Privacy / mixer exposure', 0.20,
        'No exposure', 'Indirect 3+ hops', 'Indirect ≤ 2 hops', 'Direct rare', 'Direct frequent'),
      D('geo_exposure', 'Geographic exposure', 0.15,
        'Low-risk only', 'Mostly low-risk', 'Mixed', 'High-risk', 'Sanctioned jurisdictions'),
    ],
  },
  {
    id: 'rub_real_estate',
    sector: 'real_estate',
    description: 'Real-estate sale / purchase.',
    reasoningModes: ['re_cash_purchase_check', 're_shell_owner_check', 're_valuation_anomaly'],
    dimensions: [
      D('payment_method', 'Payment method', 0.35,
        'Mortgage from regulated bank', 'Mostly bank wire', 'Mixed', 'Cash-equivalent', 'Cash'),
      D('buyer_transparency', 'Buyer transparency', 0.25,
        'Natural person + ID', 'Local entity + UBO', 'Foreign entity + UBO', 'Foreign shell', 'Nominee chain'),
      D('valuation_check', 'Valuation vs market', 0.15,
        'Independent valuation', 'Comparable sales reviewed', 'Self-declared', 'No valuation', 'Material outlier without rationale'),
      D('rapid_resale', 'Rapid-resale signal', 0.15,
        'Long hold expected', 'Standard hold', 'Short hold', 'Resold < 1 yr', 'Resold < 90 days'),
      D('jurisdiction_buyer', 'Buyer jurisdiction risk', 0.10,
        'Low', 'Medium', 'Mixed', 'High', 'Very high / sanctioned'),
    ],
  },
  {
    id: 'rub_trade_finance',
    sector: 'trade_finance',
    description: 'LC / SBLC / documentary collection.',
    reasoningModes: ['ucp600_discipline', 'tbml_overlay', 'commodity_price_anomaly'],
    dimensions: [
      D('parties_existence', 'Parties exist in registries', 0.20,
        'All parties verified', 'Mostly verified', 'Some unverified', 'Counterparty unverified', 'Phantom party identified'),
      D('price_benchmark', 'Unit price vs benchmark', 0.20,
        'Within band', 'Slightly outside', 'Outside band', 'Material outlier', 'Extreme outlier'),
      D('route_consistency', 'Route + AIS consistency', 0.20,
        'Consistent', 'Minor deviation', 'Material deviation', 'AIS gap', 'Dark vessel STSS'),
      D('lc_discrepancies', 'LC discrepancies', 0.20,
        'None', 'Minor + cured', 'Material + cured', 'Material waived', 'Repeatedly waived'),
      D('cargo_dual_use', 'Cargo dual-use sensitivity', 0.20,
        'No', 'Possible', 'Listed dual-use', 'Listed + sensitive end-user', 'Listed + sensitive jurisdiction'),
    ],
  },
  {
    id: 'rub_correspondent_banking',
    sector: 'correspondent_banking',
    description: 'Correspondent and respondent bank relationships / nostro-vostro flows.',
    reasoningModes: ['corresp_nested_bank_flow', 'sanctions_regime_matrix', 'velocity_analysis'],
    dimensions: [
      D('respondent_aml_regime', 'Respondent AML/CFT regulatory regime quality', 0.30,
        'FATF member, strong supervision', 'FATF member, adequate', 'FATF-style equivalent', 'FATF grey-list adjacent', 'FATF grey or black list'),
      D('payable_through_accounts', 'Payable-through / nested account exposure', 0.25,
        'None permitted', 'Disclosed and documented', 'Limited, documented', 'Undisclosed PTAs present', 'Shell bank activity suspected'),
      D('pta_shell_bank_screen', 'Shell bank prohibition compliance', 0.20,
        'Certified no shell banks', 'Contractual prohibition in place', 'Policy only, no cert', 'Unknown', 'Shell bank relationship evidenced'),
      D('kyc_on_kyc_reliance', 'KYC-on-KYC reliance adequacy', 0.15,
        'Full primary KYC on file', 'Certified reliance documented', 'Standard reliance letter', 'Informal reliance', 'No basis for reliance'),
      D('transaction_transparency', 'Originator / beneficiary data completeness (SWIFT)', 0.10,
        'Full SWIFT fields, R.16 compliant', 'Mostly complete', 'Partial', 'Frequently missing', 'Systematically absent'),
    ],
  },
  {
    id: 'rub_insurance',
    sector: 'insurance',
    description: 'Life insurance and high-value investment-linked insurance products.',
    reasoningModes: ['insurance_ml_overlay', 'velocity_analysis', 'layering_detection'],
    dimensions: [
      D('premium_funding_source', 'Premium funding source transparency', 0.30,
        'Bank wire from own regulated account', 'Third-party bank with documented nexus', 'Mixed sources explained', 'Cash or money orders', 'Unexplained third-party funding'),
      D('early_surrender_pattern', 'Early surrender or policy loan velocity', 0.25,
        'None', 'Once, business-justified', 'Twice within 24 months', 'Repeated pattern', 'Immediate surrender after premium'),
      D('beneficiary_transparency', 'Beneficiary identity and nexus clarity', 0.20,
        'Immediate family, documented', 'Close associate, documented', 'Third party, partially documented', 'Opaque or nominee beneficiary', 'Anonymous or unverifiable'),
      D('policy_size_vs_income', 'Policy size relative to declared income / net worth', 0.15,
        'Proportionate, documented', 'Slightly above but explained', 'Material above, weak explanation', 'Large premium, no income evidence', 'Extreme — no plausible income basis'),
      D('jurisdiction_of_policy', 'Policy jurisdiction risk', 0.10,
        'Low-risk onshore', 'Low-risk offshore (FATF member)', 'Medium-risk offshore', 'High-risk offshore', 'Secrecy / non-cooperative jurisdiction'),
    ],
  },
  {
    id: 'rub_legal_dnfbp',
    sector: 'legal_dnfbp',
    description: 'Law firms, notaries, accountants, and trust / company service providers (TCSPs).',
    reasoningModes: ['dnfbp_gatekeeper_check', 'layering_detection', 'ubo_opacity_score'],
    dimensions: [
      D('client_identity_verification', 'CDD on underlying client depth', 0.30,
        'Full EDD, UBO verified', 'Standard CDD, documented', 'Reliance on another DNFBP, certified', 'Self-declaration only', 'No CDD evidenced'),
      D('client_instruction_nexus', 'Business rationale for legal / professional structure', 0.25,
        'Legitimate commercial purpose documented', 'Plausible, documented', 'Vague rationale accepted', 'No rationale provided', 'Structure appears designed to obscure'),
      D('funds_routing', 'Client funds routing through professional accounts', 0.20,
        'None (direct to counterparty)', 'Minimal, business-justified', 'Regular but documented', 'Frequent, purpose unclear', 'Systematic layering through client account'),
      D('shell_entity_formation', 'SPV / shell entity formation for client', 0.15,
        'None', 'Disclosed legitimate purpose', 'Opaque purpose, accepted', 'Multiple shells, minimal documentation', 'Nominee directors + bearer shares'),
      D('conflict_of_interest_independence', 'Professional independence from client influence', 0.10,
        'Full independence documented', 'Standard independence', 'Some overlap, managed', 'Significant overlap', 'Captured professional suspected'),
    ],
  },
  {
    id: 'rub_msb',
    sector: 'msb',
    description: 'Money services business: remittance, currency exchange, hawala-adjacent operators.',
    reasoningModes: ['hawala_network_trace', 'velocity_analysis', 'cash_courier_ctn'],
    dimensions: [
      D('licence_and_registration', 'MSB licence and agent-network registration', 0.25,
        'Licensed + full agent registry', 'Licensed, agent list maintained', 'Registered, gaps in agent docs', 'Operating beyond licence scope', 'Unlicensed or de-licensed'),
      D('corridor_risk', 'Primary remittance corridor risk', 0.25,
        'Low-risk bilateral corridor', 'Mixed, mostly low-risk', 'Includes medium-risk corridors', 'High-risk corridor primary', 'FATF black-list corridor'),
      D('agent_oversight', 'Sub-agent oversight and AML training', 0.20,
        'Certified + annual audit', 'Certified, periodic review', 'Policy only, no audit trail', 'Minimal oversight', 'No agent oversight evidenced'),
      D('cash_to_digital_ratio', 'Cash intake as % of total volume', 0.15,
        '< 10%', '10–25%', '25–50%', '50–75%', '> 75% or cash only'),
      D('structuring_pattern', 'Structuring / smurfing signals across agent network', 0.15,
        'None', 'Isolated instances investigated', 'Recurrent, not resolved', 'Systematic pattern across multiple agents', 'Organised smurfing network evidenced'),
    ],
  },
  {
    id: 'rub_casino',
    sector: 'casino',
    description: 'Land-based and online casino / gaming operations.',
    reasoningModes: ['casino_chip_layering', 'velocity_analysis', 'layering_detection'],
    dimensions: [
      D('chip_wash_pattern', 'Chip purchase–minimal play–redemption pattern', 0.30,
        'No pattern detected', 'Isolated, investigated', 'Recurring but below threshold', 'Systematic pattern', 'Organised chip-wash scheme evidenced'),
      D('customer_source_of_funds', 'Source of funds verification for high-value players', 0.25,
        'Full SOF on file', 'Documented for all high-value', 'Documented for VIP only', 'Self-declaration accepted', 'No SOF checks performed'),
      D('third_party_chip_purchase', 'Third-party chip purchase or credit extension', 0.20,
        'Prohibited and enforced', 'Allowed with full documentation', 'Allowed, documentation gaps', 'Frequent with minimal docs', 'Systemic third-party purchasing'),
      D('digital_asset_gaming', 'Crypto / digital asset wagering or redemption', 0.15,
        'Prohibited', 'Permitted, full VASP-level KYC', 'Permitted, basic KYC', 'Permitted, minimal KYC', 'Uncontrolled crypto acceptance'),
      D('win_loss_pattern', 'Win/loss ratio anomaly vs statistical expectation', 0.10,
        'Within actuarial band', 'Slight positive anomaly', 'Material positive deviation', 'Consistent winning against odds', 'Statistically impossible win rate'),
    ],
  },
  {
    id: 'rub_npo',
    sector: 'npo',
    description: 'Non-profit organisations, charities, and NGOs.',
    reasoningModes: ['npo_cf_overlay', 'sanctions_regime_matrix', 'geographic_risk_score'],
    dimensions: [
      D('geographic_programme_risk', 'Programme delivery in high-risk or conflict jurisdictions', 0.30,
        'Low-risk jurisdictions only', 'One medium-risk programme', 'Multiple medium-risk, documented', 'Active CAHRA programmes', 'Programmes in FATF black-list zones'),
      D('fund_disbursement_controls', 'Fund disbursement traceability to end-beneficiary', 0.25,
        'Full audit trail to beneficiary', 'Documented to local partner', 'Partially documented', 'Cash disbursements without receipts', 'No disbursement documentation'),
      D('donor_transparency', 'Donor identity and source of funds verification', 0.20,
        'Full KYC for all donors', 'KYC for donors above threshold', 'Threshold inconsistently applied', 'Anonymous donations accepted', 'Anonymous large donations unrestricted'),
      D('third_party_channel', 'Use of informal value-transfer or hawala channels', 0.15,
        'None — formal channels only', 'Occasional, documented exception', 'Regular, partially documented', 'Frequent informal channels', 'Primary channel is unregulated'),
      D('governance_oversight', 'Board oversight and independent audit', 0.10,
        'Annual independent audit, active board', 'Audit performed, board engaged', 'Audit gaps, limited board activity', 'No audit, passive governance', 'No governance structure'),
    ],
  },
  {
    id: 'rub_private_banking',
    sector: 'private_banking',
    description: 'Private banking, family offices, and wealth management.',
    reasoningModes: ['pep_edd_depth', 'ubo_opacity_score', 'layering_detection'],
    dimensions: [
      D('pep_proportion', 'PEP / PEP-RCA proportion of book', 0.30,
        '< 5%, full EDD', '5–15%, documented EDD', '15–25%, partial EDD', '> 25%, EDD gaps', 'Majority PEP, no systematic EDD'),
      D('source_of_wealth_evidence', 'Source of wealth documentation quality', 0.25,
        'Independent verified documentary evidence', 'Multiple corroborating documents', 'Single self-declaration document', 'Verbal declaration only', 'No source of wealth established'),
      D('complex_structure_depth', 'Complexity of ownership / trust structures', 0.20,
        'Simple, fully transparent', 'Multi-layer, fully documented', 'Multi-layer, partial documentation', 'Nominee + offshore chain', 'Undisclosed beneficial owner'),
      D('jurisdiction_of_assets', 'Asset custody jurisdiction risk', 0.15,
        'Low-risk onshore domicile', 'Reputable IFC (FATF member)', 'Mid-tier IFC', 'High-risk or grey-list IFC', 'Secrecy or non-cooperative jurisdiction'),
      D('high_value_asset_risk', 'High-value portable asset holdings (art, gems, RE)', 0.10,
        'None or fully documented', 'Documented with valuations', 'Partially documented', 'Significant undocumented holdings', 'Anonymous high-value asset accumulation'),
    ],
  },
];

export const SECTOR_RUBRIC_BY_ID: Map<string, SectorRubric> = new Map(
  SECTOR_RUBRICS.map((r) => [r.id, r]),
);
