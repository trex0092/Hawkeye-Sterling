// Hawkeye Sterling — sectoral overlays (audit follow-up #10).
//
// Per-sector rule packs that adjust the brain's mode-selection +
// risk-weighting per the sector's regulatory expectations. Returns a
// SectorOverlay describing modes that MUST fire, modes whose weight is
// boosted, and additional regulatory anchors that should appear in the
// verdict's anchors list.
//
// Sectors covered (UAE-relevant): DPMS, real_estate, vasp, insurance,
// bank, free_zone, art_auction, casino, family_office, npo, fintech,
// remittance, lending. Production should expand each from the relevant
// supervisor's Rulebook.

export type SectorId =
  | 'dpms' | 'real_estate' | 'vasp' | 'insurance' | 'bank'
  | 'free_zone' | 'art_auction' | 'casino' | 'family_office'
  | 'npo' | 'fintech' | 'remittance' | 'lending' | 'unknown';

export interface SectorOverlay {
  sector: SectorId;
  mandatoryModes: string[];
  modeWeightBoosts: Record<string, number>;     // modeId → multiplier (1.0 = no change)
  mandatoryAnchors: string[];
  additionalRedflagFamilies: string[];
  notes: string[];
}

const OVERLAYS: Record<SectorId, SectorOverlay> = {
  dpms: {
    sector: 'dpms',
    mandatoryModes: ['cash_courier_ctn', 'kpi_dpms_thirty', 'list_walk', 'sanctions_regime_matrix', 'velocity_analysis'],
    modeWeightBoosts: { cash_courier_ctn: 1.4, kpi_dpms_thirty: 1.2, ubo_tree_walk: 1.2 },
    mandatoryAnchors: ['UAE FDL 10/2025 Art.4', 'Cabinet Res 134/2025 Art.12-14', 'MoE Circular 3/2025', 'MoE Circular 6/2025', 'LBMA RGG v9 Step 2', 'OECD DDG Annex II'],
    additionalRedflagFamilies: ['cash_intensive', 'commodity_substitution', 'rapid_resale'],
    notes: ['Designated Non-Financial Business — DPMS-specific cash thresholds + responsible-sourcing obligations.'],
  },
  real_estate: {
    sector: 'real_estate',
    mandatoryModes: ['ubo_tree_walk', 'jurisdiction_cascade', 'velocity_analysis', 'list_walk', 'sanctions_regime_matrix'],
    modeWeightBoosts: { ubo_tree_walk: 1.4, jurisdiction_cascade: 1.2, rapid_resale_pattern: 1.3 },
    mandatoryAnchors: ['UAE FDL 10/2025 Art.4', 'Cabinet Res 134/2025', 'FATF R.22'],
    additionalRedflagFamilies: ['cash_purchase', 'shell_layering', 'rapid_resale'],
    notes: ['Real-estate developers, agents and conveyancers — high cash + UBO opacity exposure.'],
  },
  vasp: {
    sector: 'vasp',
    mandatoryModes: ['mixer_forensics', 'utxo_clustering', 'list_walk', 'sanctions_regime_matrix', 'velocity_analysis'],
    modeWeightBoosts: { mixer_forensics: 1.5, utxo_clustering: 1.3, sanctions_regime_matrix: 1.2 },
    mandatoryAnchors: ['FATF R.15', 'FATF R.16 (travel rule)', 'VARA VASP Rulebook 2024', 'UAE FDL 10/2025 Art.15'],
    additionalRedflagFamilies: ['mixer_use', 'bridge_hopping', 'travel_rule_failure'],
    notes: ['Virtual Asset Service Providers — mixers, bridges, travel-rule compliance, custody.'],
  },
  insurance: {
    sector: 'insurance',
    mandatoryModes: ['list_walk', 'velocity_analysis', 'ubo_tree_walk', 'sanctions_regime_matrix'],
    modeWeightBoosts: { velocity_analysis: 1.2 },
    mandatoryAnchors: ['FATF R.10', 'UAE FDL 10/2025 Art.6-10', 'Cabinet Res 134/2025'],
    additionalRedflagFamilies: ['policy_churn', 'early_surrender'],
    notes: ['Life insurance + investment-linked products — early-surrender + premium-financing patterns.'],
  },
  bank: {
    sector: 'bank',
    mandatoryModes: ['list_walk', 'sanctions_regime_matrix', 'velocity_analysis', 'ubo_tree_walk', 'cash_courier_ctn', 'four_eyes_stress'],
    modeWeightBoosts: { sanctions_regime_matrix: 1.2, four_eyes_stress: 1.2 },
    mandatoryAnchors: ['CBUAE AML Guidance 2023', 'FATF R.10-12', 'UAE FDL 10/2025'],
    additionalRedflagFamilies: ['structuring', 'rapid_throughput', 'tbml_indicators'],
    notes: ['Licensed financial institutions — full FATF 40 + CBUAE supervision.'],
  },
  free_zone: {
    sector: 'free_zone',
    mandatoryModes: ['ubo_tree_walk', 'jurisdiction_cascade', 'list_walk', 'sanctions_regime_matrix'],
    modeWeightBoosts: { ubo_tree_walk: 1.3, jurisdiction_cascade: 1.4 },
    mandatoryAnchors: ['UAE Cabinet Res 156/2025 (goods control)', 'FATF R.24', 'OECD CRS'],
    additionalRedflagFamilies: ['front_company', 'transhipment', 'goods_substitution'],
    notes: ['Free zones — corporate-substance + dual-use export-control exposure.'],
  },
  art_auction: {
    sector: 'art_auction',
    mandatoryModes: ['ubo_tree_walk', 'list_walk', 'rapid_resale_pattern', 'velocity_analysis'],
    modeWeightBoosts: { rapid_resale_pattern: 1.4, ubo_tree_walk: 1.2 },
    mandatoryAnchors: ['FATF R.22', 'OFAC Art Market Advisory 2020'],
    additionalRedflagFamilies: ['provenance_gap', 'wash_trade', 'shell_buyer'],
    notes: ['High-value art / NFT — provenance-gap + wash-trade detection critical.'],
  },
  casino: {
    sector: 'casino',
    mandatoryModes: ['cash_courier_ctn', 'velocity_analysis', 'list_walk', 'kyc_threshold_check'],
    modeWeightBoosts: { cash_courier_ctn: 1.3 },
    mandatoryAnchors: ['FATF R.22', 'UAE General Commercial Gaming Regulatory Authority Rules'],
    additionalRedflagFamilies: ['chip_walking', 'minimal_play_high_chip_purchase'],
    notes: ['Casinos / commercial gaming — chip-walking + minimal-play laundering signals.'],
  },
  family_office: {
    sector: 'family_office',
    mandatoryModes: ['ubo_tree_walk', 'jurisdiction_cascade', 'sanctions_regime_matrix'],
    modeWeightBoosts: { ubo_tree_walk: 1.4 },
    mandatoryAnchors: ['FATF R.25', 'OECD CRS', 'UAE FDL 10/2025'],
    additionalRedflagFamilies: ['trust_opacity', 'multi_jurisdiction_layering'],
    notes: ['Trusts + private holding companies — FATF R.25 transparency requirements.'],
  },
  npo: {
    sector: 'npo',
    mandatoryModes: ['list_walk', 'jurisdiction_cascade', 'velocity_analysis'],
    modeWeightBoosts: { jurisdiction_cascade: 1.2 },
    mandatoryAnchors: ['FATF R.8', 'UAE FDL 10/2025'],
    additionalRedflagFamilies: ['conflict_zone_disbursement', 'opaque_beneficiary'],
    notes: ['NPOs — terrorist-financing risk concentrated in conflict-zone disbursements.'],
  },
  fintech: {
    sector: 'fintech',
    mandatoryModes: ['list_walk', 'velocity_analysis', 'ubo_tree_walk', 'sanctions_regime_matrix'],
    modeWeightBoosts: { velocity_analysis: 1.3 },
    mandatoryAnchors: ['CBUAE Fintech Strategy', 'FATF R.10-15'],
    additionalRedflagFamilies: ['account_takeover', 'synthetic_identity'],
    notes: ['Digital-first financial services — synthetic-identity + ATO patterns.'],
  },
  remittance: {
    sector: 'remittance',
    mandatoryModes: ['cash_courier_ctn', 'velocity_analysis', 'list_walk', 'sanctions_regime_matrix'],
    modeWeightBoosts: { cash_courier_ctn: 1.4, velocity_analysis: 1.2 },
    mandatoryAnchors: ['FATF R.14 (MVTS)', 'UAE FDL 10/2025'],
    additionalRedflagFamilies: ['hawala_indicators', 'corridor_anomaly'],
    notes: ['Money or Value Transfer Services — hawala + corridor anomalies.'],
  },
  lending: {
    sector: 'lending',
    mandatoryModes: ['ubo_tree_walk', 'velocity_analysis', 'list_walk'],
    modeWeightBoosts: { velocity_analysis: 1.2 },
    mandatoryAnchors: ['CBUAE Consumer Credit Regulation', 'FATF R.10'],
    additionalRedflagFamilies: ['loan_back', 'collateral_substitution'],
    notes: ['Consumer + commercial lending — loan-back laundering, collateral substitution.'],
  },
  unknown: {
    sector: 'unknown',
    mandatoryModes: [],
    modeWeightBoosts: {},
    mandatoryAnchors: [],
    additionalRedflagFamilies: [],
    notes: ['Sector unknown — apply baseline AML/CFT screening only.'],
  },
};

/** Detect a likely sector from a free-text business activity description. */
export function detectSector(activity: string | undefined): SectorId {
  if (!activity) return 'unknown';
  const a = activity.toLowerCase();
  if (/(dpms|precious metal|gold|bullion|jewel|diamond|refin)/.test(a)) return 'dpms';
  if (/(real estate|property|developer|conveyanc)/.test(a)) return 'real_estate';
  if (/(vasp|virtual asset|crypto|wallet|exchange)/.test(a)) return 'vasp';
  if (/(insurance|takaful)/.test(a)) return 'insurance';
  if (/(bank|financial institution)/.test(a)) return 'bank';
  if (/(free zone|ftz)/.test(a)) return 'free_zone';
  if (/(art|auction|gallery|nft)/.test(a)) return 'art_auction';
  if (/(casino|gaming)/.test(a)) return 'casino';
  if (/(family office|trust)/.test(a)) return 'family_office';
  if (/(charity|npo|aid|relief|foundation)/.test(a)) return 'npo';
  if (/(fintech|payment)/.test(a)) return 'fintech';
  if (/(remittance|hawala|mvts)/.test(a)) return 'remittance';
  if (/(lending|credit|loan)/.test(a)) return 'lending';
  return 'unknown';
}

/** Look up the overlay for a sector. */
export function overlayFor(sector: SectorId): SectorOverlay {
  return OVERLAYS[sector];
}

/** Convenience: detect sector + return its overlay in one call. */
export function detectAndOverlay(activity: string | undefined): SectorOverlay {
  return overlayFor(detectSector(activity));
}
