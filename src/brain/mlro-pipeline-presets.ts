// Hawkeye Sterling — curated pipeline presets.
// Hand-picked mode chains for the 15 case archetypes MLROs meet most often.
// Each preset is a short ordered sequence of catalogue mode ids chosen so
// the pipeline output converges on a charter-compliant 7-section narrative
// within the 60s budget.

import type { MlroModeId } from './mlro-reasoning-modes.js';

export interface PipelinePreset {
  id: string;
  label: string;
  description: string;
  when: string;              // trigger hint for the recommender
  budgetMs: number;          // total budget
  steps: readonly MlroModeId[];
  primaryAnchors: readonly string[];
}

const B = (s: number) => s * 1000;

export const PIPELINE_PRESETS: readonly PipelinePreset[] = [
  {
    id: 'pp_cahra_gold_onboard',
    label: 'CAHRA-sourced gold — onboarding',
    description: 'Refinery input from active CAHRA country without OECD Annex II documentation.',
    when: 'sector=dpms_refiner && input_origin in CAHRA',
    budgetMs: B(25),
    steps: ['data' as MlroModeId, 'bullion_dore_drc_asm' as MlroModeId, 'oecd_ddg_annex' as MlroModeId, 'lbma_rgg_five_step' as MlroModeId, 'red_team' as MlroModeId, 'reflective' as MlroModeId],
    primaryAnchors: ['LBMA RGG', 'OECD DDG Annex II', 'FDL 10/2025 Art.20-21'],
  },
  {
    id: 'pp_vasp_mixer_inbound',
    label: 'VASP — inbound from mixer',
    description: 'Crypto inbound traceable to a mixer / privacy protocol cluster.',
    when: 'hasCrypto && mixer_hops<=2',
    budgetMs: B(22),
    steps: ['chain_analysis' as MlroModeId, 'taint_propagation' as MlroModeId, 'vasp_travel_rule' as MlroModeId, 'bayesian' as MlroModeId, 'reflective' as MlroModeId],
    primaryAnchors: ['FATF R.15/16', 'Wolfsberg VA'],
  },
  {
    id: 'pp_pep_wealth_mismatch',
    label: 'PEP — wealth inconsistent with declared source',
    description: 'Declared SoW materially below observed wealth indicators for a PEP.',
    when: 'hasPep && sow_gap>3x',
    budgetMs: B(24),
    steps: ['data' as MlroModeId, 'source_triangulation' as MlroModeId, 'narrative_coherence' as MlroModeId, 'dialectic' as MlroModeId, 'bayesian' as MlroModeId, 'reflective' as MlroModeId],
    primaryAnchors: ['FATF R.12', 'Wolfsberg FAQ'],
  },
  {
    id: 'pp_structuring_near_threshold',
    label: 'Structuring — near-threshold cash',
    description: 'Multiple near-threshold cash transactions across a short window.',
    when: 'structuring_window_count>=3',
    budgetMs: B(20),
    steps: ['data' as MlroModeId, 'velocity_analysis' as MlroModeId, 'spike_detection' as MlroModeId, 'pattern_of_life' as MlroModeId, 'socratic' as MlroModeId],
    primaryAnchors: ['MoE DNFBP circulars', 'FATF RBA'],
  },
  {
    id: 'pp_tbml_over_invoice',
    label: 'TBML — over-invoice',
    description: 'LC unit price deviates materially from HS-code benchmark.',
    when: 'tbml_unit_price_delta>25%',
    budgetMs: B(24),
    steps: ['data' as MlroModeId, 'ucp600_discipline' as MlroModeId, 'vessel_ais_gap_analysis' as MlroModeId, 'red_team' as MlroModeId, 'reflective' as MlroModeId],
    primaryAnchors: ['ICC UCP 600', 'FATF RBA'],
  },
  {
    id: 'pp_eocn_partial_match',
    label: 'EOCN — partial name match (PNMR)',
    description: 'Partial match against UAE EOCN / UAE Local Terrorist List needs disambiguation.',
    when: 'partial_sanctions_match on EOCN',
    budgetMs: B(18),
    steps: ['source_triangulation' as MlroModeId, 'dialectic' as MlroModeId, 'counterfactual' as MlroModeId, 'reflective' as MlroModeId],
    primaryAnchors: ['CR 74/2020 Art.4-7'],
  },
  {
    id: 'pp_eocn_confirmed',
    label: 'EOCN — confirmed match (FFR)',
    description: 'EXACT/STRONG match with two strong identifiers on EOCN/UN.',
    when: 'confirmed_sanctions_match',
    budgetMs: B(18),
    steps: ['data' as MlroModeId, 'list_walk' as MlroModeId, 'sanctions_regime_matrix' as MlroModeId, 'reflective' as MlroModeId],
    primaryAnchors: ['CR 74/2020 Art.4-7', 'UN 1267/1988'],
  },
  {
    id: 'pp_ubo_opaque',
    label: 'UBO — opaque chain',
    description: 'Ownership chain with nominee / bearer / unknown-upward elements.',
    when: 'ubo_opacity>0.5',
    budgetMs: B(22),
    steps: ['data' as MlroModeId, 'ubo_tree_walk' as MlroModeId, 'ubo_nominee_directors' as MlroModeId, 'ubo_bearer_shares' as MlroModeId, 'jurisdiction_cascade' as MlroModeId, 'socratic' as MlroModeId],
    primaryAnchors: ['FATF R.24/25'],
  },
  {
    id: 'pp_corresp_nested',
    label: 'Correspondent — nested flow',
    description: 'Downstream bank routed via respondent without direct relationship.',
    when: 'nested_corresp detected',
    budgetMs: B(20),
    steps: ['corresp_nested_bank_flow' as MlroModeId, 'kyb_strict' as MlroModeId, 'jurisdiction_cascade' as MlroModeId, 'red_team' as MlroModeId],
    primaryAnchors: ['Wolfsberg Correspondent'],
  },
  {
    id: 'pp_bec_typosquat',
    label: 'BEC — typosquat invoice',
    description: 'Invoice from typosquat domain of known supplier with late bank-details change.',
    when: 'bec_typosquat_signal',
    budgetMs: B(20),
    steps: ['data' as MlroModeId, 'linguistic_forensics' as MlroModeId, 'pattern_of_life' as MlroModeId, 'reflective' as MlroModeId],
    primaryAnchors: ['Internal BEC playbook'],
  },
  {
    id: 'pp_re_cash_shell',
    label: 'Real estate — cash + opaque buyer',
    description: 'Property cash-purchased via shell entity with no market nexus.',
    when: 'real_estate_cash && opaque_buyer',
    budgetMs: B(22),
    steps: ['data' as MlroModeId, 're_cash_purchase' as MlroModeId, 'ubo_tree_walk' as MlroModeId, 'jurisdiction_cascade' as MlroModeId, 'reflective' as MlroModeId],
    primaryAnchors: ['FATF RBA'],
  },
  {
    id: 'pp_tipping_off_intercept',
    label: 'Tipping-off — draft intercepted',
    description: 'Outbound communication draft appears to disclose a suspicion / filing.',
    when: 'tipping_off_guard fires',
    budgetMs: B(12),
    steps: ['red_team' as MlroModeId, 'reflective' as MlroModeId],
    primaryAnchors: ['FDL 20/2018 Art.25'],
  },
  {
    id: 'pp_audit_lookback',
    label: 'Audit — sample lookback',
    description: 'Periodic lookback review on a sample of recent dispositions.',
    when: 'quarterly audit',
    budgetMs: B(24),
    steps: ['audit_lookback_sample' as MlroModeId, 'control_effectiveness' as MlroModeId, 'four_eyes_compliance' as MlroModeId, 'statistical' as MlroModeId, 'reflective' as MlroModeId],
    primaryAnchors: ['Three Lines Model'],
  },
  {
    id: 'pp_npo_conflict_zone',
    label: 'NPO — conflict-zone disbursement',
    description: 'Charity disbursement concentrated in a conflict-affected area.',
    when: 'npo && conflict_zone',
    budgetMs: B(22),
    steps: ['data' as MlroModeId, 'jurisdiction_cascade' as MlroModeId, 'source_triangulation' as MlroModeId, 'red_team' as MlroModeId],
    primaryAnchors: ['FATF R.8'],
  },
  {
    id: 'pp_baseline_triage',
    label: 'Baseline triage (any case)',
    description: 'Default chain for an unclassified alert — picks up the charter quickly.',
    when: 'fallback',
    budgetMs: B(18),
    steps: ['speed' as MlroModeId, 'data' as MlroModeId, 'reflective' as MlroModeId],
    primaryAnchors: ['Charter P7 scope declaration'],
  },
];

export const PIPELINE_PRESET_BY_ID: Map<string, PipelinePreset> = new Map(
  PIPELINE_PRESETS.map((p) => [p.id, p]),
);

export function recommendPreset(signals: {
  sector?: string;
  hasPep?: boolean;
  hasCrypto?: boolean;
  structuring?: boolean;
  cahra?: boolean;
  tbml?: boolean;
  tippingOff?: boolean;
  eocnConfirmed?: boolean;
  eocnPartial?: boolean;
  uboOpaque?: boolean;
  bec?: boolean;
  nestedCorresp?: boolean;
  realEstateCash?: boolean;
  npoConflictZone?: boolean;
  audit?: boolean;
}): PipelinePreset {
  if (signals.tippingOff) return PIPELINE_PRESET_BY_ID.get('pp_tipping_off_intercept')!;
  if (signals.eocnConfirmed) return PIPELINE_PRESET_BY_ID.get('pp_eocn_confirmed')!;
  if (signals.eocnPartial) return PIPELINE_PRESET_BY_ID.get('pp_eocn_partial_match')!;
  if (signals.cahra) return PIPELINE_PRESET_BY_ID.get('pp_cahra_gold_onboard')!;
  if (signals.hasCrypto) return PIPELINE_PRESET_BY_ID.get('pp_vasp_mixer_inbound')!;
  if (signals.hasPep) return PIPELINE_PRESET_BY_ID.get('pp_pep_wealth_mismatch')!;
  if (signals.structuring) return PIPELINE_PRESET_BY_ID.get('pp_structuring_near_threshold')!;
  if (signals.tbml) return PIPELINE_PRESET_BY_ID.get('pp_tbml_over_invoice')!;
  if (signals.uboOpaque) return PIPELINE_PRESET_BY_ID.get('pp_ubo_opaque')!;
  if (signals.nestedCorresp) return PIPELINE_PRESET_BY_ID.get('pp_corresp_nested')!;
  if (signals.bec) return PIPELINE_PRESET_BY_ID.get('pp_bec_typosquat')!;
  if (signals.realEstateCash) return PIPELINE_PRESET_BY_ID.get('pp_re_cash_shell')!;
  if (signals.npoConflictZone) return PIPELINE_PRESET_BY_ID.get('pp_npo_conflict_zone')!;
  if (signals.audit) return PIPELINE_PRESET_BY_ID.get('pp_audit_lookback')!;
  return PIPELINE_PRESET_BY_ID.get('pp_baseline_triage')!;
}
