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
];

export const SECTOR_RUBRIC_BY_ID: Map<string, SectorRubric> = new Map(
  SECTOR_RUBRICS.map((r) => [r.id, r]),
);
