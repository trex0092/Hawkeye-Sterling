// UAE NAML National Risk Assessment 2024 — Specific ML/TF Typologies
// Source: NAML Annual Report 2024, FATF Mutual Evaluation UAE Follow-Up
//
// These typologies are in addition to the FATF standard typologies and
// reflect the specific risk landscape identified in the UAE NRA 2024.
// Each typology carries uaeSpecific: true and namlNra2024: true to
// distinguish them from the global catalogue entries.

import type { Typology } from './typologies.js';

export interface NamlTypology extends Omit<Typology, 'id'> {
  id: string;
  uaeSpecific: true;
  namlNra2024: true;
  regulatoryAnchor: string;
  indicators: string[];
  relatedFatfCategories: string[];
  riskLevel: 'critical' | 'high' | 'medium' | 'low';
}

export const NAML_NRA_2024_TYPOLOGIES: NamlTypology[] = [
  {
    id: 'uae_fz_tbml' as never,
    displayName: 'UAE Free Zone TBML',
    describes: 'Trade-based money laundering via UAE free zones (JAFZA, DMCC, etc.) using mis-invoicing, over/under-valuation, and circular transfers between related free zone entities.',
    redFlagIds: [
      'rfx_tf_unit_price_outlier',
      'rfx_tf_phantom_buyer',
      'rfx_tf_route_deviation',
      'rfx_tf_third_party_pay',
    ],
    reasoningModes: [
      'tbml_over_invoicing',
      'commodity_price_anomaly',
      'tbml_phantom_shipment',
      'trade_round_tripping',
    ],
    doctrines: ['fatf_rba', 'uae_moe_dnfbp_circulars'],
    uaeSpecific: true,
    namlNra2024: true,
    regulatoryAnchor: 'UAE NAML NRA 2024 · FATF UAE MER 2023 · DMCC Compliance Requirements',
    indicators: [
      'Mis-invoicing of goods imported or exported through UAE free zones',
      'Over/under-valuation of shipments against HS code benchmarks',
      'Multiple transfers between related free zone entities with no clear commercial rationale',
      'Single importer/exporter using multiple free zone licenses for same commodity',
      'Round-trip transactions where goods originate and return to same jurisdiction',
      'Shell entities in JAFZA or DMCC with no physical operations or staff',
      'Payments routed through UAE free zone account to third-country beneficiary',
    ],
    relatedFatfCategories: ['TBML', 'Trade Finance', 'Corporate Vehicles'],
    riskLevel: 'high',
  },
  {
    id: 'uae_vasp_crypto_evasion' as never,
    displayName: 'VASP / Crypto Evasion (UAE)',
    describes: 'UAE-registered or VARA-regulated VASP used to layer funds via P2P exchanges, no-KYC platforms, and rapid conversion to minimise traceability under VARA supervision gaps.',
    redFlagIds: [
      'rfx_crypto_peel_chain',
      'rfx_crypto_bridge_rapid_swap',
      'rfx_crypto_sanction_cluster_hop',
    ],
    reasoningModes: [
      'chain_analysis',
      'vasp_travel_rule',
      'bridge_crossing_trace',
      'peel_chain',
    ],
    doctrines: ['fatf_rba'],
    uaeSpecific: true,
    namlNra2024: true,
    regulatoryAnchor: 'UAE NAML NRA 2024 · VARA Compliance Framework 2024 · FATF Travel Rule',
    indicators: [
      'UAE VARA-licensed entity receiving funds from unregulated P2P exchanges',
      'Rapid swap of stablecoins to privacy coins through UAE-based VASP',
      'No-KYC platform used in transaction chain before on-ramp to UAE exchange',
      'Large volume crypto transactions with no Travel Rule data',
      'VASP customer with known links to high-risk jurisdiction',
      'Multiple wallet addresses controlled by same entity to avoid threshold reporting',
      'Conversion to cash at UAE gold souk following crypto receipt',
    ],
    relatedFatfCategories: ['Virtual Assets', 'VASP', 'Layering'],
    riskLevel: 'high',
  },
  {
    id: 'uae_re_golden_visa_ml' as never,
    displayName: 'Real Estate Golden Visa ML',
    describes: 'Purchasing UAE property at AED 2M+ through shell companies to qualify for Golden Visa, followed by rapid resale, used to layer illicit funds while obtaining residency.',
    redFlagIds: [
      'rfx_re_rapid_flip',
      'rfx_re_opaque_buyer',
      'rfx_re_advance_overpay',
    ],
    reasoningModes: [
      're_rapid_flip_detection',
      're_shell_owner_check',
      'ubo_tree_walk',
    ],
    doctrines: ['fatf_rba', 'uae_moe_dnfbp_circulars'],
    uaeSpecific: true,
    namlNra2024: true,
    regulatoryAnchor: 'UAE NAML NRA 2024 · UAE Golden Visa Program · RERA AML Requirements',
    indicators: [
      'Property purchase price at or just above AED 2M threshold for Golden Visa qualification',
      'Beneficial owner of purchasing entity is in a high-risk jurisdiction',
      'Resale within 12 months at below-market price',
      'Purchase through recently formed or dormant UAE or offshore shell company',
      'No evidence of rental income or use of property',
      'Developer accepting payment from third party not listed as buyer',
      'Multiple Golden Visa-qualifying property purchases by related entities',
    ],
    relatedFatfCategories: ['Real Estate', 'Corporate Vehicles', 'Placement'],
    riskLevel: 'high',
  },
  {
    id: 'uae_gold_souk_structuring' as never,
    displayName: 'Gold Souk Cash Structuring (UAE)',
    describes: 'Multiple cash purchases of gold jewelry or bullion just below the AED 55,000 DNFBP reporting threshold at UAE gold souk dealers, often using multiple individuals linked to the same address.',
    redFlagIds: [
      'rfx_bullion_unknown_origin',
      'rfx_bank_round_amounts',
    ],
    reasoningModes: [
      'velocity_analysis',
      'spike_detection',
      'dpms_retail_threshold',
      'kpi_dpms_thirty',
    ],
    doctrines: ['uae_moe_dnfbp_circulars', 'lbma_rgg'],
    uaeSpecific: true,
    namlNra2024: true,
    regulatoryAnchor: 'UAE NAML NRA 2024 · UAE DNFBP Circular 2022 · MoE AML Guidelines for DPMS',
    indicators: [
      'Multiple sub-threshold purchases (below AED 55,000) in single day at same dealer',
      'Different individuals presenting same home address for separate transactions',
      'Customer insists on no receipt or documentation',
      'Purchase amounts clustering just below AED 55,000 (e.g., AED 52,000–54,999)',
      'Cash payment for precious metals with no source-of-funds documentation',
      'Same individual making repeat visits across multiple gold souk dealers',
      'Bulk purchase of small-denomination gold items inconsistent with stated purpose',
    ],
    relatedFatfCategories: ['Structuring', 'DPMS', 'Placement'],
    riskLevel: 'high',
  },
  {
    id: 'uae_hawala_layering' as never,
    displayName: 'Hawala Network Layering (UAE)',
    describes: 'UAE-based hawaladars receiving international transfers from high-risk jurisdictions, converting to gold or cash, and repatriating value through a different channel to obscure the money trail.',
    redFlagIds: [
      'rfx_bank_cross_border_same_day',
      'rfx_bank_funnel_account',
      'rfx_bullion_unknown_origin',
    ],
    reasoningModes: [
      'chain_analysis',
      'velocity_analysis',
      'hawala_network_detection',
      'link_analysis',
    ],
    doctrines: ['fatf_rba', 'uae_moe_dnfbp_circulars'],
    uaeSpecific: true,
    namlNra2024: true,
    regulatoryAnchor: 'UAE NAML NRA 2024 · UAE CBUAE Stored Value Facilities Regulation · FATF Hawala Guidance',
    indicators: [
      'Frequent small inbound transfers from high-risk jurisdictions (AF, PK, SOM, YE)',
      'UAE account receives structured inflows and makes consolidated outbound in gold',
      'Hawaladar with registered money exchange licence operating beyond licensed scope',
      'Customer presents only informal receipt or IOU from hawaladars in origin country',
      'Multiple senders in same origin city transferring to single UAE recipient on same day',
      'Gold purchase immediately following large cash receipt with no documented provenance',
      'Repatriation of equivalent value to different jurisdiction via trade payments or crypto',
    ],
    relatedFatfCategories: ['Hawala', 'Informal Value Transfer', 'Layering'],
    riskLevel: 'high',
  },
  {
    id: 'uae_npo_charity_tf' as never,
    displayName: 'NPO / Charity TF (UAE)',
    describes: 'UAE-based NPO or charitable entity receiving donations from abroad and diverting funds to high-risk or conflict-zone jurisdictions under the cover of humanitarian transfers.',
    redFlagIds: [
      'rfx_npo_conflict_zone_disbursement',
    ],
    reasoningModes: [
      'npo_conflict_zone_flow',
      'link_analysis',
      'narrative_coherence',
    ],
    doctrines: ['fatf_rba', 'uae_cd_74_2020'],
    uaeSpecific: true,
    namlNra2024: true,
    regulatoryAnchor: 'UAE NAML NRA 2024 · UAE Federal Decree-Law 2/2019 on NPOs · FATF R.8',
    indicators: [
      'NPO receives large donations from foreign individuals with no documented relationship',
      'Disbursements routed to conflict zones (YE, SO, SY, AF) without CBUAE notification',
      'Inconsistent or vague beneficiary descriptions in outbound transfer records',
      'Dual-use goods procured under "humanitarian" label without end-user certificates',
      'NPO board member or donor linked to designated entity or high-risk individual',
      'Multiple NPOs sharing same address or director, pooling funds for same destination',
      'Cash withdrawals by NPO immediately following international donation receipts',
    ],
    relatedFatfCategories: ['Terrorist Financing', 'NPO', 'TF via Charitable Sector'],
    riskLevel: 'critical',
  },
  {
    id: 'uae_shell_re_ownership' as never,
    displayName: 'Shell Company Real Estate Ownership (UAE)',
    describes: 'Multiple UAE-registered offshore SPVs (RAK ICC, ADGM, DIFC) holding UAE real estate with no genuine business purpose, nominee directors, and no declared income.',
    redFlagIds: [
      'rfx_re_opaque_buyer',
      'rfx_ubo_common_address',
      'rfx_shell_director_overlap',
    ],
    reasoningModes: [
      're_shell_owner_check',
      'ubo_tree_walk',
      'entity_resolution',
      'ubo_nominee_directors',
    ],
    doctrines: ['fatf_rba', 'uae_moe_dnfbp_circulars'],
    uaeSpecific: true,
    namlNra2024: true,
    regulatoryAnchor: 'UAE NAML NRA 2024 · UAE UBO Resolution Cabinet 58/2020 · RERA Disclosure Rules',
    indicators: [
      'Multiple UAE-registered SPVs with nominee directors holding real estate portfolio',
      'No bank accounts held by SPV — all property-related payments made personally',
      'Property income not declared to FTA despite rental revenue',
      'Registered agent serves as nominee director for >10 entities at same address',
      'SPV incorporated in RAK ICC with beneficial owner in high-risk jurisdiction',
      'No clear commercial rationale for multi-layer offshore ownership structure',
      'Property purchased, mortgaged, and transferred between related SPVs in short period',
    ],
    relatedFatfCategories: ['Real Estate', 'Corporate Vehicles', 'UBO Concealment'],
    riskLevel: 'high',
  },
  {
    id: 'uae_lc_fraud_tbml' as never,
    displayName: 'Trade Finance LC Fraud (UAE)',
    describes: 'Collusive letter of credit fraud between UAE importer and foreign exporter involving related-party transactions, non-existent goods, and LC discrepancies to extract funds from the banking system.',
    redFlagIds: [
      'rfx_tf_phantom_buyer',
      'rfx_tf_route_deviation',
      'rfx_tf_third_party_pay',
      'rfx_tf_unit_price_outlier',
    ],
    reasoningModes: [
      'ucp600_discipline',
      'tbml_phantom_shipment',
      'tbml_over_invoicing',
      'vessel_ais_gap_analysis',
    ],
    doctrines: ['fatf_rba'],
    uaeSpecific: true,
    namlNra2024: true,
    regulatoryAnchor: 'UAE NAML NRA 2024 · CBUAE Trade Finance AML Guidance 2023 · UCP 600',
    indicators: [
      'Importer and exporter share common directors, shareholders, or registered address',
      'LC documents presented for goods that cannot be verified through shipping records',
      'Price per unit significantly above or below HS code benchmarks',
      'Presenting bank and beneficiary bank in high-risk jurisdictions',
      'Multiple LC amendments extending payment terms without commercial explanation',
      'Discrepancies in LC documents accepted without formal waiver process',
      'Payment under LC discharged to account different from beneficiary on LC face',
    ],
    relatedFatfCategories: ['TBML', 'Trade Finance', 'Fraud'],
    riskLevel: 'high',
  },
];
